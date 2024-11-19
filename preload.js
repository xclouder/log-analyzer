const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
    applyFilter: (config) => ipcRenderer.invoke('filter:apply', config)
});
