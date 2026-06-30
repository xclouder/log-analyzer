/**
 * Shared type definitions used by both main and renderer processes.
 */

/** Filter pattern types */
export type FilterType = 'text' | 'regex' | 'line' | 'exclude-text';

/** A single filter condition */
export interface FilterPattern {
  enabled: boolean;
  type: FilterType;
  pattern: string;
  highlight: boolean;
  highlightColor: string;
}

/** Full filter configuration (stored as JSON) */
export interface FilterConfig {
  patterns: FilterPattern[];
}

/** Result of reading a large file by timestamp */
export interface LargeFileReadResult {
  content: string;
  startLine: number;
  totalLines: number;
  fileSize: number;
  readSize: number;
  foundTimestamp: boolean;
  readPosition: number;
}

/** Result of opening a file */
export interface FileOpenResult {
  content: string | null;
  filePath: string;
}

/** Plugin metadata (as in package.json) */
export interface PluginMetadata {
  name: string;
  version: string;
  main: string;
  author: string;
  title?: string;
  description?: string;
  defaultEnabled?: boolean;
  enabled: boolean;
  isBuiltin: boolean;
  path: string;
  engines?: { loganalyzer?: string };
  contributes?: {
    commands?: Array<{
      command: string;
      title: string;
      category?: string;
    }>;
    fileTypes?: string[];
    configuration?: ConfigurationContribution;
  };
}

/** Plugin info returned to renderer (safe subset) */
export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  defaultEnabled?: boolean;
  enabled: boolean;
  isBuiltin: boolean;
  path: string;
}

/** A registered command */
export interface CommandInfo {
  id: string;
  title: string;
  category: string;
}

/** Options for showInputBox */
export interface InputBoxOptions {
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  password?: boolean;
}

/** Options for showQuickPick */
export interface QuickPickOptions {
  title?: string;
  placeHolder?: string;
}

/** Options for showMessage dialogs */
export interface MessageOptions {
  modal?: boolean;
  detail?: string;
}

/** Item in a QuickPick list */
export interface QuickPickItem {
  label: string;
  [key: string]: unknown;
}

/** Download progress info */
export interface DownloadProgress {
  url: string;
  downloadedSize: number;
  totalSize: number;
  progress: number;
  downloadPath: string;
}

// ── Configuration system (VS Code–style) ─────────────────────────────────────

/** Schema for a single configuration property (declared in plugin package.json). */
export interface ConfigurationPropertySchema {
  /** JSON Schema type: 'string' | 'number' | 'boolean' | 'array' | 'object'. */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Default value. */
  default?: unknown;
  /** Human-readable description shown in the Settings UI. */
  description?: string;
  /** For `type: 'string'`, restrict to a set of allowed values (renders as a dropdown). */
  enum?: unknown[];
  /** Human-readable labels for `enum` values. */
  enumDescriptions?: string[];
  /** For `type: 'array'`, the schema of each item. */
  items?: { type: string };
  /** Minimum value (for `type: 'number'`). */
  minimum?: number;
  /** Maximum value (for `type: 'number'`). */
  maximum?: number;
  /** Display order hint (lower = higher). */
  order?: number;
}

/**
 * A plugin's `contributes.configuration` block.
 * Mirrors the VS Code extension manifest format.
 */
export interface ConfigurationContribution {
  /** Section title displayed in the Settings UI. */
  title?: string;
  /** Map of fully-qualified key → property schema. */
  properties?: Record<string, ConfigurationPropertySchema>;
}

/** Data sent to the Settings renderer for display. */
export interface ConfigurationSection {
  pluginName: string;
  title: string;
  properties: Array<{
    key: string;
    schema: ConfigurationPropertySchema;
    value: unknown;
    isDefault: boolean;
  }>;
}
