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
    readFile: async (filePath) => {
        try {
            const stats = await ipcRenderer.invoke('file:stats', filePath);
            if (stats.size > 10 * 1024 * 1024) { // 如果文件大于10MB
                let content = '';
                let offset = 0;
                const chunkSize = 5 * 1024 * 1024; // 每次读取5MB
                
                while (offset < stats.size) {
                    const chunk = await ipcRenderer.invoke('file:read-chunk', filePath, offset, chunkSize);
                    content += chunk;
                    offset += chunkSize;
                }
                return content;
            } else {
                return await ipcRenderer.invoke('file:read', filePath);
            }
        } catch (error) {
            throw new Error(`读取文件失败: ${error.message}`);
        }
    },
    reloadCurrentFile: () => ipcRenderer.invoke('file:reload'),
    onReloadFile: (callback) => ipcRenderer.on('menu:reload-file', callback),
    showItemInFolder: () => ipcRenderer.invoke('file:show-in-folder'),
    onMenuShowInFolder: (callback) => ipcRenderer.on('menu:show-in-folder', callback),
});
