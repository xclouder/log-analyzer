/**
 * ipc-file.ts — IPC handlers for file operations.
 */

import { ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs/promises';
import { readFileByTimestamp } from './file-reader';
import {
  IPC_FILE_OPEN,
  IPC_FILE_RELOAD,
  IPC_FILE_STATS,
  IPC_FILE_READ_BY_TIMESTAMP,
  IPC_SHOW_ITEM_IN_FOLDER,
} from '../shared/ipc-channels';

interface FileIPCDeps {
  doOpenFile: (filePath: string) => Promise<{ content: string | null; filePath: string }>;
  getCurrentFilePath: () => string;
  getMainWindow: () => Electron.BrowserWindow | null;
}

export function registerFileIPC(deps: FileIPCDeps): void {
  // Open a file (runs through plugin pre-processing and encoding detection)
  ipcMain.handle(IPC_FILE_OPEN, async (_event, filePath: string) => {
    return deps.doOpenFile(filePath);
  });

  // Reload the currently-open file
  ipcMain.handle(IPC_FILE_RELOAD, async () => {
    const currentFilePath = deps.getCurrentFilePath();
    const mainWindow = deps.getMainWindow();
    if (!currentFilePath || !mainWindow) return null;
    try {
      await fs.access(currentFilePath);
    } catch {
      dialog.showErrorBox('Error', 'The current file no longer exists.');
      return null;
    }
    return deps.doOpenFile(currentFilePath);
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
    const target = filePath || deps.getCurrentFilePath();
    if (target) shell.showItemInFolder(target);
  });
}
