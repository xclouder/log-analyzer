const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
    filterLogs: (config) => ipcRenderer.invoke('filter:apply', config),
    saveFilterConfig: (config, filePath) => {
        return ipcRenderer.invoke('filter:save-config', config, filePath);
    },
    loadFilterConfig: (filePath) => {
        return ipcRenderer.invoke('filter:load-config', filePath);
    },
    onMenuOpenFile: (callback) => ipcRenderer.on('menu:open-file', callback),
    onMenuSaveFile: (callback) => ipcRenderer.on('menu:save-file', callback),
    onFilterSaveConfig: (callback) => ipcRenderer.on('filter:save-config-dialog', callback),
    onFilterLoadConfig: (callback) => ipcRenderer.on('filter:load-config-result', callback),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
    reloadCurrentFile: () => ipcRenderer.invoke('file:reload'),
    onReloadFile: (callback) => ipcRenderer.on('menu:reload-file', callback),
    showItemInFolder: () => ipcRenderer.invoke('file:show-in-folder'),
    onMenuShowInFolder: (callback) => ipcRenderer.on('menu:show-in-folder', callback),
});
