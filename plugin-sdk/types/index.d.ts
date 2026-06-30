/**
 * LogAnalyzer Plugin SDK — Type Declarations
 *
 * 使用方式：
 *   npm install loganalyzer-plugin-sdk
 *
 * 在 TypeScript 插件中：
 *   import { PluginBase } from 'loganalyzer-plugin-sdk';
 *   import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';
 *
 *   export default class MyPlugin extends PluginBase {
 *     async onActivate(context: PluginContext): Promise<void> { ... }
 *   }
 */

// ── UI 对话框选项 ──────────────────────────────────────────────────────────

/** showInputBox 的选项 */
export interface InputBoxOptions {
  /** 输入框标题 */
  title?: string;
  /** 占位提示文字 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: string;
  /** 是否为密码输入 */
  password?: boolean;
}

/** showQuickPick 的选项 */
export interface QuickPickOptions {
  /** 选择框标题 */
  title?: string;
  /** 占位提示 */
  placeHolder?: string;
}

/** showMessage 对话框的选项 */
export interface MessageOptions {
  /** 是否为模态对话框 */
  modal?: boolean;
  /** 详细信息（仅 modal 模式显示） */
  detail?: string;
}

/** QuickPick 列表项 */
export interface QuickPickItem {
  label: string;
  [key: string]: unknown;
}

// ── Disposable ─────────────────────────────────────────────────────────────

/** 可清理的资源接口 */
export interface IDisposable {
  dispose(): void;
}

// ── 插件元数据 ─────────────────────────────────────────────────────────────

/** 插件元数据（来自 package.json + 运行时字段） */
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
  };
}

// ── PluginContext ───────────────────────────────────────────────────────────

/** 插件上下文，在 onActivate 中传入 */
export interface PluginContext {
  /** 插件实例 */
  readonly instance: PluginBase;
  /** 插件 API */
  readonly api: PluginAPI;
  /** 清理队列，卸载时自动执行 */
  disposables: IDisposable[];
  /** 插件元数据 */
  metadata: PluginMetadata;
  /** 清理所有 disposable */
  disposeAll(): void;
}

// ── PluginAPI ──────────────────────────────────────────────────────────────

/** 插件 API 接口，通过 this.api 访问 */
export interface PluginAPI {
  // ── UI 对话框 ────────────────────────────────────────────────────────

  /** 弹出错误提示框 */
  showErrorMessage(message: string, options?: MessageOptions): Promise<void>;

  /** 弹出信息提示框 */
  showInfoMessage(message: string, options?: MessageOptions): Promise<void>;

  /** 弹出文本输入框，返回用户输入的字符串或 undefined（取消） */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;

  /** 弹出列表选择框，返回用户选择的项或 undefined（取消） */
  showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined>;

  // ── 文件操作 ────────────────────────────────────────────────────────

  /** 在编辑器中打开指定文件 */
  pluginOpenFile(filePath: string): Promise<void>;

  /** 下载远程文件，返回本地路径 */
  downloadFile(url: string, relativePath: string): Promise<string>;

  // ── 路径查询 ────────────────────────────────────────────────────────

  /** 获取应用缓存目录路径 */
  getAppCacheDir(): string;

  /** 获取当前打开的文件路径，无文件时返回 null */
  getCurrentFilePath(): string | null;

  // ── 命令注册 ────────────────────────────────────────────────────────

  /** 注册一条命令到命令面板 */
  registerCommand(context: PluginContext, commandId: string, action: () => void | Promise<void>): void;

  // ── 窗口管理 ────────────────────────────────────────────────────────

  /** 创建一个子窗口 */
  createWindow(pluginId: string, options?: Record<string, any>): any;

  /** 创建一个内置编辑器窗口 */
  createEditorWindow(options?: { width?: number; height?: number; title?: string; textContent?: string }): any;

  /** 关闭插件窗口 */
  closeWindow(pluginId: string): void;

  /** 获取插件窗口 */
  getWindow(pluginId: string): any | undefined;
}

// ── PluginBase ─────────────────────────────────────────────────────────────

/**
 * 插件基类。所有插件必须继承此类。
 *
 * TypeScript 插件示例：
 * ```ts
 * import { PluginBase } from 'loganalyzer-plugin-sdk';
 * import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';
 *
 * export default class MyPlugin extends PluginBase {
 *   async onActivate(context: PluginContext): Promise<void> {
 *     this.api.registerCommand(context, 'myPlugin.hello', () => {
 *       this.api.showInfoMessage('Hello from my plugin!');
 *     });
 *   }
 * }
 * ```
 */
export declare class PluginBase {
  protected api: PluginAPI;

  constructor(api: PluginAPI);

  /** 插件加载后调用，注册命令和初始化状态 */
  onActivate(context: PluginContext): Promise<void>;

  /** 插件卸载前调用，清理资源 */
  onDeactivate(): Promise<void>;

  /**
   * 文件打开前调用，可转换文件路径。
   * 返回原路径正常继续；返回 '' 表示"已处理，跳过后续读取"
   */
  onPreOpenFile(filePath: string): Promise<string>;

  /** 文件在编辑器中打开后调用 */
  onDidOpenFile(context: PluginContext): Promise<void>;

  /** 文件关闭前调用 */
  onWillCloseFile(context: PluginContext): Promise<void>;

  /**
   * 文件内容读取后、显示前调用，可转换内容。
   * 返回原内容正常继续。
   */
  processFile(filePath: string, content: string): Promise<string>;
}
