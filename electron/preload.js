const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  readImages: (folderPath) => ipcRenderer.invoke('dir:read-images', folderPath),
  renameFiles: (data) => ipcRenderer.invoke('files:rename', data),
});