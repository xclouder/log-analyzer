const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class Context {
    constructor() {
        this.logFilePath = '';
        this.logContent = '';
    }
}

class Command {
    constructor() {
        this.name = '';
        this.description = '';
        this.action = undefined;
    }
}

class PluginAPI {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.pluginWindows = new Map();
        this.fs = fs;  // 暴露 fs 模块给插件使用
    }

    // 创建子窗口
    createWindow(pluginId, options = {}) {
        const defaultOptions = {
            width: 800,
            height: 600,
            parent: this.mainWindow,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'plugin-preload.js')
            }
        };

        const windowOptions = { ...defaultOptions, ...options };
        const win = new BrowserWindow(windowOptions);
        this.pluginWindows.set(pluginId, win);

        win.on('closed', () => {
            this.pluginWindows.delete(pluginId);
        });

        return win;
    }

    // 关闭插件窗口
    closeWindow(pluginId) {
        const win = this.pluginWindows.get(pluginId);
        if (win && !win.isDestroyed()) {
            win.close();
        }
    }

    // 获取插件窗口
    getWindow(pluginId) {
        return this.pluginWindows.get(pluginId);
    }

    registerCommand(pluginIns, cmd) {

    }

    unregisterCommand(pluginIns) {

    }
}

module.exports = PluginAPI;
