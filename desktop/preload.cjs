const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('RibitDesktopUpdates', {
  version: process.argv.find(argument => argument.startsWith('--ribit-version='))?.slice('--ribit-version='.length),
  check: () => ipcRenderer.invoke('ribit:update-check'),
  install: () => ipcRenderer.invoke('ribit:update-install'),
  onState: callback => {
    ipcRenderer.on('ribit:update-state', (_event, state) => callback(state));
  }
});
