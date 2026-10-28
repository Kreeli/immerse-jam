const { test } = require('node:test');
const assert = require('node:assert/strict');
test('score grid follows detected downbeats and keeps a pickup out of four-bar rows', async () => {
  const { timeline } = await import('../src/features/chords/chart.ts');
  const bars = timeline(
    10,
    { bpm: 120, meter: 4, firstDownbeat: 0.5, timingSource: 'detected' },
    [0.5, 1, 1.5, 2, 2.5, 3.1, 3.7, 4.3, 4.9, 5.5, 6.1, 6.7, 7.3, 7.9, 8.5, 9.1, 9.7],
  );
  assert.equal(bars[0].pickup, true);
  assert.deepEqual(
    bars.slice(0, 4).map((bar) => [bar.start, bar.end]),
    [
      [0, 0.5],
      [0.5, 2.5],
      [2.5, 4.9],
      [4.9, 7.3],
    ],
  );
  assert.equal(bars.at(-1).end, 10);
});
test('chords move to arbitrary slots, swap safely and never create a third slot', async () => {
  const { createChart, placeChord, updateSlot } = await import('../src/features/chords/chart.ts');
  const chart = createChart(undefined, 10, true, 'test');
  chart.bars[0].slots[0].label = 'C';
  chart.bars[2].slots.push({ id: 'second', label: 'G' });
  const moved = placeChord(chart, chart.bars[2].id, chart.bars[2].slots[0].id, 'C', {
    barId: chart.bars[0].id,
    slotId: chart.bars[0].slots[0].id,
  });
  assert.equal(moved.bars[2].slots[0].label, 'C');
  assert.equal(moved.bars[0].slots[0].label, null);
  const swapped = placeChord(moved, chart.bars[2].id, 'second', 'C', {
    barId: chart.bars[2].id,
    slotId: chart.bars[2].slots[0].id,
  });
  assert.deepEqual(
    swapped.bars[2].slots.map((slot) => slot.label),
    ['G', 'C'],
  );
  assert.equal(placeChord(swapped, chart.bars[2].id, null, 'F'), swapped);
  const cleared = updateSlot(swapped, chart.bars[2].id, 'second');
  assert.equal(cleared.bars[2].slots.length, 2);
  const removed = updateSlot(cleared, chart.bars[2].id, 'second', true);
  assert.equal(removed.bars[2].slots.length, 1);
  assert.deepEqual(
    removed.bars.map((bar) => [bar.start, bar.end]),
    chart.bars.map((bar) => [bar.start, bar.end]),
  );
});
test('retiming keeps manual chord content and local calibration stays monotone', async () => {
  const { createChart, retimeChart, calibrateBar } =
    await import('../src/features/chords/chart.ts');
  const chart = createChart(undefined, 10, true, 'test');
  chart.bars[0].slots[0].label = 'F#m7';
  const changed = retimeChart(
    chart,
    { bpm: 60, meter: 4, firstDownbeat: 0.25, timingSource: 'fixed' },
    10,
  );
  assert.equal(changed.bars[0].pickup, true);
  assert.equal(changed.bars[1].slots[0].label, 'F#m7');
  assert.equal(changed.bars.filter((bar) => !bar.pickup).length, chart.bars.length);
  const fixed = calibrateBar(chart, chart.bars[2].id, 4.2);
  assert.equal(fixed.bars[1].end, 4.2);
  assert.equal(fixed.bars[2].start, 4.2);
  assert.ok(fixed.bars.every((bar, index) => !index || bar.start >= fixed.bars[index - 1].end));
  assert.throws(() => calibrateBar(chart, chart.bars[2].id, 1));
});
test('recognition charts contain no more than two chords per measure', async () => {
  const { createChart } = await import('../src/features/chords/chart.ts');
  const analysis = {
    bpm: 120,
    beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    downbeat: 0,
    key: 'C',
    method: 'test',
    chords: Array.from({ length: 16 }, (_, i) => ({
      start: i * 0.25,
      end: (i + 1) * 0.25,
      label: ['C', 'G', 'Am', 'F'][i % 4],
      confidence: 1,
    })),
  };
  const chart = createChart(analysis, 4);
  assert.ok(chart.bars.every((bar) => bar.slots.length <= 2));
});
test('a second chord can start on a chosen beat rather than always half a bar', async () => {
  const { timeline, slotTime } = await import('../src/features/chords/chart.ts');
  const bar = timeline(12, { bpm: 60, meter: 3, firstDownbeat: 0, timingSource: 'fixed' })[0];
  bar.slots = [
    { id: 'a', label: 'C' },
    { id: 'b', label: 'G' },
  ];
  assert.equal(slotTime(bar, 1), 1);
  bar.splitAt = 2 / 3;
  assert.equal(slotTime(bar, 1), 2);
});
