/**
 * plugin-api-impl.ts — Concrete implementation of the PluginAPI interface.
 *
 * An instance of this class is passed to every plugin constructor.
 * It provides UI helpers, file helpers, and command registration.
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import { spawn } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { PluginAPI } from './plugin-api';
import type { PluginContext } from './plugin-context';
import { Disposable } from './plugin-context';
import type { InputBoxOptions, MessageOptions, QuickPickOptions, DownloadProgress } from '../shared/types';
import { CommandManager } from './command-manager';
import type { ConfigurationManager, ScopedConfiguration } from './configuration-manager';
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
  IPC_SET_CONTENT,
  IPC_CONTENT_CHANGED,
  IPC_EDITOR_GET_SELECTED_TEXT,
  IPC_EDITOR_REGISTER_CONTEXT_MENU,
  IPC_EDITOR_UNREGISTER_CONTEXT_MENU,
  IPC_EDITOR_CONTEXT_MENU_ACTION,
} from '../shared/ipc-channels';

const LOG_DOWNLOAD_CONFIG_SECTION = 'openLogFromUrl';
const DEFAULT_COS_LOG_DOWNLOADER_TIMEOUT_MS = 5 * 60 * 1000;

export class PluginAPIImpl implements PluginAPI {
  private readonly mainWindow: BrowserWindow;
  private readonly commandManager: CommandManager;
  private readonly configurationManager: ConfigurationManager;
  private readonly pluginWindows = new Map<string, BrowserWindow>();
  private readonly editorWindows = new Map<number, string>();
  private readonly _getCurrentFilePath: () => string;
  private contentChangedHandlerRegistered = false;

  /** Editor context menu items registered by plugins. id → { label, action } */
  private readonly contextMenuItems = new Map<string, { label: string; action: (text: string) => void | Promise<void> }>();
  private contextMenuActionHandlerRegistered = false;

  constructor(
    mainWindow: BrowserWindow,
    commandManager: CommandManager,
    getCurrentFilePath: () => string,
    configurationManager: ConfigurationManager,
  ) {
    this.mainWindow = mainWindow;
    this.commandManager = commandManager;
    this._getCurrentFilePath = getCurrentFilePath;
    this.configurationManager = configurationManager;
    this.registerContentChangedHandler();
  }

  /** Register a single global handler for content-changed events from editor windows. */
  private registerContentChangedHandler(): void {
    if (this.contentChangedHandlerRegistered) return;
    this.contentChangedHandlerRegistered = true;
    ipcMain.on(IPC_CONTENT_CHANGED, (_event, content: string) => {
      const sender = BrowserWindow.fromWebContents(_event.sender);
      if (sender && this.editorWindows.has(sender.id)) {
        this.editorWindows.set(sender.id, content);
      }
    });
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
    const config = this.configurationManager.getConfiguration(LOG_DOWNLOAD_CONFIG_SECTION);
    const downloadMode = config.get<'http' | 'cosLogDownloader'>('downloadMode', 'cosLogDownloader');

    if (downloadMode === 'cosLogDownloader') {
      const executablePath = config.get<string>('cosLogDownloaderPath');
      return this.downloadFileWithCosLogDownloader(url, relativePath, executablePath);
    }

    return this.downloadFileWithHttp(url, relativePath);
  }

  private async downloadFileWithHttp(url: string, relativePath: string): Promise<string> {
    const cacheDir = this.getAppCacheDir();
    const downloadPath = path.join(cacheDir, relativePath);
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const MAX_REDIRECTS = 10;

      const doRequest = (requestUrl: string, depth = 0): void => {
        if (depth > MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) when downloading ${url}`));
        }

        const isHttps = requestUrl.startsWith('https');
        const client = isHttps ? https : http;

        client.get(requestUrl, (response) => {
          // Follow redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const location = response.headers.location;
            if (location) return doRequest(location, depth + 1);
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

  private async downloadFileWithCosLogDownloader(
    url: string,
    relativePath: string,
    executablePath: string,
  ): Promise<string> {
    const resolvedExecutablePath = executablePath?.trim();
    if (!resolvedExecutablePath) {
      throw new Error('COS log downloader path is not configured');
    }

    if (!fs.existsSync(resolvedExecutablePath)) {
      throw new Error(`COS log downloader not found: ${resolvedExecutablePath}`);
    }

    const cacheDir = this.getAppCacheDir();
    const downloadPath = path.join(cacheDir, relativePath);
    const downloadDir = path.dirname(downloadPath);
    const tempDir = path.join(downloadDir, `.cos-download-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      await this.runCosLogDownloader(
        resolvedExecutablePath,
        url,
        tempDir,
        relativePath,
        DEFAULT_COS_LOG_DOWNLOADER_TIMEOUT_MS,
      );
      const downloadedPath = this.resolveCosLogDownloaderOutput(url, tempDir);
      fs.mkdirSync(downloadDir, { recursive: true });

      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
      fs.renameSync(downloadedPath, downloadPath);

      const totalSize = fs.statSync(downloadPath).size;
      this.mainWindow?.webContents.send(IPC_DOWNLOAD_COMPLETE, {
        url,
        downloadPath: relativePath,
        totalSize,
      });
      return downloadPath;
    } catch (err) {
      this.mainWindow?.webContents.send(IPC_DOWNLOAD_ERROR, {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      this.removeDirectoryIfSafe(tempDir, downloadDir);
    }
  }

  private runCosLogDownloader(
    executablePath: string,
    url: string,
    outputDir: string,
    relativePath: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, [url, '-o', outputDir], {
        windowsHide: true,
      });
      let stderr = '';
      let stdout = '';
      let lastProgress = 0;

      const handleOutput = (chunk: Buffer): void => {
        const text = chunk.toString('utf8');
        stdout += text;
        const matches = text.match(/(\d{1,3})%/g);
        if (!matches) return;

        const value = Number(matches[matches.length - 1].replace('%', ''));
        if (!Number.isFinite(value)) return;
        const progress = Math.max(0, Math.min(100, value));
        if (progress - lastProgress >= 5 || progress === 100) {
          lastProgress = progress;
          const info: DownloadProgress = {
            url,
            downloadedSize: 0,
            totalSize: 0,
            progress,
            downloadPath: relativePath,
          };
          this.mainWindow?.webContents.send(IPC_DOWNLOAD_PROGRESS, info);
        }
      };

      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`COS log downloader timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', finish);
      child.on('close', (code) => {
        if (code === 0) {
          finish();
          return;
        }
        const details = (stderr || stdout).trim();
        finish(new Error(`COS log downloader exited with code ${code}${details ? `: ${details}` : ''}`));
      });
    });
  }

  private resolveCosLogDownloaderOutput(url: string, tempDir: string): string {
    const expectedName = this.getFileNameFromUrl(url);
    const expectedPath = expectedName ? path.join(tempDir, expectedName) : '';
    if (expectedPath && fs.existsSync(expectedPath)) {
      return expectedPath;
    }

    const files = fs.readdirSync(tempDir)
      .map((name) => path.join(tempDir, name))
      .filter((filePath) => fs.statSync(filePath).isFile());

    if (files.length === 1) {
      return files[0];
    }
    if (files.length > 1) {
      files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      return files[0];
    }

    throw new Error('COS log downloader completed but did not produce a file');
  }

  private getFileNameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = decodeURIComponent(parsed.pathname.replace(/\/+$/, ''));
      return path.basename(pathname);
    } catch {
      return path.basename(url.split('?')[0] ?? '');
    }
  }

  private removeDirectoryIfSafe(targetDir: string, expectedParent: string): void {
    const resolvedTarget = path.resolve(targetDir);
    const resolvedParent = path.resolve(expectedParent);
    if (!resolvedTarget.startsWith(resolvedParent + path.sep)) {
      return;
    }
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
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
    return this._getCurrentFilePath() || null;
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
        win.webContents.send(IPC_SET_CONTENT, options.textContent);
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

  // ── Editor ─────────────────────────────────────────────────────────────────

  async getSelectedText(): Promise<string> {
    if (!this.mainWindow?.webContents) return '';
    return this.mainWindow.webContents.executeJavaScript(
      `(function(){ const e = window.__LA_editor; if (!e) return ''; const s = e.getSelection(); if (!s) return ''; return e.getModel().getValueInRange(s); })()`,
    ).catch(() => '');
  }

  registerEditorContextMenu(
    context: PluginContext,
    id: string,
    label: string,
    action: (selectedText: string) => void | Promise<void>,
  ): void {
    this.contextMenuItems.set(id, { label, action });

    // Tell the renderer to add this context menu item
    this.mainWindow?.webContents.send(IPC_EDITOR_REGISTER_CONTEXT_MENU, { id, label });

    // Register a one-time global handler for context menu action events
    if (!this.contextMenuActionHandlerRegistered) {
      this.contextMenuActionHandlerRegistered = true;
      ipcMain.on(IPC_EDITOR_CONTEXT_MENU_ACTION, async (_event, data: { id: string; selectedText: string }) => {
        const item = this.contextMenuItems.get(data.id);
        if (item) {
          try {
            await item.action(data.selectedText);
          } catch (err) {
            console.error(`[PluginAPI] Context menu action error (${data.id}):`, err);
          }
        }
      });
    }

    // Cleanup on deactivation
    const disposable = new Disposable(() => {
      this.contextMenuItems.delete(id);
      this.mainWindow?.webContents.send(IPC_EDITOR_UNREGISTER_CONTEXT_MENU, { id });
    });
    context.disposables.push(disposable);
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  getConfiguration(section: string): ScopedConfiguration {
    return this.configurationManager.getConfiguration(section);
  }

  onDidChangeConfiguration(
    listener: (e: { affectsConfiguration(section: string): boolean }) => void,
  ): { dispose(): void } {
    return this.configurationManager.onDidChangeConfiguration((changedKeys) => {
      listener({
        affectsConfiguration(section: string): boolean {
          return changedKeys.some((k) => k === section || k.startsWith(section + '.'));
        },
      });
    });
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
    timeoutMs = 30000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${Math.random()}`;

      const handler = (_event: Electron.IpcMainEvent, data: { requestId: string; value: T }) => {
        if (data.requestId === requestId) {
          clearTimeout(timer);
          ipcMain.removeListener(responseChannel, handler);
          resolve(data.value);
        }
      };

      const timer = setTimeout(() => {
        ipcMain.removeListener(responseChannel, handler);
        reject(new Error(`sendAndAwaitResponse timed out after ${timeoutMs}ms on channel "${responseChannel}"`));
      }, timeoutMs);

      ipcMain.on(responseChannel, handler);
      this.mainWindow?.webContents.send(sendChannel, { ...payload, requestId });
    });
  }
}
