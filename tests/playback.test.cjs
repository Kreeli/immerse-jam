const { test } = require('node:test');
const assert = require('node:assert/strict');
test('multi-track listening remains available and the last action clears the opposing state', async () => {
  const { toggleTrackState } = await import('../src/audio/track-state.ts');
  let tracks = ['vocals', 'drums', 'bass'].map((id) => ({
    id,
    name: id,
    file: id + '.wav',
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
  }));
  tracks = toggleTrackState(tracks, 'vocals', 'listen');
  tracks = toggleTrackState(tracks, 'drums', 'listen');
  assert.equal(tracks.filter((track) => track.solo).length, 2);
  tracks = toggleTrackState(tracks, 'vocals', 'close');
  assert.equal(tracks[0].mute, true);
  assert.equal(tracks[0].solo, false);
  assert.equal(tracks[1].solo, true);
  tracks = toggleTrackState(tracks, 'vocals', 'listen');
  assert.equal(tracks[0].mute, false);
  assert.equal(tracks[0].solo, true);
  tracks = toggleTrackState(tracks, 'bass', 'close');
  tracks = toggleTrackState(tracks, 'vocals', 'close');
  assert.equal(tracks.filter((track) => track.mute).length, 2);
  assert.ok(tracks.every((track) => !(track.mute && track.solo)));
});
test('fixed waveform bins preserve transients and silence across the recording', async () => {
  const { fixedEnvelope } = await import('../src/audio/envelope.ts');
  const peaks = [0, 0, 1, 0.1, 0, 0.2, 0.7, 0, 0, 0.3, 0, 0];
  const result = fixedEnvelope(peaks, 12, 6, 2);
  assert.deepEqual(result.values, [1, 0.2, 0.7, 0.3]);
  assert.equal(result.step, 3);
  assert.deepEqual(fixedEnvelope(new Array(20).fill(0), 10, 5, 5).values, new Array(10).fill(0));
});
test('background peak extraction preserves stereo peaks without detaching input samples', async () => {
  const { calculatePeaks } = await import('../src/audio/waveform-worker.js');
  const left = new Float32Array([0, 0.8, 0, 0]),
    right = new Float32Array([-0.6, 0, 0, 0.9]);
  const result = calculatePeaks([left, right], 4, 4);
  assert.equal(result.length, 4);
  assert.ok(Math.abs(result[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(result[1] - 0.8) < 1e-6);
  assert.ok(Math.abs(result[3] - 0.9) < 1e-6);
  assert.equal(left.length, 4);
});
