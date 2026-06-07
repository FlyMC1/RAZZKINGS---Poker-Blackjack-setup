import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, stopServer } from '../server/index.js';

const isDev = !app.isPackaged;
const devUrl = 'http://localhost:5173';
let serverPromise = null;

async function ensureServerStarted() {
  if (!serverPromise) {
    serverPromise = Promise.resolve(startServer());
  }

  await serverPromise;
}

async function createWindow() {
  await ensureServerStarted();

  const builtIndexPath = join(app.getAppPath(), 'dist', 'index.html');
  const shouldUseDevServer = isDev && !existsSync(builtIndexPath);

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    backgroundColor: '#0a0b0f',
    title: 'RAZZKINGS',
    webPreferences: {
      preload: join(app.getAppPath(), 'electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (shouldUseDevServer) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  win.loadFile(builtIndexPath);
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});