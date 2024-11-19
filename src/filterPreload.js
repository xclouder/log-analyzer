const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('filterAPI', {
    onFilteredContent: (callback) => {
        ipcRenderer.on('filtered-content', (event, content) => callback(content));
    },
    applyFilter: (config) => ipcRenderer.invoke('apply-filter', config)
});
