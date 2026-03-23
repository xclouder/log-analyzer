/**
 * ipc-plugin.ts — IPC handlers for plugin management.
 */

import { ipcMain } from 'electron';
import { getLogger } from './log-util';
import type { PluginManager } from './plugin-manager';
import {
  IPC_PLUGIN_LIST,
  IPC_PLUGIN_INSTALL,
  IPC_PLUGIN_UNINSTALL,
  IPC_PLUGIN_OPEN_FILE_REQUEST,
  IPC_PLUGIN_OPEN_FILE_RESPONSE,
} from '../shared/ipc-channels';

interface PluginIPCDeps {
  getPluginManager: () => PluginManager;
  doOpenFile: (filePath: string) => Promise<{ content: string | null; filePath: string }>;
  getMainWindow: () => Electron.BrowserWindow | null;
}

export function registerPluginIPC(deps: PluginIPCDeps): void {
  ipcMain.handle(IPC_PLUGIN_LIST, async () => deps.getPluginManager().getPlugins());

  ipcMain.handle(IPC_PLUGIN_INSTALL, async (_event, zipPath: string) => {
    return deps.getPluginManager().installPlugin(zipPath);
  });

  ipcMain.handle(IPC_PLUGIN_UNINSTALL, async (_event, pluginName: string) => {
    return deps.getPluginManager().uninstallPlugin(pluginName);
  });

  // Plugin requests to open a file (from plugin API → renderer → back to main)
  ipcMain.on(IPC_PLUGIN_OPEN_FILE_REQUEST, async (_event, { filePath, requestId }: { filePath: string; requestId: string }) => {
    const logger = getLogger('Main');
    logger.info(`plugin-open-file request: ${filePath}`);
    try {
      await deps.doOpenFile(filePath);
      deps.getMainWindow()?.webContents.send(IPC_PLUGIN_OPEN_FILE_RESPONSE, { requestId, success: true });
    } catch (error: any) {
      deps.getMainWindow()?.webContents.send(IPC_PLUGIN_OPEN_FILE_RESPONSE, { requestId, success: false, error: error.message });
    }
  });
}
