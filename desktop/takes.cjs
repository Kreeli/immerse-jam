const { text: t } = require('./locale.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { atomicJson } = require('./store.cjs');
const { atempo } = require('./export-audio.cjs');
const ID = /^[a-f0-9-]{36}$/;
const PRACTICE_SLOTS = 2;
function validateTakes(takes) {
  if (!Array.isArray(takes) || takes.length > 1000) throw new Error('录音库数据无效');
  const seen = new Set();
  for (const t of takes) {
    if (!ID.test(t.id) || seen.has(t.id) || typeof t.name !== 'string' || t.name.length > 120)
      throw new Error('录音编号或名称无效');
    seen.add(t.id);
    for (const key of ['file', 'rawFile'])
      if (
        t[key] &&
        (typeof t[key] !== 'string' ||
          !t[key].replaceAll('\\', '/').startsWith(`recordings/${t.id}/`) ||
          t[key].includes('..'))
      )
        throw new Error('录音文件路径无效');
    if (
      !['instrument', 'mixed'].includes(t.mode) ||
      ![t.start || 0, t.offsetMs || 0, t.duration, t.gain, t.pan].every(Number.isFinite) ||
      t.duration < 0 ||
      t.duration > 14400 ||
      Math.abs(t.start || 0) > 14400 ||
      Math.abs(t.offsetMs || 0) > 3600000 ||
      t.gain < 0 ||
      t.gain > 1.5 ||
      Math.abs(t.pan) > 1
    )
      throw new Error('录音时间或混音设置无效');
  }
}
function validateSelection(p) {
  const selected = p.selectedTakeIds || [];
  if (
    !Array.isArray(selected) ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !(p.takes || []).some((t) => t.id === id)) ||
    (p.kind !== 'creation' && selected.length > PRACTICE_SLOTS)
  )
    throw new Error(`练习音轨最多加入 ${PRACTICE_SLOTS} 条录音`);
}
function wavHeader(frames, rate, channels = 2) {
  const out = Buffer.alloc(44),
    bytes = frames * channels * 4;
  out.write('RIFF');
  out.writeUInt32LE(36 + bytes, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(3, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * channels * 4, 28);
  out.writeUInt16LE(channels * 4, 32);
  out.writeUInt16LE(32, 34);
  out.write('data', 36);
  out.writeUInt32LE(bytes, 40);
  return out;
}
function wavDuration(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE')
      throw new Error('无效的录音 WAV');
    let offset = 12,
      rate = 0,
      align = 0;
    const size = fs.fstatSync(fd).size;
    while (offset + 8 <= size) {
      const chunk = Buffer.alloc(8);
      fs.readSync(fd, chunk, 0, 8, offset);
      const length = chunk.readUInt32LE(4),
        name = chunk.toString('ascii', 0, 4);
      if (name === 'fmt ') {
        const fmt = Buffer.alloc(16);
        fs.readSync(fd, fmt, 0, 16, offset + 8);
        rate = fmt.readUInt32LE(4);
        align = fmt.readUInt16LE(12);
      }
      if (name === 'data' && rate && align)
        return Math.min(length, size - offset - 8) / align / rate;
      offset += 8 + length + (length % 2);
    }
    throw new Error('录音 WAV 缺少音频数据');
  } finally {
    fs.closeSync(fd);
  }
}
function convert(ffmpeg, source, dest, tempo = 1, pitch = 0) {
  const factor = 2 ** (-pitch / 12);
  const filters = `aresample=48000,asetrate=${48000 * factor},aresample=48000,${atempo(1 / tempo / factor)}`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        source,
        '-vn',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-af',
        filters,
        '-c:a',
        'pcm_f32le',
        dest,
      ],
      { windowsHide: true },
    );
    let error = '';
    child.stderr.on('data', (b) => (error = (error + b).slice(-1500)));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(dest) : reject(new Error(error || '录音转换未完成')),
    );
  });
}
class Takes {
  constructor(store, ffmpeg) {
    this.store = store;
    this.ffmpeg = ffmpeg;
    this.sessions = new Map();
  }
  start(projectId, options) {
    if (this.sessions.size) throw new Error('已有录音正在进行');
    const p = this.store.get(projectId),
      id = crypto.randomUUID();
    if (
      ![
        options.anchorTime,
        options.anchorPosition,
        options.tempo,
        options.pitch,
        options.latencyMs,
        options.sampleRate,
      ].every(Number.isFinite) ||
      options.tempo < 0.25 ||
      options.tempo > 2 ||
      Math.abs(options.pitch) > 12 ||
      Math.abs(options.latencyMs) > 2000 ||
      ![44100, 48000, 88200, 96000].includes(options.sampleRate) ||
      !['instrument', 'mixed'].includes(options.mode)
    )
      throw new Error('录音设置无效');
    const relative = `recordings/${id}`,
      folder = this.store.asset(projectId, relative);
    fs.mkdirSync(folder, { recursive: true });
    const meta = {
        ...options,
        id,
        projectId,
        relative,
        start: options.anchorPosition,
        frames: 0,
        sequence: 0,
        createdAt: new Date().toISOString(),
      },
      fd = fs.openSync(path.join(folder, 'raw.wav'), 'w');
    fs.writeSync(fd, wavHeader(0, options.sampleRate));
    atomicJson(path.join(folder, 'pending.json'), meta);
    this.sessions.set(id, { ...meta, fd });
    return { id };
  }
  append(id, sequence, contextTime, bytes) {
    const s = this.sessions.get(id);
    if (!s) throw new Error('录音已停止');
    const buffer = Buffer.from(bytes);
    if (
      sequence !== s.sequence ||
      buffer.length % 8 ||
      buffer.length > 1024 * 1024 ||
      !Number.isFinite(contextTime)
    )
      throw new Error('录音片段顺序或格式错误');
    for (let offset = 0; offset < buffer.length; offset += 4)
      if (!Number.isFinite(buffer.readFloatLE(offset))) throw new Error('录音包含无效采样');
    if (s.frames + buffer.length / 8 > s.sampleRate * 3600)
      throw new Error('本次录音已达到一小时，请保存后继续下一次');
    if (!s.frames) {
      s.start =
        s.anchorPosition + (contextTime - s.anchorTime) * s.tempo - (s.latencyMs * s.tempo) / 1000;
      atomicJson(this.store.asset(s.projectId, s.relative + '/pending.json'), {
        ...s,
        fd: undefined,
      });
    }
    fs.writeSync(s.fd, buffer, 0, buffer.length, 44 + s.frames * 8);
    s.frames += buffer.length / 8;
    s.sequence++;
    return s.frames;
  }
  async finish(id) {
    const s = this.sessions.get(id);
    if (!s) throw new Error('录音已停止');
    this.sessions.delete(id);
    try {
      fs.writeSync(s.fd, wavHeader(s.frames, s.sampleRate), 0, 44, 0);
    } finally {
      fs.closeSync(s.fd);
    }
    const raw = this.store.asset(s.projectId, s.relative + '/raw.wav');
    if (s.frames < s.sampleRate * 0.05) {
      const folder = this.store.asset(s.projectId, s.relative);
      if (ID.test(s.id) && path.dirname(folder) === this.store.asset(s.projectId, 'recordings'))
        fs.rmSync(folder, { recursive: true, force: true });
      return this.store.get(s.projectId);
    }
    return this.commit(s, raw);
  }
  async commit(meta, raw) {
    const file = meta.relative + '/track.wav',
      target = this.store.asset(meta.projectId, file);
    await convert(this.ffmpeg, raw, target, meta.tempo, meta.pitch);
    const duration = wavDuration(target);
    if (duration < 0.02 || duration > 14400) throw new Error('录音长度超出范围');
    const p = this.store.get(meta.projectId),
      take = {
        id: meta.id,
        name: t('{0}录音 {1}', [
          t(meta.mode === 'mixed' ? '混音' : '演奏'),
          (p.takes || []).length + 1,
        ]),
        file,
        rawFile: path.relative(this.store.dir(p.id), raw).replaceAll('\\', '/'),
        start: Math.round(meta.start * 1e6) / 1e6,
        offsetMs: 0,
        duration,
        gain: 1,
        pan: 0,
        mute: meta.mode === 'mixed' && p.kind !== 'practice',
        solo: false,
        mode: meta.mode,
        createdAt: meta.createdAt,
        recordedTempo: meta.tempo,
        recordedPitch: meta.pitch,
        inputLabel: meta.inputLabel || '',
        latencyMs: meta.latencyMs,
      };
    p.takes = [...(p.takes || []), take];
    if (p.kind !== 'creation' && (p.selectedTakeIds || []).length < PRACTICE_SLOTS)
      p.selectedTakeIds = [...(p.selectedTakeIds || []), take.id];
    atomicJson(this.store.asset(p.id, meta.relative + '/take.json'), take);
    const saved = this.store.save(p);
    fs.rmSync(this.store.asset(p.id, meta.relative + '/pending.json'), { force: true });
    return saved;
  }
  async import(projectId, files, position = 0, mode = 'instrument') {
    if (
      !Number.isFinite(position) ||
      Math.abs(position) > 14400 ||
      !['instrument', 'mixed'].includes(mode)
    )
      throw new Error('导入位置无效');
    for (const source of files) {
      const id = crypto.randomUUID(),
        relative = `recordings/${id}`,
        folder = this.store.asset(projectId, relative);
      fs.mkdirSync(folder, { recursive: true });
      const raw = path.join(folder, 'source' + path.extname(source).toLowerCase());
      fs.copyFileSync(source, raw);
      await this.commit(
        {
          id,
          projectId,
          relative,
          start: position,
          tempo: 1,
          pitch: 0,
          mode,
          latencyMs: 0,
          createdAt: new Date().toISOString(),
          inputLabel: t('导入文件'),
        },
        raw,
      );
      const p = this.store.get(projectId),
        take = p.takes.find((item) => item.id === id);
      take.name = path.basename(source, path.extname(source)).slice(0, 120);
      this.store.save(p);
    }
    return this.store.get(projectId);
  }
  select(projectId, ids) {
    const p = this.store.get(projectId);
    p.selectedTakeIds = ids;
    validateSelection(p);
    return this.store.save(p);
  }
  remove(projectId, id) {
    const p = this.store.get(projectId),
      take = (p.takes || []).find((t) => t.id === id);
    if (!take) throw new Error('录音不存在');
    p.takes = p.takes.filter((t) => t.id !== id);
    p.selectedTakeIds = (p.selectedTakeIds || []).filter((t) => t !== id);
    const folder = this.store.asset(projectId, `recordings/${id}`);
    const tombstone = this.store.asset(projectId, `recordings/.deleted-${id}`);
    const moved = ID.test(id) && fs.existsSync(folder);
    if (moved) fs.renameSync(folder, tombstone);
    let committed = false;
    try {
      const saved = this.store.save(p);
      committed = true;
      try {
        if (moved) fs.rmSync(tombstone, { recursive: true, force: true });
      } catch {}
      return saved;
    } finally {
      if (!committed && moved) fs.renameSync(tombstone, folder);
    }
  }
  async recover(projectId) {
    const root = this.store.asset(projectId, 'recordings');
    if (!fs.existsSync(root)) return this.store.get(projectId);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name) || this.sessions.has(entry.name)) continue;
      const pending = path.join(root, entry.name, 'pending.json');
      if (!fs.existsSync(pending)) continue;
      const meta = JSON.parse(fs.readFileSync(pending, 'utf8'));
      if (
        meta.projectId !== projectId ||
        meta.id !== entry.name ||
        meta.relative !== `recordings/${entry.name}`
      )
        throw new Error('未完成录音的清单无效');
      if ((this.store.get(projectId).takes || []).some((t) => t.id === meta.id)) {
        fs.rmSync(pending, { force: true });
        continue;
      }
      const raw = path.join(root, entry.name, 'raw.wav'),
        frames = Math.floor((fs.statSync(raw).size - 44) / 8);
      if (frames < 1) continue;
      const fd = fs.openSync(raw, 'r+');
      try {
        fs.writeSync(fd, wavHeader(frames, meta.sampleRate), 0, 44, 0);
      } finally {
        fs.closeSync(fd);
      }
      await this.commit(meta, raw);
    }
    return this.store.get(projectId);
  }
  close() {
    for (const s of this.sessions.values()) {
      try {
        fs.writeSync(s.fd, wavHeader(s.frames, s.sampleRate), 0, 44, 0);
        fs.closeSync(s.fd);
      } catch {}
    }
    this.sessions.clear();
  }
}
module.exports = {
  Takes,
  validateTakes,
  validateSelection,
  wavHeader,
  wavDuration,
  convert,
  PRACTICE_SLOTS,
};
