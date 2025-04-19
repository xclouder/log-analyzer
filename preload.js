const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    ipcSend: (...args) => ipcRenderer.send(...args),
    ipcOn: (...args) => ipcRenderer.on(...args),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    openFile: async (filePath) => {
        return await ipcRenderer.invoke('file:open', filePath);
    },
    importFilterCfg: async (filePath) => {
        return await ipcRenderer.invoke('filter:import', filePath);
    },
    saveFilterConfig: (config, filePath) => {
        return ipcRenderer.invoke('filter:save-config', config, filePath);
    },
    openUserPluginsDir: () => ipcRenderer.send('open-user-plugins-dir'),
    dialogOpenFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
    onMenuOpenFile: (callback) => ipcRenderer.on('menu:open-file', callback),
    onMenuSaveFile: (callback) => ipcRenderer.on('menu:save-file', callback),
    onFilterSaveConfig: (callback) => ipcRenderer.on('filter:save-config-dialog', callback),
    onFilterLoadConfig: (callback) => ipcRenderer.on('filter:load', callback),
    reloadCurrentFile: () => ipcRenderer.invoke('file:reload'),
    onReloadFile: (callback) => ipcRenderer.on('menu:reload-file', callback),
    showItemInFolder: (filePath) => ipcRenderer.send('show-item-in-folder', filePath),
    onMenuShowInFolder: (callback) => ipcRenderer.on('menu:show-in-folder', callback),
    // 插件管理 API
    pluginManager: {
        getPlugins: () => ipcRenderer.invoke('plugin:list'),
        installPlugin: (zipPath) => ipcRenderer.invoke('plugin:install', zipPath),
        uninstallPlugin: (pluginName) => ipcRenderer.invoke('plugin:uninstall', pluginName)
    },
    // Command Palette APIs
    onCommandRegister: (callback) => {
        ipcRenderer.on('command:register', callback);
    },
    onCommandUnregister: (callback) => {
        ipcRenderer.on('command:unregister', callback);
    },
    executeCommand: async (cmdId) => {
        return await ipcRenderer.invoke('command:execute', cmdId);
    },
    // 新增：获取命令列表
    searchCommands: async (query) => {
        return await ipcRenderer.invoke('command:search', query);
    },
    getCommands: async () => {
        return await ipcRenderer.invoke('command:list');
    },
    getCurrentFilePath: () => ipcRenderer.invoke('get-current-file-path'),
    showInputBox: (options) => ipcRenderer.invoke('plugin:showInputBox', options),

    onPluginOpenFile: (callback) => ipcRenderer.on('plugin:open-file', callback)
});

// 监听渲染进程请求打开文件，并转发到主进程
window.electronAPI.ipcOn('plugin-open-file', (event, data) => {
    ipcRenderer.send('plugin-open-file', data);
});

// 监听主进程的响应并转发回渲染进程
ipcRenderer.on('plugin-openfile-response', (event, data) => {
    window.electronAPI.ipcSend('plugin-openfile-response', data);
});
