import type { PluginBase } from './plugin-base';
import type { PluginAPI } from './plugin-api';
import type { PluginMetadata } from '../shared/types';
import { Disposable } from '../shared/disposable';

// Re-export Disposable so existing imports from this module continue to work
export { Disposable };

/**
 * PluginContext is passed to a plugin's onActivate() method.
 * It holds references needed during the plugin's lifetime and tracks
 * disposables for cleanup on deactivation.
 */
export class PluginContext {
  readonly instance: PluginBase;
  readonly api: PluginAPI;
  disposables: Disposable[] = [];
  metadata!: PluginMetadata; // set by PluginManager after construction

  constructor(instance: PluginBase, api: PluginAPI) {
    this.instance = instance;
    this.api = api;
  }

  /** Dispose all registered disposables (e.g., unregister commands). */
  disposeAll(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
