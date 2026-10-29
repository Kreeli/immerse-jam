const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const temporary = path.resolve('.runtime/test-workspaces/python-temp');
fs.mkdirSync(temporary, { recursive: true });
const local = path.resolve('.runtime/venv/Scripts/python.exe');
const r = spawnSync(
  process.env.IMMERSE_TEST_PYTHON || (fs.existsSync(local) ? local : 'python'),
  ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1', TEMP: temporary, TMP: temporary, TMPDIR: temporary },
  },
);
process.exit(r.status ?? 1);
