const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { downloadModel: download } = require('./runtime.cjs');
const { contained, atomicJson } = require('./store.cjs');
const repo =
  'https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/';
const msst = 'https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download/';
const six = ['bass', 'drums', 'other', 'vocals', 'guitar', 'piano'];
const catalog = [
  {
    id: 'roformer-sw',
    name: 'BS RoFormer SW · 六轨',
    description: '电脑端质量优先，约 670 MB；六种声部一次分离。',
    adapter: 'MDXC',
    file: 'BS-Roformer-SW.ckpt',
    sha256: '24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e',
    config: 'BS-Roformer-SW.yaml',
    configSha256: 'b558996f1e25eb48798bd6502505a5de94c4f966d6edfb1a0420f06cc40b501a',
    stems: six,
    sampleRate: 44100,
    modelUrl: repo + 'BS-Roformer-SW.ckpt',
    configUrl: repo + 'BS-Roformer-SW.yaml',
    license: '权重来源为公开社区发布，权重不随安装包分发',
    recommended: true,
  },
  {
    id: 'demucs-6',
    name: 'HT Demucs · 六轨兼容',
    description: '成熟兼容备选，约 52 MB；钢琴分轨可能有串音。',
    adapter: 'Demucs',
    file: 'htdemucs_6s.yaml',
    sha256: '207405151270af8fd81c2373c25d27950916682ac91dca7884a11ce13dad6f58',
    stems: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'],
    sampleRate: 44100,
    modelUrl:
      'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/htdemucs_6s.yaml',
    extraFiles: [
      {
        file: '5c90dfd2-34c22ccb.th',
        sha256: '34c22ccb381c6f9fdbf324f04e1e2fe21aaaf293f5ded163a162697ff9a02ddd',
        url: 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/5c90dfd2-34c22ccb.th',
      },
    ],
    license: 'MIT',
  },
  {
    id: 'scnet-xl',
    name: 'SCNet XL IHF · 高质量四轨',
    description: '较新的高质量四轨模型；适合鼓、贝斯与人声练习。',
    adapter: 'scnet',
    file: 'model_scnet_ep_36_sdr_10.0891.ckpt',
    config: 'config_musdb18_scnet_xl_more_wide_v5.yaml',
    stems: ['drums', 'bass', 'other', 'vocals'],
    sampleRate: 44100,
    modelUrl: msst + 'v1.0.15/model_scnet_ep_36_sdr_10.0891.ckpt',
    configUrl: msst + 'v1.0.15/config_musdb18_scnet_xl_more_wide_v5.yaml',
    license: 'MIT',
  },
  {
    id: 'scnet-small',
    name: 'SCNet Small · 轻量四轨',
    description: '轻量兼容候选；移动端需另行转换和实测。',
    adapter: 'scnet',
    file: 'scnet_checkpoint_musdb18.ckpt',
    sha256: '1bc0d1abb20bfdf966dcd07637bafd03e4bc13653d09ef18bc9b3e342eafe2aa',
    config: 'config_musdb18_scnet.yaml',
    configSha256: '19103def86d549701f824804fc5f3d244e8e8ccd4032da6ee9d5b4f2a5f2da16',
    stems: ['drums', 'bass', 'other', 'vocals'],
    sampleRate: 44100,
    modelUrl: msst + 'v.1.0.6/scnet_checkpoint_musdb18.ckpt',
    configUrl: msst + 'v.1.0.6/config_musdb18_scnet.yaml',
    license: 'MIT',
  },
  {
    id: 'karaoke',
    name: 'Mel-Band RoFormer · 主唱／和声',
    description: '歌手模式第二阶段，先取人声，再拆主唱与和声。',
    adapter: 'MDXC',
    file: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
    sha256: '1de20d459332fe8869aeb01327a31df0032262706e1365114e852dc271779813',
    config: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956_config.yaml',
    configSha256: 'b35077d94861f068097cce1a5e54633c055e7dcc2613eade4e4dc7c7c9c3f48b',
    stems: ['lead_vocals', 'backing_vocals'],
    outputMap: {
      Vocals: 'lead_vocals',
      Instrumental: 'backing_vocals',
      vocals: 'lead_vocals',
      instrumental: 'backing_vocals',
    },
    sampleRate: 44100,
    modelUrl: repo + 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
    configUrl: repo + 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956_config.yaml',
    license: '公开社区权重，下载使用；不随安装包分发',
  },
  {
    id: 'guitar-lead',
    name: 'Mel-Band RoFormer · 主奏／节奏吉他',
    description: '吉他手模式第二阶段，约 337 MB。',
    adapter: 'MDXC',
    file: 'mbr_lead_rhythm_guitar_listra92.ckpt',
    sha256: 'b3c47bca33609ca1ba0bb2d2076410bfd1eb941b051b72afc1f3e24d12b17eef',
    config: 'mbr_lead_rhythm_guitar_listra92_config.yaml',
    configSha256: 'a26685bc9ab10aab4dc153b74ec3559f1b4bd2251d129a13b6b22fe3a27d382d',
    stems: ['lead', 'rhythm'],
    outputMap: {
      Lead: 'lead',
      Rhythm: 'rhythm',
      lead: 'lead',
      rhythm: 'rhythm',
      Instrumental: 'rhythm',
    },
    sampleRate: 44100,
    modelUrl:
      'https://huggingface.co/noblebarkrr/mvsepless_resources/resolve/be0be1959ec64b38278c00e23a7057e83138985c/mel_band_roformer/mbr_lead_rhythm_guitar_listra92.ckpt',
    configUrl:
      'https://huggingface.co/noblebarkrr/mvsepless_resources/resolve/be0be1959ec64b38278c00e23a7057e83138985c/mel_band_roformer/mbr_lead_rhythm_guitar_listra92_config.yaml',
    license: '公开社区权重，训练来源与分发条件待进一步核实；不随安装包分发',
  },
  {
    id: 'beat-this',
    name: 'Beat This! · 节拍与 BPM',
    description: '识别节拍与小节首拍，约 77 MB；首次分析自动下载，支持本机显卡和 CPU。',
    adapter: 'BeatThis',
    file: 'final0.ckpt',
    sha256: '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331',
    stems: [],
    sampleRate: 22050,
    modelUrl: 'https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt',
    license: 'MIT（CPJKU Beat This!）',
  },
];
function fileHash(file) {
  const hash = crypto.createHash('sha256'),
    fd = fs.openSync(file, 'r'),
    buffer = Buffer.allocUnsafe(65536);
  try {
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, n));
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}
function validateManifest(m) {
  if (typeof m.file !== 'string' || !m.file) throw new Error('模型清单缺少 file');
  if (
    m.chunkSeconds !== undefined &&
    (!Number.isFinite(m.chunkSeconds) || m.chunkSeconds < 0.25 || m.chunkSeconds > 30)
  )
    throw new Error('模型片段长度应在 0.25–30 秒之间');
  if (m.schemaVersion !== 1 || !['onnx-waveform', 'scnet', 'MDXC'].includes(m.adapter))
    throw new Error('只支持带清单的 waveform ONNX、SCNet、RoFormer 模型');
  if (
    !m.name ||
    !Array.isArray(m.stems) ||
    m.stems.length < 1 ||
    m.stems.length > 32 ||
    new Set(m.stems).size !== m.stems.length ||
    m.stems.some((s) => !/^\w{1,40}$/.test(s))
  )
    throw new Error('声部名称缺失、重复或不合法');
  if (![22050, 32000, 44100, 48000].includes(m.sampleRate)) throw new Error('不支持此模型采样率');
  for (const k of ['file', 'config'])
    if (m[k] && (path.basename(m[k]) !== m[k] || m[k].includes('..')))
      throw new Error('模型文件必须位于同一目录');
  if (!/^[a-f0-9]{64}$/i.test(m.sha256 || '')) throw new Error('模型清单需要 SHA-256 校验值');
  if (m.adapter === 'onnx-waveform' && !m.file.endsWith('.onnx'))
    throw new Error('ONNX 文件扩展名不匹配');
  if (m.adapter !== 'onnx-waveform' && !m.config) throw new Error('此模型需要 YAML 配置');
  return m;
}
class Models {
  constructor(base) {
    this.base = path.join(base, 'models');
    this.inflight = new Map();
    fs.mkdirSync(this.base, { recursive: true });
  }
  list() {
    const custom = fs
      .readdirSync(this.base, { withFileTypes: true })
      .filter((x) => x.isDirectory() && x.name.startsWith('custom-'))
      .flatMap((x) => {
        try {
          return [JSON.parse(fs.readFileSync(path.join(this.base, x.name, 'manifest.json')))];
        } catch {
          return [];
        }
      });
    return [...catalog, ...custom].map((m) => ({
      ...m,
      installed: fs.existsSync(path.join(this.base, m.id, 'verified.json')),
    }));
  }
  get(id) {
    const m = this.list().find((x) => x.id === id);
    if (!m) throw new Error('模型不存在');
    return m;
  }
  async ensure(id, onEvent) {
    let task = this.inflight.get(id);
    if (!task) {
      task = { listeners: new Set() };
      this.inflight.set(id, task);
      task.promise = Promise.resolve()
        .then(() =>
          this.downloadFiles(id, (event) => {
            for (const listener of task.listeners) listener(event);
          }),
        )
        .finally(() => this.inflight.delete(id));
    }
    if (onEvent) task.listeners.add(onEvent);
    try {
      return await task.promise;
    } finally {
      task.listeners.delete(onEvent);
    }
  }
  async downloadFiles(id, onEvent) {
    const m = this.get(id),
      dir = path.join(this.base, m.id);
    fs.mkdirSync(dir, { recursive: true });
    if (m.custom && !m.installed) throw new Error('自定义模型尚未通过试运行');
    if (!m.custom) {
      for (const f of [
        { file: m.file, url: m.modelUrl, sha256: m.sha256 },
        ...(m.config ? [{ file: m.config, url: m.configUrl, sha256: m.configSha256 }] : []),
        ...(m.extraFiles || []),
      ]) {
        onEvent?.({ type: 'progress', message: `准备 ${m.name}：${f.file}` });
        await (m.adapter === 'BeatThis' ? require('./runtime.cjs').download : download)(
          f.url,
          path.join(dir, f.file),
          f.sha256,
          onEvent,
        );
      }
      atomicJson(path.join(dir, 'verified.json'), { downloaded: true });
    }
    return { ...m, directory: dir };
  }
  import(folder) {
    const m = validateManifest(
        JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')),
      ),
      source = contained(folder, m.file);
    const sha = fileHash(source);
    if (sha !== m.sha256) throw new Error('模型校验值不匹配');
    const id = 'custom-' + sha.slice(0, 16),
      dir = path.join(this.base, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const file of [m.file, m.config].filter(Boolean))
      fs.copyFileSync(contained(folder, file), path.join(dir, file));
    const manifest = { ...m, id, custom: true, directory: dir };
    atomicJson(path.join(dir, 'manifest.json'), manifest);
    return manifest;
  }
}
module.exports = { Models, validateManifest, catalog };
