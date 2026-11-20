const { app, BrowserWindow, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const appUrl = 'ribit://app/app.html';
const externalLinks = new Set([
  'https://ribit.hopetohelp.net/',
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

app.whenReady().then(() => {
  const assets = path.join(process.resourcesPath, 'app');
  protocol.handle('ribit', async request => {
    const url = new URL(request.url);
    // Serve only the packaged application and its static resources.
    if (request.method !== 'GET' || url.host !== 'app' ||
        !/^\/(?:[\w-]+\/)*[\w-]+\.(?:html|css|js|woff2)$/.test(url.pathname)) {
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
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternal(url);
  });
  window.loadURL(appUrl).catch(console.error);
});

app.on('window-all-closed', () => app.quit());
