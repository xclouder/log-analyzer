const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { PluginAPI, Disposable } = require('./plugin-api');
const { PluginContext } = require('./plugin-context');
const AdmZip = require('adm-zip');
const { getLogger } = require('./log-util');

const logger = getLogger('PluginManager');

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
        
        logger.log('Plugin directories initialized:', {
            builtinPluginsDir: this.builtinPluginsDir,
            userPluginsDir: this.userPluginsDir,
            userData: app.getPath('userData'),
            resourcesPath: process.resourcesPath,
            __dirname: __dirname
        });
    }

    async loadPlugins() {
        try {
            await this.initializePluginDirs();
            
            logger.log('Loading plugins from directories:', {
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
            logger.error('Failed to load plugins:', error);
        }
    }

    async loadPluginsFromDir(directory, isBuiltin, pluginBasePath) {
        try {
            logger.log(`Scanning directory for plugins: ${directory}`);
            if (!fs.existsSync(directory)) {
                logger.error(`Plugin directory does not exist: ${directory}`);
                return;
            }
            
            const pluginFiles = await fsPromises.readdir(directory);
            logger.log(`Found ${pluginFiles.length} items in ${directory}`);
            
            for (const file of pluginFiles) {
                const pluginDir = path.join(directory, file);
                const stats = fs.statSync(pluginDir);
                if (!stats.isDirectory()) {
                    logger.log(`Skipping non-directory: ${pluginDir}`);
                    continue;
                }
                logger.log(`Found plugin directory: ${pluginDir}`);
                await this.loadPlugin(pluginDir, isBuiltin);
            }
        } catch (error) {
            logger.error(`Error loading plugins from directory ${directory}:`, error);
        }
    }

    async loadPlugin(pluginDir, isBuiltin) {
        try {
            logger.log(`Loading plugin from directory: ${pluginDir}`);
            const packageJsonPath = path.join(pluginDir, 'package.json');
            
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error(`package.json not found in plugin directory: ${packageJsonPath}`);
            }

            const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf-8'));
            logger.log(`Loading plugin: ${packageJson.name}`);
            
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error(`Invalid plugin package.json format for: ${packageJson.name}`);
            }

            const pluginBasePath = path.resolve(__dirname, 'plugin-base.js');
            logger.log(`Plugin base path: ${pluginBasePath}`);
            
            const mainFile = path.join(pluginDir, packageJson.main);
            logger.log(`Plugin main file: ${mainFile}`);
            
            if (!fs.existsSync(mainFile)) {
                throw new Error(`Plugin main file not found: ${mainFile}`);
            }

            logger.log(`Loading plugin class from: ${mainFile}`);
            const PluginClass = require(mainFile)(pluginBasePath);
            
            if (!PluginClass) {
                throw new Error(`Failed to load plugin class from: ${mainFile}`);
            }

            logger.log(`Initializing plugin instance: ${packageJson.name}`);
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

            logger.log(`Activating plugin: ${packageJson.name}`);
            await plugin.onActivate(pluginCtx);
            logger.log(`Plugin loaded successfully: ${packageJson.name}`);
        } catch (err) {
            logger.error(`Failed to load plugin from ${pluginDir}:`, err);
            throw err; // 重新抛出错误以便上层捕获
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
            logger.log('Installing plugin from:', zipPath);
            if (!fs.existsSync(zipPath)) {
                throw new Error(`Plugin file not found: ${zipPath}`);
            }

            const zip = new AdmZip(zipPath);
            tempDir = path.join(this.userPluginsDir, '_temp');
            logger.log('Extracting to temp directory:', tempDir);

            if (fs.existsSync(tempDir)) {
                await fsPromises.rm(tempDir, { recursive: true });
            }

            await fsPromises.mkdir(tempDir, { recursive: true });
            
            zip.extractAllTo(tempDir, true);
            const tempDirContents = await fsPromises.readdir(tempDir);
            logger.log('Extracted contents:', tempDirContents);
            const packageJsonPath = path.join(tempDir, 'package.json');
            logger.log('Looking for package.json at:', packageJsonPath);
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error('package.json not found in plugin package');
            }

            const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf8'));
            logger.log('Found package.json:', packageJson);
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error('Invalid plugin format');
            }

            const targetDir = path.join(this.userPluginsDir, packageJson.name);
            if (fs.existsSync(targetDir)) {
                throw new Error('Plugin already exists');
            }

            logger.log('Moving plugin to:', targetDir);
            await fsPromises.rename(tempDir, targetDir);
            await this.loadPlugin(targetDir, false);
            logger.log('Plugin installation completed successfully');
            return { success: true, plugin: packageJson };
        } catch (err) {
            logger.error('Error during plugin installation:', err);
            if (tempDir && fs.existsSync(tempDir)) {
                try {
                    await fsPromises.rm(tempDir, { recursive: true });
                    logger.log('Cleaned up temp directory');
                } catch (cleanupErr) {
                    logger.error('Error cleaning up temp directory:', cleanupErr);
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
                logger.error(`Error processing file with plugin ${processor.id}:`, error);
            }
        }
        return processedContent;
    }

    async preProcessFilePath(filePath) {
        logger.log('[PluginManager] Starting preProcessFilePath for:', filePath);
        let processedPath = filePath;
        for (const plugin of this.plugins.values()) {
            logger.log(`[PluginManager] Checking plugin ${plugin.id} for onPreOpenFile method`);
            if (typeof plugin.instance.onPreOpenFile === 'function') {
                try {
                    logger.log(`[PluginManager] Calling onPreOpenFile for plugin ${plugin.id}`);
                    const newPath = await plugin.instance.onPreOpenFile(processedPath);
                    logger.log(`[PluginManager] Plugin ${plugin.id} returned path:`, newPath);
                    if (newPath && typeof newPath === 'string') {
                        processedPath = newPath;
                    }
                } catch (error) {
                    logger.error(`[PluginManager] Error in plugin ${plugin.id} while preprocessing file path:`, error);
                }
            }
        }
        logger.log('[PluginManager] Final processed path:', processedPath);
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
