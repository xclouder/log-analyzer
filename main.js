const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');  // 添加fs模块的引入
const fsPromises = fs.promises;  // 使用 fs.promises 以支持异步操作

let mainWindow;
let currentLogContent = '';

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
    mainWindow.webContents.openDevTools();
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
            return {
                content,
                filePath
            };
        } catch (err) {
            console.error('Error reading file:', err);
            return null;
        }
    }
    return null;
});

ipcMain.handle('dialog:saveFile', async (event, { filePath, content }) => {
    try {
        await fsPromises.writeFile(filePath, content, 'utf8');
        currentLogContent = content;
        return true;
    } catch (err) {
        console.error('Error saving file:', err);
        return false;
    }
});

function filterLogs(content, config) {
    console.log('Filtering logs with config:', config);
    const lines = content.split('\n');
    const filteredLines = [];

    // 格式化行号的函数，使用空格代替前导零
    function formatLineNumber(num) {
        return `[Line:${num.toString().padStart(6, ' ')}]`;
    }

    // 解析行号范围的函数
    function parseLineRange(pattern) {
        pattern = pattern.trim();
        
        // 处理大于小于
        if (pattern.startsWith('>')) {
            const num = parseInt(pattern.substring(1));
            return lineNum => lineNum > num;
        }
        if (pattern.startsWith('<')) {
            const num = parseInt(pattern.substring(1));
            return lineNum => lineNum < num;
        }
        
        // 处理范围 (如 "1-100")
        if (pattern.includes('-')) {
            const [start, end] = pattern.split('-').map(num => parseInt(num.trim()));
            return lineNum => lineNum >= start && lineNum <= end;
        }
        
        // 处理具体行号列表 (如 "1,2,3")
        if (pattern.includes(',')) {
            const numbers = pattern.split(',').map(num => parseInt(num.trim()));
            return lineNum => numbers.includes(lineNum);
        }
        
        // 处理单个行号
        const num = parseInt(pattern);
        return lineNum => lineNum === num;
    }

    // 如果没有过滤条件，返回添加行号的非空行内容
    if (!config.patterns || config.patterns.length === 0) {
        console.log('No filter patterns provided, returning non-empty lines with line numbers');
        return lines
            .map((line, index) => ({ 
                line: line.trim(), 
                number: index + 1 
            }))
            .filter(item => item.line !== '')
            .map(item => `${formatLineNumber(item.number)} ${item.line}`)
            .join('\n');
    }

    console.log('Processing filter patterns:', config.patterns);

    // 预处理过滤条件
    const processedPatterns = config.patterns.map(({ pattern, type }) => {
        console.log(`Processing pattern: "${pattern}" of type: ${type}`);
        if (type === 'line') {
            try {
                const lineFilter = parseLineRange(pattern);
                console.log('Successfully created line range filter');
                return {
                    pattern: lineFilter,
                    type: 'line'
                };
            } catch (error) {
                console.error('Invalid line range pattern:', pattern, error);
                return null;
            }
        } else if (type === 'regex') {
            try {
                const regex = new RegExp(pattern);
                console.log('Successfully created regex pattern:', regex);
                return {
                    pattern: regex,
                    type: 'regex'
                };
            } catch (error) {
                console.error('Invalid regex pattern:', pattern, error);
                // 如果正则表达式无效，降级为文本匹配
                console.log('Falling back to text matching for invalid regex');
                return {
                    pattern: pattern,
                    type: 'text'
                };
            }
        }
        console.log('Using text matching pattern:', pattern);
        return {
            pattern: pattern,
            type: 'text'
        };
    }).filter(pattern => pattern !== null);

    console.log('Processed patterns:', processedPatterns);

    lines.forEach((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            return; // 跳过空行
        }

        const lineNumber = lineIndex + 1;
        // console.log(`\nProcessing line ${lineNumber}:`, trimmedLine);

        // 任何一个模式匹配成功就保留该行（OR关系）
        const shouldKeep = processedPatterns.some(({ pattern, type }, index) => {
            if (type === 'line') {
                const matches = pattern(lineNumber);
                // console.log(`Pattern ${index + 1} (line): Line ${lineNumber} - Match result:`, matches);
                return matches;
            } else if (type === 'regex') {
                const matches = pattern.test(trimmedLine);
                console.log(`Pattern ${index + 1} (regex): "${pattern}" - Match result:`, matches);
                return matches;
            } else {
                const matches = trimmedLine.toLowerCase().includes(pattern.toLowerCase());
                console.log(`Pattern ${index + 1} (text): "${pattern}" - Match result:`, matches);
                return matches;
            }
        });

        if (shouldKeep) {
            // 添加行号标记并保留该行
            filteredLines.push(`${formatLineNumber(lineNumber)} ${trimmedLine}`);
            // console.log('Line matched and kept');
        } else {
            // console.log('Line filtered out');
        }
    });

    console.log(`Filtered ${lines.length} lines to ${filteredLines.length} lines`);
    return filteredLines.join('\n');
}

ipcMain.handle('filter:apply', async (event, config) => {
    try {
        if (!currentLogContent) {
            return {
                success: false,
                error: '没有打开的日志文件'
            };
        }

        const filteredContent = filterLogs(currentLogContent, config);
        return {
            success: true,
            content: filteredContent
        };
    } catch (err) {
        console.error('Error applying filter:', err);
        return {
            success: false,
            error: err.message
        };
    }
});

// 过滤配置相关的IPC处理
ipcMain.handle('filter:save-config', async (event, config, filePath) => {
    try {
        console.log('Saving config to file:', config);
        await fsPromises.writeFile(filePath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        console.error('Error saving filter config:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('filter:load-config', async (event, filePath) => {
    try {
        console.log('Loading config from file:', filePath);
        const configData = await fsPromises.readFile(filePath, 'utf-8');
        const config = JSON.parse(configData);
        console.log('Loaded config:', config);
        
        if (!config || !config.patterns) {
            throw new Error('Invalid config format');
        }
        
        mainWindow.webContents.send('filter:load-config-result', config);
        return { success: true, config };
    } catch (err) {
        console.error('Error loading filter config:', err);
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
                    label: '打开文件',
                    click: () => {
                        mainWindow.webContents.send('menu:open-file');
                    }
                },
                {
                    label: '保存结果',
                    click: () => {
                        mainWindow.webContents.send('menu:save-file');
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
                                console.log('Reading config file:', configPath);
                                const configData = await fsPromises.readFile(configPath, 'utf-8');
                                const config = JSON.parse(configData);
                                console.log('Sending config to renderer:', config);
                                mainWindow.webContents.send('filter:load-config-result', config);
                            } catch (err) {
                                console.error('Error loading filter config:', err);
                                dialog.showErrorBox('错误', '加载配置文件失败: ' + err.message);
                            }
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }
    ]);
    Menu.setApplicationMenu(menu);
}
