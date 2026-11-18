const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBackup', {
  save: json => ipcRenderer.invoke('schedule-backup:save', json),
});
