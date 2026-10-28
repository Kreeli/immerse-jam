const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
fs.cpSync(
  path.join(root, 'node_modules/@coderline/alphatab/dist'),
  path.join(root, 'dist/alphatab'),
  { recursive: true },
);
fs.cpSync(path.join(root, 'assets'), path.join(root, 'dist/assets'), { recursive: true });
