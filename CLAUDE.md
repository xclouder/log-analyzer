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

### Key Files
- `src/main/main.ts` — App lifecycle, IPC handler registration, menu creation
- `src/main/file-reader.ts` — File reading with encoding detection (chardet + iconv-lite) and large-file binary search
- `src/main/plugin-manager.ts` — Plugin loading, installation, uninstallation
- `src/main/plugin-api.ts` — PluginAPI interface definition
- `src/main/plugin-api-impl.ts` — Concrete PluginAPI implementation (UI dialogs, downloads, commands)
- `src/main/preload.ts` — Secure context bridge (compiled to `dist/main/main/preload.js`)
- `src/renderer/app.ts` — Main renderer logic (compiled to `dist/renderer/renderer/app.js`)
- `src/shared/types.ts` — Shared TypeScript interfaces
- `src/shared/ipc-channels.ts` — All IPC channel name constants
- `src/shared/filter-engine.ts` — Pure filter logic (testable without Electron)

### Plugin System
Plugins use a factory function pattern to extend `PluginBase`:
```js
module.exports = function(pluginBasePath) {
  const Plugin = require(pluginBasePath);  // loads plugin-base.js
  class MyPlugin extends Plugin { ... }
  return MyPlugin;
};
```
Built-in plugins live in `src/plugins/`. User plugins are installed to `<userData>/plugins/`.

### Large File Handling
Files > `sizeMB` (default 100MB) are read via binary search on byte offsets. Key fix: chunk boundaries are aligned to raw byte newlines BEFORE decoding, preventing multi-byte character corruption. Encoding is auto-detected via `chardet`.

### Testing
Tests live in `tests/`. The `electron` module is mocked via `tests/__mocks__/electron.ts`. Pure logic modules (file-reader, filter-engine, command-manager) are tested without Electron.
