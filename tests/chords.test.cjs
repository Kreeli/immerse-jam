const { test } = require('node:test');
const assert = require('node:assert/strict');

test('chord bars follow detected variable beats and retain sustained harmony', async () => {
  const { buildChordBars } = await import('../src/features/chords/chords.ts');
  const beats = [0, 0.5, 1, 1.5, 2, 2.6, 3.2, 3.8, 4.4, 5, 5.6, 6.2, 6.8];
  const bars = buildChordBars(
    {
      bpm: 120,
      beats,
      key: 'C',
      method: 'test',
      chords: [
        { start: 0, end: 4.4, label: 'C', confidence: 1 },
        { start: 4.4, end: 7.2, label: 'G', confidence: 1 },
      ],
    },
    7.2,
  );
  assert.deepEqual(
    bars.map((bar) => bar.start),
    [0, 2, 4.4, 6.8],
  );
  assert.equal(bars[0].segments[0].label, 'C');
  assert.equal(bars[1].segments[0].label, 'C');
  assert.equal(bars[2].segments[0].label, 'G');
  assert.equal(bars.at(-1).end, 7.2);
});

test('manual row moves preserve every measure and the source timeline', async () => {
  const { arrangeRows, moveBar } = await import('../src/features/chords/chords.ts');
  const ids = Array.from({ length: 12 }, (_, i) => `bar-${i}`);
  const rows = arrangeRows(ids, 4);
  const moved = moveBar(rows, 'bar-0', rows[1].id, 'bar-6');
  assert.equal(rows[0].bars.length, 4);
  assert.deepEqual(moved[1].bars, ['bar-4', 'bar-5', 'bar-0', 'bar-6', 'bar-7']);
  assert.deepEqual(moved.flatMap((row) => row.bars).sort(), ids.slice().sort());
  assert.deepEqual(arrangeRows(ids, 4, moved), moved);
});

test('old projects without beat data still produce four-beat bars', async () => {
  const { buildChordBars } = await import('../src/features/chords/chords.ts');
  const bars = buildChordBars({ bpm: 60, key: 'C', method: 'legacy', beats: [], chords: [] }, 10);
  assert.deepEqual(
    bars.map((bar) => [bar.start, bar.end]),
    [
      [0, 4],
      [4, 8],
      [8, 10],
    ],
  );
});
