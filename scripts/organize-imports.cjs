const ts = require('typescript'),
  fs = require('node:fs'),
  path = require('node:path');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config,
  parsed = ts.parseJsonConfigFileContent(config, ts.sys, process.cwd());
const files = parsed.fileNames.filter((file) => /(^|\/)src\//.test(file.replaceAll('\\', '/'))),
  versions = new Map(files.map((file) => [file, '0']));
const host = {
  getScriptFileNames: () => parsed.fileNames,
  getScriptVersion: (file) => versions.get(file) || '0',
  getScriptSnapshot: (file) =>
    fs.existsSync(file) ? ts.ScriptSnapshot.fromString(fs.readFileSync(file, 'utf8')) : undefined,
  getCurrentDirectory: () => process.cwd(),
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const service = ts.createLanguageService(host);
for (const file of files) {
  const changes = service.organizeImports({ type: 'file', fileName: file }, {}, {});
  for (const change of changes) {
    let text = fs.readFileSync(change.fileName, 'utf8');
    for (const edit of change.textChanges.sort((a, b) => b.span.start - a.span.start))
      text =
        text.slice(0, edit.span.start) +
        edit.newText +
        text.slice(edit.span.start + edit.span.length);
    fs.writeFileSync(change.fileName, text);
    versions.set(change.fileName, String(Number(versions.get(change.fileName) || 0) + 1));
  }
}
service.dispose();
console.log('Imports organized:', files.length, 'files');
