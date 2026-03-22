/**
 * app.ts - Main renderer process logic for LogAnalyzer.
 *
 * Responsibilities:
 * - Initialize Monaco editors (source + filtered)
 * - Manage drag-and-drop file opening
 * - Manage filter panel UI (add/delete/apply filters)
 * - Handle large file dialog
 * - Handle confirm dialog
 * - Handle download progress display
 * - Listen to menu events from main process
 * - Coordinate between Monaco editors (line mapping, navigation)
 */

declare const monaco: typeof import('monaco-editor');
// jQuery is loaded via script tag; use loose type here
declare const $: any;

// ─── Global editor state ──────────────────────────────────────────────────────

let editor: import('monaco-editor').editor.IStandaloneCodeEditor;
let filteredEditor: import('monaco-editor').editor.IStandaloneCodeEditor;
let currentFilePath: string | null = null;
let currentFullscreenEditor: HTMLElement | null = null;

/** Maps filteredEditor line index (0-based) → source editor line index (0-based) */
let lineMapping: number[] = [];

let currentFilterConfig: { patterns: FilterPattern[] } = { patterns: [] };

interface FilterPattern {
  enabled: boolean;
  type: 'text' | 'regex' | 'line' | 'exclude-text';
  pattern: string;
  highlight: boolean;
  highlightColor: string;
}

// ─── Monaco initialization ────────────────────────────────────────────────────
// Monaco loader.js is loaded dynamically to handle packaged vs dev paths.
// In packaged builds, monaco is unpacked outside the asar.

(function loadMonaco() {
  const vsPath = (window as any).electronAPI.getMonacoVsPath();
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
}

// ─── Drag and Drop ────────────────────────────────────────────────────────────

function setupDragAndDrop(): void {
  const editorContainer = document.getElementById('editor')!;
  const filteredContainer = document.getElementById('filtered-editor')!;
  const filterSection = document.getElementById('filter-section')!;

  // Prevent default drag behavior on document
  document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });

  // Editor container: drop to open log file
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

  // Filter section: drop to load filter config JSON
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
      const config = await (window as any).electronAPI.importFilterCfg(filePath);
      if (!(e as DragEvent).ctrlKey && !(e as DragEvent).metaKey) clearFilters();
      onDidImportFilterConfig(config);
    } catch (err: any) {
      alert('加载配置错误: ' + err.message);
    }
  });
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

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
    // Exit fullscreen
    targetEl.classList.remove('fullscreen');
    document.body.classList.remove('has-fullscreen');
    currentFullscreenEditor = null;
    setTimeout(() => { editor.layout(); filteredEditor.layout(); }, 0);
  } else {
    // Exit existing fullscreen if any
    if (currentFullscreenEditor) {
      currentFullscreenEditor.classList.remove('fullscreen');
      document.body.classList.remove('has-fullscreen');
    }
    // Enter fullscreen
    targetEl.classList.add('fullscreen');
    document.body.classList.add('has-fullscreen');
    currentFullscreenEditor = targetEl;
    setTimeout(() => {
      if (targetEl === sourceEl) editor.layout();
      else filteredEditor.layout();
    }, 0);
  }
}

// ─── Menu Event Listeners ─────────────────────────────────────────────────────

const api = (window as any).electronAPI;

api.onMenuOpenFile(() => showOpenFileDialog());

api.onReloadFile(async () => {
  if (!currentFilePath) return;
  const result = await api.reloadCurrentFile();
  if (result) {
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

// Download progress
api.onDownloadProgress((_event: unknown, info: any) => showDownloadProgress(info));
api.onDownloadComplete((_event: unknown, info: any) => showDownloadComplete(info));
api.onDownloadError((_event: unknown, info: any) => showDownloadError(info));

// ─── File Operations ──────────────────────────────────────────────────────────

/** Check file size; show large-file dialog if > 200MB, else open normally. */
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

// ─── Filter Panel ─────────────────────────────────────────────────────────────

/** Toggle collapse/expand of the filter panel. */
function toggleFilterPanel(): void {
  document.querySelector('.filter-toggle')!.classList.toggle('collapsed');
  document.getElementById('filter-section')!.classList.toggle('collapsed');
}
(window as any).toggleFilterPanel = toggleFilterPanel;

function initializeColorPicker(container: HTMLElement, initialColor: string): void {
  if (!container || !(window as any).$) return;
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
(window as any).clearFilters = clearFilters;

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
    <button class="delete-filter" onclick="deleteFilter(this)">删除</button>
  `;

  const enableCb = filterDiv.querySelector('.enable-checkbox') as HTMLInputElement;
  const typeSelect = filterDiv.querySelector('.filter-type') as HTMLSelectElement;
  const patternInput = filterDiv.querySelector('.filter-pattern') as HTMLInputElement;
  const colorContainer = filterDiv.querySelector('.kendo-colorpicker-container') as HTMLElement;

  enableCb.addEventListener('change', () => updateCurrentConfig());
  typeSelect.addEventListener('change', () => { updatePlaceholder(typeSelect, patternInput); updateCurrentConfig(); });
  patternInput.addEventListener('input', () => updateCurrentConfig());

  document.getElementById('filter-container')!.appendChild(filterDiv);
  initializeColorPicker(colorContainer, '');
  updateCurrentConfig();
}
(window as any).addFilter = addFilter;

function deleteFilter(element: HTMLElement): void {
  element.closest('.filter-item')?.remove();
  updateCurrentConfig();
}
(window as any).deleteFilter = deleteFilter;

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
      <button class="delete-filter" onclick="deleteFilter(this)">删除</button>
    `;
    const typeSelect = filterItem.querySelector('.filter-type') as HTMLSelectElement;
    const patternInput = filterItem.querySelector('.filter-pattern') as HTMLInputElement;
    const enableCb = filterItem.querySelector('.enable-checkbox') as HTMLInputElement;
    const colorContainer = filterItem.querySelector('.kendo-colorpicker-container') as HTMLElement;

    updatePlaceholder(typeSelect, patternInput);
    enableCb.addEventListener('change', () => updateCurrentConfig());
    typeSelect.addEventListener('change', () => { updatePlaceholder(typeSelect, patternInput); updateCurrentConfig(); });
    patternInput.addEventListener('input', () => updateCurrentConfig());

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

// ─── Apply Filters (client-side) ─────────────────────────────────────────────

async function applyFilters(): Promise<void> {
  try {
    const sourceContent = editor.getValue();
    if (!sourceContent) { filteredEditor.setValue(''); return; }

    const lines = sourceContent.split('\n');
    const activeFilters = currentFilterConfig.patterns.filter((f) => f.enabled);
    const includeFilters = activeFilters.filter((f) => f.type !== 'exclude-text');
    const excludeFilters = activeFilters.filter((f) => f.type === 'exclude-text');

    // If no active filters, show all
    if (activeFilters.length === 0) {
      filteredEditor.setValue(sourceContent);
      lineMapping = lines.map((_, i) => i);
      return;
    }

    const filteredIndices = new Set<number>();
    const highlightRanges: { pattern: string; color: string; isRegex?: boolean; lines?: number[] }[] = [];

    // Apply include filters
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
      // Only exclude filters — start with all lines
      lines.forEach((_, i) => filteredIndices.add(i));
    }

    // Apply exclude filters
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

    // Double-click in filtered editor: jump to source line
    filteredEditor.onMouseDown((e) => {
      if (e.event.detail === 2 && e.target.position) {
        const filteredLineIndex = e.target.position.lineNumber - 1;
        const originalLineIndex = lineMapping[filteredLineIndex];
        if (originalLineIndex !== undefined) {
          // Exit fullscreen if needed
          if (currentFullscreenEditor) {
            currentFullscreenEditor.classList.remove('fullscreen');
            document.body.classList.remove('has-fullscreen');
            currentFullscreenEditor = null;
            setTimeout(() => { editor.layout(); filteredEditor.layout(); }, 0);
          }
          const originalLine = originalLineIndex + 1; // Monaco is 1-based
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

    // Apply highlight decorations
    applyHighlightDecorations(filteredContent, highlightRanges);
  } catch (err: any) {
    filteredEditor.setValue(`错误: ${err.message || '过滤失败'}`);
  }
}
(window as any).applyFilters = applyFilters;

function applyHighlightDecorations(
  filteredContent: string,
  ranges: { pattern: string; color: string; isRegex?: boolean; lines?: number[] }[],
): void {
  // Clear old highlight styles
  document.head.querySelectorAll('style[data-highlight]').forEach((s) => s.remove());

  if (!ranges.length) return;

  const model = filteredEditor.getModel();
  if (!model) return;

  const decorations: import('monaco-editor').editor.IModelDeltaDecoration[] = [];

  ranges.forEach(({ pattern, color, isRegex, lines: lineNums }, idx) => {
    // Add CSS for this highlight class
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

// ─── Download Progress ────────────────────────────────────────────────────────

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
(window as any).hideDownloadProgress = hideDownloadProgress;

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

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
(window as any).closeConfirmDialog = closeConfirmDialog;

// ─── Large File Dialog ────────────────────────────────────────────────────────

let pendingLargeFilePath: string | null = null;

function showLargeFileDialog(filePath: string): void {
  if (!filePath) { alert('文件路径无效'); return; }
  pendingLargeFilePath = filePath;

  const dialog = document.getElementById('largeFileDialog')!;
  const overlay = document.getElementById('largeFileDialogOverlay')!;
  (document.getElementById('timestampInput') as HTMLInputElement).value = '';
  (document.getElementById('readSizeInput') as HTMLInputElement).value = '100';

  overlay.classList.add('active');
  dialog.classList.add('active');

  // Focus the timestamp input after a short delay
  setTimeout(() => (document.getElementById('timestampInput') as HTMLInputElement).focus(), 100);

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { closeLargeFileDialog(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}
(window as any).showLargeFileDialog = showLargeFileDialog;

function closeLargeFileDialog(): void {
  document.getElementById('largeFileDialog')!.classList.remove('active');
  document.getElementById('largeFileDialogOverlay')!.classList.remove('active');
  pendingLargeFilePath = null;
}
(window as any).closeLargeFileDialog = closeLargeFileDialog;

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
(window as any).confirmReadLargeFile = confirmReadLargeFile;
