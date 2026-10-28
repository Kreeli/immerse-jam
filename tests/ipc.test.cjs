const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript');
test('every desktop request is covered by the shared preload contract', () => {
  const declared = new Set(require('../shared/ipc-methods.json')),
    registered = new Set();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.cjs')) {
        const source = ts.createSourceFile(
          file,
          fs.readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.JS,
        );
        function visit(node) {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'handle' &&
            ts.isStringLiteral(node.arguments[0])
          )
            registered.add(node.arguments[0].text);
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  walk('desktop');
  assert.deepEqual([...registered].sort(), [...declared].sort());
});
