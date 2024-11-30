const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');  // 添加fs模块的引入
const fsPromises = fs.promises;  // 使用 fs.promises 以支持异步操作

let mainWindow;
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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // 注释掉这行，禁用开发者工具的自动打开
    createMenu();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
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
            const content = await fsPromises.readFile(filePath, 'utf8');
            currentLogContent = content;
            currentFilePath = filePath;
            log('File opened:', filePath);
            return {
                content,
                filePath
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
        const content = await fsPromises.readFile(filePath, 'utf8');
        currentLogContent = content;
        currentFilePath = filePath;
        log('File read:', filePath);
        return content;
    } catch (err) {
        logError('Error reading file:', err);
        throw err;
    }
});

// 处理重新加载当前文件的请求
ipcMain.handle('file:reload', async () => {
    try {
        if (!currentLogContent || !mainWindow) {
            return null;
        }

        // 检查文件是否存在
        try {
            await fsPromises.access(currentFilePath);
        } catch (err) {
            dialog.showErrorBox('错误', '当前文件已经不存在');
            return null;
        }

        // 重新读取文件内容
        const content = await fsPromises.readFile(currentFilePath, 'utf8');
        currentLogContent = content;
        log('File reloaded:', currentFilePath);
        return {
            content,
            filePath: currentFilePath
        };
    } catch (err) {
        logError('Error reloading file:', err);
        return null;
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
        await fsPromises.writeFile(filePath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        logError('Error saving filter config:', err);
        return { success: false, error: err.message };
    }
});

// 创建应用程序菜单
function createMenu() {
    const menu = Menu.buildFromTemplate([
        {
            label: '文件',
            submenu: [
                {
                    label: '新建',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        // 启动新的应用程序实例
                        const { spawn } = require('child_process');
                        const path = require('path');
                        const electron = require('electron');
                        
                        // 获取当前应用程序的路径
                        const appPath = process.argv[0];
                        const appDir = path.dirname(process.argv[1]);
                        
                        // 在新进程中启动应用程序
                        spawn(appPath, [appDir], {
                            detached: true,
                            stdio: 'ignore'
                        }).unref();
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
                                const configData = await fsPromises.readFile(configPath, 'utf-8');
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
    ]);
    Menu.setApplicationMenu(menu);
}
