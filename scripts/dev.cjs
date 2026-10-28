const { spawn } = require('node:child_process');
const path = require('node:path');
require('./copy-assets.cjs');
const vite = spawn(process.execPath, [path.join(__dirname, '../node_modules/vite/bin/vite.js')], {
  stdio: 'inherit',
  windowsHide: true,
});
let desktop;
(async () => {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch('http://127.0.0.1:5173');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  desktop = spawn(require('electron'), ['.'], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, IMMERSE_DEV_URL: 'http://127.0.0.1:5173' },
  });
  desktop.on('exit', () => {
    vite.kill();
    process.exit();
  });
})();
process.on('SIGINT', () => {
  desktop?.kill();
  vite.kill();
});
