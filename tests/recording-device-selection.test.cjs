const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('missing saved devices require confirmation and discard the old route latency', async () => {
  const { reconcileRecordingDevices } =
    await import('../src/features/recording/device-selection.ts');
  const settings = {
    inputDeviceId: 'communications',
    outputDeviceId: 'old-output',
    latencyMs: 207,
    channel: 'stereo',
    mode: 'mixed',
  };
  const devices = [
    { kind: 'audioinput', deviceId: 'default', label: 'Default microphone' },
    { kind: 'audiooutput', deviceId: 'default', label: 'Default output' },
  ];
  const result = reconcileRecordingDevices(settings, devices);
  assert.equal(result.changed, true);
  assert.deepEqual(result.settings, {
    ...settings,
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    latencyMs: 0,
  });
  assert.equal(settings.latencyMs, 207);
  assert.equal(reconcileRecordingDevices(settings, []).changed, false);
  assert.equal(
    reconcileRecordingDevices(
      settings,
      devices.map((d) => ({ ...d, label: '' })),
    ).changed,
    false,
  );
  assert.equal(
    reconcileRecordingDevices(settings, [
      ...devices,
      { kind: 'audioinput', deviceId: 'communications', label: 'Communications' },
      { kind: 'audiooutput', deviceId: 'old-output', label: 'USB' },
    ]).changed,
    false,
  );
});
