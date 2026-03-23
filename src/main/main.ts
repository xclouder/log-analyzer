/**
 * main.ts — Electron main process entry point for LogAnalyzer.
 *
 * This file is the pure orchestrator: it creates the main window, wires up
 * dependencies, and delegates to specialised modules for IPC, menus, and
 * auto-updates.
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { configureLogger, getLogger, shutdown as shutdownLogger } from './log-util';
import { CommandManager } from './command-manager';
import { PluginManager } from './plugin-manager';
import { readFile } from './file-reader';
import { registerFileIPC } from './ipc-file';
import { registerDialogIPC } from './ipc-dialog';
import { registerFilterIPC } from './ipc-filter';
import { registerPluginIPC } from './ipc-plugin';
import { registerMiscIPC } from './ipc-misc';
import { buildApplicationMenu } from './menu-builder';
import { initAutoUpdater, checkForUpdates } from './auto-updater';

// ─── App state ─────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let pluginManagerWindow: BrowserWindow | null = null;
let pluginManager: PluginManager;
let commandManager: CommandManager;
let currentFilePath = '';
let isLoggingEnabled = false;

const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

// ─── Core file open ────────────────────────────────────────────────────────────

/**
 * Open a file: run plugin pre-processing, detect encoding, run plugin content
 * processing, update app state and window title.
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
  if (mainWindow) {
    mainWindow.setTitle(finalPath ? `LogAnalyzer - ${finalPath}` : 'LogAnalyzer');
  }
  logger.info(`File opened: ${finalPath}`);

  return { content, filePath: finalPath };
}

// ─── Window creation ───────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'LogAnalyzer',
  });

  const htmlPath = app.isPackaged
    ? path.join(app.getAppPath(), 'src', 'renderer', 'index.html')
    : path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html');

  mainWindow.loadFile(htmlPath);

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

  buildApplicationMenu({
    getMainWindow: () => mainWindow,
    getPluginManagerWindow: () => pluginManagerWindow,
    setPluginManagerWindow: (win) => { pluginManagerWindow = win; },
    isLoggingEnabled: () => isLoggingEnabled,
    setLoggingEnabled: (enabled) => { isLoggingEnabled = enabled; },
  });

  checkForUpdates();

  commandManager = new CommandManager();
  pluginManager = new PluginManager(mainWindow, commandManager, () => currentFilePath);
  pluginManager.loadPlugins().then(() => {
    getLogger('Main').info('All plugins loaded');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const logger = getLogger('Main');
  try {
    configureLogger(app.getPath('userData'));
    logger.info('Application starting...');

    // Register all IPC handlers (before window creation)
    registerFileIPC({
      doOpenFile,
      getCurrentFilePath: () => currentFilePath,
      getMainWindow: () => mainWindow,
    });
    registerDialogIPC(() => mainWindow);
    registerFilterIPC();
    registerPluginIPC({
      getPluginManager: () => pluginManager,
      doOpenFile,
      getMainWindow: () => mainWindow,
    });
    registerMiscIPC({
      getCommandManager: () => commandManager,
      getPluginManager: () => pluginManager,
      getCurrentFilePath: () => currentFilePath,
      getMainWindow: () => mainWindow,
    });

    initAutoUpdater(() => mainWindow);
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
