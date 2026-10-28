const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript');
const catalog = require('../shared/locales/en.json');
const errors = [];
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
}
for (const file of walk('src').filter((file) => /\.tsx?$/.test(file))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'tr' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const key = node.arguments[0].text;
      if (!catalog[key]) errors.push(file + ': missing translation ' + key);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const [key, value] of Object.entries(catalog)) {
  if (/[\u4e00-\u9fff]/.test(value) && key !== '简体中文')
    errors.push('English contains untranslated text: ' + key);
  const fields = (text) => [...new Set(text.match(/\{\d+\}/g) || [])].sort().join(',');
  if (fields(key) !== fields(value)) errors.push('Placeholder mismatch: ' + key);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Translation catalog checked:', Object.keys(catalog).length, 'entries');
