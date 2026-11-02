// Native wizard smoke test: real loopback download, no installed application,
// private library or registry changes. The page/functions match the installer.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto'),
  cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime/test-workspaces'), { recursive: true });
const area = fs.mkdtempSync(path.join(root, '.runtime/test-workspaces/native-setup-'));
const nsisRoot = path.join(root, '.runtime/builder-cache');
function find(folder, name) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      const result = find(file, name);
      if (result) return result;
    } else if (entry.name === name) return file;
  }
}
const compiler = find(nsisRoot, 'makensis.exe');
const plugin = find(path.join(nsisRoot, 'nsis-resources-3.4.1'), 'StdUtils.dll').replace(
  'x86-ansi',
  'x86-unicode',
);
const quote = (text) => text.replaceAll('$', '$$').replaceAll('"', '$\\"');
const data = crypto.randomBytes(8 * 1048576),
  sha = crypto.createHash('sha256').update(data).digest('hex');
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Length': data.length });
  let offset = 0;
  const timer = setInterval(() => {
    // Hold near half until the page is inspected, but send a trickle so the
    // production transport's inactivity watchdog remains meaningful.
    if (offset >= data.length) {
      clearInterval(timer);
      res.end();
      return;
    }
    const length =
      offset >= data.length / 2 && !fs.existsSync(path.join(area, 'continue')) ? 1 : 262144;
    res.write(data.subarray(offset, offset + length));
    offset += length;
  }, 80);
  res.on('close', () => clearInterval(timer));
});
server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/weights';
  const worker = path.join(area, 'worker.cjs');
  fs.writeFileSync(
    worker,
    `const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const setup=require(${JSON.stringify(path.join(root, 'desktop/installation.cjs'))});
const statusFile=process.argv.find(a=>a.startsWith('--setup-status=')).slice(15);
const status=require(${JSON.stringify(path.join(root, 'desktop/setup-status.cjs'))}).create(statusFile);
app.setPath('userData',${JSON.stringify(path.join(area, 'profile'))});
app.whenReady().then(async()=>{const input=setup.options(process.argv);input.installRoot=${JSON.stringify(path.join(area, 'program'))};fs.mkdirSync(input.installRoot,{recursive:true});fs.writeFileSync(${JSON.stringify(path.join(area, 'selection.json'))},JSON.stringify(input));
await setup.prepare(input,{onEvent:e=>{status.send(e);if(e.received)fs.writeFileSync(${JSON.stringify(path.join(area, 'download-witness.json'))},JSON.stringify(e));},runtime:async()=>{},audio:async()=>{},models:{ensure:async(id,report)=>require(${JSON.stringify(path.join(root, 'desktop/runtime.cjs'))}).download(${JSON.stringify(url)},path.join(input.dataRoot,id+'.ckpt'),${JSON.stringify(sha)},report)}});status.finish();app.exit(0);}).catch(e=>{status.finish(e);app.exit(1)});`,
  );
  // Only suppress registry writes in this fixture; all progress/UI/process code
  // and model selection functions come from the production include files.
  const page = path.join(area, 'download-page.nsh');
  fs.writeFileSync(
    page,
    fs
      .readFileSync(path.join(root, 'installer/download-page.nsh'), 'utf8')
      .replace(/^\s*WriteRegStr .*$/gm, ''),
  );
  const setup = path.join(area, 'setup.nsh');
  fs.writeFileSync(
    setup,
    fs
      .readFileSync(path.join(root, 'installer/setup.nsh'), 'utf8')
      .replace('  Page custom IJStoragePage IJStorageLeave', '')
      .replace(
        '!include "${PROJECT_DIR}\\installer\\download-page.nsh"',
        '!include "' + quote(page) + '"',
      ),
  );
  const file = path.join(area, 'check.nsi'),
    exe = path.join(area, 'Installer progress check.exe');
  fs.writeFileSync(
    file,
    `Unicode true
RequestExecutionLevel user
Name "Immerse Jam progress check"
OutFile "${quote(exe)}"
!include "MUI2.nsh"
!include "${quote(path.join(root, 'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh'))}"
!addplugindir /x86-unicode "${quote(path.dirname(plugin))}"
!define PROJECT_DIR "${quote(root)}"
!define APP_EXECUTABLE_FILENAME "electron.exe"
!define IJ_PREPARE_PREFIX '"${quote(worker)}" '
!define MUI_FINISHPAGE_RUN_NOTCHECKED
Var launchLink
!include "${quote(setup)}"
!insertmacro customPageAfterChangeDir
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro customHeader
Function .onInit
StrCpy $LANGUAGE 2052
InitPluginsDir
StrCpy $INSTDIR "${quote(path.dirname(require('electron')))}"
StrCpy $IJData "${quote(path.join(area, 'data'))}"
StrCpy $IJMode "cpu"
StrCpy $IJSelected0 \$\{BST_CHECKED\}
StrCpy $IJSelected5 \$\{BST_CHECKED\}
FunctionEnd
Section
SectionEnd
`
      .replaceAll('$\\{', '${')
      .replaceAll('\\}', '}'),
  );
  const compiled = cp.spawnSync(compiler, ['-V2', file], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (compiled.status !== 0) {
    console.error(compiled.stdout, compiled.stderr);
    server.close();
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(
    path.join(root, '.runtime/native-progress-check.json'),
    JSON.stringify({ area, exe }, null, 2),
  );
  console.log('NATIVE_SETUP_CHECK_READY', JSON.stringify({ area, exe }));
  console.log(
    'Open the returned executable to inspect the wizard. Create continue to finish downloading, then stop to end the local server.',
  );
  const stop = setInterval(() => {
    if (fs.existsSync(path.join(area, 'stop'))) {
      clearInterval(stop);
      server.close();
    }
  }, 500);
});
