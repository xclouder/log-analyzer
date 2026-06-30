/**
 * configuration-manager.ts — Manages plugin configuration values.
 *
 * Design follows VS Code's configuration model:
 *
 * 1. Plugins declare their configuration schema in package.json:
 *    ```json
 *    "contributes": {
 *      "configuration": {
 *        "title": "My Plugin Settings",
 *        "properties": {
 *          "myPlugin.timeout": {
 *            "type": "number",
 *            "default": 30,
 *            "description": "Request timeout in seconds"
 *          }
 *        }
 *      }
 *    }
 *    ```
 *
 * 2. Plugins read values via `api.getConfiguration('myPlugin').get<number>('timeout')`.
 *
 * 3. Users edit values through the Settings UI (settings.html).
 *
 * 4. User values are persisted to <userData>/settings.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getLogger } from './log-util';
import type {
  ConfigurationPropertySchema,
  ConfigurationContribution,
} from '../shared/types';

const logger = getLogger('ConfigurationManager');

// ─── Event emitter for configuration changes ────────────────────────────────

type ConfigChangeListener = (keys: string[]) => void;

/**
 * A scoped view of the configuration namespace, similar to VS Code's
 * `WorkspaceConfiguration`.
 *
 * Plugins interact with this object to read/write their configuration.
 */
export class ScopedConfiguration {
  constructor(
    private readonly section: string,
    private readonly manager: ConfigurationManager,
  ) {}

  /**
   * Get a configuration value. Returns the user-set value, falling back to the
   * declared default. If no default exists, returns `defaultValue`.
   */
  get<T>(key: string, defaultValue?: T): T {
    const fullKey = this.section ? `${this.section}.${key}` : key;
    return this.manager.getValue<T>(fullKey, defaultValue);
  }

  /**
   * Update a configuration value. Persists to disk immediately.
   */
  async update(key: string, value: unknown): Promise<void> {
    const fullKey = this.section ? `${this.section}.${key}` : key;
    await this.manager.setValue(fullKey, value);
  }

  /**
   * Check whether a configuration key has a user-defined value.
   */
  has(key: string): boolean {
    const fullKey = this.section ? `${this.section}.${key}` : key;
    return this.manager.hasValue(fullKey);
  }
}

// ─── ConfigurationManager ────────────────────────────────────────────────────

export class ConfigurationManager {
  /** Registry: full key → property schema (from plugin package.json). */
  private readonly schemas = new Map<string, ConfigurationPropertySchema & { pluginName: string }>();

  /** Ordered list of configuration sections for the Settings UI. */
  private readonly sections: Array<{ pluginName: string; title: string; properties: string[] }> = [];

  /** User values (overrides defaults). Loaded from / saved to disk. */
  private userValues: Record<string, unknown> = {};

  /** Path to the JSON file on disk. */
  private settingsFilePath = '';

  /** Listeners notified when values change. */
  private readonly changeListeners: ConfigChangeListener[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Initialise: resolve paths and load persisted values. */
  init(): void {
    this.settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
    this.loadFromDisk();
    logger.info(`Settings file: ${this.settingsFilePath}`);
  }

  // ── Schema registration (called by PluginManager per plugin) ──────────────

  /**
   * Register configuration properties declared by a plugin.
   * Called once per plugin during loading (before onActivate).
   */
  registerPluginConfiguration(pluginName: string, contribution: ConfigurationContribution): void {
    const sectionTitle = contribution.title || pluginName;
    const keys: string[] = [];

    if (contribution.properties) {
      for (const [key, schema] of Object.entries(contribution.properties)) {
        this.schemas.set(key, { ...schema, pluginName });
        keys.push(key);
        logger.info(`Registered config key: ${key} (plugin: ${pluginName})`);
      }
    }

    if (keys.length > 0) {
      this.sections.push({ pluginName, title: sectionTitle, properties: keys });
    }
  }

  /**
   * Unregister all configuration properties for a given plugin.
   * Called when a plugin is uninstalled.
   */
  unregisterPluginConfiguration(pluginName: string): void {
    for (const [key, schema] of this.schemas.entries()) {
      if (schema.pluginName === pluginName) {
        this.schemas.delete(key);
      }
    }
    const idx = this.sections.findIndex((s) => s.pluginName === pluginName);
    if (idx !== -1) this.sections.splice(idx, 1);
  }

  // ── Read / write ──────────────────────────────────────────────────────────

  getValue<T>(key: string, defaultValue?: T): T {
    if (key in this.userValues) {
      return this.userValues[key] as T;
    }
    const schema = this.schemas.get(key);
    if (schema && schema.default !== undefined) {
      return schema.default as T;
    }
    return defaultValue as T;
  }

  hasValue(key: string): boolean {
    return key in this.userValues;
  }

  async setValue(key: string, value: unknown): Promise<void> {
    const oldValue = this.userValues[key];
    if (oldValue === value) return;

    this.userValues[key] = value;
    await this.saveToDisk();
    this.notifyChange([key]);
  }

  /**
   * Bulk update multiple values at once (used by the Settings UI).
   * More efficient than calling setValue repeatedly.
   */
  async setValues(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    const changedKeys: string[] = [];
    for (const { key, value } of entries) {
      if (this.userValues[key] !== value) {
        this.userValues[key] = value;
        changedKeys.push(key);
      }
    }
    if (changedKeys.length > 0) {
      await this.saveToDisk();
      this.notifyChange(changedKeys);
    }
  }

  /**
   * Reset a key to its default value (remove the user override).
   */
  async resetValue(key: string): Promise<void> {
    if (!(key in this.userValues)) return;
    delete this.userValues[key];
    await this.saveToDisk();
    this.notifyChange([key]);
  }

  // ── Change event ──────────────────────────────────────────────────────────

  onDidChangeConfiguration(listener: ConfigChangeListener): { dispose: () => void } {
    this.changeListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.changeListeners.indexOf(listener);
        if (idx !== -1) this.changeListeners.splice(idx, 1);
      },
    };
  }

  private notifyChange(keys: string[]): void {
    for (const listener of this.changeListeners) {
      try {
        listener(keys);
      } catch (err) {
        logger.error('Configuration change listener error:', err);
      }
    }
  }

  // ── Query (used by Settings UI via IPC) ────────────────────────────────────

  /**
   * Returns all registered configuration sections with their schemas and
   * current effective values — consumed by the Settings renderer.
   */
  getAllConfigurationForUI(): Array<{
    pluginName: string;
    title: string;
    properties: Array<{
      key: string;
      schema: ConfigurationPropertySchema;
      value: unknown;
      isDefault: boolean;
    }>;
  }> {
    return this.sections.map((section) => ({
      pluginName: section.pluginName,
      title: section.title,
      properties: section.properties.map((key) => {
        const schema = this.schemas.get(key)!;
        const isDefault = !(key in this.userValues);
        const value = isDefault ? (schema.default ?? null) : this.userValues[key];
        return { key, schema, value, isDefault };
      }),
    }));
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, 'utf-8');
        this.userValues = JSON.parse(raw);
        logger.info(`Loaded ${Object.keys(this.userValues).length} user settings`);
      }
    } catch (err) {
      logger.error('Failed to load settings.json:', err);
      this.userValues = {};
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.settingsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.userValues, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save settings.json:', err);
    }
  }

  /** Get a ScopedConfiguration for a given section prefix (e.g. 'myPlugin'). */
  getConfiguration(section: string): ScopedConfiguration {
    return new ScopedConfiguration(section, this);
  }
}
