const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  readImages: (folderPath) => ipcRenderer.invoke('dir:read-images', folderPath),
  renameFiles: (data) => ipcRenderer.invoke('files:rename', data),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  onUpdateStatus: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
});