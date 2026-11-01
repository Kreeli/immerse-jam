const fs = require('node:fs'),
  crypto = require('node:crypto');
// Test-only binary counterpart to the native PCM endpoints. Small fixture media only.
class StreamFixture {
  constructor(store) {
    this.store = store;
    this.sessions = new Map();
    this.waves = new Map();
    this.requests = [];
  }
  call(method, data) {
    if (method === 'android-stream-open') {
      const id = crypto.randomUUID();
      const tracks = data.tracks.map((t) => {
        const wav = fs.readFileSync(this.store.asset(data.id, t.file));
        const rate = wav.readUInt32LE(24),
          frames = (wav.length - 44) / 4;
        return { ...t, wav, rate, frames, duration: frames / rate };
      });
      this.sessions.set(id, tracks);
      return { id, tracks: tracks.map(({ id, duration }) => ({ id, duration })) };
    }
    if (method === 'android-stream-wave') {
      const key = crypto.randomUUID();
      this.waves.set(key, data);
      return { url: `/stream/${data.session}/wave/${key}` };
    }
    if (method === 'android-stream-close') {
      this.sessions.delete(data.session);
      return true;
    }
    throw new Error(method);
  }
  sample(track, time, c) {
    const pos = time * track.rate,
      i = Math.floor(pos),
      fraction = pos - i;
    const at = (n) =>
      n >= 0 && n < track.frames ? track.wav.readInt16LE(44 + n * 4 + c * 2) / 32768 : 0;
    return at(i) * (1 - fraction) + at(i + 1) * fraction;
  }
  serve(path, res) {
    const parts = path.split('/'),
      tracks = this.sessions.get(parts[2]);
    if (!tracks) throw new Error('Missing PCM session');
    let values;
    if (parts[3] === 'pcm') {
      const track = tracks[Number(parts[4])],
        first = Number(parts[5]);
      const count = Math.min(Number(parts[6] || 48002), Math.ceil(track.duration * 48000) - first);
      this.requests.push({ first, count });
      values = new Float32Array(count * 2);
      for (let i = 0; i < count; i++)
        for (let c = 0; c < 2; c++) values[i * 2 + c] = this.sample(track, (first + i) / 48000, c);
    } else {
      const d = this.waves.get(parts[4]);
      this.waves.delete(parts[4]);
      values = new Float32Array(Math.ceil(d.duration * 100));
      for (let bin = 0; bin < values.length; bin++) {
        let peak = 0;
        for (let k = 0; k < 16; k++) {
          let l = 0,
            r = 0;
          for (const t of d.tracks) {
            const track = tracks.find((track) => track.id === t.id),
              time = d.origin + bin / 100 + k / 1600 - (t.start || 0);
            const a = this.sample(track, time, 0),
              b = this.sample(track, time, 1),
              pan = t.pan || 0,
              gain = t.gain;
            l +=
              (pan <= 0
                ? a + Math.cos(((pan + 1) * Math.PI) / 2) * b
                : Math.cos((pan * Math.PI) / 2) * a) * gain;
            r +=
              (pan <= 0
                ? Math.sin(((pan + 1) * Math.PI) / 2) * b
                : b + Math.sin((pan * Math.PI) / 2) * a) * gain;
          }
          peak = Math.max(peak, Math.abs(l) * d.master, Math.abs(r) * d.master);
        }
        values[bin] = peak;
      }
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end(Buffer.from(values.buffer));
  }
}
module.exports = { StreamFixture };
