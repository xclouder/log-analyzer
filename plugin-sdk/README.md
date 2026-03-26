# loganalyzer-plugin-sdk

LogAnalyzer 插件开发 SDK。提供 `PluginBase` 基类和 TypeScript 类型声明。

## 安装

```bash
npm install loganalyzer-plugin-sdk
npm install typescript --save-dev
```

## 快速开始

### 1. 项目结构

```
my-plugin/
├── src/
│   └── index.ts       # TypeScript 源码
├── dist/
│   └── index.js       # 编译产物（自动生成）
├── package.json
└── tsconfig.json
```

### 2. package.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "author": "your-name",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "loganalyzer-plugin-sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "engines": {
    "loganalyzer": "^1.0.0"
  },
  "contributes": {
    "commands": []
  }
}
```

> **重要：** `main` 字段必须指向编译后的 `.js` 文件（如 `dist/index.js`）。

### 3. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

也可以直接复制本 SDK 附带的 `tsconfig.plugin.json` 作为基础。

### 4. src/index.ts

```ts
import { PluginBase } from 'loganalyzer-plugin-sdk';
import type { PluginContext } from 'loganalyzer-plugin-sdk';

export default class MyPlugin extends PluginBase {
  async onActivate(context: PluginContext): Promise<void> {
    this.api.registerCommand(context, 'myPlugin.greet', async () => {
      await this.api.showInfoMessage('Hello from TypeScript plugin!');
    });
  }

  async onDeactivate(): Promise<void> {
    // Clean up resources
  }
}
```

### 5. 编译 & 打包

```bash
# 编译 TypeScript → JavaScript
npm run build

# 使用 CLI 打包为 .zip
npx log-analyzer-plugin build
```

## 开发流程

```
编写 TypeScript (.ts)
    ↓
npm run build (tsc 编译)
    ↓
产出 JavaScript (.js) 到 dist/
    ↓
npx log-analyzer-plugin build (打包 .zip)
    ↓
在 LogAnalyzer 中安装 .zip 插件
```

## 可用类型

| 类型 | 说明 |
|------|------|
| `PluginBase` | 插件基类（运行时 + 类型） |
| `PluginAPI` | 插件 API 接口（通过 `this.api` 访问） |
| `PluginContext` | 插件上下文（`onActivate` 的参数） |
| `PluginMetadata` | 插件元数据 |
| `InputBoxOptions` | 输入框选项 |
| `QuickPickOptions` | 列表选择框选项 |
| `MessageOptions` | 消息对话框选项 |
| `IDisposable` | 可清理资源接口 |

## License

MIT
