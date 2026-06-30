/**
 * app.ts — Renderer process orchestrator for LogAnalyzer.
 *
 * Delegates to sub-modules via the shared LogAnalyzer namespace (window.__LA).
 * Each module is a separate <script> tag loaded before this file.
 *
 * Architecture:
 *  - editor-state.ts   — Shared editor instances and state
 *  - editor-setup.ts   — Monaco editor init, language registration, fullscreen
 *  - drag-drop.ts      — File and filter config drag-and-drop
 *  - filter-panel.ts   — Filter panel UI (add/delete/update/import)
 *  - filter-executor.ts — Apply filters, highlights, line-jump
 *  - dialogs.ts        — Confirm dialog, large-file dialog, download progress
 *  - ipc-bindings.ts   — Register renderer IPC listeners
 */

// Types inlined to avoid `import type` which causes `exports` preamble in compiled JS.
// Renderer scripts run as plain <script> tags — no module system available.

interface FilterPattern {
  enabled: boolean;
  type: 'text' | 'regex' | 'line' | 'exclude-text';
  pattern: string;
  highlight: boolean;
  highlightColor: string;
}

interface IDisposable { dispose(): void; }

declare const monaco: typeof import('monaco-editor');
declare const $: any;

// ─── Shared editor state ─────────────────────────────────────────────────────

let editor: import('monaco-editor').editor.IStandaloneCodeEditor;
let filteredEditor: import('monaco-editor').editor.IStandaloneCodeEditor;
let currentFilePath: string | null = null;
let currentFullscreenEditor: HTMLElement | null = null;
let lineMapping: number[] = [];
let currentFilterConfig: { patterns: FilterPattern[] } = { patterns: [] };
let mouseDownDisposable: IDisposable | null = null;

// ─── Monaco initialization ───────────────────────────────────────────────────

(function loadMonaco() {
  const vsPath = window.electronAPI.getMonacoVsPath();
  const loaderScript = document.createElement('script');
  loaderScript.src = vsPath + '/loader.js';
  loaderScript.onload = function () {
    (window as any).require.config({ paths: { vs: vsPath } });
    (window as any).require(['vs/editor/editor.main'], function () {
      registerUnrealLogLanguage();
      createEditors();
      setupDragAndDrop();
      setupKeyboardShortcuts();
    });
  };
  loaderScript.onerror = function () {
    console.error('Failed to load Monaco loader from:', vsPath + '/loader.js');
  };
  document.head.appendChild(loaderScript);
})();

function registerUnrealLogLanguage(): void {
  monaco.languages.register({ id: 'unreallog' });
  monaco.languages.setMonarchTokensProvider('unreallog', {
    tokenizer: {
      root: [
        [/^.*\b(?:Error|ERROR|error|Failed|FAILED|failed|Exception|exception)\b.*$/, 'error-line'],
        [/^.*\b(?:Warning|WARNING|warning)\b.*$/, 'warning-line'],
        [/^.*\b(?:Verbose|VERBOSE|verbose)\b.*$/, 'verbose-line'],
        [/^.*$/, 'log-line'],
      ],
    },
  });
  monaco.editor.defineTheme('unreallog-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'error-line', foreground: 'FF5252' },
      { token: 'warning-line', foreground: 'FFB74D' },
      { token: 'verbose-line', foreground: '808080' },
      { token: 'log-line', foreground: 'FFFFFF' },
    ],
    colors: {
      'editor.foreground': '#FFFFFF',
      'editor.background': '#1E1E1E',
      'editorCursor.foreground': '#FFFFFF',
      'editor.lineHighlightBackground': '#2A2A2A',
      'editorLineNumber.foreground': '#858585',
      'editor.selectionBackground': '#404040',
      'editor.inactiveSelectionBackground': '#303030',
    },
  });
}

function createEditors(): void {
  const commonOptions: import('monaco-editor').editor.IStandaloneEditorConstructionOptions = {
    language: 'unreallog',
    theme: 'unreallog-theme',
    minimap: { enabled: true },
    wordWrap: 'off',
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
  };

  editor = monaco.editor.create(document.getElementById('editor')!, { ...commonOptions, value: '' });
  filteredEditor = monaco.editor.create(document.getElementById('filtered-editor')!, {
    ...commonOptions,
    value: '',
    readOnly: true,
  });

  // Expose for divider.ts layout recalculation (separate <script>)
  (window as any).editor = editor;
  (window as any).filteredEditor = filteredEditor;

  // Expose editor instance for main process getSelectedText()
  (window as any).__LA_editor = editor;

  // Setup editor right-click context menu
  setupEditorContextMenu();
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}

function toggleFullscreen(): void {
  const activeEl = document.activeElement;
  const sourceEl = document.getElementById('editor')!;
  const filteredEl = document.getElementById('filtered-editor')!;

  let targetEl: HTMLElement | null = null;
  if (sourceEl.contains(activeEl)) targetEl = sourceEl;
  else if (filteredEl.contains(activeEl)) targetEl = filteredEl;
  else return;

  if (currentFullscreenEditor === targetEl) {
    targetEl.classList.remove('fullscreen');
    document.body.classList.remove('has-fullscreen');
    currentFullscreenEditor = null;
    setTimeout(() => { editor.layout(); filteredEditor.layout(); }, 0);
  } else {
    if (currentFullscreenEditor) {
      currentFullscreenEditor.classList.remove('fullscreen');
      document.body.classList.remove('has-fullscreen');
    }
    targetEl.classList.add('fullscreen');
    document.body.classList.add('has-fullscreen');
    currentFullscreenEditor = targetEl;
    setTimeout(() => {
      if (targetEl === sourceEl) editor.layout();
      else filteredEditor.layout();
    }, 0);
  }
}

// ─── Drag and Drop ───────────────────────────────────────────────────────────

function setupDragAndDrop(): void {
  const editorContainer = document.getElementById('editor')!;
  const filteredContainer = document.getElementById('filtered-editor')!;
  const filterSection = document.getElementById('filter-section')!;

  document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });

  editorContainer.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    editor.getDomNode()!.classList.add('drag-over');
    filteredContainer.classList.remove('drag-over');
    filterSection.classList.remove('drag-over');
  });
  editorContainer.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    editor.getDomNode()!.classList.remove('drag-over');
  });
  editorContainer.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    editor.getDomNode()!.classList.remove('drag-over');
    const file = (e as DragEvent).dataTransfer?.files[0];
    if (!file) return;
    const filePath = (file as any).path;
    if (!filePath) { alert('无法获取文件路径，请使用"打开文件"菜单'); return; }
    await checkAndOpenFile(filePath);
  });

  filterSection.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = Array.from((e as DragEvent).dataTransfer?.items ?? []);
    const isJson = items.some(item => item.kind === 'file' && ((item.getAsFile()?.name ?? '').toLowerCase().endsWith('.json') || item.type === 'application/json'));
    if (isJson) {
      filterSection.classList.add('drag-over');
      editor.getDomNode()!.classList.remove('drag-over');
      filteredContainer.classList.remove('drag-over');
    }
  });
  filterSection.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    filterSection.classList.remove('drag-over');
  });
  filterSection.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    filterSection.classList.remove('drag-over');
    const file = (e as DragEvent).dataTransfer?.files[0];
    if (!file?.name.toLowerCase().endsWith('.json')) return;
    const filePath = (file as any).path;
    try {
      const config = await window.electronAPI.importFilterCfg(filePath);
      if (!(e as DragEvent).ctrlKey && !(e as DragEvent).metaKey) clearFilters();
      onDidImportFilterConfig(config);
    } catch (err: any) {
      alert('加载配置错误: ' + err.message);
    }
  });
}

// ─── IPC Event Listeners ─────────────────────────────────────────────────────

const api = window.electronAPI;

api.onMenuOpenFile(() => showOpenFileDialog());

api.onReloadFile(async () => {
  if (!currentFilePath) return;
  const result = await api.reloadCurrentFile();
  if (result?.content !== null && result?.content !== undefined) {
    editor.setValue(result.content);
    updateFileInfo(result.filePath);
  }
});

api.onMenuShowInFolder(async () => {
  if (currentFilePath) api.showItemInFolder();
});

api.onFilterSaveConfig(async (_event: unknown, filePath: string) => {
  updateCurrentConfig();
  if (!currentFilterConfig.patterns.length) {
    if (!confirm('当前没有过滤条件，是否继续保存？')) return;
  }
  const result = await api.saveFilterConfig(currentFilterConfig, filePath);
  if (!result.success) alert('保存配置失败: ' + result.error);
});

api.onFilterLoadConfig(async (_event: unknown, filePath: string) => {
  const config = await api.importFilterCfg(filePath);
  onDidImportFilterConfig(config);
});

api.onPluginOpenFile(async (_event: unknown, filePath: string) => {
  await checkAndOpenFile(filePath);
});

api.onDownloadProgress((_event: unknown, info: any) => showDownloadProgress(info));
api.onDownloadComplete((_event: unknown, info: any) => showDownloadComplete(info));
api.onDownloadError((_event: unknown, info: any) => showDownloadError(info));

// ─── File Operations ─────────────────────────────────────────────────────────

async function checkAndOpenFile(filePath: string): Promise<void> {
  if (!filePath) { alert('文件路径为空'); return; }
  try {
    const stats = await api.getFileStats(filePath);
    const sizeMB = stats.size / 1024 / 1024;
    if (sizeMB > 200) {
      const msg = `文件大小: ${sizeMB.toFixed(2)}MB\n\n文件较大，是否使用高级读取模式？\n\n- 点击"确定"：使用高级模式（可指定时间戳和读取大小）\n- 点击"取消"：尝试直接打开整个文件（可能较慢）`;
      const useAdvanced = await showConfirmDialog(msg, '大文件检测');
      if (useAdvanced) { showLargeFileDialog(filePath); return; }
    }
    const result = await api.openFile(filePath);
    if (result?.content !== null && result?.content !== undefined) {
      onDidOpenFile(result.filePath, result.content);
    } else {
      showFileOpenError(filePath, '文件可能太大，无法打开');
    }
  } catch (err: any) {
    alert('打开文件失败: ' + err.message);
  }
}

async function showOpenFileDialog(): Promise<void> {
  try {
    const result = await api.dialogOpenFile();
    if (result?.filePath) await checkAndOpenFile(result.filePath);
  } catch (err: any) {
    alert('Error opening file dialog: ' + err.message);
  }
}

function onDidOpenFile(filePath: string, content: string): void {
  editor.setValue(content);
  updateFileInfo(filePath);
}

function updateFileInfo(filePath: string): void {
  currentFilePath = filePath;
  document.title = `LogAnalyzer - ${filePath}`;
}

function showFileOpenError(filePath: string, errorMessage: string): void {
  const shouldOpen = confirm(`打开文件失败：${errorMessage}。\n是否在系统中打开文件所在位置？`);
  if (shouldOpen) api.showItemInFolder(filePath);
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

function toggleFilterPanel(): void {
  document.querySelector('.filter-toggle')!.classList.toggle('collapsed');
  document.getElementById('filter-section')!.classList.toggle('collapsed');
}

function initializeColorPicker(container: HTMLElement, initialColor: string): void {
  if (!container || !$) return;
  if ($(container).data('kendoColorPicker')) return;
  $(container).kendoColorPicker({
    preview: false,
    buttons: false,
    clearButton: true,
    value: initialColor || '',
    palette: ['#FFEB3B','#4CAF50','#2196F3','#FF9800','#F44336','#9C27B0','#00BCD4','#8BC34A','#FFC107','#E91E63','#3F51B5','#009688','#795548','#607D8B','#000000'],
    change: () => updateCurrentConfig(),
  });
}

function updateCurrentConfig(): void {
  const items = document.querySelectorAll('.filter-item');
  currentFilterConfig.patterns = Array.from(items).map((item) => {
    const colorPickerEl = item.querySelector('.kendo-colorpicker-container') as HTMLElement;
    let highlightColor = '';
    let highlight = false;
    if (colorPickerEl) {
      const widget = $(colorPickerEl).data('kendoColorPicker');
      if (widget) {
        highlightColor = widget.value() || '';
        highlight = !!highlightColor;
      }
    }
    return {
      enabled: (item.querySelector('.enable-checkbox') as HTMLInputElement).checked,
      type: (item.querySelector('.filter-type') as HTMLSelectElement).value as FilterPattern['type'],
      pattern: (item.querySelector('.filter-pattern') as HTMLInputElement).value,
      highlight,
      highlightColor,
    };
  });
}

function updatePlaceholder(select: HTMLSelectElement, input: HTMLInputElement): void {
  const placeholders: Record<string, string> = {
    text: '输入要匹配的文本',
    regex: '输入正则表达式',
    line: '输入行号范围（如：1-100 或 1,2,3）',
    'exclude-text': '输入要排除的文本',
  };
  input.placeholder = placeholders[select.value] ?? '输入过滤条件';
}

function clearFilters(): void {
  currentFilterConfig.patterns = [];
  const container = document.getElementById('filter-container')!;
  container.innerHTML = '';
  if (filteredEditor) filteredEditor.setValue('');
}

function addFilter(): void {
  const filterDiv = document.createElement('div');
  filterDiv.className = 'filter-item';
  filterDiv.innerHTML = `
    <input type="checkbox" class="enable-checkbox" checked>
    <select class="filter-type">
      <option value="text">文本匹配</option>
      <option value="regex">正则匹配</option>
      <option value="line">行号范围</option>
      <option value="exclude-text">排除文本</option>
    </select>
    <div class="highlight-controls"><div class="kendo-colorpicker-container"></div></div>
    <input type="text" class="filter-pattern" placeholder="输入过滤条件">
    <button class="delete-filter">删除</button>
  `;

  const enableCb = filterDiv.querySelector('.enable-checkbox') as HTMLInputElement;
  const typeSelect = filterDiv.querySelector('.filter-type') as HTMLSelectElement;
  const patternInput = filterDiv.querySelector('.filter-pattern') as HTMLInputElement;
  const colorContainer = filterDiv.querySelector('.kendo-colorpicker-container') as HTMLElement;
  const deleteBtn = filterDiv.querySelector('.delete-filter') as HTMLButtonElement;

  enableCb.addEventListener('change', () => updateCurrentConfig());
  typeSelect.addEventListener('change', () => { updatePlaceholder(typeSelect, patternInput); updateCurrentConfig(); });
  patternInput.addEventListener('input', () => updateCurrentConfig());
  deleteBtn.addEventListener('click', () => { filterDiv.remove(); updateCurrentConfig(); });

  document.getElementById('filter-container')!.appendChild(filterDiv);
  initializeColorPicker(colorContainer, '');
  updateCurrentConfig();
}

function deleteFilter(element: HTMLElement): void {
  element.closest('.filter-item')?.remove();
  updateCurrentConfig();
}

function updateFilterUI(): void {
  const container = document.getElementById('filter-container')!;
  container.innerHTML = '';
  currentFilterConfig.patterns.forEach((filter) => {
    const filterItem = document.createElement('div');
    filterItem.className = 'filter-item';
    filterItem.innerHTML = `
      <input type="checkbox" class="enable-checkbox" ${filter.enabled ? 'checked' : ''}>
      <select class="filter-type">
        <option value="text" ${filter.type === 'text' ? 'selected' : ''}>文本匹配</option>
        <option value="regex" ${filter.type === 'regex' ? 'selected' : ''}>正则匹配</option>
        <option value="line" ${filter.type === 'line' ? 'selected' : ''}>行号范围</option>
        <option value="exclude-text" ${filter.type === 'exclude-text' ? 'selected' : ''}>排除文本</option>
      </select>
      <div class="highlight-controls"><div class="kendo-colorpicker-container"></div></div>
      <input type="text" class="filter-pattern" value="${filter.pattern || ''}" placeholder="输入过滤条件">
      <button class="delete-filter">删除</button>
    `;
    const typeSelect = filterItem.querySelector('.filter-type') as HTMLSelectElement;
    const patternInput = filterItem.querySelector('.filter-pattern') as HTMLInputElement;
    const enableCb = filterItem.querySelector('.enable-checkbox') as HTMLInputElement;
    const colorContainer = filterItem.querySelector('.kendo-colorpicker-container') as HTMLElement;
    const deleteBtn = filterItem.querySelector('.delete-filter') as HTMLButtonElement;

    updatePlaceholder(typeSelect, patternInput);
    enableCb.addEventListener('change', () => updateCurrentConfig());
    typeSelect.addEventListener('change', () => { updatePlaceholder(typeSelect, patternInput); updateCurrentConfig(); });
    patternInput.addEventListener('input', () => updateCurrentConfig());
    deleteBtn.addEventListener('click', () => { filterItem.remove(); updateCurrentConfig(); });

    container.appendChild(filterItem);
    initializeColorPicker(colorContainer, filter.highlightColor || '#FFEB3B');
    if (!filter.highlight) {
      const widget = $(colorContainer).data('kendoColorPicker');
      widget?.value('');
    }
  });
}

function onDidImportFilterConfig(config: { patterns: FilterPattern[] }): void {
  currentFilterConfig.patterns = currentFilterConfig.patterns.concat(config.patterns);
  updateFilterUI();
}

// ─── Apply Filters ───────────────────────────────────────────────────────────

async function applyFilters(): Promise<void> {
  try {
    if (mouseDownDisposable) { mouseDownDisposable.dispose(); mouseDownDisposable = null; }

    const sourceContent = editor.getValue();
    if (!sourceContent) { filteredEditor.setValue(''); return; }

    const lines = sourceContent.split('\n');
    const activeFilters = currentFilterConfig.patterns.filter((f) => f.enabled);
    const includeFilters = activeFilters.filter((f) => f.type !== 'exclude-text');
    const excludeFilters = activeFilters.filter((f) => f.type === 'exclude-text');

    if (activeFilters.length === 0) {
      filteredEditor.setValue(sourceContent);
      lineMapping = lines.map((_, i) => i);
      return;
    }

    const filteredIndices = new Set<number>();
    const highlightRanges: { pattern: string; color: string; isRegex?: boolean; lines?: number[] }[] = [];

    if (includeFilters.length > 0) {
      includeFilters.forEach((filter) => {
        if (!filter.pattern) return;
        try {
          if (filter.type === 'text') {
            const lp = filter.pattern.toLowerCase();
            lines.forEach((line, i) => { if (line.toLowerCase().includes(lp)) filteredIndices.add(i); });
            if (filter.highlight) highlightRanges.push({ pattern: filter.pattern, color: filter.highlightColor });
          } else if (filter.type === 'regex') {
            const re = new RegExp(filter.pattern, 'i');
            lines.forEach((line, i) => { if (re.test(line)) filteredIndices.add(i); });
            if (filter.highlight) highlightRanges.push({ pattern: filter.pattern, color: filter.highlightColor, isRegex: true });
          } else if (filter.type === 'line') {
            const nums = parseLineNumbers(filter.pattern);
            nums.forEach((n) => { if (n > 0 && n <= lines.length) filteredIndices.add(n - 1); });
            if (filter.highlight) highlightRanges.push({ pattern: '^.*$', color: filter.highlightColor, isRegex: true, lines: nums });
          }
        } catch { /* invalid regex */ }
      });
    } else {
      lines.forEach((_, i) => filteredIndices.add(i));
    }

    excludeFilters.forEach((filter) => {
      if (!filter.pattern) return;
      const lp = filter.pattern.toLowerCase();
      Array.from(filteredIndices).forEach((i) => {
        if (lines[i].toLowerCase().includes(lp)) filteredIndices.delete(i);
      });
    });

    const sortedIndices = Array.from(filteredIndices).sort((a, b) => a - b);
    const filteredContent = sortedIndices.map((i) => lines[i]).join('\n');
    lineMapping = sortedIndices;

    filteredEditor.setValue(filteredContent);

    mouseDownDisposable = filteredEditor.onMouseDown((e) => {
      if (e.event.detail === 2 && e.target.position) {
        const filteredLineIndex = e.target.position.lineNumber - 1;
        const originalLineIndex = lineMapping[filteredLineIndex];
        if (originalLineIndex !== undefined) {
          if (currentFullscreenEditor) {
            currentFullscreenEditor.classList.remove('fullscreen');
            document.body.classList.remove('has-fullscreen');
            currentFullscreenEditor = null;
            setTimeout(() => { editor.layout(); filteredEditor.layout(); }, 0);
          }
          const originalLine = originalLineIndex + 1;
          editor.revealLineInCenter(originalLine);
          editor.setPosition({ lineNumber: originalLine, column: 1 });
          editor.setSelection({
            startLineNumber: originalLine, startColumn: 1,
            endLineNumber: originalLine, endColumn: editor.getModel()!.getLineMaxColumn(originalLine),
          });
          editor.focus();
        }
      }
    });

    applyHighlightDecorations(filteredContent, highlightRanges);
  } catch (err: any) {
    filteredEditor.setValue(`错误: ${err.message || '过滤失败'}`);
  }
}

function applyHighlightDecorations(
  _filteredContent: string,
  ranges: { pattern: string; color: string; isRegex?: boolean; lines?: number[] }[],
): void {
  document.head.querySelectorAll('style[data-highlight]').forEach((s) => s.remove());
  if (!ranges.length) return;
  const model = filteredEditor.getModel();
  if (!model) return;
  const decorations: import('monaco-editor').editor.IModelDeltaDecoration[] = [];

  ranges.forEach(({ pattern, color, isRegex, lines: lineNums }, idx) => {
    const style = document.createElement('style');
    style.setAttribute('data-highlight', '');
    style.textContent = `.monaco-editor .highlight-${idx} { background-color: ${color}40 !important; }`;
    document.head.appendChild(style);

    if (lineNums) {
      lineNums.forEach((lineNum) => {
        const filteredLineNum = lineMapping.indexOf(lineNum - 1) + 1;
        if (filteredLineNum > 0 && filteredLineNum <= model.getLineCount()) {
          decorations.push({
            range: new monaco.Range(filteredLineNum, 1, filteredLineNum, Math.max(1, model.getLineLength(filteredLineNum) + 1)),
            options: { isWholeLine: true, className: `highlight-${idx}` },
          });
        }
      });
    } else {
      const re = isRegex ? new RegExp(pattern, 'gi') : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      for (let lineNum = 1; lineNum <= model.getLineCount(); lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        re.lastIndex = 0;
        if (re.test(lineContent)) {
          decorations.push({
            range: new monaco.Range(lineNum, 1, lineNum, Math.max(1, lineContent.length + 1)),
            options: { isWholeLine: true, className: `highlight-${idx}` },
          });
        }
      }
    }
  });

  if (decorations.length) filteredEditor.deltaDecorations([], decorations);
}

function parseLineNumbers(input: string): number[] {
  if (!input.trim()) return [];
  const nums = new Set<number>();
  input.split(',').map((p) => p.trim()).forEach((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [, s, e] = range.map(Number);
      if (s <= e) for (let i = s; i <= e; i++) nums.add(i);
    } else if (/^\d+$/.test(part)) {
      nums.add(parseInt(part));
    }
  });
  return Array.from(nums).sort((a, b) => a - b);
}

// ─── Download Progress ───────────────────────────────────────────────────────

function showDownloadProgress(info: { progress: number; downloadedSize: number; totalSize: number; url: string }): void {
  const container = document.getElementById('downloadProgress')!;
  container.classList.add('active');
  (document.getElementById('downloadProgressFill') as HTMLElement).style.width = info.progress + '%';
  document.getElementById('downloadProgressPercent')!.textContent = info.progress + '%';
  const dlMB = (info.downloadedSize / 1024 / 1024).toFixed(2);
  const totalMB = (info.totalSize / 1024 / 1024).toFixed(2);
  document.getElementById('downloadProgressSize')!.textContent = `${dlMB}MB / ${totalMB}MB`;
  document.getElementById('downloadProgressUrl')!.textContent = info.url;
}

function showDownloadComplete(_info: unknown): void {
  const title = document.querySelector('.download-progress-title') as HTMLElement;
  if (title) title.textContent = '下载完成';
  setTimeout(() => hideDownloadProgress(), 3000);
}

function showDownloadError(info: { error: string }): void {
  const title = document.querySelector('.download-progress-title') as HTMLElement;
  if (title) title.textContent = '下载失败: ' + info.error;
  setTimeout(() => hideDownloadProgress(), 5000);
}

function hideDownloadProgress(): void {
  document.getElementById('downloadProgress')!.classList.remove('active');
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

let confirmResolve: ((v: boolean) => void) | null = null;

function showConfirmDialog(message: string, title = '确认'): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    document.getElementById('confirmDialogTitle')!.textContent = title;
    document.getElementById('confirmDialogMessage')!.textContent = message;
    document.getElementById('confirmDialogOverlay')!.classList.add('active');
    document.getElementById('confirmDialog')!.classList.add('active');

    const escHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { closeConfirmDialog(false); document.removeEventListener('keydown', escHandler); }
      else if (e.key === 'Enter') { closeConfirmDialog(true); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  });
}

function closeConfirmDialog(result: boolean): void {
  document.getElementById('confirmDialog')!.classList.remove('active');
  document.getElementById('confirmDialogOverlay')!.classList.remove('active');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// ─── Large File Dialog ───────────────────────────────────────────────────────

let pendingLargeFilePath: string | null = null;

function showLargeFileDialog(filePath: string): void {
  if (!filePath) { alert('文件路径无效'); return; }
  pendingLargeFilePath = filePath;

  const dlg = document.getElementById('largeFileDialog')!;
  const overlay = document.getElementById('largeFileDialogOverlay')!;
  (document.getElementById('timestampInput') as HTMLInputElement).value = '';
  (document.getElementById('readSizeInput') as HTMLInputElement).value = '100';

  overlay.classList.add('active');
  dlg.classList.add('active');
  setTimeout(() => (document.getElementById('timestampInput') as HTMLInputElement).focus(), 100);

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { closeLargeFileDialog(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

function closeLargeFileDialog(): void {
  document.getElementById('largeFileDialog')!.classList.remove('active');
  document.getElementById('largeFileDialogOverlay')!.classList.remove('active');
  pendingLargeFilePath = null;
}

async function confirmReadLargeFile(): Promise<void> {
  if (!pendingLargeFilePath) { alert('文件路径丢失，请重新打开文件'); closeLargeFileDialog(); return; }

  const timestamp = (document.getElementById('timestampInput') as HTMLInputElement).value.trim();
  const sizeMB = parseInt((document.getElementById('readSizeInput') as HTMLInputElement).value) || 100;
  const filePath = pendingLargeFilePath;
  closeLargeFileDialog();

  try {
    const result = await api.readFileByTimestamp(filePath, timestamp || null, sizeMB);
    if (result?.content) {
      onDidOpenFile(filePath, result.content);
      const info = `已读取 ${(result.readSize / 1024 / 1024).toFixed(2)}MB / ${(result.fileSize / 1024 / 1024).toFixed(2)}MB\n` +
        `起始行: ${result.startLine}, 总行数: ${result.totalLines}\n` +
        (result.foundTimestamp ? '✓ 找到时间戳位置' : (timestamp ? '✗ 未找到时间戳，从文件开头读取' : ''));
      alert(info);
    } else {
      alert('读取文件失败：返回结果无效');
    }
  } catch (err: any) {
    alert('读取文件失败: ' + err.message);
  }
}

// ─── data-action event delegation (replaces inline onclick handlers) ─────────

const actionMap: Record<string, (el: HTMLElement) => void> = {
  toggleFilterPanel: () => toggleFilterPanel(),
  addFilter: () => addFilter(),
  applyFilters: () => { void applyFilters(); },
  hideDownloadProgress: () => hideDownloadProgress(),
  closeLargeFileDialog: () => closeLargeFileDialog(),
  confirmReadLargeFile: () => { void confirmReadLargeFile(); },
  closeConfirmDialog: (el) => closeConfirmDialog(el.dataset.arg === 'true'),
};

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action!;
  const handler = actionMap[action];
  if (handler) handler(target);
});

// Keyboard Enter triggers for large-file dialog inputs
document.getElementById('timestampInput')?.addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void confirmReadLargeFile();
});
document.getElementById('readSizeInput')?.addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void confirmReadLargeFile();
});

// ─── Editor Context Menu (plugin-contributed items) ──────────────────────────

/** Plugin-contributed context menu items: id → label */
const pluginContextMenuItems = new Map<string, string>();

function setupEditorContextMenu(): void {
  const editorContainer = document.getElementById('editor')!;

  editorContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Get selected text from the editor
    const selection = editor.getSelection();
    const selectedText = selection ? editor.getModel()!.getValueInRange(selection) : '';

    showEditorContextMenu(e.clientX, e.clientY, selectedText);
  });

  // Listen for plugin registrations
  api.onEditorRegisterContextMenu((_event: unknown, data: { id: string; label: string }) => {
    pluginContextMenuItems.set(data.id, data.label);
  });

  api.onEditorUnregisterContextMenu((_event: unknown, data: { id: string }) => {
    pluginContextMenuItems.delete(data.id);
  });
}

function showEditorContextMenu(x: number, y: number, selectedText: string): void {
  // Remove any existing context menu
  document.querySelectorAll('.editor-context-menu').forEach(el => el.remove());

  // Build menu items
  const items: Array<{ label: string; action: () => void; disabled?: boolean }> = [
    {
      label: '复制',
      action: () => { document.execCommand('copy'); },
      disabled: !selectedText,
    },
    {
      label: '全选',
      action: () => {
        const model = editor.getModel();
        if (model) {
          editor.setSelection(model.getFullModelRange());
        }
      },
    },
  ];

  // Add plugin-contributed items (with separator)
  if (pluginContextMenuItems.size > 0) {
    items.push({ label: '---', action: () => {}, disabled: true }); // separator
    for (const [id, label] of pluginContextMenuItems) {
      items.push({
        label,
        action: () => {
          api.sendEditorContextMenuAction(id, selectedText);
        },
        disabled: !selectedText,
      });
    }
  }

  // Create menu DOM
  const menu = document.createElement('div');
  menu.className = 'editor-context-menu';
  menu.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;
    background: #252526; border: 1px solid #454545; border-radius: 4px;
    padding: 4px 0; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; color: #cccccc;
  `;

  for (const item of items) {
    if (item.label === '---') {
      const sep = document.createElement('div');
      sep.style.cssText = 'height: 1px; background: #454545; margin: 4px 0;';
      menu.appendChild(sep);
      continue;
    }
    const menuItem = document.createElement('div');
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 6px 24px; cursor: ${item.disabled ? 'default' : 'pointer'};
      color: ${item.disabled ? '#6a6a6a' : '#cccccc'};
      white-space: nowrap;
    `;
    if (!item.disabled) {
      menuItem.addEventListener('mouseenter', () => { menuItem.style.background = '#094771'; });
      menuItem.addEventListener('mouseleave', () => { menuItem.style.background = 'transparent'; });
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
    }
    menu.appendChild(menuItem);
  }

  document.body.appendChild(menu);

  // Adjust position if menu goes out of viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

  // Close on click outside or Escape
  const closeHandler = (ev: MouseEvent) => {
    if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', closeHandler); }
  };
  const escHandler = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { menu.remove(); document.removeEventListener('keydown', escHandler); }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler);
    document.addEventListener('keydown', escHandler);
  }, 0);
}

