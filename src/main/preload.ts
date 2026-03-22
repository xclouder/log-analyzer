/**
 * preload.ts — Secure bridge between Electron main process and renderer.
 *
 * Exposes a typed `window.electronAPI` surface via contextBridge.
 * All IPC channel names are imported from the shared constants file.
 *
 * Security: contextIsolation=true, nodeIntegration=false (enforced in main.ts).
 */

import * as path from 'path';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IPC_FILE_OPEN,
  IPC_FILE_RELOAD,
  IPC_FILE_STATS,
  IPC_FILE_READ_BY_TIMESTAMP,
  IPC_DIALOG_OPEN_FILE,
  IPC_DIALOG_SAVE_FILE,
  IPC_FILTER_IMPORT,
  IPC_FILTER_SAVE_CONFIG,
  IPC_PLUGIN_LIST,
  IPC_PLUGIN_INSTALL,
  IPC_PLUGIN_UNINSTALL,
  IPC_COMMAND_SEARCH,
  IPC_COMMAND_LIST,
  IPC_COMMAND_EXECUTE,
  IPC_GET_CURRENT_FILE_PATH,
  IPC_OPEN_USER_PLUGINS_DIR,
  IPC_SHOW_ITEM_IN_FOLDER,
  IPC_MENU_OPEN_FILE,
  IPC_MENU_RELOAD_FILE,
  IPC_MENU_SHOW_IN_FOLDER,
  IPC_FILTER_SAVE_CONFIG_DIALOG,
  IPC_FILTER_LOAD,
  IPC_COMMAND_REGISTER,
  IPC_COMMAND_UNREGISTER,
  IPC_PLUGIN_OPEN_FILE,
  IPC_PLUGIN_OPEN_FILE_REQUEST,
  IPC_PLUGIN_INPUTBOX_RESPONSE,
  IPC_PLUGIN_QUICKPICK_RESPONSE,
  IPC_PLUGIN_INFORMATION_RESPONSE,
  IPC_PLUGIN_ERROR_RESPONSE,
  IPC_PLUGIN_SHOW_INPUTBOX,
  IPC_PLUGIN_SHOW_QUICKPICK,
  IPC_PLUGIN_SHOW_INFORMATION,
  IPC_PLUGIN_SHOW_ERROR,
  IPC_DOWNLOAD_PROGRESS,
  IPC_DOWNLOAD_COMPLETE,
  IPC_DOWNLOAD_ERROR,
  IPC_TOGGLE_LOGGING,
} from '../shared/ipc-channels';

// ── Compute resource paths for renderer ────────────────────────────────────────
// In dev, resources are relative to the project root.
// In packaged builds, monaco is unpacked outside the asar at app.asar.unpacked/.
// The preload script is at dist/main/main/preload.js → project root is ../../..
const projectRoot = path.join(__dirname, '..', '..', '..');
const isPackaged = projectRoot.includes('app.asar');
const monacoVsPath = isPackaged
  ? path.join(projectRoot.replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'monaco-editor', 'min', 'vs')
  : path.join(projectRoot, 'node_modules', 'monaco-editor', 'min', 'vs');

type Callback = (event: IpcRendererEvent, ...args: any[]) => void;

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Resource paths (for Monaco etc.) ─────────────────────────────────────
  getMonacoVsPath: () => monacoVsPath,
  isPackaged: () => isPackaged,
  // ── File operations ────────────────────────────────────────────────────────
  openFile: (filePath: string) => ipcRenderer.invoke(IPC_FILE_OPEN, filePath),
  reloadCurrentFile: () => ipcRenderer.invoke(IPC_FILE_RELOAD),
  getFileStats: (filePath: string) => ipcRenderer.invoke(IPC_FILE_STATS, filePath),
  readFileByTimestamp: (filePath: string, timestamp: string | null, sizeMB: number) =>
    ipcRenderer.invoke(IPC_FILE_READ_BY_TIMESTAMP, { filePath, timestamp, sizeMB }),
  showItemInFolder: (filePath?: string) => ipcRenderer.send(IPC_SHOW_ITEM_IN_FOLDER, filePath),

  // ── Dialogs ────────────────────────────────────────────────────────────────
  dialogOpenFile: () => ipcRenderer.invoke(IPC_DIALOG_OPEN_FILE),
  saveFile: (content: any) => ipcRenderer.invoke(IPC_DIALOG_SAVE_FILE, content),

  // ── Filter ─────────────────────────────────────────────────────────────────
  importFilterCfg: (filePath: string) => ipcRenderer.invoke(IPC_FILTER_IMPORT, filePath),
  saveFilterConfig: (config: any, filePath: string) =>
    ipcRenderer.invoke(IPC_FILTER_SAVE_CONFIG, config, filePath),

  // ── Plugin management ──────────────────────────────────────────────────────
  pluginManager: {
    getPlugins: () => ipcRenderer.invoke(IPC_PLUGIN_LIST),
    installPlugin: (zipPath: string) => ipcRenderer.invoke(IPC_PLUGIN_INSTALL, zipPath),
    uninstallPlugin: (name: string) => ipcRenderer.invoke(IPC_PLUGIN_UNINSTALL, name),
  },
  openUserPluginsDir: () => ipcRenderer.send(IPC_OPEN_USER_PLUGINS_DIR),

  // ── Command palette ────────────────────────────────────────────────────────
  searchCommands: (query: string) => ipcRenderer.invoke(IPC_COMMAND_SEARCH, query),
  getCommands: () => ipcRenderer.invoke(IPC_COMMAND_LIST),
  executeCommand: (cmdId: string) => ipcRenderer.invoke(IPC_COMMAND_EXECUTE, cmdId),
  onCommandRegister: (cb: Callback) => ipcRenderer.on(IPC_COMMAND_REGISTER, cb),
  onCommandUnregister: (cb: Callback) => ipcRenderer.on(IPC_COMMAND_UNREGISTER, cb),

  // ── App state ──────────────────────────────────────────────────────────────
  getCurrentFilePath: () => ipcRenderer.invoke(IPC_GET_CURRENT_FILE_PATH),

  // ── Menu events (main → renderer) ─────────────────────────────────────────
  onMenuOpenFile: (cb: Callback) => ipcRenderer.on(IPC_MENU_OPEN_FILE, cb),
  onMenuSaveFile: (cb: Callback) => ipcRenderer.on('menu:save-file', cb),
  onReloadFile: (cb: Callback) => ipcRenderer.on(IPC_MENU_RELOAD_FILE, cb),
  onMenuShowInFolder: (cb: Callback) => ipcRenderer.on(IPC_MENU_SHOW_IN_FOLDER, cb),

  // ── Filter dialog events (main → renderer) ─────────────────────────────────
  onFilterSaveConfig: (cb: Callback) => ipcRenderer.on(IPC_FILTER_SAVE_CONFIG_DIALOG, cb),
  onFilterLoadConfig: (cb: Callback) => ipcRenderer.on(IPC_FILTER_LOAD, cb),

  // ── Plugin UI dialogs (main → renderer) ───────────────────────────────────
  onPluginShowInputBox: (cb: Callback) => ipcRenderer.on(IPC_PLUGIN_SHOW_INPUTBOX, cb),
  onPluginShowQuickPick: (cb: Callback) => ipcRenderer.on(IPC_PLUGIN_SHOW_QUICKPICK, cb),
  onPluginShowInformation: (cb: Callback) => ipcRenderer.on(IPC_PLUGIN_SHOW_INFORMATION, cb),
  onPluginShowError: (cb: Callback) => ipcRenderer.on(IPC_PLUGIN_SHOW_ERROR, cb),

  // ── Plugin UI dialog responses (renderer → main) ───────────────────────────
  sendInputBoxResponse: (requestId: string, value: string | null) =>
    ipcRenderer.send(IPC_PLUGIN_INPUTBOX_RESPONSE, { requestId, value }),
  sendQuickPickResponse: (requestId: string, value: string | null) =>
    ipcRenderer.send(IPC_PLUGIN_QUICKPICK_RESPONSE, { requestId, value }),
  sendInformationResponse: (requestId: string) =>
    ipcRenderer.send(IPC_PLUGIN_INFORMATION_RESPONSE, { requestId }),
  sendErrorResponse: (requestId: string) =>
    ipcRenderer.send(IPC_PLUGIN_ERROR_RESPONSE, { requestId }),

  // ── Plugin file open ───────────────────────────────────────────────────────
  onPluginOpenFile: (cb: Callback) => ipcRenderer.on(IPC_PLUGIN_OPEN_FILE, cb),

  // ── Download progress ──────────────────────────────────────────────────────
  onDownloadProgress: (cb: Callback) => ipcRenderer.on(IPC_DOWNLOAD_PROGRESS, cb),
  onDownloadComplete: (cb: Callback) => ipcRenderer.on(IPC_DOWNLOAD_COMPLETE, cb),
  onDownloadError: (cb: Callback) => ipcRenderer.on(IPC_DOWNLOAD_ERROR, cb),

  // ── Dev ────────────────────────────────────────────────────────────────────
  onToggleLogging: (cb: Callback) => ipcRenderer.on(IPC_TOGGLE_LOGGING, cb),

  // ── Window controls ────────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // ── showInputBox legacy (used by plugin:showInputBox in original) ──────────
  showInputBox: (options: any) => ipcRenderer.invoke('plugin:showInputBox', options),
});

// ── Plugin open-file bridge ────────────────────────────────────────────────────
// Renderer sends 'plugin-open-file-request' when a plugin calls pluginOpenFile().
// We forward it to the main process.
ipcRenderer.on(IPC_PLUGIN_OPEN_FILE_REQUEST, (_event, data) => {
  ipcRenderer.send(IPC_PLUGIN_OPEN_FILE_REQUEST, data);
});
