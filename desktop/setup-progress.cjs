const path = require('node:path');
const { BrowserWindow } = require('electron');

async function open(app) {
  const window = new BrowserWindow({
    width: 600,
    height: 408,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    autoHideMenuBar: true,
    title: 'Immerse Jam',
    backgroundColor: '#151519',
    webPreferences: {
      preload: path.join(__dirname, 'setup-progress-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [app.getLocale().startsWith('zh') ? '--setup-zh' : '--setup-en'],
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  await window.loadFile(path.join(__dirname, 'setup-progress.html'));
  let current = {},
    pending,
    timer;
  const sendNow = () => {
    timer = undefined;
    if (!window.isDestroyed()) {
      window.webContents.send('installation-progress', pending);
      if (Number.isFinite(current.progress)) window.setProgressBar(current.progress);
      else window.setProgressBar(2); // Windows' indeterminate taskbar animation.
    }
  };
  window.on('closed', () => clearTimeout(timer));
  return {
    send(event) {
      if (event.stage) current = { stage: event.stage };
      // A new operation must not retain the preceding file's percentage.
      current = { stage: current.stage, ...event };
      pending = current;
      if (!timer) timer = setTimeout(sendNow, 80);
    },
  };
}
module.exports = { open };
