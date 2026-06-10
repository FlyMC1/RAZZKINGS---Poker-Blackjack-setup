import { app, BrowserWindow } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, stopServer } from '../server/index.js';

const isDev = !app.isPackaged;
const devUrl = 'http://localhost:5173';
const publicHostFlag = '--public-host';
const shouldStartPublicHost = process.argv.includes(publicHostFlag);
let serverPromise = null;
let tunnelProcess = null;

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

function startPublicHostTunnel() {
  if (!shouldStartPublicHost || isDev) {
    return;
  }

  const cloudflaredCheck = spawnSync('cloudflared', ['--version'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (cloudflaredCheck.status !== 0) {
    console.warn('[public-host] cloudflared was not found in PATH. Starting in LAN mode.');
    return;
  }

  let outputBuffer = '';
  const urlPattern = /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/;

  tunnelProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3001'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  const handleData = (chunk) => {
    const text = String(chunk ?? '');
    outputBuffer += text;
    const match = outputBuffer.match(urlPattern);
    if (match?.[0] && !process.env.PUBLIC_BASE_URL) {
      process.env.PUBLIC_BASE_URL = match[0];
      console.log(`[public-host] Live URL: ${match[0]}`);
    }
  };

  tunnelProcess.stdout.on('data', handleData);
  tunnelProcess.stderr.on('data', handleData);

  tunnelProcess.on('error', (error) => {
    console.warn(`[public-host] cloudflared failed to start: ${error.message}`);
  });

  tunnelProcess.on('exit', (code) => {
    tunnelProcess = null;
    if (code !== 0 && code !== null) {
      console.warn(`[public-host] cloudflared exited with code ${code}.`);
    }
  });
}

function stopPublicHostTunnel() {
  if (!tunnelProcess || tunnelProcess.killed) {
    return;
  }

  tunnelProcess.kill('SIGTERM');
}

app.whenReady().then(async () => {
  startPublicHostTunnel();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPublicHostTunnel();
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPublicHostTunnel();
});