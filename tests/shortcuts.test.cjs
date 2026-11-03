const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('desktop and Android key-only events share actions without stealing modified keys', async () => {
  const { playerShortcut } = await import('../src/shared/shortcuts.ts');
  const key = (key, code = '', extra = {}) =>
    playerShortcut({
      key,
      code,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
      ...extra,
    });
  assert.equal(key(' ', 'Space'), 'toggle');
  assert.equal(key(' '), 'toggle');
  assert.equal(key('ArrowLeft'), 'back');
  assert.equal(key('ArrowRight'), 'forward');
  assert.equal(key('L'), 'loop');
  assert.equal(key('m'), 'marker');
  assert.equal(key('m', 'KeyM', { ctrlKey: true }), null);
  assert.equal(key('l', 'KeyL', { altKey: true }), null);
  assert.equal(key(' ', 'Space', { repeat: true }), null);
  assert.equal(key('ArrowRight', '', { repeat: true }), 'forward');
});
