/**
 * electron-api.d.ts — Type declarations for window.electronAPI
 *
 * Maps every method exposed by preload.ts via contextBridge.exposeInMainWorld.
 * Importing this file (via tsconfig include) gives full IntelliSense in the
 * renderer process and eliminates the need for `(window as any).electronAPI`.
 */

import type {
  FilterConfig,
  PluginInfo,
  PluginMetadata,
  CommandInfo,
  InputBoxOptions,
  QuickPickOptions,
  QuickPickItem,
  MessageOptions,
  DownloadProgress,
  LargeFileReadResult,
  FileOpenResult,
} from './types';

export interface ElectronAPI {
  // ── Resource paths ──────────────────────────────────────────────────────
  getMonacoVsPath(): string;
  isPackaged(): boolean;

  // ── File operations ─────────────────────────────────────────────────────
  openFile(filePath: string): Promise<FileOpenResult>;
  reloadCurrentFile(): Promise<FileOpenResult | null>;
  getFileStats(filePath: string): Promise<{ size: number; mtime: Date }>;
  readFileByTimestamp(
    filePath: string,
    timestamp: string | null,
    sizeMB: number,
  ): Promise<LargeFileReadResult>;
  showItemInFolder(filePath?: string): void;

  // ── Dialogs ─────────────────────────────────────────────────────────────
  dialogOpenFile(): Promise<{ filePath: string } | null>;
  saveFile(content: unknown): Promise<boolean>;

  // ── Filter ──────────────────────────────────────────────────────────────
  importFilterCfg(filePath: string): Promise<FilterConfig>;
  saveFilterConfig(
    config: FilterConfig,
    filePath: string,
  ): Promise<{ success: boolean; error?: string }>;

  // ── Plugin management ───────────────────────────────────────────────────
  pluginManager: {
    getPlugins(): Promise<PluginInfo[]>;
    installPlugin(zipPath: string): Promise<{ success: boolean; plugin?: PluginMetadata; error?: string }>;
    uninstallPlugin(name: string): Promise<{ success: boolean; error?: string }>;
  };
  openUserPluginsDir(): void;

  // ── Command palette ─────────────────────────────────────────────────────
  searchCommands(query: string): Promise<CommandInfo[]>;
  getCommands(): Promise<CommandInfo[]>;
  executeCommand(cmdId: string): Promise<void>;
  onCommandRegister(cb: (...args: unknown[]) => void): void;
  onCommandUnregister(cb: (...args: unknown[]) => void): void;

  // ── App state ───────────────────────────────────────────────────────────
  getCurrentFilePath(): Promise<string>;

  // ── Menu events (main → renderer) ──────────────────────────────────────
  onMenuOpenFile(cb: (...args: unknown[]) => void): void;
  onMenuSaveFile(cb: (...args: unknown[]) => void): void;
  onReloadFile(cb: (...args: unknown[]) => void): void;
  onMenuShowInFolder(cb: (...args: unknown[]) => void): void;

  // ── Filter dialog events (main → renderer) ────────────────────────────
  onFilterSaveConfig(cb: (event: unknown, filePath: string) => void): void;
  onFilterLoadConfig(cb: (event: unknown, filePath: string) => void): void;

  // ── Plugin UI dialogs (main → renderer) ────────────────────────────────
  onPluginShowInputBox(
    cb: (event: unknown, data: { options: InputBoxOptions; requestId: string }) => void,
  ): void;
  onPluginShowQuickPick(
    cb: (event: unknown, data: { items: (string | QuickPickItem)[]; options: QuickPickOptions; requestId: string }) => void,
  ): void;
  onPluginShowInformation(
    cb: (event: unknown, data: { message: string; options?: MessageOptions; requestId: string }) => void,
  ): void;
  onPluginShowError(
    cb: (event: unknown, data: { message: string; options?: MessageOptions; requestId: string }) => void,
  ): void;

  // ── Plugin UI dialog responses (renderer → main) ──────────────────────
  sendInputBoxResponse(requestId: string, value: string | null): void;
  sendQuickPickResponse(requestId: string, value: string | QuickPickItem | null): void;
  sendInformationResponse(requestId: string): void;
  sendErrorResponse(requestId: string): void;

  // ── Plugin file open ───────────────────────────────────────────────────
  onPluginOpenFile(cb: (event: unknown, filePath: string) => void): void;

  // ── Download progress ──────────────────────────────────────────────────
  onDownloadProgress(cb: (event: unknown, info: DownloadProgress) => void): void;
  onDownloadComplete(cb: (event: unknown, info: { url: string; downloadPath: string; totalSize: number }) => void): void;
  onDownloadError(cb: (event: unknown, info: { url: string; error: string }) => void): void;

  // ── Dev ─────────────────────────────────────────────────────────────────
  onToggleLogging(cb: (event: unknown, enabled: boolean) => void): void;

  // ── Window controls ────────────────────────────────────────────────────
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;

  // ── Editor window ──────────────────────────────────────────────────────
  onSetContent(cb: (event: unknown, content: string) => void): void;
  sendContentChanged(content: string): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
