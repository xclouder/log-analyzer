const fs = require('fs').promises;
const path = require('path');
const PluginAPI = require('./plugin-api');

class PluginManager {
    constructor(mainWindow) {
        this.plugins = new Map();
        this.api = new PluginAPI(mainWindow);
        this.fileProcessors = [];
    }

    // 加载插件
    async loadPlugin(pluginPath) {
        try {
            // 获取插件目录的 package.json
            const packageJsonPath = path.join(pluginPath, 'package.json');
            const packageJson = require(packageJsonPath);
            
            // 获取插件主文件的完整路径
            const mainPath = path.join(pluginPath, packageJson.main);
            const PluginClass = require(mainPath);
            
            const plugin = new PluginClass(this.api);
            this.plugins.set(plugin.id, plugin);
            
            if (typeof plugin.activate === 'function') {
                await plugin.activate();
            }
            
            return plugin;
        } catch (error) {
            console.error(`Failed to load plugin from ${pluginPath}:`, error);
            return null;
        }
    }

    // 加载所有插件
    async loadPlugins(pluginsDir) {
        try {
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const pluginPath = path.join(pluginsDir, entry.name);
                    const manifestPath = path.join(pluginPath, 'package.json');
                    
                    try {
                        await fs.access(manifestPath);
                        await this.loadPlugin(pluginPath);
                    } catch (error) {
                        console.error(`Error loading plugin from ${pluginPath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading plugins:', error);
        }
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
            if (typeof plugin.onPreOpenFile === 'function') {
                try {
                    console.log(`[PluginManager] Calling onPreOpenFile for plugin ${plugin.id}`);
                    const newPath = await plugin.onPreOpenFile(processedPath);
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
            if (typeof plugin.deactivate === 'function') {
                await plugin.deactivate();
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
