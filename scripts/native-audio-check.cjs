// Opens output devices with a short silent stream. No input capture or system-volume changes.
const fs = require('node:fs'),
  path = require('node:path');
const { NativeAudio, hostCommand } = require('../desktop/native-audio.cjs');
const output = path.resolve('.runtime/settings-followup-20261105');
fs.mkdirSync(output, { recursive: true });
const events = [];
const service = new NativeAudio({
  ...hostCommand(process.cwd(), false),
  emit: (e) => events.push(e),
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const info = await service.info();
  const results = [];
  const trials = ['wasapi', 'wasapi-low-latency', 'wasapi-exclusive', 'directsound', 'asio'].map(
    (backend) => ({ backend, sampleRate: 48000 }),
  );
  trials.push({ backend: 'wasapi', sampleRate: 44100 });
  for (const { backend, sampleRate } of trials) {
    const devices = info.devices.filter((d) => d.backend === backend);
    const device = devices.find((d) => d.isDefault) || devices[0];
    if (!device) {
      results.push({ backend, opened: false, reason: 'No driver/device enumerated' });
      continue;
    }
    const before = events.length;
    try {
      const ready = await service.start({ backend, sampleRate, deviceId: device.deviceId });
      for (let i = 0; i < 16; i++) {
        await service.write({ streamId: ready.streamId, samples: new Float32Array(1024).buffer });
        await sleep(11);
      }
      await sleep(60);
      const failures = events.slice(before).filter((e) => e.type === 'error');
      if (failures.length) throw new Error(failures.map((e) => e.message).join('; '));
      results.push({
        backend,
        opened: true,
        sampleRate,
        deviceSampleRate: ready.deviceSampleRate,
        deviceBufferFrames: ready.deviceBufferFrames,
        pcm: 'silence',
      });
    } catch (error) {
      results.push({ backend, opened: false, sampleRate, reason: error.message });
    } finally {
      await service.stop();
      await sleep(250);
    }
  }
  fs.writeFileSync(
    path.join(output, 'native-device-check.json'),
    JSON.stringify({ enumerated: info, results }, null, 2),
  );
  console.log('NATIVE_DEVICE_CHECK', JSON.stringify(results));
  if (!results.some((r) => r.opened)) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => service.stop());
