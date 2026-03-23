/**
 * ipc-misc.ts — IPC handlers for commands, window controls, and misc functions.
 */

import { ipcMain, shell } from 'electron';
import type { CommandManager } from './command-manager';
import type { PluginManager } from './plugin-manager';
import {
  IPC_COMMAND_SEARCH,
  IPC_COMMAND_LIST,
  IPC_COMMAND_EXECUTE,
  IPC_GET_CURRENT_FILE_PATH,
  IPC_OPEN_USER_PLUGINS_DIR,
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_MAXIMIZE,
  IPC_WINDOW_CLOSE,
  IPC_WINDOW_IS_MAXIMIZED,
} from '../shared/ipc-channels';

interface MiscIPCDeps {
  getCommandManager: () => CommandManager;
  getPluginManager: () => PluginManager;
  getCurrentFilePath: () => string;
  getMainWindow: () => Electron.BrowserWindow | null;
}

export function registerMiscIPC(deps: MiscIPCDeps): void {
  // ── Command palette ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_COMMAND_SEARCH, async (_event, query: string) => {
    return deps.getCommandManager().searchCommands(query);
  });

  ipcMain.handle(IPC_COMMAND_LIST, async () => {
    return deps.getCommandManager().getAllCommands();
  });

  ipcMain.handle(IPC_COMMAND_EXECUTE, async (_event, cmdId: string) => {
    return deps.getCommandManager().executeCommand(cmdId);
  });

  // ── App state ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC_GET_CURRENT_FILE_PATH, () => deps.getCurrentFilePath());

  ipcMain.on(IPC_OPEN_USER_PLUGINS_DIR, async () => {
    shell.openPath(deps.getPluginManager().userPluginsDir);
  });

  // ── Window controls ────────────────────────────────────────────────────────
  ipcMain.on(IPC_WINDOW_MINIMIZE, () => deps.getMainWindow()?.minimize());
  ipcMain.on(IPC_WINDOW_MAXIMIZE, () => {
    const win = deps.getMainWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on(IPC_WINDOW_CLOSE, () => deps.getMainWindow()?.close());
  ipcMain.handle(IPC_WINDOW_IS_MAXIMIZED, () => deps.getMainWindow()?.isMaximized() ?? false);
}
