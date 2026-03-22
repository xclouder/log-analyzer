# log-analyzer-plugin CLI

A command-line tool for **LogAnalyzer plugin development** — scaffold, build, and install plugins from the terminal.

---

## Installation

```bash
# From the cli/ directory
npm install

# Install globally (optional)
npm install -g .
```

---

## Usage

```
log-analyzer-plugin <command> [options]
```

### Commands

#### `init` — Scaffold a new plugin

Interactively generates the boilerplate directory structure for a new plugin.

```bash
log-analyzer-plugin init
```

You will be prompted for:

| Field | Description |
|---|---|
| Plugin name | Kebab-case identifier, e.g. `my-plugin` |
| Display title | Human-readable title shown in the UI |
| Class name | PascalCase class name, e.g. `MyPlugin` |
| Description | Short plugin description |
| Author | Author name |
| Version | Semver version (default `1.0.0`) |
| Features | `fileContent`, `filePath`, `window` (multi-select) |
| File types | Comma-separated file extensions, e.g. `.log,.txt` |

Output: a new directory `<plugin-name>/` containing `index.js`, `package.json`, `README.md`, and `assets/`.

---

#### `build` — Package plugin into a `.zip`

Run from inside your plugin directory. Validates that `package.json` and `index.js` exist, then zips the plugin.

```bash
log-analyzer-plugin build

# Optional: specify output path
log-analyzer-plugin build -o /tmp/my-plugin.zip
log-analyzer-plugin build --output /tmp/my-plugin.zip
```

The resulting `.zip` includes `package.json`, `index.js`, `README.md`, and any `src/`, `dist/`, `lib/` sub-directories.

---

#### `install <plugin-path>` — Install a plugin zip

Extracts a built plugin `.zip` into `~/.log-analyzer/plugins/`. If a plugin with the same name already exists it is replaced.

```bash
log-analyzer-plugin install ./my-plugin.zip
log-analyzer-plugin install /path/to/some-plugin-1.0.0.zip
```

The install directory is always `<home>/.log-analyzer/plugins/<plugin-name>/` regardless of operating system.

---

## Plugin structure

Every LogAnalyzer plugin must follow this structure:

```
my-plugin/
├── index.js       ← required: factory-function entry point
├── package.json   ← required: name, version, contributes …
├── README.md
└── assets/
```

`index.js` must export a factory function:

```js
module.exports = function(pluginBasePath) {
  const Plugin = require(pluginBasePath);

  class MyPlugin extends Plugin {
    async onActivate(context) { /* register commands */ }
    async onPreOpenFile(filePath) { return filePath; }
  }

  return MyPlugin;
};
```

---

## Development workflow

```bash
# 1. Scaffold
log-analyzer-plugin init

# 2. Edit index.js …

# 3. Package
cd my-plugin
log-analyzer-plugin build

# 4. Install into LogAnalyzer
log-analyzer-plugin install ./my-plugin.zip
```
