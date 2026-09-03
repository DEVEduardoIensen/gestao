/**
 * Eldorado Pesca & Lake - Electron Main Process (v2.7.0)
 * Janela Desktop Dedicada com Bandeja do Sistema (Tray) e Sincronização Automática em Background
 */

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } = require('electron');
const path = require('node:path');

// Identificador do modelo de usuário do Windows para agrupamento limpo na barra de tarefas
if (process.platform === 'win32') {
  app.setAppUserModelId('com.eldoradolake.pesca');
}

// Single Instance Lock: Previne duplicatas e foca a janela existente
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Inicia servidor backend SQLite local
  try {
    require('./local_server.js');
  } catch (e) {
    console.log('[Electron Main] Nota sobre servidor backend local:', e.message);
  }

  let mainWindow = null;
  let tray = null;
  app.isQuiting = false;

  function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, 'app_icon.ico');
    try {
      const trayIcon = nativeImage.createFromPath(iconPath);
      tray = new Tray(trayIcon);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Abrir Eldorado Pesca PRO',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.focus();
            }
          }
        },
        {
          label: 'Sincronizar Agora',
          click: () => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('trigger-background-sync');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Sair do Sistema',
          click: () => {
            app.isQuiting = true;
            app.quit();
          }
        }
      ]);

      tray.setToolTip('Eldorado Pesca & Lake (Sincronização em Segundo Plano Ativa)');
      tray.setContextMenu(contextMenu);

      tray.on('click', () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          if (mainWindow.isFocused()) {
            mainWindow.hide();
          } else {
            mainWindow.focus();
          }
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      });

      tray.on('double-click', () => {
        if (mainWindow) {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
    } catch (err) {
      console.warn('[Electron Main] Falha ao inicializar System Tray:', err);
    }
  }

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
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false, // Mantém execução ativa em background quando a janela estiver oculta
        preload: path.join(__dirname, 'preload.js')
      },
      autoHideMenuBar: true
    });

    Menu.setApplicationMenu(null);

    // Carrega servidor backend local ou fallback direto para index.html offline
    const localIndexPath = path.join(__dirname, 'index.html');
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      mainWindow.loadFile(localIndexPath);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      if (validatedURL && validatedURL.includes('localhost:3000')) {
        mainWindow.loadFile(localIndexPath);
      }
    });

    // Exibe a janela assim que estiver renderizada
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    // Ao fechar a janela no "X", minimiza para a bandeja do sistema para manter a sincronização viva
    mainWindow.on('close', (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        mainWindow.hide();

        if (tray) {
          tray.displayBalloon?.({
            title: 'Eldorado Pesca PRO',
            content: 'O aplicativo continua ativo na bandeja para sincronização automática via Wi-Fi.'
          });
        }
        return false;
      }
      return true;
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Disparador periódico de sincronização em segundo plano (a cada 20 segundos)
    setInterval(() => {
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('trigger-background-sync');
      }
    }, 20000);
  }

  // Recebe atualizações de status da sincronização do renderer
  ipcMain.on('update-sync-status', (event, status) => {
    if (tray) {
      const statusText = status === 'synced' ? 'Sincronizado' :
        status === 'syncing' ? 'Sincronizando...' :
        status === 'offline' ? 'Offline' : 'Ativo';
      tray.setToolTip(`Eldorado Pesca & Lake (${statusText})`);
    }
  });

  // Foca e restaura caso o usuário tente abrir um segundo atalho na Área de Trabalho
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuiting = true;
  });

  app.on('window-all-closed', () => {
    // No Windows e Linux, continua rodando na bandeja do sistema
    if (app.isQuiting) {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    }
  });
}
