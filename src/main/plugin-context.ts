import type { PluginBase } from './plugin-base';
import type { PluginAPI } from './plugin-api';
import type { PluginMetadata } from '../shared/types';

/**
 * A Disposable represents a cleanup action. Calling dispose() runs the action once.
 * Disposables are used to clean up command registrations and other resources
 * when a plugin is deactivated.
 */
export class Disposable {
  private disposed = false;
  private readonly disposeAction: () => void;

  constructor(disposeAction: () => void) {
    this.disposeAction = disposeAction;
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.disposeAction();
    }
  }
}

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
