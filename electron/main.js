import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBackupWriter } from './backupFile.js';

const devUrl = !app.isPackaged && process.env.VITE_DEV_SERVER_URL;
const devDataDirectory = !app.isPackaged && process.env.SUBSTATION_DEV_DATA_DIR
  ? resolve(process.env.SUBSTATION_DEV_DATA_DIR)
  : null;

if (!app.isPackaged) {
  const profile = devDataDirectory ?? join(app.getPath('appData'), 'substation-schedule-dev');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}

const pagePath = join(app.getAppPath(), 'dist-desktop', 'index.html');
const expectedUrl = devUrl ? new URL(devUrl).href : pathToFileURL(pagePath).href;
let mainWindow;
let backupWriter;
let quitting = false;
let readyToQuit = false;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist-electron', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.on('closed', () => { mainWindow = undefined; });

  if (devUrl) {
    await mainWindow.loadURL(expectedUrl);
    console.info('[desktop] Renderer loaded');
  } else {
    await mainWindow.loadFile(pagePath);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (readyToQuit || !backupWriter) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void backupWriter.flush().then(() => {
      readyToQuit = true;
      app.quit();
    });
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('cn.substation.schedule');
    const documents = app.getPath('documents');
    const backupDirectory = app.isPackaged
      ? documents
      : join(devDataDirectory ?? documents, '变电站巡视计划（开发）');
    backupWriter = createBackupWriter(backupDirectory);
    ipcMain.handle('schedule-backup:save', async (event, json) => {
      if (quitting || event.sender !== mainWindow?.webContents
        || event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== expectedUrl) {
        throw new Error('不允许该页面写入排班备份。');
      }
      try {
        await backupWriter.save(json);
      } catch (error) {
        console.error('自动备份写入失败：', error);
        throw error;
      }
    });
    await createWindow();
  }).catch(error => {
    console.error('桌面窗口启动失败：', error);
    app.exit(1);
  });
}
