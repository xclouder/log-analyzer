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
            const plugin = require(pluginPath);
            const pluginInstance = new plugin(this.api);
            
            // 注册插件
            this.plugins.set(pluginInstance.id, pluginInstance);
            
            // 如果插件提供文件处理功能，注册处理器
            if (typeof pluginInstance.processFile === 'function') {
                this.fileProcessors.push(pluginInstance);
            }

            // 初始化插件
            if (typeof pluginInstance.activate === 'function') {
                await pluginInstance.activate();
            }

            return pluginInstance;
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
                        const manifestContent = await fs.readFile(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestContent);
                        
                        if (manifest.main) {
                            const mainPath = path.join(pluginPath, manifest.main);
                            await this.loadPlugin(mainPath);
                        }
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
