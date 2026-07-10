import { app, BrowserWindow, shell } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import net from 'net';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5173;

function getBackendPath(): string {
  if (isDev) {
    const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin';
    const venvPy = process.platform === 'win32' ? 'python.exe' : 'python3';
    return path.join(__dirname, '..', 'backend', '.venv', venvBin, venvPy);
  }
  return path.join(process.resourcesPath, 'backend', 'main.exe');
}

function getBackendArgs(): string[] {
  if (isDev) {
    return ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)];
  }
  return [];
}

function getBackendCwd(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath();
    const args = getBackendArgs();
    const cwd = getBackendCwd();

    console.log(`[Electron] Starting backend: ${backendPath} ${args.join(' ')}`);

    backendProcess = spawn(backendPath, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME || process.env.USERPROFILE,
        APP_DEVICE: process.env.APP_DEVICE || 'auto',
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: isDev ? 'pipe' : 'ignore',
    });

    backendProcess.on('error', (err) => {
      console.error('[Electron] Backend error:', err);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`[Electron] Backend exited with code ${code}`);
      backendProcess = null;
    });

    if (isDev && backendProcess.stdout) {
      backendProcess.stdout.on('data', (data: Buffer) => {
        console.log(`[Backend] ${data.toString().trim()}`);
      });
      backendProcess.stderr.on('data', (data: Buffer) => {
        console.log(`[Backend] ${data.toString().trim()}`);
      });
    }

    waitForPort(BACKEND_PORT, 30000)
      .then(() => {
        console.log('[Electron] Backend is ready');
        resolve();
      })
      .catch(() => {
        reject(new Error('Backend failed to start within 30 seconds'));
      });
  });
}

function waitForPort(port: number, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} not ready within ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} not ready within ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
      socket.connect(port, '127.0.0.1');
    };
    check();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'SimpleTex',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('[Electron] Stopping backend...');
    backendProcess.kill('SIGTERM');
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    console.error('[Electron] Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
