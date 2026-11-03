const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('wave history keys invalidate media and mix changes but retain cosmetic edits', async () => {
  const { waveHistoryKey: key } = await import('../src/audio/wave-history.ts');
  const p = {
      id: 'project',
      createdAt: 'now',
      title: 'Before',
      duration: 10,
      practice: { master: 0.8 },
    },
    tracks = [{ id: 'vocals', file: 'a.wav', gain: 1, pan: 0, mute: false, solo: false }];
  const sig = (project = p, items = tracks) => key(project, items, 'mix', 0, 10, 0.8);
  assert.equal(sig(), sig({ ...p, title: 'After', description: 'Note' }));
  assert.notEqual(sig(), sig({ ...p, importRevision: 'new' }));
  assert.notEqual(sig(), sig(p, [{ ...tracks[0], gain: 0.5 }]));
  assert.notEqual(sig(), sig(p, [{ ...tracks[0], file: 'b.wav' }]));
});
test('wave history bounds peak memory and evicts the least recently used entry', async () => {
  const { WaveHistory } = await import('../src/audio/wave-history.ts');
  const h = new WaveHistory(5, 2);
  h.set('a', [1, 2]);
  h.set('b', [3, 4]);
  assert.deepEqual(h.get('a'), [1, 2]);
  h.set('c', [5, 6]);
  assert.equal(h.get('b'), null);
  h.set('too-big', [1, 2, 3, 4, 5, 6]);
  assert.equal(h.get('too-big'), null);
  assert.deepEqual(h.get('a'), [1, 2]);
  h.clear();
  assert.equal(h.get('a'), null);
});
