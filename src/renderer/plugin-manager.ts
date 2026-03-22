/**
 * plugin-manager.ts - Renderer logic for the plugin manager window.
 *
 * Handles:
 * - Listing installed plugins
 * - Installing a plugin from a .zip file (drag-and-drop or file picker)
 * - Uninstalling plugins
 * - Opening the user plugins directory
 */

interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  author: string;
  isBuiltin?: boolean;
}

interface PluginOperationResult {
  success: boolean;
  error?: string;
}

const pluginManager = (window as any).electronAPI.pluginManager as {
  getPlugins(): Promise<PluginInfo[]>;
  installPlugin(filePath: string): Promise<PluginOperationResult>;
  uninstallPlugin(name: string): Promise<PluginOperationResult>;
};

// ─── Load and render plugin list ─────────────────────────────────────────────

async function loadPlugins(): Promise<void> {
  console.log('Loading plugins...');
  const plugins = await pluginManager.getPlugins();
  const pluginList = document.getElementById('pluginList')!;
  pluginList.innerHTML = '';

  plugins.forEach((plugin) => {
    const pluginElement = document.createElement('div');
    pluginElement.className = 'plugin-item';
    pluginElement.innerHTML = `
      <div class="plugin-header">
        <span class="plugin-name">${plugin.name}</span>
        <span class="plugin-version">v${plugin.version}</span>
      </div>
      <div class="plugin-description">${plugin.description ?? '无描述'}</div>
      <div class="plugin-author">作者: ${plugin.author}</div>
      <div class="plugin-actions">
        <button class="btn btn-danger"
                onclick="uninstallPlugin('${plugin.name}')"
                ${plugin.isBuiltin ? 'disabled' : ''}>
          ${plugin.isBuiltin ? '内置插件' : '删除'}
        </button>
      </div>
    `;
    pluginList.appendChild(pluginElement);
  });
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

async function uninstallPlugin(pluginName: string): Promise<void> {
  if (!confirm(`确定要删除插件 "${pluginName}" 吗？`)) return;
  try {
    const result = await pluginManager.uninstallPlugin(pluginName);
    if (result.success) {
      alert('插件已成功删除');
      void loadPlugins();
    } else {
      alert('删除插件失败: ' + result.error);
    }
  } catch (err: any) {
    alert('删除插件时发生错误: ' + err.message);
  }
}
(window as any).uninstallPlugin = uninstallPlugin;

// ─── Install ──────────────────────────────────────────────────────────────────

async function handlePluginInstall(file: File): Promise<void> {
  if (!file.name.endsWith('.zip')) {
    alert('请选择 .zip 格式的插件包');
    return;
  }
  try {
    const result = await pluginManager.installPlugin((file as any).path as string);
    if (result.success) {
      alert('插件安装成功');
      void loadPlugins();
    } else {
      alert('安装插件失败: ' + result.error);
    }
  } catch (err: any) {
    alert('安装插件时发生错误: ' + err.message);
  }
}

// ─── Drag-and-drop install area ───────────────────────────────────────────────

const dragArea = document.getElementById('dragArea')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

dragArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dragArea.classList.add('drag-over');
});

dragArea.addEventListener('dragleave', () => {
  dragArea.classList.remove('drag-over');
});

dragArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragArea.classList.remove('drag-over');
  const files = (e as DragEvent).dataTransfer?.files;
  if (files && files.length > 0) {
    await handlePluginInstall(files[0]);
  }
});

dragArea.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  if (fileInput.files && fileInput.files.length > 0) {
    await handlePluginInstall(fileInput.files[0]);
  }
});

// ─── Open plugins directory ───────────────────────────────────────────────────

function openUserPluginsDir(): void {
  (window as any).electronAPI.openUserPluginsDir();
}
(window as any).openUserPluginsDir = openUserPluginsDir;

// ─── Initialise ───────────────────────────────────────────────────────────────

void loadPlugins();
