# LogAnalyzer 插件开发指南

## 概述

LogAnalyzer 支持通过插件扩展功能。插件可以使用 **JavaScript** 或 **TypeScript** 编写。TypeScript 插件通过 `loganalyzer-plugin-sdk` 获得完整的类型提示，开发者自行编译为 JavaScript 后打包分发。

插件可以：

- 拦截并处理文件打开流程（解压、解密、转换路径等）
- 变换文件内容（过滤、格式化、解码等）
- 注册命令到命令面板（Ctrl+Shift+P）
- 弹出 UI 对话框（输入框、列表选择、消息提示）
- 下载远程文件
- 创建自定义窗口

---

## 快速开始

### 方式一：使用 CLI 脚手架

```bash
cd cli
npm install
npx log-analyzer-plugin init
```

交互式提示会引导你创建插件目录结构。在语言选择步骤中，可以选择 **JavaScript** 或 **TypeScript**。

### 方式二：手动创建（JavaScript）

创建如下目录结构：

```
my-plugin/
├── package.json   # 必须 — 元数据 + 命令声明
├── index.js       # 必须 — 工厂函数入口
└── README.md      # 可选
```

### 方式三：手动创建（TypeScript）

```
my-plugin/
├── src/
│   └── index.ts       # TypeScript 源码
├── dist/
│   └── index.js       # 编译产物（tsc 生成）
├── package.json       # 必须 — main 指向 dist/index.js
├── tsconfig.json      # TypeScript 编译配置
└── README.md          # 可选
```

---

## package.json 格式

### 必填字段

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "author": "your-name"
}
```

缺少以上任一字段，插件将拒绝加载。

### 完整示例

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件功能说明",
  "title": "我的插件",
  "author": "your-name",
  "license": "MIT",
  "main": "index.js",
  "engines": {
    "loganalyzer": "^1.0.0"
  },
  "contributes": {
    "commands": [
      {
        "command": "loganalyzer.myCommand",
        "title": "执行我的命令",
        "category": "我的分类"
      }
    ],
    "fileTypes": [".zip", ".gz"]
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 唯一标识符，kebab-case 格式 |
| `version` | ✅ | 语义化版本号 |
| `main` | ✅ | 入口文件路径（`index.js` 或 `index.ts`） |
| `author` | ✅ | 作者名称 |
| `title` | | 显示名称，用作命令分类的回退值 |
| `description` | | 在插件管理器中展示的描述文本 |
| `contributes.commands` | | 声明插件注册的命令（见下文） |
| `contributes.fileTypes` | | 关联的文件扩展名 |

### contributes.commands

每个命令需要在 `package.json` 中声明，才能通过 `api.registerCommand()` 注册：

```json
{
  "contributes": {
    "commands": [
      {
        "command": "loganalyzer.openLogFromUrl",
        "title": "从URL打开日志",
        "category": "日志"
      }
    ]
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `command` | ✅ | 命令唯一 ID |
| `title` | ✅ | 命令面板中显示的名称 |
| `category` | | 命令分类（缺省使用 `title` 或 `name`） |

---

## 工厂函数模式

插件的 `index.js` 必须导出一个**工厂函数**，该函数接收 `pluginBasePath` 参数并返回插件类：

```js
module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);  // 获取 PluginBase 类

    class MyPlugin extends Plugin {
        constructor(api) {
            super(api);  // 必须调用 super，PluginBase 会保存 this.api
        }

        async onActivate(context) {
            // 插件初始化逻辑
        }
    }

    return MyPlugin;  // 返回类本身，不是实例
};
```

**为什么用这种模式：** 插件是独立的 `.js` 文件，无法直接 `require` 应用内部模块。宿主程序在运行时将 `plugin-base.js` 的绝对路径传入，让插件可以继承基类。

---

## TypeScript 插件开发

### Plugin SDK

`loganalyzer-plugin-sdk` 是专门为 TypeScript 插件开发提供的 SDK 包，包含：

- 完整的 TypeScript 类型声明（`PluginAPI`、`PluginContext`、`PluginBase` 等）
- 推荐的 `tsconfig.json` 配置
- 示例项目

安装：

```bash
npm install loganalyzer-plugin-sdk --save-dev
npm install typescript --save-dev
```

### 基本结构

TypeScript 插件与 JavaScript 插件遵循相同的工厂函数模式，只是使用 TypeScript 语法编写。**关键区别**：

- `main` 字段必须指向编译后的 `.js` 文件（如 `dist/index.js`）
- 源码放在 `src/` 目录
- 使用 `tsc` 编译后再打包

#### package.json

```json
{
  "name": "my-ts-plugin",
  "version": "1.0.0",
  "description": "TypeScript 插件示例",
  "title": "我的TS插件",
  "author": "your-name",
  "license": "MIT",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "loganalyzer-plugin-sdk": "^1.0.0",
    "typescript": "^5.4.0"
  },
  "engines": { "loganalyzer": "^1.0.0" },
  "contributes": {
    "commands": [
      {
        "command": "loganalyzer.myTsCommand",
        "title": "执行TS命令",
        "category": "我的分类"
      }
    ]
  }
}
```

> **重要：** `main` 字段指向编译后的 `.js` 文件，不是 `.ts` 源码。

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### src/index.ts

```ts
import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';

module.exports = function(pluginBasePath: string) {
    const Plugin = require(pluginBasePath);

    class MyTsPlugin extends Plugin {
        constructor(api: PluginAPI) {
            super(api);
        }

        async onActivate(context: PluginContext): Promise<void> {
            this.api.registerCommand(context, 'loganalyzer.myTsCommand', async () => {
                const input = await this.api.showInputBox({
                    title: '请输入内容',
                    placeholder: '在此输入...'
                });
                if (input) {
                    await this.api.showInfoMessage(`你输入了: ${input}`);
                }
            });
        }

        async onPreOpenFile(filePath: string): Promise<string> {
            return filePath;
        }

        async processFile(filePath: string, content: string): Promise<string> {
            return content;
        }
    }

    return MyTsPlugin;
};
```

### 开发流程

```
编写 TypeScript (src/*.ts)
    ↓
npm run build (tsc 编译)
    ↓
产出 JavaScript (dist/*.js)
    ↓
npx log-analyzer-plugin build (打包 .zip)
    ↓
在 LogAnalyzer 中安装 .zip 插件
```

### 类型提示

SDK 提供的类型导入方式：

```ts
import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';
import type { InputBoxOptions, QuickPickOptions } from 'loganalyzer-plugin-sdk';
import type { PluginBase, PluginMetadata, IDisposable } from 'loganalyzer-plugin-sdk';
```

> **注意：** 使用 `import type` 确保类型仅用于编译时检查，不会影响运行时产物。

### 使用 CLI 开发 TypeScript 插件

```bash
# 1. 脚手架创建（选择 TypeScript）
cd cli && npm install
npx log-analyzer-plugin init
# → 在 "Plugin language" 步骤选择 "TypeScript"

# 2. 安装依赖（包括 SDK 和 TypeScript）
cd my-ts-plugin
npm install

# 3. 编辑插件逻辑
# 编辑 src/index.ts

# 4. 编译
npm run build

# 5. 打包（CLI 会自动先执行 tsc 编译）
npx log-analyzer-plugin build

# 6. 安装
npx log-analyzer-plugin install ./my-ts-plugin.zip
```

---

## 生命周期钩子

| 钩子 | 签名 | 调用时机 |
|------|------|----------|
| `onActivate(context)` | `async (PluginContext) → void` | 插件加载后立即调用，用于注册命令、初始化状态 |
| `onDeactivate()` | `async () → void` | 插件被卸载前调用，用于清理资源 |
| `onPreOpenFile(filePath)` | `async (string) → string` | 在任何文件打开前调用，可转换路径。返回原路径正常继续；**返回 `''` 表示"已处理，跳过后续读取"** |
| `processFile(filePath, content)` | `async (string, string) → string` | 文件内容读取后、显示前调用，可转换内容 |
| `onDidOpenFile(context)` | `async (PluginContext) → void` | 文件在编辑器中打开后调用 |
| `onWillCloseFile(context)` | `async (PluginContext) → void` | 文件关闭前调用 |

### onPreOpenFile 详解

多个插件的 `onPreOpenFile` 按加载顺序**串行执行**，前一个的返回值作为后一个的输入。

```js
async onPreOpenFile(filePath) {
    if (filePath.endsWith('.encrypted')) {
        const decryptedPath = await this.decrypt(filePath);
        return decryptedPath;  // 后续读取解密后的文件
    }
    return filePath;  // 不处理，原样传递
}
```

返回空字符串 `''` 是特殊约定，表示插件已经自行处理了文件打开（例如解压 ZIP 后让用户选择子文件），宿主程序不再读取原文件：

```js
async onPreOpenFile(filePath) {
    if (this.isZipFile(filePath)) {
        // 解压并让用户选择文件...
        await this.api.pluginOpenFile(selectedFile);
        return '';  // 告知宿主："我已处理完毕"
    }
    return filePath;
}
```

---

## 插件 API 参考

通过 `this.api` 访问，所有方法均由宿主程序提供。

### UI 对话框

#### showInputBox(options?)

弹出文本输入框，返回用户输入的字符串或 `undefined`（取消）。

```js
const url = await this.api.showInputBox({
    title: "请输入URL",
    placeholder: "https://example.com/log.zip",
    defaultValue: ""
});
if (!url) return;  // 用户取消
```

**InputBoxOptions：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 输入框标题 |
| `placeholder` | string | 占位提示文字 |
| `defaultValue` | string | 默认值 |
| `password` | boolean | 是否为密码输入 |

#### showQuickPick(items, options?)

弹出列表选择框，返回用户选择的项或 `undefined`（取消）。

```js
const files = ['error.log', 'access.log', 'debug.log'];
const selected = await this.api.showQuickPick(files, {
    title: "选择要打开的文件"
});
if (!selected) return;
```

**QuickPickOptions：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 选择框标题 |
| `placeHolder` | string | 占位提示 |

#### showErrorMessage(message, options?)

弹出错误提示框。

```js
await this.api.showErrorMessage("下载失败", {
    modal: true,
    detail: error.message
});
```

#### showInfoMessage(message, options?)

弹出信息提示框，原名 `showInformationMessage`。

```js
await this.api.showInfoMessage("操作完成");
```

**MessageOptions（两者通用）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `modal` | boolean | 是否为模态对话框 |
| `detail` | string | 详细信息（仅 modal 模式显示） |

### 文件操作

#### pluginOpenFile(filePath)

在编辑器中打开指定文件（等同于用户手动打开文件）。

```js
await this.api.pluginOpenFile("C:/logs/extracted/game.log");
```

#### downloadFile(url, relativePath)

下载远程文件到应用缓存目录。支持 HTTP/HTTPS，自动跟随 301/302 重定向。下载进度每 5% 更新一次（渲染进程会显示进度条）。

```js
const localPath = await this.api.downloadFile(
    "https://example.com/log.zip",
    "my-plugin/download.zip"    // 相对于缓存目录的路径
);
// localPath = "<userData>/cache/my-plugin/download.zip"
```

#### getAppCacheDir()

获取应用缓存目录路径。

```js
const cacheDir = this.api.getAppCacheDir();
// → "<userData>/cache"
```

#### getCurrentFilePath()

获取当前打开的文件路径，无文件时返回 `null`。

```js
const filePath = this.api.getCurrentFilePath();
```

### 命令注册

#### registerCommand(context, commandId, action)

注册一条命令到命令面板。**前提：** 该 `commandId` 必须已在 `package.json` 的 `contributes.commands` 中声明。

```js
async onActivate(context) {
    this.api.registerCommand(context, 'loganalyzer.myCommand', () => {
        this.doSomething();
    });
}
```

命令会在插件卸载时自动注销（通过 Disposable 模式）。

### 窗口管理

#### createWindow(pluginId, options?)

创建一个子窗口。

```js
const win = this.api.createWindow('my-plugin', {
    width: 800,
    height: 600,
    title: '自定义窗口'
});
```

#### createEditorWindow(options?)

创建一个内置 Monaco 编辑器的窗口。

```js
const win = this.api.createEditorWindow({
    width: 1000,
    height: 700,
    title: '日志预览',
    textContent: '这里是文件内容...'
});
```

#### closeWindow(pluginId) / getWindow(pluginId)

关闭或获取已创建的插件窗口。

---

## PluginContext 与 Disposable

### PluginContext

`onActivate(context)` 的参数，包含：

| 属性 | 类型 | 说明 |
|------|------|------|
| `instance` | PluginBase | 插件实例本身 |
| `api` | PluginAPI | API 接口 |
| `metadata` | PluginMetadata | 插件元数据（来自 package.json + 运行时字段） |
| `disposables` | Disposable[] | 清理队列，卸载时自动执行 |

### Disposable

`api.registerCommand()` 会自动创建 Disposable 并推入 `context.disposables`。卸载时 `disposeAll()` 逐个调用 `dispose()`，保证命令被注销。

如果需要手动注册清理逻辑：

```js
async onActivate(context) {
    const timer = setInterval(() => this.poll(), 60000);

    // 手动添加 Disposable
    context.disposables.push({
        dispose() { clearInterval(timer); }
    });
}
```

---

## 插件安装方式

### 方式一：应用内安装（推荐）

1. 将插件打包为 `.zip`（使用 CLI 的 `build` 命令）
2. 打开 LogAnalyzer → 菜单 → Plugins → Plugin Manager
3. 选择 ZIP 文件安装

安装位置：`<userData>/plugins/<plugin-name>/`

### 方式二：CLI 安装

```bash
cd cli && npm install
npx log-analyzer-plugin install ./my-plugin.zip
```

安装位置：`~/.log-analyzer/plugins/<plugin-name>/`

### 方式三：开发模式（直接放目录）

将插件目录直接放入 `src/plugins/`（作为内置插件），或放入 `<userData>/plugins/`（作为用户插件），重启应用即可加载。

---

## CLI 工具参考

CLI 工具位于 `cli/` 目录，提供三个命令：

### init — 脚手架创建

```bash
npx log-analyzer-plugin init
```

交互式提示：

| 提示项 | 格式要求 | 说明 |
|--------|----------|------|
| name | kebab-case (`/^[a-z0-9-]+$/`) | 插件名称 |
| title | 自由文本 | 显示标题 |
| className | PascalCase (`/^[A-Z][a-zA-Z0-9]*$/`) | 类名（自动从 name 推导） |
| description | 自由文本 | 描述 |
| author | 自由文本 | 作者 |
| version | 语义化版本 | 默认 `1.0.0` |
| features | 多选 | File Content Processing / File Path Processing / Custom Window |
| fileTypes | 逗号分隔 | 关联的文件扩展名 |

### build — 打包

```bash
cd my-plugin
npx log-analyzer-plugin build [-o, --output <path>]
```

在当前目录下验证插件结构，然后打包为 ZIP。

- 如果检测到 `tsconfig.json`，会先自动执行 `tsc` 编译
- 验证 `package.json` 的 `main` 字段必须指向 `.js` 文件
- 验证 `main` 指向的文件确实存在

打包内容：
- 文件：`package.json`、`README.md`
- `main` 所在的目录（如 `dist/`）或 `main` 文件本身
- 可选目录：`assets/`、`lib/`（如果存在）

### install — 安装

```bash
npx log-analyzer-plugin install <plugin.zip>
```

解压到 `~/.log-analyzer/plugins/<name>/`，如果已存在则覆盖（升级）。

---

## 完整示例：openlog-from-url 插件

这是一个内置插件，展示了大部分 API 的用法。

### package.json

```json
{
  "name": "openlog-from-url",
  "version": "1.0.0",
  "description": "Open log from URL - download a zip and select a file to open",
  "title": "OpenLogFromUrl",
  "author": "loganalyzer",
  "license": "MIT",
  "main": "index.js",
  "engines": { "loganalyzer": "^1.0.0" },
  "contributes": {
    "commands": [
      {
        "command": "loganalyzer.openLogFromUrl",
        "title": "从URL打开日志",
        "category": "日志"
      }
    ],
    "fileTypes": [".zip", ".gz", ".tar", ".7z"]
  }
}
```

### index.js（简化版）

```js
module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class OpenlogFromUrlPlugin extends Plugin {
        constructor(api) {
            super(api);
        }

        // ── 钩子：拦截压缩文件的打开 ──────────────────
        async onPreOpenFile(filePath) {
            if (!this.isCompressedFile(filePath)) {
                return filePath;  // 非压缩文件，正常通过
            }

            // 解压
            const cacheDir = /* 解压目标路径 */;
            await this.extractZip(filePath, cacheDir);

            // 让用户选择文件
            const files = this.walkDir(cacheDir);
            const selected = await this.api.showQuickPick(files, {
                title: "选择要打开的文件"
            });

            if (selected) {
                await this.api.pluginOpenFile(path.join(cacheDir, selected));
                return '';  // 已处理
            }
            return filePath;  // 用户取消，回退
        }

        // ── 命令：从 URL 下载并打开 ──────────────────
        async onActivate(context) {
            this.api.registerCommand(context, 'loganalyzer.openLogFromUrl', () => {
                this.downloadAndOpen();
            });
        }

        async downloadAndOpen() {
            // 1. 获取 URL
            const url = await this.api.showInputBox({ title: "输入日志URL" });
            if (!url) return;

            // 2. 下载
            try {
                const zipPath = await this.api.downloadFile(url, 'downloads/log.zip');

                // 3. 解压 + 选择文件
                const cacheDir = this.api.getAppCacheDir();
                await this.extractZip(zipPath, cacheDir);
                const files = this.walkDir(cacheDir);
                const selected = await this.api.showQuickPick(files, {
                    title: "选择要打开的文件"
                });

                if (selected) {
                    await this.api.pluginOpenFile(path.join(cacheDir, selected));
                }
            } catch (error) {
                await this.api.showErrorMessage("下载失败", {
                    modal: true,
                    detail: error.message
                });
            }
        }

        isCompressedFile(filePath) {
            const ext = path.extname(filePath).toLowerCase();
            if (filePath.toLowerCase().endsWith('.tar.gz')) return true;
            return ['.zip', '.tar', '.gz', '.7z'].includes(ext);
        }
    }

    return OpenlogFromUrlPlugin;
};
```

---

## 插件加载流程图

```
应用启动
  │
  ├── 扫描 src/plugins/ (内置)
  └── 扫描 <userData>/plugins/ (用户)
        │
        ├── 读取 package.json
        ├── 校验必填字段 (name, version, main, author)
        ├── require(main)(pluginBasePath) → 获取 PluginClass
        ├── new PluginClass(api) → 创建实例
        ├── 创建 PluginContext → 设置 metadata
        └── 调用 onActivate(context) → 插件初始化完成
              │
              └── 插件调用 api.registerCommand(context, id, action)
                    │
                    ├── 校验 id 已在 package.json 中声明
                    ├── 注册到 CommandManager
                    ├── 通知渲染进程刷新命令面板
                    └── 推入 Disposable 到 context.disposables

文件打开时
  │
  ├── preProcessFilePath(path) → 按顺序调用每个插件的 onPreOpenFile
  ├── readFile(path) → 自动检测编码，读取内容
  └── processFileContent(path, content) → 按顺序调用每个插件的 processFile

插件卸载时
  │
  ├── context.disposeAll() → 注销所有命令
  ├── instance.onDeactivate() → 插件清理
  └── 删除插件目录
```
