/**
 * plugin-api-impl.ts — Concrete implementation of the PluginAPI interface.
 *
 * An instance of this class is passed to every plugin constructor.
 * It provides UI helpers, file helpers, and command registration.
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { PluginAPI } from './plugin-api';
import type { PluginContext } from './plugin-context';
import { Disposable } from './plugin-context';
import type { InputBoxOptions, MessageOptions, QuickPickOptions, DownloadProgress } from '../shared/types';
import { CommandManager } from './command-manager';
import {
  IPC_PLUGIN_SHOW_INPUTBOX,
  IPC_PLUGIN_SHOW_QUICKPICK,
  IPC_PLUGIN_SHOW_INFORMATION,
  IPC_PLUGIN_SHOW_ERROR,
  IPC_PLUGIN_INPUTBOX_RESPONSE,
  IPC_PLUGIN_QUICKPICK_RESPONSE,
  IPC_PLUGIN_INFORMATION_RESPONSE,
  IPC_PLUGIN_ERROR_RESPONSE,
  IPC_COMMAND_REGISTER,
  IPC_COMMAND_UNREGISTER,
  IPC_PLUGIN_OPEN_FILE,
  IPC_DOWNLOAD_PROGRESS,
  IPC_DOWNLOAD_COMPLETE,
  IPC_DOWNLOAD_ERROR,
} from '../shared/ipc-channels';

export class PluginAPIImpl implements PluginAPI {
  private readonly mainWindow: BrowserWindow;
  private readonly commandManager: CommandManager;
  private readonly pluginWindows = new Map<string, BrowserWindow>();
  private readonly editorWindows = new Map<number, string>();

  constructor(mainWindow: BrowserWindow, commandManager: CommandManager) {
    this.mainWindow = mainWindow;
    this.commandManager = commandManager;
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  showErrorMessage(message: string, _options?: MessageOptions): Promise<void> {
    return this.sendAndAwaitResponse<void>(
      IPC_PLUGIN_SHOW_ERROR,
      IPC_PLUGIN_ERROR_RESPONSE,
      { message, options: _options },
    );
  }

  showInfoMessage(message: string, _options?: MessageOptions): Promise<void> {
    return this.sendAndAwaitResponse<void>(
      IPC_PLUGIN_SHOW_INFORMATION,
      IPC_PLUGIN_INFORMATION_RESPONSE,
      { message },
    );
  }

  showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
    return this.sendAndAwaitResponse<string | undefined>(
      IPC_PLUGIN_SHOW_INPUTBOX,
      IPC_PLUGIN_INPUTBOX_RESPONSE,
      { options },
    );
  }

  showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined> {
    return this.sendAndAwaitResponse<string | undefined>(
      IPC_PLUGIN_SHOW_QUICKPICK,
      IPC_PLUGIN_QUICKPICK_RESPONSE,
      { items, options },
    );
  }

  // ── File helpers ────────────────────────────────────────────────────────────

  async pluginOpenFile(filePath: string): Promise<void> {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send(IPC_PLUGIN_OPEN_FILE, filePath);
    }
  }

  async downloadFile(url: string, relativePath: string): Promise<string> {
    const cacheDir = this.getAppCacheDir();
    const downloadPath = path.join(cacheDir, relativePath);
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl: string): void => {
        const isHttps = requestUrl.startsWith('https');
        const client = isHttps ? https : http;

        client.get(requestUrl, (response) => {
          // Follow redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const location = response.headers.location;
            if (location) return doRequest(location);
            return reject(new Error('Redirect with no location header'));
          }

          if (response.statusCode !== 200) {
            return reject(new Error(`Download failed with status: ${response.statusCode}`));
          }

          const totalSize = parseInt(response.headers['content-length'] ?? '0', 10);
          let downloadedSize = 0;
          let lastProgress = 0;

          const fileStream = fs.createWriteStream(downloadPath);

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            const progress = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0;

            // Throttle progress events to every 5%
            if (progress - lastProgress >= 5 || progress === 100) {
              lastProgress = progress;
              const info: DownloadProgress = {
                url,
                downloadedSize,
                totalSize,
                progress,
                downloadPath: relativePath,
              };
              this.mainWindow?.webContents.send(IPC_DOWNLOAD_PROGRESS, info);
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            this.mainWindow?.webContents.send(IPC_DOWNLOAD_COMPLETE, {
              url,
              downloadPath: relativePath,
              totalSize,
            });
            resolve(downloadPath);
          });

          fileStream.on('error', (err) => {
            fs.unlink(downloadPath, () => {});
            this.mainWindow?.webContents.send(IPC_DOWNLOAD_ERROR, { url, error: err.message });
            reject(err);
          });
        }).on('error', (err) => {
          this.mainWindow?.webContents.send(IPC_DOWNLOAD_ERROR, { url, error: err.message });
          reject(err);
        });
      };

      doRequest(url);
    });
  }

  // ── App paths ───────────────────────────────────────────────────────────────

  getAppCacheDir(): string {
    return path.join(app.getPath('userData'), 'cache');
  }

  // ── Command registration ────────────────────────────────────────────────────

  registerCommand(
    context: PluginContext,
    commandId: string,
    action: () => void | Promise<void>,
  ): void {
    const meta = context.metadata;
    if (!meta?.contributes?.commands) {
      console.error(`[PluginAPI] Plugin ${meta?.name} has no contributes.commands in package.json`);
      return;
    }

    const cmdConfig = meta.contributes.commands.find((c) => c.command === commandId);
    if (!cmdConfig) {
      console.error(`[PluginAPI] Command ${commandId} not declared in plugin ${meta.name}`);
      return;
    }

    this.commandManager.registerCommand(
      commandId,
      cmdConfig.title,
      cmdConfig.category ?? meta.title ?? meta.name,
      action,
    );

    // Notify renderer that the command palette should refresh
    this.mainWindow?.webContents.send(IPC_COMMAND_REGISTER);

    // Register cleanup disposable on the plugin context
    const disposable = new Disposable(() => {
      this.commandManager.unregisterCommand(commandId);
      this.mainWindow?.webContents.send(IPC_COMMAND_UNREGISTER);
    });
    context.disposables.push(disposable);
  }

  getCurrentFilePath(): string | null {
    const win = BrowserWindow.getAllWindows()[0];
    return (win as any)?.currentFilePath ?? null;
  }

  // ── Window helpers ──────────────────────────────────────────────────────────

  createWindow(pluginId: string, options: Electron.BrowserWindowConstructorOptions = {}): BrowserWindow {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      parent: this.mainWindow,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      ...options,
    });
    this.pluginWindows.set(pluginId, win);
    win.on('closed', () => this.pluginWindows.delete(pluginId));
    return win;
  }

  createEditorWindow(options: { width?: number; height?: number; title?: string; textContent?: string } = {}): BrowserWindow {
    const win = new BrowserWindow({
      width: options.width ?? 800,
      height: options.height ?? 600,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    win.setMenu(null);

    // editor.html is in src/renderer/ (not compiled by TS)
    const editorHtmlPath = app.isPackaged
      ? path.join(app.getAppPath(), 'src', 'renderer', 'editor.html')
      : path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'editor.html');
    win.loadFile(editorHtmlPath);

    if (options.title) {
      win.setTitle(options.title);
      win.webContents.on('did-finish-load', () => win.setTitle(options.title!));
    }

    win.webContents.on('did-finish-load', () => {
      if (options.textContent) {
        win.webContents.send('set-content', options.textContent);
      }
    });

    ipcMain.on('content-changed', (_event, content: string) => {
      const sender = BrowserWindow.fromWebContents(_event.sender);
      if (sender?.id === win.id) {
        this.editorWindows.set(win.id, content);
      }
    });

    this.editorWindows.set(win.id, options.textContent ?? '');
    win.on('closed', () => this.editorWindows.delete(win.id));
    return win;
  }

  closeWindow(pluginId: string): void {
    const win = this.pluginWindows.get(pluginId);
    if (win && !win.isDestroyed()) win.close();
  }

  getWindow(pluginId: string): BrowserWindow | undefined {
    return this.pluginWindows.get(pluginId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Send a message to the renderer and await a single response identified by requestId.
   * Handles concurrent calls correctly by matching on requestId.
   */
  private sendAndAwaitResponse<T>(
    sendChannel: string,
    responseChannel: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random()}`;

      const handler = (_event: Electron.IpcMainEvent, data: { requestId: string; value: T }) => {
        if (data.requestId === requestId) {
          ipcMain.removeListener(responseChannel, handler);
          resolve(data.value);
        }
      };

      ipcMain.on(responseChannel, handler);
      this.mainWindow?.webContents.send(sendChannel, { ...payload, requestId });
    });
  }
}
