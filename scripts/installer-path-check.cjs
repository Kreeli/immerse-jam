// Runs the production NSIS path validator without UI, registry or disk changes
// outside an isolated workspace directory. Also records the old instruction.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime/test-workspaces'), { recursive: true });
const area = fs.mkdtempSync(path.join(root, '.runtime/test-workspaces/storage-path-'));
function find(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      const found = find(file);
      if (found) return found;
    } else if (entry.name === 'makensis.exe') return file;
  }
}
const quote = (text) => text.replaceAll('$', '$$').replaceAll('"', '$\\"');
const cases = [
  ['E:\\ImmerseJ_am_data_E', 'E:\\immerse_E', '0', 'ok'],
  ['E:/ImmerseJ_am_data__E', 'E:\\immerse_E', '0', 'ok'],
  [
    'E:\\missing-parent-immerse-check\\new-data',
    'E:\\missing-app-immerse-check\\program',
    '0',
    'ok',
  ],
  ['E:\\app\\data', 'E:\\app', '0', 'nested'],
  ['E:\\app', 'E:\\app\\program', '0', 'nested'],
  ['E:\\app\\', 'e:\\APP', '0', 'nested'],
  ['E:\\app-data', 'E:\\app', '0', 'ok'],
  ['E:\\app\\..\\data', 'E:\\app', '0', 'ok'],
  ['E:\\', 'E:\\app', '0', 'invalid'],
  ['E:relative', 'E:\\app', '0', 'invalid'],
  ['relative', 'E:\\app', '0', 'invalid'],
  [(process.env.SystemDrive || 'C:') + '\\new-immerse-check', 'E:\\app', '0', 'system'],
  [(process.env.SystemDrive || 'C:') + '\\new-immerse-check', 'E:\\app', '1', 'ok'],
];
const output = path.join(area, 'result.txt'),
  exe = path.join(area, 'paths.exe');
const source = `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${quote(exe)}"
!include "LogicLib.nsh"
Var IJData
Var IJAllowC
!include "${quote(path.join(root, 'installer/storage-path.nsh'))}"
Section
FileOpen $9 "${quote(output)}" w
StrCpy $0 "E:\\ImmerseJ_am_data_E"
ClearErrors
GetFullPathName $0 $0
FileWrite $9 "old-in-place=$0$\\r$\\n"
StrCpy $0 "E:\\missing-parent-immerse-check\\new-data"
GetFullPathName $1 $0
FileWrite $9 "old-missing-parent=$1$\\r$\\n"
${cases
  .map(
    ([data, app, allow], index) => `StrCpy $IJData "${quote(data)}"
StrCpy $INSTDIR "${quote(app)}"
StrCpy $IJAllowC "${allow}"
FileWrite $9 "program${index}=$INSTDIR$\\r$\\n"
Call IJCheckStorage
Pop $0
FileWrite $9 "${index}=$0$\\r$\\n"
FileWrite $9 "path${index}=$IJData$\\r$\\n"`,
  )
  .join('\n')}
FileClose $9
SectionEnd
`;
const nsi = path.join(area, 'paths.nsi');
fs.writeFileSync(nsi, source);
const compiled = cp.spawnSync(find(path.join(root, '.runtime/builder-cache')), ['-V2', nsi], {
  encoding: 'utf8',
  windowsHide: true,
});
assert.equal(compiled.status, 0, String(compiled.error || '') + compiled.stdout + compiled.stderr);
const run = cp.spawnSync(exe, [], { windowsHide: true, timeout: 15000 });
assert.equal(run.status, 0, String(run.error || run.stderr));
const results = Object.fromEntries(
  fs
    .readFileSync(output, 'utf8')
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
cases.forEach((entry, index) => assert.equal(results[index], entry[3], JSON.stringify(entry)));
console.log(
  JSON.stringify({
    passed: cases.length,
    originalInstruction: results['old-in-place'],
    originalMissingParent: results['old-missing-parent'],
    area,
  }),
);
