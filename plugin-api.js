const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { ipcMain } = require('electron');

class Disposable {
    constructor(disposeAction) {
        this.disposeAction = disposeAction;
    }
    dispose() {
        this.disposeAction();
    }
}

class PluginAPI {
    constructor(mainWindow, commandManager) {
        this.mainWindow = mainWindow;
        this.pluginWindows = new Map();
        this.fs = fs;  // 暴露 fs 模块给插件使用
        this.commandManager = commandManager;
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

    registerCommand(pluginContext, cmdId, action) {
        const meta = pluginContext.metadata;

        console.log('Registering command:', cmdId);
        console.log('Plugin metadata:', meta);

        if (!meta || !meta.contributes || !meta.contributes.commands) {
            console.error('Invalid plugin metadata structure');
            return;
        }

        const cmdConfigs = meta.contributes.commands;
        console.log('Available commands:', cmdConfigs);

        const matchingCmd = cmdConfigs.find(cmdCfg => cmdCfg.command === cmdId);
        if (!matchingCmd) {
            console.error(`Command ${cmdId} not found in available commands`);
            return;
        }

        // 向命令管理器注册命令
        this.commandManager.registerCommand(
            cmdId,
            matchingCmd.title,
            matchingCmd.category || meta.title,
            action
        );

        // 通知渲染进程更新命令列表
        this.mainWindow.webContents.send('command:register');

        // 创建一个 disposable 对象来处理命令的清理
        const disposable = new Disposable(() => {
            console.log('Unregistering command:', cmdId);
            this.commandManager.unregisterCommand(cmdId);
            this.mainWindow.webContents.send('command:unregister');
        });

        pluginContext.disposables.push(disposable);
        return disposable;
    }

    getCurrentFilePath() {
        // Get the current file path directly from the main process
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) return null;
        
        return mainWindow.currentFilePath;
    }
}

module.exports = { PluginAPI, Disposable };
