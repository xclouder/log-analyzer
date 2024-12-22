const path = require('path');
const { app } = require('electron');

// 获取用户数据目录
const userDataPath = app ? app.getPath('userData') : require('electron').remote.app.getPath('userData');
const logPath = path.join(userDataPath, 'logs');

const config = {
    appenders: {
        console: {
            type: 'console',
            layout: {
                type: 'pattern',
                pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] %c%] - %m'
            }
        },
        file: {
            type: 'dateFile',
            filename: path.join(logPath, 'loganalyzer.log'),
            pattern: 'yyyy-MM-dd',
            keepFileExt: true,
            compress: true,
            layout: {
                type: 'pattern',
                pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c] - %m'
            },
            // 确保日志目录存在
            alwaysIncludePattern: true
        }
    },
    categories: {
        default: { 
            appenders: ['console', 'file'], 
            level: 'debug',
            enableCallStack: true
        },
        Main: {
            appenders: ['console', 'file'],
            level: 'debug'
        },
        PluginManager: {
            appenders: ['console', 'file'],
            level: 'debug'
        },
        CommandPalette: {
            appenders: ['console', 'file'],
            level: 'debug'
        }
    }
};

// 确保日志目录存在
const fs = require('fs');
if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
}

module.exports = config;
