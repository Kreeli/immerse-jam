const path = require('node:path');
const { spawnSync } = require('node:child_process');
const r = spawnSync(
  path.resolve('.runtime/venv/Scripts/python.exe'),
  ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v'],
  { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } },
);
process.exit(r.status ?? 1);
