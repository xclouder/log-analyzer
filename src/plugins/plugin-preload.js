const { contextBridge, ipcRenderer } = require('electron');

// 为插件提供的API
contextBridge.exposeInMainWorld('pluginAPI', {
    // 发送消息到主进程
    sendToMain: (channel, data) => {
        ipcRenderer.send(`plugin:${channel}`, data);
    },
    
    // 从主进程接收消息
    onMessage: (channel, callback) => {
        ipcRenderer.on(`plugin:${channel}`, (event, ...args) => callback(...args));
    },
    
    // 调用主进程方法并等待结果
    invoke: async (channel, data) => {
        return await ipcRenderer.invoke(`plugin:${channel}`, data);
    }
});
