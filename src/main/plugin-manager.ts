/**
 * plugin-manager.ts — Loads, validates, and manages the lifecycle of plugins.
 *
 * Plugins are ZIP files containing a package.json and a main JS file that
 * exports a factory function:
 *   module.exports = function(pluginBasePath) { return PluginClass; }
 *
 * Two plugin directories are scanned:
 *   - Builtin: <resourcesPath>/plugins  (production)  or  ./src/plugins  (dev)
 *   - User:    <userData>/plugins
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import AdmZip from 'adm-zip';
import { getLogger } from './log-util';
import { PluginContext } from './plugin-context';
import { PluginAPIImpl } from './plugin-api-impl';
import type { PluginMetadata, PluginInfo } from '../shared/types';
import type { CommandManager } from './command-manager';

const logger = getLogger('PluginManager');

interface LoadedPlugin {
  instance: any;
  metadata: PluginMetadata;
  context: PluginContext;
}

export class PluginManager {
  private readonly mainWindow: BrowserWindow;
  private readonly commandManager: CommandManager;
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly api: PluginAPIImpl;

  builtinPluginsDir = '';
  userPluginsDir = '';

  constructor(mainWindow: BrowserWindow, commandManager: CommandManager) {
    this.mainWindow = mainWindow;
    this.commandManager = commandManager;
    this.api = new PluginAPIImpl(mainWindow, commandManager);
  }

  // ── Directory initialisation ──────────────────────────────────────────────

  private async initPluginDirs(): Promise<void> {
    // __dirname at runtime = dist/main/main/ → project root = ../../../
    const projectRoot = path.join(__dirname, '..', '..', '..');
    this.builtinPluginsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'plugins')
      : path.join(projectRoot, 'src', 'plugins');

    this.userPluginsDir = path.join(app.getPath('userData'), 'plugins');
    await fsPromises.mkdir(this.userPluginsDir, { recursive: true });

    logger.info('Plugin directories:', {
      builtin: this.builtinPluginsDir,
      user: this.userPluginsDir,
    });
  }

  // ── Load all plugins ──────────────────────────────────────────────────────

  async loadPlugins(): Promise<void> {
    try {
      await this.initPluginDirs();
      if (this.builtinPluginsDir) await this.loadFromDir(this.builtinPluginsDir, true);
      if (this.userPluginsDir) await this.loadFromDir(this.userPluginsDir, false);
    } catch (err) {
      logger.error('Failed to load plugins:', err);
    }
  }

  private async loadFromDir(directory: string, isBuiltin: boolean): Promise<void> {
    if (!fs.existsSync(directory)) {
      logger.warn(`Plugin directory does not exist: ${directory}`);
      return;
    }
    const entries = await fsPromises.readdir(directory);
    for (const entry of entries) {
      const pluginDir = path.join(directory, entry);
      if (!fs.statSync(pluginDir).isDirectory()) continue;
      try {
        await this.loadPlugin(pluginDir, isBuiltin);
      } catch (err) {
        logger.error(`Failed to load plugin from ${pluginDir}:`, err);
      }
    }
  }

  // ── Load a single plugin ──────────────────────────────────────────────────

  async loadPlugin(pluginDir: string, isBuiltin: boolean): Promise<void> {
    const packageJsonPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`package.json not found: ${packageJsonPath}`);
    }

    const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf-8'));
    if (!this.validatePackage(packageJson)) {
      throw new Error(`Invalid package.json for plugin: ${packageJson.name ?? pluginDir}`);
    }

    const mainFile = path.join(pluginDir, packageJson.main as string);
    if (!fs.existsSync(mainFile)) {
      throw new Error(`Plugin main file not found: ${mainFile}`);
    }

    // The plugin exports a factory: (pluginBasePath) => PluginClass
    // We pass the path to the compiled plugin-base.js so the plugin can extend it.
    const pluginBasePath = path.resolve(__dirname, 'plugin-base.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PluginClass = require(mainFile)(pluginBasePath);
    if (!PluginClass) {
      throw new Error(`Plugin factory returned falsy for: ${mainFile}`);
    }

    const instance = new PluginClass(this.api);
    const context = new PluginContext(instance, this.api);
    const metadata: PluginMetadata = { ...packageJson, isBuiltin, path: pluginDir };
    context.metadata = metadata;

    this.plugins.set(packageJson.name, { instance, metadata, context });

    logger.info(`Activating plugin: ${metadata.name}`);
    await instance.onActivate(context);
    logger.info(`Plugin loaded: ${metadata.name}`);
  }

  // ── Plugin info (safe subset for renderer) ────────────────────────────────

  getPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(({ metadata }) => ({
      name: metadata.name,
      version: metadata.version,
      description: metadata.description ?? '',
      author: metadata.author,
      isBuiltin: metadata.isBuiltin,
      path: metadata.path,
    }));
  }

  // ── Install ───────────────────────────────────────────────────────────────

  async installPlugin(zipPath: string): Promise<{ success: boolean; plugin: any }> {
    const tempDir = path.join(this.userPluginsDir, '_temp');
    try {
      if (!fs.existsSync(zipPath)) throw new Error(`Plugin file not found: ${zipPath}`);

      const zip = new AdmZip(zipPath);
      if (fs.existsSync(tempDir)) await fsPromises.rm(tempDir, { recursive: true });
      await fsPromises.mkdir(tempDir, { recursive: true });
      zip.extractAllTo(tempDir, true);

      const packageJsonPath = path.join(tempDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('package.json not found in plugin package');
      }

      const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf-8'));
      if (!this.validatePackage(packageJson)) throw new Error('Invalid plugin format');

      const targetDir = path.join(this.userPluginsDir, packageJson.name);
      if (fs.existsSync(targetDir)) throw new Error(`Plugin already exists: ${packageJson.name}`);

      await fsPromises.rename(tempDir, targetDir);
      await this.loadPlugin(targetDir, false);

      logger.info(`Plugin installed: ${packageJson.name}`);
      return { success: true, plugin: packageJson };
    } catch (err) {
      logger.error('Plugin installation error:', err);
      if (fs.existsSync(tempDir)) {
        await fsPromises.rm(tempDir, { recursive: true }).catch(() => {});
      }
      throw err;
    }
  }

  // ── Uninstall ─────────────────────────────────────────────────────────────

  async uninstallPlugin(pluginName: string): Promise<{ success: boolean }> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);
    if (plugin.metadata.isBuiltin) throw new Error('Cannot uninstall a builtin plugin');

    plugin.context.disposeAll();
    await plugin.instance.onDeactivate?.();
    await fsPromises.rm(plugin.metadata.path, { recursive: true });
    this.plugins.delete(pluginName);

    logger.info(`Plugin uninstalled: ${pluginName}`);
    return { success: true };
  }

  // ── Plugin hooks ──────────────────────────────────────────────────────────

  /**
   * Run every plugin's onPreOpenFile hook in sequence.
   * A plugin may return '' as a sentinel meaning "I handled it, skip further reading".
   */
  async preProcessFilePath(filePath: string): Promise<string> {
    let processed = filePath;
    for (const { instance, metadata } of this.plugins.values()) {
      if (typeof instance.onPreOpenFile === 'function') {
        try {
          const result: string = await instance.onPreOpenFile(processed);
          if (typeof result === 'string') {
            processed = result;
          }
          // If result is '', stop and propagate the sentinel
          if (processed === '') break;
        } catch (err) {
          logger.error(`onPreOpenFile error in plugin ${metadata.name}:`, err);
        }
      }
    }
    logger.info(`preProcessFilePath: ${filePath} -> ${processed}`);
    return processed;
  }

  /**
   * Run every plugin's processFile hook in sequence to transform file content.
   */
  async processFileContent(filePath: string, content: string): Promise<string> {
    let processed = content;
    for (const { instance, metadata } of this.plugins.values()) {
      if (typeof instance.processFile === 'function') {
        try {
          processed = await instance.processFile(filePath, processed);
        } catch (err) {
          logger.error(`processFile error in plugin ${metadata.name}:`, err);
        }
      }
    }
    return processed;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private validatePackage(pkg: any): boolean {
    return ['name', 'version', 'main', 'author'].every((f) => Boolean(pkg[f]));
  }
}
