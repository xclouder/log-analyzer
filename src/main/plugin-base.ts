import type { PluginContext } from './plugin-context';
import type { PluginAPI } from './plugin-api';

/**
 * Base class for all LogAnalyzer plugins.
 *
 * The `loganalyzer-plugin-sdk` package exports a compatible PluginBase class
 * for plugin developers. This version is used internally by the host app.
 *
 * Plugin developers extend from the SDK:
 *
 * ```ts
 * import { PluginBase } from 'loganalyzer-plugin-sdk';
 * import type { PluginContext } from 'loganalyzer-plugin-sdk';
 *
 * export default class MyPlugin extends PluginBase {
 *   async onActivate(context: PluginContext): Promise<void> { ... }
 * }
 * ```
 */
class PluginBase {
  protected api: PluginAPI;

  constructor(api: PluginAPI) {
    this.api = api;
  }

  /** Called after the plugin is loaded. Register commands and set up state here. */
  async onActivate(_context: PluginContext): Promise<void> {}

  /** Called before the plugin is uninstalled. Clean up resources here. */
  async onDeactivate(): Promise<void> {}

  /**
   * Called before any file is opened. Can transform the file path
   * (e.g., decrypt an encrypted file and return the decrypted path).
   * Return the original path to proceed normally.
   */
  async onPreOpenFile(filePath: string): Promise<string> {
    return filePath;
  }

  /** Called after a file has been opened in the editor. */
  async onDidOpenFile(_context: PluginContext): Promise<void> {}

  /** Called before a file is closed. */
  async onWillCloseFile(_context: PluginContext): Promise<void> {}

  /**
   * Called after file content is read. Can transform the content
   * (e.g., parse binary format, add annotations). Return original content
   * to proceed normally.
   */
  async processFile(_filePath: string, content: string): Promise<string> {
    return content;
  }
}

export { PluginBase };
