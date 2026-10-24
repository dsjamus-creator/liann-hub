'use strict';

const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');
const { HUB_URL, isHubUrl, isExternalUrl } = require('./url-policy.cjs');

function openExternal(url) {
  if (isExternalUrl(url)) void shell.openExternal(url);
}

function secureContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    // The HUB briefly opens about:blank before its AlongSide profile link arrives.
    if (url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: {
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    } };
    if (isHubUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: {
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    } };
    openExternal(url);
    return { action: 'deny' };
  });
  const handleNavigation = (event, url) => {
    if (isHubUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', handleNavigation);
  contents.on('will-redirect', handleNavigation);
  contents.on('will-attach-webview', event => event.preventDefault());
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 760,
    minHeight: 580,
    title: 'LiANN HUB',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#121410',
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isHubUrl(url)) window.show();
  });
  void window.loadURL(HUB_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.on('web-contents-created', (_event, contents) => secureContents(contents));
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'LiANN HUB', submenu: [
        { label: 'Open HUB in browser', click: () => void shell.openExternal(HUB_URL) },
        { role: 'reload' },
        { role: 'quit' }
      ] },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ]));
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
