/**
 * loganalyzer-plugin-sdk
 *
 * SDK for developing LogAnalyzer plugins. Provides the PluginBase class
 * that all plugins must extend.
 *
 * Usage:
 *   import { PluginBase } from 'loganalyzer-plugin-sdk';
 *   import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';
 *
 *   export default class MyPlugin extends PluginBase {
 *     async onActivate(context) { ... }
 *   }
 */

class PluginBase {
  constructor(api) {
    this.api = api;
  }

  /** Called after the plugin is loaded. Register commands and set up state here. */
  async onActivate(_context) {}

  /** Called before the plugin is uninstalled. Clean up resources here. */
  async onDeactivate() {}

  /**
   * Called before any file is opened. Can transform the file path.
   * Return the original path to proceed normally.
   * Return '' to signal "I handled it, skip further reading".
   */
  async onPreOpenFile(filePath) {
    return filePath;
  }

  /** Called after a file has been opened in the editor. */
  async onDidOpenFile(_context) {}

  /** Called before a file is closed. */
  async onWillCloseFile(_context) {}

  /**
   * Called after file content is read. Can transform the content.
   * Return original content to proceed normally.
   */
  async processFile(_filePath, content) {
    return content;
  }
}

module.exports = { PluginBase };
module.exports.default = { PluginBase };
