/**
 * Eldorado Pesca & Lake - Electron Main Process
 * Dedicated Desktop Window with Custom Icon & High Performance Architecture
 */

const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

// Set Application User Model ID on Windows for consistent taskbar grouping & icon
if (process.platform === 'win32') {
  app.setAppUserModelId('com.eldoradolake.pesca');
}

// Single Instance Lock: Prevents opening duplicate windows and focuses existing window instantly
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Start SQLite Backend Server in-process (lightning fast)
  try {
    require('./local_server.js');
  } catch (e) {
    console.log('Backend server initialization note:', e.message);
  }

  let mainWindow = null;

  function createWindow() {
    const iconPath = path.join(__dirname, 'app_icon.ico');

    mainWindow = new BrowserWindow({
      width: 1360,
      height: 880,
      minWidth: 1024,
      minHeight: 700,
      backgroundColor: '#060a13',
      title: 'Eldorado Pesca & Lake - Sistema de Gestão',
      icon: iconPath,
      show: false, // Performance: Wait until ready-to-show to prevent blank screen flicker
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false // Keeps smooth performance when switching windows
      },
      autoHideMenuBar: true
    });

    Menu.setApplicationMenu(null);

    // Load backend server
    mainWindow.loadURL('http://localhost:3000');

    // Show instantly once rendered
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // Handle second instance launch: restore and focus existing window
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
