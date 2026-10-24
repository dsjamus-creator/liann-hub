'use strict';
// Learning with LiANN hub as a desktop window. It opens the hosted hub at app.lwliann.com and keeps navigation inside
// that origin; every Open button on the hub (games, PolyFlow, AlongSide, guides) opens in the system browser, as it
// does from a browser tab. Nothing runs locally: no Node in the page, no file access, no extra permissions.
const { app, BrowserWindow, shell, session } = require('electron');

const APP_URL = 'https://app.lwliann.com/';
const APP_ORIGIN = new URL(APP_URL).origin;

function allowedInside(raw) {
  try { return new URL(raw).origin === APP_ORIGIN; } catch { return false; }
}

function openOutside(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') shell.openExternal(url.href);
  } catch { /* Ignore malformed links. */ }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: 'Learning with LiANN',
    icon: require('node:path').join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#121410',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedInside(url)) return { action: 'allow' };
    openOutside(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowedInside(url)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  window.loadURL(APP_URL);
}

app.whenReady().then(() => {
  // The hub asks for no device permissions; refuse any request so a page cannot acquire one through the window.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
