/**
 * menu-builder.ts — Builds the application menu.
 */

import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import {
  IPC_MENU_OPEN_FILE,
  IPC_MENU_RELOAD_FILE,
  IPC_MENU_SHOW_IN_FOLDER,
  IPC_FILTER_SAVE_CONFIG_DIALOG,
  IPC_FILTER_LOAD,
  IPC_TOGGLE_LOGGING,
} from '../shared/ipc-channels';

interface MenuDeps {
  getMainWindow: () => BrowserWindow | null;
  getPluginManagerWindow: () => BrowserWindow | null;
  setPluginManagerWindow: (win: BrowserWindow | null) => void;
  getSettingsWindow: () => BrowserWindow | null;
  setSettingsWindow: (win: BrowserWindow | null) => void;
  isLoggingEnabled: () => boolean;
  setLoggingEnabled: (enabled: boolean) => void;
}

export function buildApplicationMenu(deps: MenuDeps): void {
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
          click: () => deps.getMainWindow()?.webContents.send(IPC_MENU_OPEN_FILE),
        },
        {
          label: 'Reload File',
          accelerator: 'CmdOrCtrl+R',
          click: () => deps.getMainWindow()?.webContents.send(IPC_MENU_RELOAD_FILE),
        },
        {
          label: 'Show in Folder',
          click: () => deps.getMainWindow()?.webContents.send(IPC_MENU_SHOW_IN_FOLDER),
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
            const mainWindow = deps.getMainWindow();
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
            const mainWindow = deps.getMainWindow();
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
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (deps.getSettingsWindow()) {
              deps.getSettingsWindow()!.focus();
              return;
            }
            const mainWindow = deps.getMainWindow();
            const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
            const settingsWin = new BrowserWindow({
              width: 900,
              height: 700,
              parent: mainWindow ?? undefined,
              webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
              },
              title: 'Settings',
            });
            settingsWin.setMenu(null);

            const settingsHtml = app.isPackaged
              ? path.join(app.getAppPath(), 'src', 'renderer', 'settings.html')
              : path.join(PROJECT_ROOT, 'src', 'renderer', 'settings.html');
            settingsWin.loadFile(settingsHtml);
            settingsWin.on('closed', () => {
              deps.setSettingsWindow(null);
            });
            deps.setSettingsWindow(settingsWin);
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
            if (deps.getPluginManagerWindow()) {
              deps.getPluginManagerWindow()!.focus();
              return;
            }
            const mainWindow = deps.getMainWindow();
            const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
            const pmWindow = new BrowserWindow({
              width: 800,
              height: 600,
              parent: mainWindow ?? undefined,
              modal: true,
              webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
              },
            });
            pmWindow.setMenu(null);

            const pmHtml = app.isPackaged
              ? path.join(app.getAppPath(), 'src', 'renderer', 'plugin-manager.html')
              : path.join(PROJECT_ROOT, 'src', 'renderer', 'plugin-manager.html');
            pmWindow.loadFile(pmHtml);
            pmWindow.on('closed', () => {
              deps.setPluginManagerWindow(null);
            });
            deps.setPluginManagerWindow(pmWindow);
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
          checked: deps.isLoggingEnabled(),
          click: (menuItem) => {
            deps.setLoggingEnabled(menuItem.checked);
            deps.getMainWindow()?.webContents.send(IPC_TOGGLE_LOGGING, menuItem.checked);
          },
        },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
