const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registerUpdates } = require('./updates.cjs');

function setup(enabled = true) {
  const appUrl = 'ribit://app/app.html';
  const statuses = [];
  const handlers = {};
  const ipc = { handle: (channel, handler) => { handlers[channel] = handler; } };
  const window = {
    isDestroyed: () => false,
    webContents: {
      mainFrame: { url: appUrl },
      send: (_channel, state) => statuses.push(state.status),
    },
  };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const updater = new EventEmitter();
  updater.quitAndInstall = (...args) => { updater.installArguments = args; };
  registerUpdates(updater, ipc, window, appUrl, enabled);
  return {
    statuses, updater, event,
    check: (sender = event) => handlers['ribit:update-check'](sender),
    install: (sender = event) => handlers['ribit:update-install'](sender),
  };
}

test('downloads once, allows installing only after verification, and keeps the ready state', async () => {
  const { updater, statuses, check, install } = setup();
  let count = 0;
  let finishDownload;
  const download = new Promise(resolve => { finishDownload = resolve; });
  updater.checkForUpdates = async () => {
    count++;
    updater.emit('update-available', { version: '0.2.4' });
    return { downloadPromise: download };
  };
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowDowngrade, false);

  const checking = check();
  await check();
  install();
  assert.equal(updater.installArguments, undefined);
  updater.emit('update-downloaded', { version: '0.2.4' });
  finishDownload();
  await checking;
  await check();
  install();

  assert.equal(count, 1);
  assert.deepEqual(statuses, ['checking', 'downloading', 'downloading', 'ready', 'ready']);
  assert.deepEqual(updater.installArguments, [true, true]);
});

test('blocks other frames and unsigned builds', async () => {
  const { updater, check, install, statuses, event } = setup(false);
  updater.checkForUpdates = () => assert.fail('Check must not run');
  const foreign = { ...event, senderFrame: { url: event.senderFrame.url } };
  await check(foreign);
  install(foreign);
  assert.deepEqual(statuses, []);
  await check();
  install();
  assert.deepEqual(statuses, ['unavailable']);
  assert.equal(updater.installArguments, undefined);
});

test('reports a failed check and accepts a successful retry', async () => {
  const { updater, check, statuses } = setup();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  await check();
  updater.checkForUpdates = async () => { updater.emit('update-not-available'); };
  await check();
  assert.deepEqual(statuses, ['checking', 'error', 'checking', 'current']);
});
