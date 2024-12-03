const fs = require('fs').promises;
const path = require('path');
const PluginAPI = require('./plugin-api');
const AdmZip = require('adm-zip');

class PluginManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.plugins = new Map();
        this.api = new PluginAPI(mainWindow);
        this.fileProcessors = [];
        this.builtinPluginsDir = ''; // 内置插件目录
        this.userPluginsDir = ''; // 用户插件目录
    }

    // 初始化插件目录
    async initializePluginDirs() {
        const { app } = require('electron');
        
        // 设置内置插件目录
        this.builtinPluginsDir = app.isPackaged
            ? path.join(process.resourcesPath, 'plugins')
            : path.join(__dirname, '..', '..', 'plugins');

        // 设置用户插件目录
        this.userPluginsDir = path.join(app.getPath('userData'), 'plugins');
        
        // 确保用户插件目录存在
        await fs.mkdir(this.userPluginsDir, { recursive: true });

        console.log('Plugin directories initialized:', {
            builtinPluginsDir: this.builtinPluginsDir,
            userPluginsDir: this.userPluginsDir
        });
    }

    // 加载所有插件
    async loadPlugins() {
        try {
            await this.initializePluginDirs();
            console.log('Loading plugins from directories:', {
                builtinPluginsDir: this.builtinPluginsDir,
                userPluginsDir: this.userPluginsDir
            });
            
            // 加载内置插件
            if (this.builtinPluginsDir) {
                await this.loadPluginsFromDir(this.builtinPluginsDir, true);
            }
            
            // 加载用户插件
            if (this.userPluginsDir) {
                await this.loadPluginsFromDir(this.userPluginsDir, false);
            }
        } catch (error) {
            console.error('Error loading plugins:', error);
            throw error;
        }
    }

    // 从指定目录加载插件
    async loadPluginsFromDir(pluginsDir, isBuiltin) {
        if (!pluginsDir) {
            console.error('Invalid plugins directory:', pluginsDir);
            return;
        }

        try {
            console.log(`Loading plugins from ${pluginsDir} (isBuiltin: ${isBuiltin})`);
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const pluginDir = path.join(pluginsDir, entry.name);
                    await this.loadPlugin(pluginDir, isBuiltin);
                }
            }
        } catch (err) {
            console.error(`Error loading plugins from ${pluginsDir}:`, err);
        }
    }

    // 加载单个插件
    async loadPlugin(pluginDir, isBuiltin) {
        try {
            console.log(`Loading plugin from ${pluginDir}`);
            // 读取插件的 package.json
            const packageJsonPath = path.join(pluginDir, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            
            // 验证插件格式
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error('Invalid plugin package.json');
            }
            
            // 加载插件主文件
            const mainFile = path.join(pluginDir, packageJson.main);
            const PluginClass = require(mainFile);
            
            // 创建插件实例
            const plugin = new PluginClass(this.api);
            
            // 存储插件信息
            this.plugins.set(packageJson.name, {
                instance: plugin,
                metadata: {
                    ...packageJson,
                    isBuiltin,
                    path: pluginDir
                }
            });
            
            // 如果插件有 activate 方法，调用它
            if (typeof plugin.activate === 'function') {
                await plugin.activate();
            }
            
            console.log(`Plugin loaded successfully: ${packageJson.name}`);
        } catch (err) {
            console.error(`Failed to load plugin from ${pluginDir}:`, err);
        }
    }

    // 验证插件包格式
    validatePluginPackage(packageJson) {
        const required = ['name', 'version', 'main', 'author'];
        return required.every(field => packageJson[field]);
    }

    // 获取插件列表
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

    // 安装插件
    async installPlugin(zipPath) {
        try {
            // 读取 zip 文件
            const zip = new AdmZip(zipPath);
            
            // 在临时目录解压并验证
            const tempDir = path.join(this.userPluginsDir, '_temp');
            await fs.promises.mkdir(tempDir, { recursive: true });
            zip.extractAllTo(tempDir, true);
            
            // 查找并验证 package.json
            const packageJsonPath = path.join(tempDir, 'package.json');
            const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'));
            
            if (!this.validatePluginPackage(packageJson)) {
                throw new Error('Invalid plugin format');
            }
            
            // 检查是否已存在同名插件
            const targetDir = path.join(this.userPluginsDir, packageJson.name);
            if (fs.existsSync(targetDir)) {
                throw new Error('Plugin already exists');
            }
            
            // 移动到最终位置
            await fs.promises.rename(tempDir, targetDir);
            
            // 加载新插件
            await this.loadPlugin(targetDir, false);
            
            return { success: true, plugin: packageJson };
        } catch (err) {
            // 清理临时目录
            if (fs.existsSync(tempDir)) {
                await fs.promises.rm(tempDir, { recursive: true });
            }
            throw err;
        }
    }

    // 删除插件
    async uninstallPlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error('Plugin not found');
        }
        
        if (plugin.metadata.isBuiltin) {
            throw new Error('Cannot uninstall builtin plugin');
        }
        
        // 如果插件有 deactivate 方法，调用它
        if (typeof plugin.instance.deactivate === 'function') {
            await plugin.instance.deactivate();
        }
        
        // 删除插件目录
        await fs.rm(plugin.metadata.path, { recursive: true });
        
        // 从插件列表中移除
        this.plugins.delete(pluginName);
        
        return { success: true };
    }

    // 处理文件内容
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

    // 预处理文件路径
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

    // 卸载插件
    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            if (typeof plugin.instance.deactivate === 'function') {
                await plugin.instance.deactivate();
            }
            this.plugins.delete(pluginId);
            this.fileProcessors = this.fileProcessors.filter(p => p.id !== pluginId);
        }
    }

    // 获取所有已加载的插件
    getPlugins() {
        return Array.from(this.plugins.values());
    }
}

module.exports = PluginManager;
