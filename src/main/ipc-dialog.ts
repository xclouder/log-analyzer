/**
 * ipc-dialog.ts — IPC handlers for file dialogs.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  IPC_DIALOG_OPEN_FILE,
  IPC_DIALOG_SAVE_FILE,
} from '../shared/ipc-channels';

export function registerDialogIPC(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_DIALOG_OPEN_FILE, async () => {
    const mainWindow = getMainWindow();
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
