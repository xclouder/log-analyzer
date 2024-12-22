const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { PluginAPI, Disposable } = require('./plugin-api');
const { PluginContext } = require('./plugin-context');
const AdmZip = require('adm-zip');

class PluginManager {
    constructor(mainWindow, commandManager) {
        this.mainWindow = mainWindow;
        this.plugins = new Map();
        this.api = new PluginAPI(mainWindow, commandManager);
        this.fileProcessors = [];
        this.builtinPluginsDir = ''; 
        this.userPluginsDir = ''; 
    }

    async initializePluginDirs() {
        const { app } = require('electron');
        this.builtinPluginsDir = app.isPackaged
            ? path.join(process.resourcesPath, 'plugins')
            : path.join(__dirname, 'plugins');
        this.userPluginsDir = path.join(app.getPath('userData'), 'plugins');
        
        await fsPromises.mkdir(this.userPluginsDir, { recursive: true });
        
        console.log('Plugin directories initialized:', {
            builtinPluginsDir: this.builtinPluginsDir,
            userPluginsDir: this.userPluginsDir
        });
    }

    async loadPlugins() {
        try {
            await this.initializePluginDirs();
            
            console.log('Loading plugins from directories:', {
                builtinPluginsDir: this.builtinPluginsDir,
                userPluginsDir: this.userPluginsDir
            });
            
            const pluginBasePath = path.resolve(__dirname, 'plugin-base.js');
            
            if (this.builtinPluginsDir) {
                await this.loadPluginsFromDir(this.builtinPluginsDir, true, pluginBasePath);
            }

            if (this.userPluginsDir) {
                await this.loadPluginsFromDir(this.userPluginsDir, false, pluginBasePath);
            }
        } catch (error) {
            console.error('Failed to load plugins:', error);
        }
    }

    async loadPluginsFromDir(directory, isBuiltin, pluginBasePath) {
        const pluginFiles = await fsPromises.readdir(directory);
        for (const file of pluginFiles) {
            const pluginDir = path.join(directory, file);
            const stats = fs.statSync(pluginDir);
            if (!stats.isDirectory()) {
                continue;
            }
            await this.loadPlugin(pluginDir, isBuiltin);
        }
    }

    async loadPlugin(pluginDir, isBuiltin) {
        try {
            console.log(`Loading plugin, dir: ${pluginDir}`);
            const packageJsonPath = path.join(pluginDir, 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error('package.json not found in plugin directory');
            }

            const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf-8'));
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error('Invalid plugin package.json format');
            }

            const pluginBasePath = path.resolve(__dirname, 'plugin-base.js');
            const mainFile = path.join(pluginDir, packageJson.main);
            const PluginClass = require(mainFile)(pluginBasePath);
            const plugin = new PluginClass(this.api);
            const pluginCtx = new PluginContext(plugin, this.api);
            const meta = {
                ...packageJson,
                isBuiltin,
                path: pluginDir
            };
            
            pluginCtx.metadata = meta;
            
            this.plugins.set(packageJson.name, {
                instance: plugin,
                metadata: meta,
                context: pluginCtx,
            });

            await plugin.onActivate(pluginCtx);
            console.log(`Plugin loaded successfully: ${packageJson.name}`);
        } catch (err) {
            console.error(`Failed to load plugin from ${pluginDir}:`, err);
        }
    }

    validatePluginPackage(packageJson) {
        const required = ['name', 'version', 'main', 'author'];
        return required.every(field => packageJson[field]);
    }

    getPlugins() {
        const pluginList = [];
        for (const [name, { metadata }] of this.plugins) {
            pluginList.push({
                name: metadata.name,
                version: metadata.version,
                description: metadata.description || '',
                author: metadata.author,
                isBuiltin: metadata.isBuiltin,
                path: metadata.path
            });
        }
        return pluginList;
    }

    async installPlugin(zipPath) {
        let tempDir = null;
        try {
            console.log('Installing plugin from:', zipPath);
            if (!fs.existsSync(zipPath)) {
                throw new Error(`Plugin file not found: ${zipPath}`);
            }

            const zip = new AdmZip(zipPath);
            tempDir = path.join(this.userPluginsDir, '_temp');
            console.log('Extracting to temp directory:', tempDir);

            if (fs.existsSync(tempDir)) {
                await fsPromises.rm(tempDir, { recursive: true });
            }

            await fsPromises.mkdir(tempDir, { recursive: true });
            
            zip.extractAllTo(tempDir, true);
            const tempDirContents = await fsPromises.readdir(tempDir);
            console.log('Extracted contents:', tempDirContents);
            const packageJsonPath = path.join(tempDir, 'package.json');
            console.log('Looking for package.json at:', packageJsonPath);
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error('package.json not found in plugin package');
            }

            const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf8'));
            console.log('Found package.json:', packageJson);
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error('Invalid plugin format');
            }

            const targetDir = path.join(this.userPluginsDir, packageJson.name);
            if (fs.existsSync(targetDir)) {
                throw new Error('Plugin already exists');
            }

            console.log('Moving plugin to:', targetDir);
            await fsPromises.rename(tempDir, targetDir);
            await this.loadPlugin(targetDir, false);
            console.log('Plugin installation completed successfully');
            return { success: true, plugin: packageJson };
        } catch (err) {
            console.error('Error during plugin installation:', err);
            if (tempDir && fs.existsSync(tempDir)) {
                try {
                    await fsPromises.rm(tempDir, { recursive: true });
                    console.log('Cleaned up temp directory');
                } catch (cleanupErr) {
                    console.error('Error cleaning up temp directory:', cleanupErr);
                }
            }
            throw err;
        }
    }

    async uninstallPlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error('Plugin not found');
        }
        if (plugin.metadata.isBuiltin) {
            throw new Error('Cannot uninstall builtin plugin');
        }
        const context = plugin.context;
        context.disposables.forEach(disposable => disposable.dispose());
        context.disposables = [];
        if (typeof plugin.instance.onDeactivate === 'function') {
            await plugin.instance.onDeactivate();
        }
        await fsPromises.rm(plugin.metadata.path, { recursive: true });
        this.plugins.delete(pluginName);
        return { success: true };
    }

    async processFileContent(filePath, content) {
        let processedContent = content;
        for (const processor of this.fileProcessors) {
            try {
                processedContent = await processor.processFile(filePath, processedContent);
            } catch (error) {
                console.error(`Error processing file with plugin ${processor.id}:`, error);
            }
        }
        return processedContent;
    }

    async preProcessFilePath(filePath) {
        console.log('[PluginManager] Starting preProcessFilePath for:', filePath);
        let processedPath = filePath;
        for (const plugin of this.plugins.values()) {
            console.log(`[PluginManager] Checking plugin ${plugin.id} for onPreOpenFile method`);
            if (typeof plugin.instance.onPreOpenFile === 'function') {
                try {
                    console.log(`[PluginManager] Calling onPreOpenFile for plugin ${plugin.id}`);
                    const newPath = await plugin.instance.onPreOpenFile(processedPath);
                    console.log(`[PluginManager] Plugin ${plugin.id} returned path:`, newPath);
                    if (newPath && typeof newPath === 'string') {
                        processedPath = newPath;
                    }
                } catch (error) {
                    console.error(`[PluginManager] Error in plugin ${plugin.id} while preprocessing file path:`, error);
                }
            }
        }
        console.log('[PluginManager] Final processed path:', processedPath);
        return processedPath;
    }

    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            await plugin.instance.onDeactivate();
            this.plugins.delete(pluginId);
            this.fileProcessors = this.fileProcessors.filter(p => p.id !== pluginId);
        }
    }
}

module.exports = PluginManager;
