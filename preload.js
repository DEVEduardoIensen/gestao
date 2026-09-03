/**
 * Eldorado Pesca & Lake - Desktop Electron Preload Script
 * Define flags de identificação do app desktop nativo
 */

const { contextBridge } = require('electron');

try {
  contextBridge.exposeInMainWorld('__ELDORADO_IS_ELECTRON', true);
  contextBridge.exposeInMainWorld('__ELDORADO_IS_DESKTOP_APP', true);
} catch (e) {
  window.__ELDORADO_IS_ELECTRON = true;
  window.__ELDORADO_IS_DESKTOP_APP = true;
}
