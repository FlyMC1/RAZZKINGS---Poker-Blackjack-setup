import { app, BrowserWindow, dialog } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, stopServer } from '../server/index.js';

const isDev = !app.isPackaged;
const devUrl = 'http://localhost:5173';
const publicHostFlag = '--public-host';
const shouldStartPublicHost = process.argv.includes(publicHostFlag);
let serverPromise = null;
let tunnelProcess = null;
let mainWindow = null;

function getLogFilePath() {
  try {
    const logDir = join(app.getPath('userData'), 'logs');
    mkdirSync(logDir, { recursive: true });
    return join(logDir, 'startup.log');
  } catch {
    return join(process.cwd(), 'razzkings-startup.log');
  }
}

function logStartup(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;

  try {
    appendFileSync(getLogFilePath(), line, 'utf8');
  } catch {
    // Ignore logging failures so startup never depends on file IO.
  }

  console.log(message);
}

function reportStartupError(error, context) {
  const text = `${context}: ${error?.stack || error?.message || String(error)}`;
  logStartup(`[fatal] ${text}`);

  if (app.isReady()) {
    dialog.showErrorBox('RAZZKINGS startup error', `${text}\n\nLog file: ${getLogFilePath()}`);
  }
}

async function ensureServerStarted() {
  if (!serverPromise) {
    logStartup('[startup] starting local server...');
    serverPromise = Promise.resolve(startServer());
  }

  await serverPromise;
  logStartup('[startup] local server ready');
}

async function createWindow() {
  const builtIndexPath = join(app.getAppPath(), 'dist', 'index.html');
  const shouldUseDevServer = isDev && !existsSync(builtIndexPath);

  logStartup('[startup] creating browser window');

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

  mainWindow = win;

  if (shouldUseDevServer) {
    logStartup('[startup] loading dev server URL');
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  logStartup(`[startup] loading renderer file: ${builtIndexPath}`);
  win.loadFile(builtIndexPath);

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logStartup(`[fatal] renderer failed to load: ${errorCode} ${errorDescription}`);
  });

  win.on('closed', () => {
    mainWindow = null;
  });
}

function startPublicHostTunnel() {
  if (!shouldStartPublicHost || isDev) {
    return;
  }

  logStartup('[public-host] launching public-host mode');

  const cloudflaredCheck = spawnSync('cloudflared', ['--version'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (cloudflaredCheck.status !== 0) {
    logStartup('[public-host] cloudflared was not found in PATH. Starting in LAN mode.');
    return;
  }

  logStartup(`[public-host] cloudflared detected: ${String(cloudflaredCheck.stdout || cloudflaredCheck.stderr || '').trim()}`);

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
      logStartup(`[public-host] live URL: ${match[0]}`);
    }
  };

  tunnelProcess.stdout.on('data', handleData);
  tunnelProcess.stderr.on('data', handleData);

  tunnelProcess.on('error', (error) => {
    logStartup(`[public-host] cloudflared failed to start: ${error.message}`);
  });

  tunnelProcess.on('exit', (code) => {
    tunnelProcess = null;
    if (code !== 0 && code !== null) {
      logStartup(`[public-host] cloudflared exited with code ${code}`);
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
  logStartup(`[startup] app ready; argv=${JSON.stringify(process.argv)}`);
  logStartup(`[startup] userData=${app.getPath('userData')}`);
  startPublicHostTunnel();
  void ensureServerStarted().catch((error) => {
    logStartup(`[startup] local server failed: ${error?.stack || error?.message || 'unknown error'}`);
  });
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logStartup('[startup] activate event: recreating main window');
      void createWindow();
    }
  });
}).catch((error) => {
  reportStartupError(error, 'app.whenReady failed');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logStartup('[shutdown] all windows closed; stopping app');
    stopPublicHostTunnel();
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  logStartup('[shutdown] before-quit');
  stopPublicHostTunnel();
});

app.on('render-process-gone', (_event, _webContents, details) => {
  logStartup(`[fatal] render process gone: ${details.reason}`);
});

app.on('child-process-gone', (_event, details) => {
  logStartup(`[fatal] child process gone: type=${details.type} reason=${details.reason}`);
});

process.on('uncaughtException', (error) => {
  reportStartupError(error, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  reportStartupError(reason, 'unhandledRejection');
});