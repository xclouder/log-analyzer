const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

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
            const content = await fs.readFile(filePath, 'utf8');
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
        await fs.writeFile(filePath, content, 'utf8');
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

    // 如果没有过滤条件，返回添加行号的非空行内容
    if (!config.patterns || config.patterns.length === 0) {
        console.log('No filter patterns provided, returning non-empty lines with line numbers');
        return lines
            .map((line, index) => ({ 
                line: line.trim(), 
                number: index + 1 
            }))
            .filter(item => item.line !== '')
            .map(item => `[Line:${item.number.toString().padStart(6, '0')}] ${item.line}`)
            .join('\n');
    }

    // 预处理过滤条件
    const processedPatterns = config.patterns.map(({ pattern, type }) => {
        if (type === 'regex') {
            try {
                return {
                    pattern: new RegExp(pattern),
                    type: 'regex'
                };
            } catch (error) {
                console.error('Invalid regex pattern:', pattern, error);
                // 如果正则表达式无效，降级为文本匹配
                return {
                    pattern: pattern,
                    type: 'text'
                };
            }
        }
        return {
            pattern: pattern,
            type: 'text'
        };
    });

    lines.forEach((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            return; // 跳过空行
        }

        const lineNumber = lineIndex + 1;

        // 任何一个模式匹配成功就保留该行（OR关系）
        const shouldKeep = processedPatterns.some(({ pattern, type }) => {
            if (type === 'regex') {
                return pattern.test(trimmedLine);
            } else {
                return trimmedLine.includes(pattern);
            }
        });

        if (shouldKeep) {
            // 添加行号标记并保留该行
            filteredLines.push(`[Line:${lineNumber.toString().padStart(6, '0')}] ${trimmedLine}`);
            console.log('Line matched filter pattern:', trimmedLine);
        } else {
            console.log('Line filtered out:', trimmedLine);
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
