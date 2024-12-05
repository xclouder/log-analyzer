const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs').promises;
const PluginManager = require('./src/plugins/plugin-manager');

// 自动更新配置
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;
let pluginManager;
let pluginManagerWindow = null;
let currentLogContent = '';
let currentFilePath = '';
let isLoggingEnabled = false;

// 日志控制函数
function log(...args) {
    if (isLoggingEnabled) {
        console.log(...args);
    }
}

function logError(...args) {
    if (isLoggingEnabled) {
        console.error(...args);
    }
}

// 获取插件目录路径
function getPluginsPath() {
    // 判断是开发环境还是生产环境
    if (app.isPackaged) {
        // 生产环境，使用 extraResources 路径
        return path.join(process.resourcesPath, 'plugins');
    } else {
        // 开发环境，使用项目目录
        return path.join(__dirname, 'plugins');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'LogAnalyzer'
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // 注释掉这行，禁用开发者工具的自动打开
    createMenu();
    
    // 检查更新
    checkForUpdates();
}

app.whenReady().then(async () => {
    try {
        // 初始化插件管理器
        pluginManager = new PluginManager();

        // 创建主窗口
        createWindow();

        // 加载插件
        await pluginManager.loadPlugins();
        console.log('Plugins loaded successfully');

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    } catch (err) {
        console.error('Error during app initialization:', err);
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Log Files', extensions: ['log', 'txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        try {
            // 通过插件预处理文件路径
            const processedPath = await pluginManager.preProcessFilePath(filePath);
            
            // 读取文件内容
            const content = await fs.readFile(processedPath, 'utf8');
            
            // 处理文件内容
            const processedContent = await pluginManager.processFileContent(processedPath, content);
            
            currentLogContent = processedContent;
            currentFilePath = processedPath;
            updateWindowTitle(processedPath);
            log('File opened:', processedPath);
            return {
                content: processedContent,
                filePath: processedPath
            };
        } catch (err) {
            logError('Error reading file:', err);
            return null;
        }
    }
    return null;
});

ipcMain.handle('dialog:saveFile', async (event, { filePath, content }) => {
    // 不再需要保存功能
    return false;
});

// 添加文件读取处理器
ipcMain.handle('file:read', async (event, filePath) => {
    try {
        // 通过插件预处理文件路径
        const processedPath = await pluginManager.preProcessFilePath(filePath);
        
        // 读取文件内容
        const content = await fs.readFile(processedPath, 'utf8');
        
        // 处理文件内容
        const processedContent = await pluginManager.processFileContent(processedPath, content);
        
        currentLogContent = processedContent;
        currentFilePath = processedPath;
        updateWindowTitle(processedPath);
        log('File read:', processedPath);
        return processedContent;
    } catch (error) {
        logError('Error reading file:', error);
        throw error;
    }
});

ipcMain.handle('file:stats', async (event, filePath) => {
    try {
        // 通过插件预处理文件路径
        const processedPath = await pluginManager.preProcessFilePath(filePath);
        
        return await fs.stat(processedPath);
    } catch (error) {
        throw new Error(`获取文件信息失败: ${error.message}`);
    }
});

ipcMain.handle('file:read-chunk', async (event, filePath, offset, length) => {
    try {
        // 通过插件预处理文件路径
        const processedPath = await pluginManager.preProcessFilePath(filePath);
        
        const fileHandle = await fs.open(processedPath, 'r');
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
        await fileHandle.close();
        const content = buffer.toString('utf8', 0, bytesRead);
        
        // 如果是最后一个块，更新当前文件信息
        const stats = await fs.stat(processedPath);
        if (offset + bytesRead >= stats.size) {
            currentFilePath = processedPath;
            updateWindowTitle(processedPath);
            log('File read (chunked):', processedPath);
        }
        
        return content;
    } catch (error) {
        throw new Error(`读取文件块失败: ${error.message}`);
    }
});

// 处理重新加载当前文件的请求
ipcMain.handle('file:reload', async () => {
    try {
        if (!currentFilePath || !mainWindow) {
            return null;
        }

        // 检查文件是否存在
        try {
            await fs.access(currentFilePath);
        } catch (err) {
            dialog.showErrorBox('错误', '当前文件已经不存在');
            return null;
        }

        // 重新读取文件内容
        try {
            // 通过插件预处理文件路径
            const processedPath = await pluginManager.preProcessFilePath(currentFilePath);
            
            // 读取文件内容
            const content = await fs.readFile(processedPath, 'utf8');
            
            // 处理文件内容
            const processedContent = await pluginManager.processFileContent(processedPath, content);
            
            currentLogContent = processedContent;
            updateWindowTitle(processedPath);
            log('File reloaded:', processedPath);
            return {
                content: processedContent,
                filePath: processedPath
            };
        } catch (err) {
            logError('Error reloading file:', err);
            dialog.showErrorBox('错误', '重新加载文件失败: ' + err.message);
            return null;
        }
    } catch (err) {
        logError('Error in file:reload:', err);
        return null;
    }
});

// 显示文件在文件夹中
ipcMain.on('show-item-in-folder', (event, filePath) => {
    if (filePath) {
        shell.showItemInFolder(filePath);
    } else if (currentFilePath) {
        shell.showItemInFolder(currentFilePath);
    }
});

// 处理在系统文件夹中显示文件的请求
ipcMain.handle('file:show-in-folder', async () => {
    try {
        if (!currentFilePath) {
            return;
        }

        // 检查文件是否存在
        try {
            await fs.access(currentFilePath);
        } catch (err) {
            dialog.showErrorBox('错误', '此文件已不存在');
            return;
        }

        // 在文件管理器中显示并选中文件
        shell.showItemInFolder(currentFilePath);
    } catch (err) {
        logError('Error showing file in folder:', err);
    }
});

// 添加插件相关的IPC处理器
ipcMain.on('plugin:message', (event, data) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const plugin = pluginManager.getPlugins().find(p => p.window === win);
    if (plugin) {
        plugin.handleMessage(data);
    }
});

// 插件管理相关 IPC 处理
ipcMain.handle('plugin:list', async () => {
    try {
        return pluginManager.getPlugins();
    } catch (err) {
        console.error('Error getting plugin list:', err);
        throw err;
    }
});

ipcMain.handle('plugin:install', async (event, zipPath) => {
    try {
        return await pluginManager.installPlugin(zipPath);
    } catch (err) {
        console.error('Error installing plugin:', err);
        throw err;
    }
});

ipcMain.handle('plugin:uninstall', async (event, pluginName) => {
    try {
        return await pluginManager.uninstallPlugin(pluginName);
    } catch (err) {
        console.error('Error uninstalling plugin:', err);
        throw err;
    }
});

async function filterContent(content, config) {
    try {
        if (!content || !config || !config.patterns || config.patterns.length === 0) {
            return { success: true, content: content };
        }

        const lines = content.split('\n');
        const matchedLines = new Set();
        const lineHighlights = new Map(); // 存储行号到高亮颜色的映射

        // 处理每个过滤器
        for (const filter of config.patterns) {
            const { type, pattern, highlight, highlightColor } = filter;
            if (!pattern) continue;

            try {
                switch (type) {
                    case 'text':
                        lines.forEach((line, index) => {
                            if (line.includes(pattern)) {
                                matchedLines.add(index);
                                if (highlight) {
                                    lineHighlights.set(index, highlightColor);
                                }
                            }
                        });
                        break;
                    case 'regex':
                        const regex = new RegExp(pattern);
                        lines.forEach((line, index) => {
                            if (regex.test(line)) {
                                matchedLines.add(index);
                                if (highlight) {
                                    lineHighlights.set(index, highlightColor);
                                }
                            }
                        });
                        break;
                    case 'line':
                        const range = pattern.split('-').map(num => parseInt(num.trim()));
                        if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
                            for (let i = range[0] - 1; i < range[1]; i++) {
                                if (i >= 0 && i < lines.length) {
                                    matchedLines.add(i);
                                    if (highlight) {
                                        lineHighlights.set(i, highlightColor);
                                    }
                                }
                            }
                        }
                        break;
                }
            } catch (err) {
                console.error('Filter error:', err);
            }
        }

        // 构建过滤后的内容，包括高亮信息
        const filteredLines = [];
        const highlights = [];
        
        lines.forEach((line, index) => {
            if (matchedLines.has(index)) {
                filteredLines.push(line);
                if (lineHighlights.has(index)) {
                    highlights.push({
                        lineNumber: filteredLines.length, // 新的行号
                        color: lineHighlights.get(index)
                    });
                }
            }
        });

        return {
            success: true,
            content: filteredLines.join('\n'),
            highlights: highlights
        };
    } catch (err) {
        console.error('Filter error:', err);
        return { success: false, error: err.message };
    }
}

ipcMain.handle('filter:apply', async (event, config) => {
    try {
        if (!currentLogContent) {
            return {
                success: false,
                error: '没有打开的日志文件'
            };
        }

        const result = await filterContent(currentLogContent, config);
        return result;
    } catch (err) {
        logError('Error applying filter:', err);
        return {
            success: false,
            error: err.message
        };
    }
});

// 加载过滤器配置
ipcMain.handle('loadFilterConfig', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Filter Config', extensions: ['json'] }
            ]
        });

        if (filePaths && filePaths.length > 0) {
            const configPath = filePaths[0];
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            log('Filter config loaded:', config);
            return config;
        }
    } catch (err) {
        logError('Error loading filter config:', err);
        throw new Error('加载过滤器配置失败: ' + err.message);
    }
});

// 保存过滤器配置
ipcMain.handle('filter:save-config', async (event, config, filePath) => {
    try {
        log('Saving config to file:', config);
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        logError('Error saving filter config:', err);
        return { success: false, error: err.message };
    }
});

// 创建应用程序菜单
function createMenu() {
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '新建',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        // 启动新的应用程序实例
                        const { spawn } = require('child_process');
                        
                        let appPath;
                        let args = [];
                        
                        if (process.platform === 'darwin') {
                            // macOS
                            appPath = process.execPath;
                            const appContentsPath = path.dirname(path.dirname(process.execPath));
                            args = ['--args', appContentsPath];
                        } else if (process.platform === 'win32') {
                            // Windows
                            appPath = app.getPath('exe');
                        } else {
                            // Linux
                            appPath = process.execPath;
                        }
                        
                        // 在新进程中启动应用程序
                        const child = spawn(appPath, args, {
                            detached: true,
                            stdio: 'ignore'
                        });
                        
                        child.unref();
                    }
                },
                {
                    label: '打开文件',
                    click: () => {
                        mainWindow.webContents.send('menu:open-file');
                    }
                },
                {
                    label: '重新加载文件',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.webContents.send('menu:reload-file');
                    }
                },
                {
                    label: '在系统文件夹中显示',
                    click: async () => {
                        mainWindow.webContents.send('menu:show-in-folder');
                    }
                },
                { type: 'separator' },
                {
                    label: '保存过滤配置',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: '保存过滤配置',
                            filters: [
                                { name: 'JSON', extensions: ['json'] }
                            ]
                        });
                        
                        if (!result.canceled) {
                            mainWindow.webContents.send('filter:save-config-dialog', result.filePath);
                        }
                    }
                },
                {
                    label: '加载过滤配置',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            title: '加载过滤配置',
                            filters: [
                                { name: 'JSON', extensions: ['json'] }
                            ],
                            properties: ['openFile']
                        });
                        
                        if (!result.canceled && result.filePaths.length > 0) {
                            const configPath = result.filePaths[0];
                            try {
                                log('Reading config file:', configPath);
                                const configData = await fs.readFile(configPath, 'utf-8');
                                const config = JSON.parse(configData);
                                log('Sending config to renderer:', config);
                                mainWindow.webContents.send('filter:load-config-result', config);
                            } catch (err) {
                                logError('Error loading filter config:', err);
                                dialog.showErrorBox('错误', '加载配置文件失败: ' + err.message);
                            }
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于',
                    click: async () => {
                        const version = app.getVersion();
                        const message = `LogAnalyzer v${version}\n\n` +
                            '一个强大的日志分析工具\n\n' +
                            '© 2024 LogAnalyzer Team\n' +
                            '保留所有权利';
                        
                        await dialog.showMessageBox({
                            type: 'info',
                            title: '关于 LogAnalyzer',
                            message: message,
                            buttons: ['确定']
                        });
                    }
                }
            ]
        },
        {
            label: '开发',
            submenu: [
                {
                    label: '切换调试日志',
                    type: 'checkbox',
                    checked: isLoggingEnabled,
                    click: (menuItem) => {
                        isLoggingEnabled = menuItem.checked;
                        mainWindow.webContents.send('toggle-logging', isLoggingEnabled);
                        log('Logging ' + (isLoggingEnabled ? 'enabled' : 'disabled'));
                    }
                },
                { role: 'toggleDevTools' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 检查更新
async function checkForUpdates() {
    try {
        await autoUpdater.checkForUpdates();
    } catch (err) {
        console.error('Error checking for updates:', err);
    }
}

// 更新事件处理
autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 ${info.version}，是否下载？`,
        buttons: ['下载', '稍后'],
        cancelId: 1
    }).then(({ response }) => {
        if (response === 0) {
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow) return;

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '更新已就绪',
        message: '新版本已下载完成，重启应用以完成更新。',
        buttons: ['现在重启', '稍后'],
        cancelId: 1
    }).then(({ response }) => {
        if (response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    });
});

autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err);
    if (mainWindow) {
        dialog.showErrorBox('更新错误', '检查更新时发生错误，请稍后重试。');
    }
});

// 更新窗口标题
function updateWindowTitle(filePath) {
    if (mainWindow) {
        const title = filePath ? `LogAnalyzer - ${filePath}` : 'LogAnalyzer';
        mainWindow.setTitle(title);
    }
}
