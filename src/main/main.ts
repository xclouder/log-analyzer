/**
 * main.ts — Electron main process entry point for LogAnalyzer.
 *
 * Responsibilities:
 * - Create the main BrowserWindow
 * - Set up the application menu
 * - Register all IPC handlers (file, dialog, filter, plugin, command, misc)
 * - Manage plugin lifecycle via PluginManager
 * - Handle auto-updates
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { configureLogger, getLogger, shutdown as shutdownLogger } from './log-util';
import { CommandManager } from './command-manager';
import { PluginManager } from './plugin-manager';
import { readFile, readFileByTimestamp } from './file-reader';
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
  IPC_PLUGIN_OPEN_FILE_REQUEST,
  IPC_PLUGIN_OPEN_FILE_RESPONSE,
  IPC_TOGGLE_LOGGING,
} from '../shared/ipc-channels';

// ─── App state ────────────────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let pluginManagerWindow: BrowserWindow | null = null;
let pluginManager: PluginManager;
let commandManager: CommandManager;
let currentFilePath = '';
let isLoggingEnabled = false;

// ─── Auto-updater config ───────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ─── Window creation ───────────────────────────────────────────────────────────────

// __dirname in dev = dist/main/main/  (rootDir=src, src/main/main.ts → dist/main/main/main.js)
// project root     = __dirname + '/../../..'
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required so preload can require() shared modules
      // preload.js is compiled to dist/main/main/preload.js (same dir as main.js)
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'LogAnalyzer',
  });

  // HTML files are not compiled by TS — load directly from src/renderer/ in dev.
  // In packaged builds, HTML is inside app.asar at src/renderer/.
  const htmlPath = app.isPackaged
    ? path.join(app.getAppPath(), 'src', 'renderer', 'index.html')
    : path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html');

  mainWindow.loadFile(htmlPath);
  // mainWindow.webContents.openDevTools(); // Uncomment to open DevTools on start

  // Capture renderer console output for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelStr = ['VERBOSE', 'INFO', 'WARN', 'ERROR'][level] ?? 'UNKNOWN';
    const logger = getLogger('Renderer');
    if (level >= 2) {
      logger.error(`[${levelStr}] ${message} (${sourceId}:${line})`);
    } else {
      logger.info(`[${levelStr}] ${message}`);
    }
  });

  createMenu();
  checkForUpdates();

  commandManager = new CommandManager();
  setupCommandIPC();

  pluginManager = new PluginManager(mainWindow, commandManager);
  pluginManager.loadPlugins().then(() => {
    const logger = getLogger('Main');
    logger.info('All plugins loaded');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC: Commands ─────────────────────────────────────────────────────────────────────

function setupCommandIPC(): void {
  ipcMain.handle(IPC_COMMAND_SEARCH, async (_event, query: string) => {
    return commandManager.searchCommands(query);
  });

  ipcMain.handle(IPC_COMMAND_LIST, async () => {
    return commandManager.getAllCommands();
  });

  ipcMain.handle(IPC_COMMAND_EXECUTE, async (_event, cmdId: string) => {
    return commandManager.executeCommand(cmdId);
  });
}

// ─── IPC: File operations ──────────────────────────────────────────────────────────

function setupFileIPC(): void {
  // Open a file (runs through plugin pre-processing and encoding detection)
  ipcMain.handle(IPC_FILE_OPEN, async (_event, filePath: string) => {
    return doOpenFile(filePath);
  });

  // Reload the currently-open file
  ipcMain.handle(IPC_FILE_RELOAD, async () => {
    if (!currentFilePath || !mainWindow) return null;
    try {
      await fs.access(currentFilePath);
    } catch {
      dialog.showErrorBox('Error', 'The current file no longer exists.');
      return null;
    }
    return doOpenFile(currentFilePath);
  });

  // File stats (for large-file detection)
  ipcMain.handle(IPC_FILE_STATS, async (_event, filePath: string) => {
    if (!filePath) throw new Error('File path is required');
    return fs.stat(filePath);
  });

  // Large-file read by timestamp
  ipcMain.handle(
    IPC_FILE_READ_BY_TIMESTAMP,
    async (_event, { filePath, timestamp, sizeMB = 100 }: { filePath: string; timestamp: string | null; sizeMB: number }) => {
      if (!filePath) throw new Error('File path is required');
      return readFileByTimestamp(filePath, timestamp, sizeMB);
    },
  );

  // Show current file in OS file manager
  ipcMain.on(IPC_SHOW_ITEM_IN_FOLDER, (_event, filePath?: string) => {
    const target = filePath || currentFilePath;
    if (target) shell.showItemInFolder(target);
  });
}

// ─── IPC: Dialogs ────────────────────────────────────────────────────────────────────────

function setupDialogIPC(): void {
  ipcMain.handle(IPC_DIALOG_OPEN_FILE, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { filePath: result.filePaths[0] };
    }
    return null;
  });

  // saveFile is a no-op (saving not needed), kept for API compatibility
  ipcMain.handle(IPC_DIALOG_SAVE_FILE, async () => false);
}

// ─── IPC: Filters ─────────────────────────────────────────────────────────────────────────

function setupFilterIPC(): void {
  // Import (read) a filter config JSON from disk
  ipcMain.handle(IPC_FILTER_IMPORT, async (_event, filePath: string) => {
    const raw = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(raw);
    if (!config || !config.patterns) throw new Error('Invalid filter config format');
    return config;
  });

  // Save a filter config JSON to disk
  ipcMain.handle(IPC_FILTER_SAVE_CONFIG, async (_event, config: unknown, filePath: string) => {
    try {
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

// ─── IPC: Plugin management ───────────────────────────────────────────────────────────

function setupPluginIPC(): void {
  ipcMain.handle(IPC_PLUGIN_LIST, async () => pluginManager.getPlugins());

  ipcMain.handle(IPC_PLUGIN_INSTALL, async (_event, zipPath: string) => {
    return pluginManager.installPlugin(zipPath);
  });

  ipcMain.handle(IPC_PLUGIN_UNINSTALL, async (_event, pluginName: string) => {
    return pluginManager.uninstallPlugin(pluginName);
  });

  // Plugin requests to open a file (from plugin API → renderer → back to main)
  ipcMain.on(IPC_PLUGIN_OPEN_FILE_REQUEST, async (_event, { filePath, requestId }: { filePath: string; requestId: string }) => {
    const logger = getLogger('Main');
    logger.info(`plugin-open-file request: ${filePath}`);
    try {
      await doOpenFile(filePath);
      mainWindow?.webContents.send(IPC_PLUGIN_OPEN_FILE_RESPONSE, { requestId, success: true });
    } catch (error: any) {
      mainWindow?.webContents.send(IPC_PLUGIN_OPEN_FILE_RESPONSE, { requestId, success: false, error: error.message });
    }
  });
}

// ─── IPC: Misc ────────────────────────────────────────────────────────────────────────────

function setupMiscIPC(): void {
  ipcMain.handle(IPC_GET_CURRENT_FILE_PATH, () => currentFilePath);

  ipcMain.on(IPC_OPEN_USER_PLUGINS_DIR, async () => {
    shell.openPath(pluginManager.userPluginsDir);
  });

  // Window controls (frameless window)
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
}

// ─── Core file open ────────────────────────────────────────────────────────────────────

/**
 * Open a file: run plugin pre-processing, detect encoding, run plugin content
 * processing, update app state and window title.
 *
 * Returns { content, filePath } on success; { content: null, filePath } on error.
 * When a plugin returns '' as the processed path it means “already handled —
 * do not read file as text” (e.g. plugin opened a different file).
 */
async function doOpenFile(filePath: string): Promise<{ content: string | null; filePath: string }> {
  const logger = getLogger('Main');
  logger.info(`doOpenFile: ${filePath}`);

  // 1. Plugin pre-processing (path transform / zip extraction / etc.)
  let finalPath = filePath;
  try {
    finalPath = await pluginManager.preProcessFilePath(filePath);
  } catch (err) {
    logger.error('Plugin preProcessFilePath error:', err);
  }

  // '' sentinel: plugin handled it (e.g. opened a different file)
  if (finalPath === '') {
    return { content: null, filePath };
  }

  // 2. Read file with auto-encoding detection
  let content: string;
  try {
    content = await readFile(finalPath);
  } catch (err: any) {
    logger.error(`Error reading file ${finalPath}:`, err);
    return { content: null, filePath: finalPath };
  }

  // 3. Plugin content processing (optional transforms)
  try {
    content = await pluginManager.processFileContent(finalPath, content);
  } catch (err) {
    logger.error('Plugin processFileContent error:', err);
  }

  // 4. Update state
  currentFilePath = finalPath;
  updateWindowTitle(finalPath);
  logger.info(`File opened: ${finalPath}`);

  return { content, filePath: finalPath };
}

// ─── Menu ───────────────────────────────────────────────────────────────────────────────────

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const { spawn } = require('child_process');
            const child = spawn(process.execPath, [], { detached: true, stdio: 'ignore' });
            child.unref();
          },
        },
        {
          label: 'Open File',
          click: () => mainWindow?.webContents.send(IPC_MENU_OPEN_FILE),
        },
        {
          label: 'Reload File',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.send(IPC_MENU_RELOAD_FILE),
        },
        {
          label: 'Show in Folder',
          click: () => mainWindow?.webContents.send(IPC_MENU_SHOW_IN_FOLDER),
        },
        { type: 'separator' },
        {
          label: 'Open Log Directory',
          click: () => shell.openPath(path.join(app.getPath('userData'), 'logs')),
        },
        { type: 'separator' },
        {
          label: 'Save Filter Config',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showSaveDialog(mainWindow, {
              title: 'Save Filter Config',
              filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!result.canceled && result.filePath) {
              mainWindow.webContents.send(IPC_FILTER_SAVE_CONFIG_DIALOG, result.filePath);
            }
          },
        },
        {
          label: 'Load Filter Config',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Load Filter Config',
              filters: [{ name: 'JSON', extensions: ['json'] }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send(IPC_FILTER_LOAD, result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Plugins',
      submenu: [
        {
          label: 'Plugin Manager',
          click: () => {
            if (pluginManagerWindow) {
              pluginManagerWindow.focus();
              return;
            }
            pluginManagerWindow = new BrowserWindow({
              width: 800,
              height: 600,
              parent: mainWindow ?? undefined,
              modal: true,
              webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
              },
            });
            pluginManagerWindow.setMenu(null);

            const pmHtml = app.isPackaged
              ? path.join(app.getAppPath(), 'src', 'renderer', 'plugin-manager.html')
              : path.join(PROJECT_ROOT, 'src', 'renderer', 'plugin-manager.html');
            pluginManagerWindow.loadFile(pmHtml);
            pluginManagerWindow.on('closed', () => {
              pluginManagerWindow = null;
            });
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: 'About LogAnalyzer',
              message: `LogAnalyzer v${app.getVersion()}

A powerful log analysis tool`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
    {
      label: 'Dev',
      submenu: [
        {
          label: 'Toggle Debug Logging',
          type: 'checkbox',
          checked: isLoggingEnabled,
          click: (menuItem) => {
            isLoggingEnabled = menuItem.checked;
            mainWindow?.webContents.send(IPC_TOGGLE_LOGGING, isLoggingEnabled);
          },
        },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

function updateWindowTitle(filePath: string): void {
  if (mainWindow) {
    mainWindow.setTitle(filePath ? `LogAnalyzer - ${filePath}` : 'LogAnalyzer');
  }
}

async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Silently ignore network errors during update check
  }
}

// ─── Auto-updater events ───────────────────────────────────────────────────────────────

autoUpdater.on('update-available', (info) => {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `New version ${info.version} is available. Download now?`,
      buttons: ['Download', 'Later'],
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
});

autoUpdater.on('update-downloaded', () => {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'The update has been downloaded. Restart to apply it.',
      buttons: ['Restart Now', 'Later'],
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
});

autoUpdater.on('error', (err) => {
  getLogger('Main').error('AutoUpdater error:', err);
});

// ─── App lifecycle ─────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const logger = getLogger('Main');
  try {
    // Configure logger first (needs userData path which is only available after ready)
    configureLogger(app.getPath('userData'));
    logger.info('Application starting...');

    // Register all IPC handlers
    setupFileIPC();
    setupDialogIPC();
    setupFilterIPC();
    setupPluginIPC();
    setupMiscIPC();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('Error during app initialization:', err);
  }
});

app.on('window-all-closed', async () => {
  getLogger('Main').info('All windows closed, shutting down...');
  await shutdownLogger();
  if (process.platform !== 'darwin') app.quit();
});
