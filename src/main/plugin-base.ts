import type { PluginContext } from './plugin-context';
import type { PluginAPI } from './plugin-api';

/**
 * Base class for all LogAnalyzer plugins.
 *
 * Plugins are loaded from a ZIP file via the Plugin Manager. Each plugin's
 * main file must export a factory function:
 *
 * ```js
 * module.exports = function(pluginBasePath) {
 *   const Plugin = require(pluginBasePath);
 *   class MyPlugin extends Plugin { ... }
 *   return MyPlugin;
 * };
 * ```
 *
 * This factory pattern lets plugins extend the base class without knowing
 * the absolute installation path of `plugin-base.js` at write-time.
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

// Both named export (for TypeScript imports) and module.exports (for plugin require())
export { PluginBase };

// Plugins do `const Plugin = require(pluginBasePath)` and expect the class directly.
// Override module.exports so require() returns the class, not { PluginBase: ... }.
module.exports = PluginBase;
// Preserve named export for TypeScript consumers
module.exports.PluginBase = PluginBase;
