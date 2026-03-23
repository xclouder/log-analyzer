/**
 * ipc-filter.ts — IPC handlers for filter config import/save.
 */

import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import {
  IPC_FILTER_IMPORT,
  IPC_FILTER_SAVE_CONFIG,
} from '../shared/ipc-channels';

export function registerFilterIPC(): void {
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
