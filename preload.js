/**
 * Eldorado Pesca & Lake - Desktop Electron Preload Script
 * Define flags de identificação do app desktop nativo
 */

const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('__ELDORADO_IS_ELECTRON', true);
  contextBridge.exposeInMainWorld('__ELDORADO_IS_DESKTOP_APP', true);
  contextBridge.exposeInMainWorld('electronAPI', {
    onTriggerBackgroundSync: (callback) => {
      if (typeof callback === 'function') {
        ipcRenderer.on('trigger-background-sync', () => callback());
      }
    },
    notifySyncStatus: (status) => {
      ipcRenderer.send('update-sync-status', status);
    }
  });
} catch (e) {
  window.__ELDORADO_IS_ELECTRON = true;
  window.__ELDORADO_IS_DESKTOP_APP = true;
}

