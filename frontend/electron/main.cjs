const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// ── Configuration ──
const APP_URL = process.env.MUSICPLAYER_URL || 'http://localhost:3000';
const BACKEND_PORT = 3000;
const BACKEND_STARTUP_TIMEOUT = 30000; // 30 seconds max wait

let mainWindow = null;
let lyricsWindow = null;
let visualizerWindow = null;
let backendProcess = null;
let currentSongData = null;
let currentPlayState = null;

// ── Find Node.js executable ──
function findNodeExe() {
  // Check environment variable first
  if (process.env.NODE_EXE && fs.existsSync(process.env.NODE_EXE)) {
    return process.env.NODE_EXE;
  }

  // Common install locations on Windows
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'fnm', 'node-versions', 'v22.11.0', 'installation', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Try PATH
  return 'node.exe';
}

// ── Find backend directory ──
function findBackendDir() {
  // Packaged mode: backend is in extraResources
  const packagedDir = path.join(process.resourcesPath || '', 'backend');
  if (fs.existsSync(path.join(packagedDir, 'server.js'))) {
    return packagedDir;
  }

  // Dev mode: backend is relative to electron directory
  const devDir = path.join(__dirname, '..', '..', 'backend');
  if (fs.existsSync(path.join(devDir, 'server.js'))) {
    return devDir;
  }

  // Try relative to frontend directory
  const frontendDir = path.join(__dirname, '..');
  const altDir = path.join(frontendDir, '..', 'backend');
  if (fs.existsSync(path.join(altDir, 'server.js'))) {
    return altDir;
  }

  // Fallback: try current working directory
  const cwdBackend = path.join(process.cwd(), 'backend');
  if (fs.existsSync(path.join(cwdBackend, 'server.js'))) {
    return cwdBackend;
  }

  throw new Error('Cannot find backend directory (server.js)');
}

// ── Check if port is ready ──
function isPortReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/songs?page=1&limit=1`, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ── Start backend server ──
async function startBackend() {
  const nodeExe = findNodeExe();
  const backendDir = findBackendDir();
  const serverScript = path.join(backendDir, 'server.js');

  console.log('[Launcher] Node.js:', nodeExe);
  console.log('[Launcher] Backend dir:', backendDir);
  console.log('[Launcher] Server script:', serverScript);

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Server script not found: ${serverScript}`);
  }

  // Check if port is already open (backend already running)
  if (await isPortReady(BACKEND_PORT)) {
    console.log('[Launcher] Backend already running on port', BACKEND_PORT);
    return;
  }

  console.log('[Launcher] Starting backend server...');

  backendProcess = spawn(nodeExe, [serverScript], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[Backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('[Backend]', data.toString().trim());
  });

  backendProcess.on('error', (err) => {
    console.error('[Launcher] Failed to start backend:', err.message);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log('[Launcher] Backend exited with code', code, 'signal', signal);
    backendProcess = null;
  });

  // Wait for backend to be ready
  const startTime = Date.now();
  while (Date.now() - startTime < BACKEND_STARTUP_TIMEOUT) {
    if (await isPortReady(BACKEND_PORT)) {
      console.log('[Launcher] Backend is ready!');
      return;
    }
    // Check if process died
    if (backendProcess && backendProcess.exitCode !== null) {
      throw new Error(`Backend process exited unexpectedly with code ${backendProcess.exitCode}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Backend did not start within ${BACKEND_STARTUP_TIMEOUT / 1000} seconds`);
}

// ── Stop backend server ──
function stopBackend() {
  if (backendProcess) {
    console.log('[Launcher] Stopping backend server...');
    // Use taskkill on Windows to ensure child processes are also killed
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch (_) {}
      backendProcess = null;
    } else {
      backendProcess.kill('SIGTERM');
      backendProcess = null;
    }
  }
}

// ── Create main window ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#101114',
    autoHideMenuBar: true,
    title: 'Music Player',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close floating windows too
    if (lyricsWindow) { lyricsWindow.close(); lyricsWindow = null; }
    if (visualizerWindow) { visualizerWindow.close(); visualizerWindow = null; }
  });
}

// ── Floating window factory ──
function createFloatingWindow(type, options = {}) {
  const isLyrics = type === 'lyrics';
  const win = new BrowserWindow({
    width: options.width || (isLyrics ? 420 : 520),
    height: options.height || (isLyrics ? 640 : 400),
    minWidth: 280,
    minHeight: 200,
    show: false,
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    title: isLyrics ? '歌词' : '音乐可视化',
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    titleBarStyle: 'hidden',
    frame: false,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const panelUrl = `${APP_URL}/#/floating?panel=${type}`;
  win.loadURL(panelUrl);

  win.once('ready-to-show', () => {
    win.show();
    // Send current song data immediately
    if (currentSongData) {
      win.webContents.send('song-update', currentSongData);
    }
    if (currentPlayState) {
      win.webContents.send('play-state-update', currentPlayState);
    }
  });

  win.on('closed', () => {
    if (isLyrics) lyricsWindow = null;
    else visualizerWindow = null;
    notifyMainPanelStatus();
  });

  return win;
}

// ── Broadcast to all floating windows ──
function broadcastToFloating(channel, data) {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.webContents.send(channel, data);
  }
  if (visualizerWindow && !visualizerWindow.isDestroyed()) {
    visualizerWindow.webContents.send(channel, data);
  }
}

function notifyMainPanelStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('panel-status', {
      lyricsOpen: !!lyricsWindow,
      visualizerOpen: !!visualizerWindow,
    });
  }
}

// ── IPC Handlers ──
function registerIpcHandlers() {
  // Open floating panels
  ipcMain.on('open-lyrics', () => {
    if (!lyricsWindow) {
      lyricsWindow = createFloatingWindow('lyrics');
    } else {
      lyricsWindow.focus();
    }
    notifyMainPanelStatus();
  });

  ipcMain.on('close-lyrics', () => {
    if (lyricsWindow) { lyricsWindow.close(); lyricsWindow = null; }
    notifyMainPanelStatus();
  });

  ipcMain.on('open-visualizer', () => {
    if (!visualizerWindow) {
      visualizerWindow = createFloatingWindow('visualizer');
    } else {
      visualizerWindow.focus();
    }
    notifyMainPanelStatus();
  });

  ipcMain.on('close-visualizer', () => {
    if (visualizerWindow) { visualizerWindow.close(); visualizerWindow = null; }
    notifyMainPanelStatus();
  });

  // Main window sends song updates to floating windows
  ipcMain.on('song-update', (_event, data) => {
    currentSongData = data;
    broadcastToFloating('song-update', data);
  });

  ipcMain.on('play-state-update', (_event, data) => {
    currentPlayState = data;
    broadcastToFloating('play-state-update', data);
  });

  ipcMain.on('time-update', (_event, data) => {
    broadcastToFloating('time-update', data);
  });

  // Floating windows request current song data
  ipcMain.handle('request-song-data', () => {
    return { song: currentSongData, playState: currentPlayState };
  });
}

// ── App lifecycle ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      registerIpcHandlers();
      await startBackend();
      createWindow();
    } catch (err) {
      console.error('[Launcher] Fatal error:', err.message);
      const { dialog } = require('electron');
      dialog.showErrorBox(
        '启动失败',
        `无法启动音乐播放器后台服务:\n\n${err.message}\n\n请确保:\n1. 已安装 Node.js\n2. MySQL 数据库已启动\n3. .env 文件配置正确`
      );
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    stopBackend();
  });
}
