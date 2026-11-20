function registerUpdates(updater, ipc, window, appUrl, enabled) {
  let state = { status: 'idle', version: '' };
  let pending = false;

  function publish(status, version = '') {
    state = { status, version };
    if (!window.isDestroyed()) window.webContents.send('ribit:update-state', state);
  }

  function trusted(event) {
    return !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === appUrl;
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.on('update-available', release => publish('downloading', release.version));
  updater.on('update-not-available', () => publish('current'));
  updater.on('update-downloaded', release => publish('ready', release.version));
  updater.on('error', () => publish('error'));

  ipc.handle('ribit:update-check', async event => {
    if (!trusted(event)) return;
    if (!enabled) {
      publish('unavailable');
      return;
    }
    if (pending || state.status === 'ready') {
      publish(state.status, state.version);
      return;
    }
    pending = true;
    publish('checking');
    try {
      const result = await updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      if (state.status === 'checking') publish('current');
    } catch (_) {
      if (state.status !== 'error') publish('error');
    } finally {
      pending = false;
    }
  });

  ipc.handle('ribit:update-install', event => {
    if (enabled && trusted(event) && state.status === 'ready') updater.quitAndInstall(true, true);
  });
}

module.exports = { registerUpdates };
