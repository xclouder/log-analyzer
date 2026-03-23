/**
 * auto-updater.ts — Configures and manages automatic updates.
 */

import { dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getLogger } from './log-util';

/** Configure the auto-updater and register its event handlers. */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    const mainWindow = getMainWindow();
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
    const mainWindow = getMainWindow();
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
}

/** Silently check for updates (errors are ignored). */
export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Silently ignore network errors during update check
  }
}
