const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { registerUpdates } = require('./updates.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('js-yaml');
const { pathToFileURL } = require('node:url');

const appUrl = 'ribit://app/app.html';
const externalLinks = new Set([
  'https://ribit.hopetohelp.net/',
  'https://ribit.hopetohelp.net/chat',
  'mailto:hopetohelp.il@gmail.com'
]);

protocol.registerSchemesAsPrivileged([
  { scheme: 'ribit', privileges: { standard: true, secure: true } }
]);

function openExternal(url) {
  if (externalLinks.has(new URL(url).href)) {
    shell.openExternal(url).catch(console.error);
  }
}

function hasSignedUpdateConfig() {
  if (!app.isPackaged) return false;
  try {
    const config = load(fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'));
    return [config?.publisherName].flat().some(name => typeof name === 'string' && name.trim());
  } catch (_) {
    return false;
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else app.whenReady().then(() => {
  const assets = path.join(process.resourcesPath, 'app');
  protocol.handle('ribit', async request => {
    const url = new URL(request.url);
    // Serve only the packaged application and its static resources.
    if (request.method !== 'GET' || url.host !== 'app' ||
        !/^\/(?:[\w-]+\/)*[\w-]+\.(?:html|css|js|png|woff2)$/.test(url.pathname)) {
      return new Response(null, { status: 404 });
    }
    const file = await net.fetch(pathToFileURL(path.join(assets, url.pathname)).href);
    const headers = new Headers(file.headers);
    headers.set('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
    return new Response(file.body, { status: file.status, headers });
  });

  const window = new BrowserWindow({
    width: 820,
    height: 830,
    minWidth: 360,
    minHeight: 440,
    backgroundColor: '#fafbff',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--ribit-version=' + app.getVersion()]
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternal(url);
  });
  registerUpdates(autoUpdater, ipcMain, window, appUrl, hasSignedUpdateConfig());
  app.on('second-instance', () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  window.loadURL(appUrl).catch(console.error);
});

app.on('window-all-closed', () => app.quit());
