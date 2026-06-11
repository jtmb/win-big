import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;

const isDev = !app.isPackaged;
const NEXT_PORT = 6049;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // In dev, `next dev` is already running via concurrently
      resolve();
      return;
    }

    // Production: spawn Next.js standalone server
    const standalonePath = path.join(process.resourcesPath, 'next-standalone');
    const serverScript = path.join(standalonePath, 'server.js');

    nextServer = spawn(process.execPath, [serverScript], {
      cwd: standalonePath,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(NEXT_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    nextServer.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('started') || msg.includes('ready')) {
        resolve();
      }
    });

    nextServer.stderr?.on('data', (data: Buffer) => {
      console.error('[next server]', data.toString());
    });

    nextServer.on('error', reject);
    nextServer.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js server exited with code ${code}`));
      }
    });

    // Timeout after 30s
    setTimeout(() => resolve(), 30000);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1297,
    height: 1011,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    autoHideMenuBar: true,
    title: 'WinBig — Lottery Number Predictor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadURL(NEXT_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startNextServer();
  } catch (err) {
    console.error('Failed to start Next.js server:', err);
  }

  await registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  nextServer?.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  nextServer?.kill();
});

export { mainWindow };
