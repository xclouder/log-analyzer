const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs').promises;
const PluginManager = require('./plugin-manager');
const {CommandManager} = require('./command-manager');
const log4js = require('log4js');
const logConfig = require('./log4js-config');

// 初始化日志配置
log4js.configure(logConfig);
const logger = log4js.getLogger('Main');

let mainWindow;
let pluginManager;
let pluginManagerWindow = null;
let commandManager;
let currentLogContent = '';
let currentFilePath = '';
let isLoggingEnabled = false;

// 自动更新配置
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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

    // 初始化命令管理器
    commandManager = new CommandManager();

    // 设置命令相关的 IPC 处理器
    setupCommandIPC();

    // 初始化插件管理器
    pluginManager = new PluginManager(mainWindow, commandManager);

    // 加载插件
    pluginManager.loadPlugins().then(() => {
        console.log('Plugins loaded finished');
    });
}

function setupCommandIPC() {
    // 注册命令的 IPC 处理器
    ipcMain.handle('command:search', async (event, query) => {
        return commandManager.searchCommands(query);
    });

    ipcMain.handle('command:list', async () => {
        return commandManager.getAllCommands();
    });

    ipcMain.handle('command:execute', async (event, cmdId) => {
        return commandManager.executeCommand(cmdId);
    });
}

app.whenReady().then(async () => {
    try {
        logger.info('Application starting...');
        // 创建主窗口
        createWindow();

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    } catch (err) {
        console.error('Error during app initialization:', err);
    }
});

app.on('window-all-closed', () => {
    logger.info('All windows closed, shutting down...');
    log4js.shutdown();
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

        return await doOpenFile(filePath);
    }
    return null;
});

ipcMain.handle('dialog:saveFile', async (event, { filePath, content }) => {
    // 不再需要保存功能
    return false;
});

ipcMain.handle('file:open', async (event, filePath) => {
    try {
        // 读取文件内容
        return await doOpenFile(filePath);

    } catch (error) {
        logError('Error reading file:', error);
        throw error;
    }
});

ipcMain.handle('filter:import', async (event, filePath) => {
    try {
        // 读取文件内容
        return await doImportFilterConfig(filePath);

    } catch (error) {
        logError('Error reading file:', error);
        throw error;
    }
});

// 添加文件读取处理器
ipcMain.handle('file:read', async (event, filePath) => {
    try {
        // 读取文件内容
        const content = await fs.readFile(filePath, 'utf8');
        
        currentLogContent = content;
        currentFilePath = filePath;
        mainWindow.currentFilePath = filePath;
        updateWindowTitle(filePath);
        log('File read:', filePath);
        return currentLogContent;
    } catch (error) {
        logError('Error reading file:', error);
        throw error;
    }
});

ipcMain.handle('file:stats', async (event, filePath) => {
    try {
        if (!filePath) {
            throw new Error('文件路径不能为空');
        }
        return await fs.stat(filePath);
    } catch (error) {
        throw new Error(`获取文件信息失败: ${error.message}`);
    }
});

// 根据时间戳读取大文件日志
ipcMain.handle('file:read-by-timestamp', async (event, { filePath, timestamp, sizeMB = 100 }) => {
    try {
        log('file:read-by-timestamp called with:', { filePath, timestamp, sizeMB });
        
        // 验证参数
        if (!filePath) {
            throw new Error('文件路径不能为空');
        }
        
        const fsSync = require('fs');
        const stats = await fs.stat(filePath);
        const fileSize = stats.size;
        const readSize = sizeMB * 1024 * 1024; // 转换为字节
        
        log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB, Read size: ${sizeMB}MB`);
        
        // 如果文件小于指定大小，直接读取整个文件
        if (fileSize <= readSize) {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split(/\r?\n/);
            return {
                content,
                startLine: 1,
                totalLines: lines.length,
                fileSize,
                readSize: fileSize,
                foundTimestamp: false
            };
        }
        
        // 使用二分查找定位时间戳位置
        let position = 0;
        let foundPosition = -1;
        
        if (timestamp) {
            foundPosition = await findTimestampPosition(filePath, timestamp, fileSize);
            if (foundPosition >= 0) {
                position = foundPosition;
            }
        }
        
        // 确保不会超出文件范围
        const actualReadSize = Math.min(readSize, fileSize - position);
        
        // 从找到的位置开始读取指定大小的内容
        const buffer = Buffer.alloc(actualReadSize);
        const fd = fsSync.openSync(filePath, 'r');
        
        try {
            fsSync.readSync(fd, buffer, 0, actualReadSize, position);
            let content = buffer.toString('utf8');
            
            // 如果不是从文件开头读取，找到第一个完整的行
            if (position > 0) {
                const firstNewline = content.indexOf('\n');
                if (firstNewline !== -1) {
                    content = content.substring(firstNewline + 1);
                }
            }
            
            // 计算起始行号
            let startLine = 1;
            if (position > 0) {
                const beforeBuffer = Buffer.alloc(Math.min(position, 10 * 1024 * 1024)); // 最多读取前10MB来计算行号
                fsSync.readSync(fd, beforeBuffer, 0, beforeBuffer.length, Math.max(0, position - beforeBuffer.length));
                const beforeContent = beforeBuffer.toString('utf8');
                startLine = (beforeContent.match(/\n/g) || []).length + 1;
            }
            
            const totalLines = content.split(/\r?\n/).length;
            
            return {
                content,
                startLine,
                totalLines,
                fileSize,
                readSize: actualReadSize,
                foundTimestamp: foundPosition >= 0,
                readPosition: position
            };
        } finally {
            fsSync.closeSync(fd);
        }
    } catch (error) {
        logError('Error reading file by timestamp:', error);
        throw new Error(`读取文件失败: ${error.message}`);
    }
});

// 辅助函数：使用二分查找定位时间戳
async function findTimestampPosition(filePath, targetTimestamp, fileSize) {
    const fsSync = require('fs');
    const fd = fsSync.openSync(filePath, 'r');
    
    try {
        // 规范化用户输入的时间戳
        const normalizedTimestamp = normalizeUserTimestamp(targetTimestamp);
        if (!normalizedTimestamp) {
            console.log('Invalid timestamp input');
            return -1;
        }
        
        // 解析目标时间戳
        const targetDate = parseTimestamp(normalizedTimestamp);
        if (!targetDate) {
            console.log('Invalid timestamp format:', normalizedTimestamp);
            return -1;
        }
        
        const targetTime = targetDate.getTime();
        
        let left = 0;
        let right = fileSize;
        let bestPosition = -1;
        const chunkSize = 8192; // 8KB chunks for searching
        
        console.log(`Searching for timestamp: ${normalizedTimestamp} (${targetTime})`);
        
        // 二分查找
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            
            // 读取mid位置附近的内容
            const readStart = Math.max(0, mid - chunkSize);
            const readLength = Math.min(chunkSize * 2, fileSize - readStart);
            const buffer = Buffer.alloc(readLength);
            
            fsSync.readSync(fd, buffer, 0, readLength, readStart);
            const content = buffer.toString('utf8');
            
            // 查找这段内容中的时间戳
            const timestamp = extractTimestamp(content);
            
            if (!timestamp) {
                // 如果找不到时间戳，向右搜索
                left = mid + 1;
                continue;
            }
            
            const currentDate = parseTimestamp(timestamp);
            if (!currentDate) {
                left = mid + 1;
                continue;
            }
            
            const currentTime = currentDate.getTime();
            
            if (currentTime < targetTime) {
                left = mid + 1;
            } else if (currentTime > targetTime) {
                right = mid;
            } else {
                // 找到精确匹配
                bestPosition = mid;
                console.log(`Found exact match at position: ${mid}`);
                break;
            }
            
            // 记录最接近的位置
            if (currentTime <= targetTime) {
                bestPosition = mid;
            }
        }
        
        // 如果找到了位置，回退到该行的开始
        if (bestPosition >= 0) {
            const buffer = Buffer.alloc(Math.min(chunkSize, bestPosition));
            const readStart = Math.max(0, bestPosition - buffer.length);
            fsSync.readSync(fd, buffer, 0, buffer.length, readStart);
            const content = buffer.toString('utf8');
            const lastNewline = content.lastIndexOf('\n');
            
            if (lastNewline !== -1) {
                bestPosition = readStart + lastNewline + 1;
            } else {
                bestPosition = readStart;
            }
            
            console.log(`Final position (line start): ${bestPosition}`);
        } else {
            console.log('Timestamp not found, will read from beginning');
        }
        
        return bestPosition;
    } finally {
        fsSync.closeSync(fd);
    }
}

// 辅助函数：从文本中提取时间戳
function extractTimestamp(text) {
    // 支持多种常见的日志时间戳格式
    const patterns = [
        // UE格式: [2025.11.04-19.19.39:123]
        /\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{3})?)\]/,
        // ISO 8601: 2024-01-15T10:30:45.123Z
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/,
        // 标准格式: 2024-01-15 10:30:45
        /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/,
        // 带毫秒: 2024-01-15 10:30:45.123
        /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/,
        // 斜杠分隔: 2024/01/15 10:30:45
        /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/,
        // 方括号包围: [2024-01-15 10:30:45]
        /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]/,
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

// 辅助函数：将用户输入的时间戳转换为完整格式
function normalizeUserTimestamp(userInput) {
    if (!userInput || !userInput.trim()) {
        return null;
    }
    
    const input = userInput.trim();
    
    // UE格式: 11.04-19.19.39 或 11.04-19.19
    const uePattern = /^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})(?:\.(\d{2}))?$/;
    const ueMatch = input.match(uePattern);
    
    if (ueMatch) {
        const currentYear = new Date().getFullYear();
        const month = ueMatch[1];
        const day = ueMatch[2];
        const hour = ueMatch[3];
        const minute = ueMatch[4];
        const second = ueMatch[5] || '00'; // 如果没有秒，默认为00
        
        // 返回完整的UE格式时间戳
        return `${currentYear}.${month}.${day}-${hour}.${minute}.${second}`;
    }
    
    // 如果已经是完整格式，直接返回
    return input;
}

// 辅助函数：将时间戳转换为Date对象
function parseTimestamp(timestamp) {
    if (!timestamp) {
        return null;
    }
    
    // UE格式: 2025.11.04-19.19.39
    const uePattern = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})(?::(\d{3}))?$/;
    const ueMatch = timestamp.match(uePattern);
    
    if (ueMatch) {
        const year = parseInt(ueMatch[1]);
        const month = parseInt(ueMatch[2]) - 1; // JavaScript月份从0开始
        const day = parseInt(ueMatch[3]);
        const hour = parseInt(ueMatch[4]);
        const minute = parseInt(ueMatch[5]);
        const second = parseInt(ueMatch[6]);
        const ms = ueMatch[7] ? parseInt(ueMatch[7]) : 0;
        
        return new Date(year, month, day, hour, minute, second, ms);
    }
    
    // 尝试标准格式解析
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
        return date;
    }
    
    return null;
}

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
            currentFilePath = processedPath;
            mainWindow.currentFilePath = processedPath;
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

// 处理打开用户插件目录的请求
ipcMain.on('open-user-plugins-dir', async () => {
    const pluginManager = new PluginManager(mainWindow, commandManager);
    await pluginManager.initializePluginDirs();
    shell.openPath(pluginManager.userPluginsDir);
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

// 插件API：弹出输入框
const { PluginAPI } = require('./plugin-api');
const pluginAPI = new PluginAPI(mainWindow);
ipcMain.handle('plugin:showInputBox', async (event, options) => {
    return await pluginAPI.showInputBox(options);
});

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
    const isMac = process.platform === 'darwin';
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
                    label: '打开日志目录',
                    click: async () => {
                        const logPath = path.join(app.getPath('userData'), 'logs');
                        shell.openPath(logPath);
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
                                mainWindow.webContents.send('filter:load', configPath);
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
            label: '插件',
            submenu: [
                {
                    label: '插件管理',
                    click: () => {
                        if (pluginManagerWindow) {
                            pluginManagerWindow.focus();
                            return;
                        }

                        pluginManagerWindow = new BrowserWindow({
                            width: 800,
                            height: 600,
                            parent: mainWindow,
                            modal: true,
                            webPreferences: {
                                preload: path.join(__dirname, 'preload.js'),
                                contextIsolation: true,
                                enableRemoteModule: false,
                                nodeIntegration: false
                            }
                        });

                        // 去掉菜单
                        pluginManagerWindow.setMenu(null);

                        pluginManagerWindow.loadFile('plugin-manager.html');
                        // 打开开发者工具
                        //pluginManagerWindow.webContents.openDevTools();

                        pluginManagerWindow.on('closed', () => {
                            pluginManagerWindow = null;
                        });
                    }
                }
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
                            ' 2024 LogAnalyzer Team\n' +
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

async function doImportFilterConfig(filePath) {
    const configData = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(configData);
    console.log('Loading filter config:', config);
    if (!config || !config.patterns) {
        throw new Error('无效的配置格式');
    }

    return config;
}

async function doOpenFile(filePath) {
    console.log(`doOpenFile: ${filePath}`);

    let finalPath = filePath;
    
    try {
        // 通过插件预处理文件路径
        finalPath = await pluginManager.preProcessFilePath(filePath);
    } catch (err) {
        logError('Error preprocessing file path:', err);
    }
    
    try {
        // 通过插件预处理文件路径
        const processedPath = finalPath;
        
        // 读取文件内容
        const content = await fs.readFile(processedPath, 'utf8');
        
        // 处理文件内容
        const processedContent = await pluginManager.processFileContent(processedPath, content);
        
        currentLogContent = processedContent;
        currentFilePath = processedPath;
        mainWindow.currentFilePath = processedPath;
        updateWindowTitle(processedPath);
        log('File opened:', processedPath);
        return {
            content: processedContent,
            filePath: processedPath
        };
    } catch (err) {
        logError('Error reading file:', err);
        return { content: null, filePath: finalPath };
    }
}

ipcMain.handle('open-file', async (event, filePath) => {
    return await openFile(filePath);
});

ipcMain.handle('get-current-file-path', () => {
    return currentFilePath;
});

ipcMain.handle('dialog-open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Log Files', extensions: ['log', 'txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];

        return await doOpenFile(filePath);
    }
    return null;
});

async function openFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        currentLogContent = content;
        currentFilePath = filePath;
        mainWindow.currentFilePath = filePath;
        updateWindowTitle(filePath);
        log('File opened:', filePath);
        return {
            content,
            filePath
        };
    } catch (err) {
        console.error('Error reading file:', err);
        return null;
    }
}

// 监听插件请求打开文件
ipcMain.on('plugin-open-file', async (event, { filePath, requestId }) => {
    console.log(`plugin-open-file: ${filePath}`);
    try {
        await doOpenFile(filePath);
        event.reply('plugin-openfile-response', { requestId, success: true });
    } catch (error) {
        event.reply('plugin-openfile-response', { requestId, success: false, error: error.message });
    }
});

// 导出一些函数供其他模块使用
module.exports = {
    doOpenFile,
    openFile
};
