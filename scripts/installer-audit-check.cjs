const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const quote = (value) => value.replaceAll('$', '$$').replaceAll('"', '$\\"');
async function main() {
  const parent = path.join(root, '.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const area = fs.mkdtempSync(path.join(parent, 'installer-native-audit-'));
  const tools = require('app-builder-lib/out/toolsets/windows');
  const compiler = await tools.getMakeNsisPath(null),
    plugins = await tools.getNsisPluginsPath(null);
  const plugin = path.join(plugins, 'x86-unicode/StdUtils.dll');
  assert.ok(fs.existsSync(plugin));
  const binary = path.join(area, 'node.exe');
  fs.copyFileSync(process.execPath, binary);
  function program(name) {
    const dir = path.join(area, name);
    fs.mkdirSync(dir);
    fs.linkSync(binary, path.join(dir, 'node.exe'));
    return dir;
  }
  const old = program('old-program'),
    selected = program('Selected Program'),
    guiProgram = program('GUI Program');
  const stateFile = path.join(area, 'case.json'),
    attempts = path.join(area, 'attempts.jsonl'),
    settings = path.join(area, 'fixture.ini'),
    selection = path.join(area, 'selection.ini');
  const worker = path.join(area, 'worker.cjs');
  fs.writeFileSync(
    worker,
    [
      "const fs=require('node:fs');",
      'const setup=require(' + JSON.stringify(path.join(root, 'desktop/installation.cjs')) + ');',
      'const input=setup.options(process.argv);',
      'fs.appendFileSync(' + JSON.stringify(attempts) + ",JSON.stringify(input)+'\\n');",
      'const state=JSON.parse(fs.readFileSync(' + JSON.stringify(stateFile) + ",'utf8'));",
      "const file=process.argv.find(a=>a.startsWith('--setup-status='))?.slice(15);",
      'const status=file?require(' +
        JSON.stringify(path.join(root, 'desktop/setup-status.cjs')) +
        ').create(file):null;',
      '(async()=>{require(' +
        JSON.stringify(path.join(root, 'desktop/locations.cjs')) +
        ').validateRoot(input.dataRoot,input.installRoot,input.allowSystemDrive);',
      "if(state.fail)throw new Error('Fixture network interruption');",
      "if(state.hold){status?.send({stage:'runtime',message:'Fixture download in progress',received:1024,total:2048});setInterval(()=>{},1000);return;}",
      'if(!state.validationOnly)await setup.prepare(input,{preflight:()=>{},runtime:async()=>{},audio:async()=>{},models:{ensure:async()=>{}}});status?.finish();',
      '})().catch(e=>{status?.finish(e);console.error(e.message);process.exitCode=1;});',
    ].join('\n'),
  );
  // Every registry write is removed from the fixture; reads use a private INI.
  const page = path.join(area, 'download-page.nsh'),
    setupFile = path.join(area, 'setup.nsh');
  fs.writeFileSync(
    page,
    fs
      .readFileSync(path.join(root, 'installer/download-page.nsh'), 'utf8')
      .replace(/^\s*WriteRegStr .*$/gm, ''),
  );
  fs.writeFileSync(
    setupFile,
    fs
      .readFileSync(path.join(root, 'installer/setup.nsh'), 'utf8')
      .replace(
        '\u0024{NSD_GetText} $IJDataEdit $IJData',
        '\u0024{NSD_GetText} $IJDataEdit $IJData\nWriteINIStr "' +
          quote(path.join(area, 'path-check.ini')) +
          '" "Trace" "raw" "$IJData"',
      )
      .replaceAll(
        'MessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"',
        'WriteINIStr "' +
          quote(path.join(area, 'path-check.ini')) +
          '" "Trace" "values" "$IJData | $INSTDIR | $0 | $1 | $2 | $3 | $4 | $IJAllowC"\nMessageBox MB_OK|MB_ICONEXCLAMATION "$(IJSelectPath)"',
      )
      .replace(/^\s*WriteRegStr .*$/gm, '')
      .replace('ReadRegStr $IJData HKCU "Software\\ImmerseJam" "DataRoot"', 'StrCpy $IJData ""')
      .replace(
        'ReadRegStr $0 HKCU "Software\\ImmerseJam" "ProgramRoot"',
        'ReadINIStr $0 "' + quote(settings) + '" "Fixture" "oldProgram"',
      )
      .replace(
        '!include "\u0024{PROJECT_DIR}\\installer\\download-page.nsh"',
        '!include "' + quote(page) + '"',
      ),
  );
  const exe = path.join(area, 'Immerse installer audit.exe'),
    script = path.join(area, 'audit.nsi');
  fs.writeFileSync(
    script,
    [
      'Unicode true',
      'RequestExecutionLevel user',
      'Name "Immerse Jam installer audit"',
      'OutFile "' + quote(exe) + '"',
      '!include "MUI2.nsh"',
      '!addincludedir "' +
        quote(path.join(root, 'node_modules/app-builder-lib/templates/nsis/include')) +
        '"',
      '!include "' +
        quote(path.join(root, 'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh')) +
        '"',
      '!include "' +
        quote(path.join(root, 'node_modules/app-builder-lib/templates/nsis/multiUser.nsh')) +
        '"',
      '!addplugindir /x86-unicode "' + quote(path.dirname(plugin)) + '"',
      '!define PROJECT_DIR "' + quote(root) + '"',
      '!define APP_EXECUTABLE_FILENAME "node.exe"',
      "!define IJ_PREPARE_PREFIX '" + '"' + quote(worker) + '" ' + "'",
      '!define MUI_FINISHPAGE_RUN_NOTCHECKED',
      'Var launchLink',
      '!include "' + quote(setupFile) + '"',
      '!insertmacro MUI_PAGE_DIRECTORY',
      '!insertmacro customPageAfterChangeDir',
      '!insertmacro MUI_PAGE_INSTFILES',
      '!insertmacro customFinishPage',
      '!insertmacro MUI_LANGUAGE "English"',
      '!insertmacro MUI_LANGUAGE "SimpChinese"',
      '!insertmacro customHeader',
      'Function .onInit',
      'StrCpy $LANGUAGE 2052',
      'InitPluginsDir',
      'StrCpy $INSTDIR "' + quote(old) + '"',
      '!insertmacro customInit',
      '\u0024{GetParameters} $0',
      '\u0024{GetOptions} $0 "/SELECT=" $1',
      '\u0024{If} $1 == "1"',
      'WriteINIStr "' + quote(selection) + '" "Selection" "program" $INSTDIR',
      'SetErrorLevel 0',
      'Quit',
      '\u0024{EndIf}',
      'FunctionEnd',
      'Section',
      '!insertmacro customInstall',
      'SectionEnd',
    ].join('\r\n'),
  );
  const built = cp.spawnSync(compiler.path, ['-V2', script], {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, ...compiler.env },
  });
  if (built.status !== 0) throw new Error(built.stdout + '\n' + built.stderr);
  function configure(state = {}, previous = old) {
    fs.writeFileSync(stateFile, JSON.stringify(state));
    fs.writeFileSync(settings, '[Fixture]\r\noldProgram=' + previous + '\r\n');
  }
  const records = () =>
    fs.existsSync(attempts)
      ? fs.readFileSync(attempts, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : [];
  const results = [];
  async function run(name, args, expected, state = {}, previous = old) {
    configure(state, previous);
    const before = records().length;
    const child = cp.spawn(exe, args, {
      windowsVerbatimArguments: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid)
        cp.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
        });
    }, 30000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    }).finally(() => clearTimeout(timer));
    assert.equal(timedOut, false, name + ' stalled or opened a modal');
    assert.equal(code, expected, name + ' exit');
    const items = records().slice(before);
    results.push({ name, code, attempts: items.length });
    console.log('PASS ' + name);
    return items;
  }
  const data = path.join(area, 'valid-data');
  const args = ['/S', '/MODE=cpu', '/MODELS=', '/DATA=' + data, '/D=' + selected];
  const accepted = await run('E data without system-drive consent', args, 0);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].installRoot, selected);
  assert.equal(accepted[0].allowSystemDrive, false);
  assert.ok(fs.existsSync(path.join(selected, 'installation.json')));
  assert.equal(fs.existsSync(path.join(old, 'installation.json')), false);
  const system =
    (process.env.SystemDrive || 'C:') + '\\Immerse-Audit-Never-Created-' + path.basename(area);
  assert.equal(fs.existsSync(system), false);
  await run(
    'system data without consent fails once',
    ['/S', '/MODE=cpu', '/MODELS=', '/DATA=' + system, '/D=' + selected],
    1,
    { validationOnly: true },
  );
  await run(
    'system data with consent passes validation',
    ['/S', '/ALLOWC=1', '/MODE=cpu', '/MODELS=', '/DATA=' + system, '/D=' + selected],
    0,
    { validationOnly: true },
  );
  assert.equal(fs.existsSync(system), false);
  assert.equal(
    (await run('silent failure exits without retry dialog', args, 1, { fail: true })).length,
    1,
  );
  await run(
    'explicit directory with spaces overrides old directory',
    ['/S', '/SELECT=1', '/D=' + selected],
    0,
  );
  function selectedText() {
    let text = fs.readFileSync(selection, 'utf16le');
    if (!text.includes('program=')) text = fs.readFileSync(selection, 'utf8');
    return text;
  }
  assert.ok(selectedText().includes(selected));
  await run('default selects a non-system drive', ['/S', '/SELECT=1'], 0, {}, '');
  const defaultSelection = selectedText(),
    drive = /program=([A-Za-z]:)/.exec(defaultSelection)?.[1];
  assert.ok(drive && drive.toLowerCase() !== (process.env.SystemDrive || 'C:').toLowerCase());
  const log = path.join(root, '.runtime/audit-logs');
  fs.mkdirSync(log, { recursive: true });
  fs.writeFileSync(
    path.join(log, 'native-installer.json'),
    JSON.stringify(
      { area, exe, results, defaultSelection, systemDataCreated: fs.existsSync(system) },
      null,
      2,
    ),
  );
  if (!process.argv.includes('--interactive')) return;
  configure({ hold: true });
  const gui = cp.spawn(
    exe,
    ['/MODE=cpu', '/MODELS=', '/DATA=' + path.join(area, 'gui-data'), '/D=' + guiProgram],
    { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: false },
  );
  gui.unref();
  fs.writeFileSync(
    path.join(log, 'native-ui.json'),
    JSON.stringify({ area, exe, pid: gui.pid, stateFile, attempts }, null, 2),
  );
  console.log('NATIVE_GUI_READY ' + JSON.stringify({ area, pid: gui.pid }));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
