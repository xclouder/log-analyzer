const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    openFile: async (filePath) => {
        return await ipcRenderer.invoke('file:open', filePath);
    },
    importFilterCfg: async (filterPath) => {
        return await ipcRenderer.invoke('file:read', filePath);
    },
    saveFilterConfig: (config, filePath) => {
        return ipcRenderer.invoke('filter:save-config', config, filePath);
    },
    dialogOpenFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
    onMenuOpenFile: (callback) => ipcRenderer.on('menu:open-file', callback),
    onMenuSaveFile: (callback) => ipcRenderer.on('menu:save-file', callback),
    onFilterSaveConfig: (callback) => ipcRenderer.on('filter:save-config-dialog', callback),
    onFilterLoadConfig: (callback) => ipcRenderer.on('filter:load-config-result', callback),
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
});
