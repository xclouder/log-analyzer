const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { ipcMain } = require('electron');
const { getAppCacheDir } = require('electron-updater/out/AppAdapter');

class Disposable {
    constructor(disposeAction) {
        this.disposed = false;
        this.disposeAction = disposeAction;
    }
    dispose() {
        if (!this.disposed && this.disposeAction) {
            this.disposed = true;
            this.disposeAction();
        }
    }
}

class PluginAPI {
    constructor(mainWindow, commandManager) {
        this.mainWindow = mainWindow;
        this.pluginWindows = new Map();
        this.fs = fs;  // 暴露 fs 模块给插件使用
        this.commandManager = commandManager;
        this.editorWindows = new Map();
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

    createEditorWindow(options = {}) {
        const win = new BrowserWindow({
            width: options.width || 800,
            height: options.height || 600,
            autoHideMenuBar: true,
            menuBarVisible: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        // Remove menu
        win.setMenu(null);

        // Load the editor HTML file
        win.loadFile(path.join(__dirname, 'editor.html'));

        // Set window title
        if (options.title) {
            win.setTitle(options.title);
            // Force title update after load
            win.webContents.on('did-finish-load', () => {
                win.setTitle(options.title);
            });
        }

        // Set initial content when window is ready
        win.webContents.on('did-finish-load', () => {
            if (options.textContent) {
                win.webContents.send('set-content', options.textContent);
            }
        });

        // Handle content changes
        ipcMain.on('content-changed', (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                // Store the updated content
                this.editorWindows.set(window.id, content);
            }
        });

        // Store window reference
        this.editorWindows.set(win.id, options.textContent || '');

        // Clean up when window is closed
        win.on('closed', () => {
            this.editorWindows.delete(win.id);
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

    // Get the content of a specific editor window
    getEditorWindowContent(windowId) {
        return this.editorWindows.get(windowId);
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

    /**
     * @param {InputBoxOptions} options
     * @returns {Promise<string>}
     */
    async showInputBox(options) {
        const { BrowserWindow, ipcMain } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];

        return new Promise((resolve) => {
            const requestId = Date.now() + Math.random();
            // 只监听一次
            ipcMain.once('plugin-inputbox-response', (event, { requestId: respId, value }) => {
                if (respId === requestId) {
                    resolve(value); // value为string或null
                }
            });
            mainWindow.webContents.send('plugin-show-inputbox', { options, requestId });

            console.log(`show-inputbox`);
        });
    }

    /**
     * 
     * @param {string[]} items 
     * @param {QuickPickOptions} options 
     * @returns 
     */
    async showQuickPick(items, options) {
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];

        return new Promise((resolve) => {
            const requestId = Date.now() + Math.random();
            // 只监听一次
            ipcMain.once('plugin-quickpick-response', (event, { requestId: respId, value }) => {
                if (respId === requestId) {
                    resolve(value); // value为string或null
                }
            });
            mainWindow.webContents.send('plugin-show-quickpick', { items, options, requestId });

            console.log(`show-quickpick`);
        });
    }

    async showInformationMessage(message, options) {
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];

        return new Promise((resolve) => {
            const requestId = Date.now() + Math.random();
            // 只监听一次
            ipcMain.once('plugin-informationmessage-response', (event, { requestId: respId, value }) => {
                if (respId === requestId) {
                    resolve(value); // value为string或null
                }
            });
            mainWindow.webContents.send('plugin-show-informationmessage', { message, requestId });

            console.log(`show-informationmessage`);
        });
    }

    async showErrorMessage(message, options) {
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];

        return new Promise((resolve) => {
            const requestId = Date.now() + Math.random();
            // 只监听一次
            ipcMain.once('plugin-errormessage-response', (event, { requestId: respId, value }) => {
                if (respId === requestId) {
                    resolve(value); // value为string或null
                }
            });
            mainWindow.webContents.send('plugin-show-errormessage', { message, options, requestId });

            console.log(`show-errormessage`);
        });
    }

    async pluginOpenFile(filePath) {
        console.log(`Plugin API attempting to open file: ${filePath}`);
        
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('plugin:open-file', filePath);
        }
        return true;
    }

    getAppCacheDir() {
        const { app } = require('electron');
        return app.getPath('userData') + '/cache';
    }

    async downloadFile(url, filePathRelativeToCacheDir, options = {}) {
        const path = require('path');
        const cacheDir = this.getAppCacheDir();
        const downloadPath = path.join(cacheDir, filePathRelativeToCacheDir);
        const fs = require('fs');

        // 确保缓存目录存在
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });

        try {
            console.log(`Starting download for ${url}...`);
            const https = require('https');
            const http = require('http');
            
            return new Promise((resolve, reject) => {
                const isHttps = url.startsWith('https');
                const client = isHttps ? https : http;
                
                const request = client.get(url, (response) => {
                    // 处理重定向
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        console.log(`Redirecting to: ${response.headers.location}`);
                        return this.downloadFile(response.headers.location, filePathRelativeToCacheDir, options)
                            .then(resolve)
                            .catch(reject);
                    }
                    
                    if (response.statusCode !== 200) {
                        reject(new Error(`Failed to download file: ${response.statusCode}`));
                        return;
                    }
                    
                    const fileStream = fs.createWriteStream(downloadPath);
                    response.pipe(fileStream);
                    
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`Download successful for ${url}, saved to ${downloadPath}`);
                        resolve(downloadPath);
                    });
                    
                    fileStream.on('error', (err) => {
                        fs.unlink(downloadPath, () => {}); // 删除下载的文件
                        reject(err);
                    });
                });
                
                request.on('error', (err) => {
                    reject(err);
                });
                
                request.end();
            });
        } catch (error) {
            console.error(`Download failed for ${url}: ${error.message}`);
            throw new Error(error.message);
        }
    }
}

module.exports = { PluginAPI, Disposable };
