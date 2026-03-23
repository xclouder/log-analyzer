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
  };
}

/** Plugin info returned to renderer (safe subset) */
export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
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
