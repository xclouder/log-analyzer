import type { PluginContext } from './plugin-context';
import type { InputBoxOptions, MessageOptions, QuickPickOptions } from '../shared/types';
import type { BrowserWindow } from 'electron';

/**
 * PluginAPI is the surface exposed to every plugin instance.
 * Plugins receive an instance of this (or a subclass) in their constructor.
 *
 * All UI methods are async so plugins can await user interaction before
 * continuing. The concrete implementation lives in PluginAPIImpl (plugin-api-impl.ts)
 * and is created by PluginManager for each loaded plugin.
 */
export interface PluginAPI {
  // ── UI helpers ─────────────────────────────────────────────────────────────

  /** Show a modal/non-modal error message. */
  showErrorMessage(message: string, options?: MessageOptions): Promise<void>;

  /** Show a modal/non-modal info message. */
  showInfoMessage(message: string, options?: MessageOptions): Promise<void>;

  /** Prompt the user for a single text value. Returns undefined if cancelled. */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;

  /**
   * Show a quick-pick dropdown populated with `items`.
   * Returns the selected item string, or undefined if cancelled.
   */
  showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined>;

  // ── File helpers ────────────────────────────────────────────────────────────

  /**
   * Open a file inside the editor, exactly as if the user had used File → Open.
   * Triggers the full open pipeline (pre-open hooks, encoding detection, etc.).
   */
  pluginOpenFile(filePath: string): Promise<void>;

  /**
   * Download a remote URL and save it under the application's download cache.
   * `relativePath` is appended to the app download dir.
   * Returns the absolute local path of the saved file.
   */
  downloadFile(url: string, relativePath: string): Promise<string>;

  // ── App paths ───────────────────────────────────────────────────────────────

  /** Returns the OS-appropriate application cache directory (cross-platform). */
  getAppCacheDir(): string;

  /** Returns the path of the currently-open file, or null. */
  getCurrentFilePath(): string | null;

  // ── Command registration ────────────────────────────────────────────────────

  /**
   * Register a command that can be triggered from the command palette.
   * Returns a Disposable that unregisters the command when disposed.
   */
  registerCommand(context: PluginContext, commandId: string, action: () => void | Promise<void>): void;

  // ── Window helpers ─────────────────────────────────────────────────────────

  /** Create a new BrowserWindow owned by a plugin. */
  createWindow(pluginId: string, options?: Electron.BrowserWindowConstructorOptions): BrowserWindow;

  /** Create a simple text-editor window (loads editor.html). */
  createEditorWindow(options?: { width?: number; height?: number; title?: string; textContent?: string }): BrowserWindow;

  /** Close a plugin-owned window by plugin ID. */
  closeWindow(pluginId: string): void;

  /** Get a plugin-owned window by plugin ID. */
  getWindow(pluginId: string): BrowserWindow | undefined;
}
