# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Commands

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript (main + renderer)
npm run build:main    # Compile main process only
npm run build:renderer # Compile renderer process only
npm start             # Build then launch Electron app
npm test              # Run Jest tests
npm test -- --testPathPattern=file-reader  # Run single test file
npm run test:coverage # Run tests with coverage report

# Build distributables
npm run build:portable  # Windows portable EXE
npm run build:nsis      # Windows NSIS installer
npm run build:mac       # macOS ZIP
```

## Architecture

### TypeScript Build Pipeline
- `src/main/` → compiled by `tsconfig.main.json` (rootDir=`src`) → `dist/main/main/`
- `src/renderer/` → compiled by `tsconfig.renderer.json` (rootDir=`src`) → `dist/renderer/renderer/`
- `src/shared/` → compiled by both tsconfigs into their respective output dirs
- Electron entry point: `dist/main/main/main.js` (set in `package.json "main"`)
- HTML files (`src/renderer/*.html`) are **not compiled** — loaded directly from `src/renderer/` in dev
- Script paths in `index.html` are relative (`../../dist/renderer/renderer/*.js`)

### Renderer Architecture Constraint
Renderer runs with `nodeIntegration: false` and `contextIsolation: true`. Scripts are loaded via `<script>` tags (no bundler). This means:
- **DO NOT use `import` or `import type` in renderer `.ts` files** — even `import type` causes TypeScript (with `module: commonjs`) to emit `Object.defineProperty(exports, "__esModule", ...)` which crashes at runtime because `exports` is undefined in browser `<script>` context
- Types needed from `shared/` must be **duplicated inline** in renderer files
- **`import` of values does NOT work** at runtime (compiles to `require()` which is unavailable)
- Cross-script communication uses `(window as any).editor` etc.
- HTML event handlers use `data-action` attributes + event delegation (not inline `onclick`)
- Access to Node/Electron APIs is exclusively through `window.electronAPI` (defined in preload.ts, typed by `shared/electron-api.d.ts`)

### Main Process (src/main/)
- `main.ts` — Orchestrator: app lifecycle, window creation, calls register functions from IPC modules
- `ipc-file.ts` — File open/reload/stats/timestamp IPC handlers
- `ipc-dialog.ts` — Dialog IPC handlers
- `ipc-filter.ts` — Filter config import/save IPC handlers
- `ipc-plugin.ts` — Plugin management IPC handlers
- `ipc-misc.ts` — Window controls, commands, misc IPC handlers
- `menu-builder.ts` — Application menu template and construction
- `auto-updater.ts` — electron-updater configuration and event handlers
- `file-reader.ts` — File reading with encoding detection (chardet + iconv-lite) and large-file binary search
- `plugin-manager.ts` — Plugin loading, installation, uninstallation
- `plugin-api.ts` — PluginAPI interface definition
- `plugin-api-impl.ts` — Concrete PluginAPI implementation (UI dialogs, downloads, commands)
- `preload.ts` — Secure context bridge (compiled to `dist/main/main/preload.js`)

### Renderer Process (src/renderer/)
- `app.ts` — Single-file renderer logic (editors, filters, dialogs, IPC, drag-drop)
- `command-palette.ts` — VSCode-style command palette (Ctrl+Shift+P)
- `renderer-inputbox.ts` — Plugin UI widgets (InputBox, QuickPick, message dialogs)
- `plugin-manager.ts` — Plugin manager window logic
- `divider.ts` — Resizable editor divider
- `app.css` — Main application styles (extracted from index.html)
- `command-palette.css` — Command palette styles

### Shared (src/shared/)
- `types.ts` — Shared TypeScript interfaces (FilterPattern, PluginInfo, etc.)
- `ipc-channels.ts` — All IPC channel name constants (single source of truth)
- `electron-api.d.ts` — Global `ElectronAPI` interface for `window.electronAPI` type safety
- `filter-engine.ts` — Pure filter logic (testable without Electron)
- `disposable.ts` — IDisposable interface and Disposable class
- `sanitize.ts` — HTML escaping for XSS prevention

### Plugin System
Plugins use a factory function pattern to extend `PluginBase`:
```js
module.exports = function(pluginBasePath) {
  const Plugin = require(pluginBasePath);  // loads plugin-base.js
  class MyPlugin extends Plugin { ... }
  return MyPlugin;
};
```
Plugins can be written in **JavaScript** (`.js`) or **TypeScript** (`.ts`). TypeScript plugins use the `loganalyzer-plugin-sdk` package for type declarations and must be pre-compiled to JavaScript before distribution. The runtime PluginManager only loads `.js` files.

Built-in plugins live in `src/plugins/`. User plugins are installed to `<userData>/plugins/`.
The `plugin-sdk/` directory contains the SDK package with type declarations, recommended tsconfig, and example TypeScript plugin.

### Large File Handling
Files > `sizeMB` (default 100MB) are read via binary search on byte offsets. Key fix: chunk boundaries are aligned to raw byte newlines BEFORE decoding, preventing multi-byte character corruption. Encoding is auto-detected via `chardet`.

### Testing
Tests live in `tests/`. The `electron` module is mocked via `tests/__mocks__/electron.ts`. Pure logic modules (file-reader, filter-engine, command-manager) are tested without Electron. The log-util module is mocked in command-manager tests.
