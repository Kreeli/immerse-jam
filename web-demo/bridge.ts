import { merge } from '@project-patch';
type Data = Record<string, any>;
const clone = <T>(value: T): T => structuredClone(value);
const names = ['vocals', 'drums', 'bass', 'piano', 'guitar', 'other'];
const makeId = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const tracks = () =>
  names.map((name) => ({
    id: makeId(),
    name,
    file: name + '.mp3',
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
  }));
export const models = [
  {
    id: 'roformer-sw',
    name: 'BS RoFormer SW · 六轨',
    description: '默认六轨模型 · 本页模拟分析，读取预先分离的排练素材',
    adapter: 'roformer',
    stems: names,
    sampleRate: 44100,
    installed: true,
    recommended: true,
    license: '模型遵循各自许可',
  },
  {
    id: 'htdemucs',
    name: 'HT Demucs · 六轨',
    description: '模型切换流程演示 · 试听仍使用同一组预置六轨，不代表不同模型的音质对比',
    adapter: 'demucs',
    stems: names,
    sampleRate: 44100,
    installed: false,
    license: '模型遵循各自许可',
  },
  {
    id: 'beat-this',
    name: 'Beat This! · 节拍',
    description: '节拍识别流程演示 · 网页不运行推理',
    adapter: 'BeatThis',
    stems: [],
    sampleRate: 22050,
    installed: true,
    license: 'MIT',
  },
];
const initial = () => ({
  schemaVersion: 1,
  id: 'fabulous-demo',
  title: 'Fabulous · 排练片段',
  artist: 'BLU-SWING · 60 秒演示素材',
  original: 'original.mp3',
  playback: 'original.mp3',
  duration: 60,
  tracks: [],
  results: [],
  activeResultId: null,
  attachments: [],
  bookmarks: [],
  takes: [],
  selectedTakeIds: [],
  chordCharts: [],
  practice: {
    tempo: 1,
    pitch: 0,
    master: 0.8,
    eq: [0, 0, 0],
    metronome: false,
    metronomeVolume: 0.3,
    countIn: false,
  },
  starred: false,
  notes: '',
  createdAt: now(),
  updatedAt: now(),
});
let projects: Data[] = [initial()];
let folders: Data[] = [];
const events = new Set<(event: Data) => void>();
const jobs = new Map<string, number>();
const takes = new Map<string, Data>();
const blobs = new Set<string>();
let disposed = false;
let opened = false;
const emit = (event: Data) => events.forEach((callback) => callback(clone(event)));
const notify = (message: string) =>
  window.dispatchEvent(new CustomEvent('demo-notice', { detail: message }));
const get = (id: string) => {
  const p = projects.find((p) => p.id === id);
  if (!p) throw new Error('演示项目已删除，请重置演示。');
  return p;
};
const save = (p: Data) => {
  p.updatedAt = now();
  projects = [p, ...projects.filter((item) => item.id !== p.id)];
  return clone(p);
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const audioUrl = (name: string) =>
  new URL('../assets/audio/fabulous-rehearsal/' + name + '.mp3', location.href).href;
function result(p: Data, modelId = 'roformer-sw', separate = true) {
  const row = {
    id: makeId(),
    name: '六轨 · 演示结果',
    modelId,
    modelName: models.find((m) => m.id === modelId)?.name || models[0].name,
    mode: 'six',
    createdAt: now(),
    directory: 'demo',
    tracks: tracks(),
  };
  if (separate) {
    p.results = [...(p.results || []), row];
    p.activeResultId = row.id;
    p.tracks = clone(row.tracks);
  }
  p.analysis = {
    key: 'C minor',
    bpm: 105.263,
    beatsPerBar: 4,
    downbeat: 0,
    beats: Array.from({ length: 106 }, (_, i) => (i * 60) / 105.263),
    chords: ['Cm7', 'Fm7', 'B♭7', 'E♭maj7'].map((label, i) => ({
      start: i * 15,
      end: (i + 1) * 15,
      label,
      confidence: 0.5,
    })),
    method: 'demo-illustration',
  };
  return save(p);
}
let sample: Promise<AudioBuffer> | null = null;
async function sampleTake(p: Data, start: number, seconds: number) {
  sample ||= fetch(audioUrl('guitar'))
    .then((r) => {
      if (!r.ok) throw new Error('无法读取演示录音素材');
      return r.arrayBuffer();
    })
    .then((bytes) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes));
  const buffer = await sample;
  const offset = Math.max(0, Math.min(start, buffer.duration - 0.2));
  const frames = Math.max(
    1,
    Math.min(
      Math.round(seconds * buffer.sampleRate),
      buffer.length - Math.round(offset * buffer.sampleRate),
    ),
  );
  const bytes = new ArrayBuffer(44 + frames * 4),
    view = new DataView(bytes);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++)
    for (let ch = 0; ch < 2; ch++) {
      const value =
        buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1))[
          Math.round(offset * buffer.sampleRate) + i
        ] || 0;
      view.setInt16(44 + i * 4 + ch * 2, Math.max(-1, Math.min(1, value)) * 32767, true);
    }
  const file = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  blobs.add(file);
  const take = {
    id: makeId(),
    name: '演示录音（预置吉他）',
    file,
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
    start,
    duration: frames / buffer.sampleRate,
    offsetMs: 0,
    mode: 'instrument',
    createdAt: now(),
    recordedTempo: 1,
    recordedPitch: 0,
    inputLabel: '演示输入 · 非麦克风录制',
    latencyMs: 0,
  };
  p.takes = [...(p.takes || []), take];
  p.selectedTakeIds = [...(p.selectedTakeIds || []).slice(-1), take.id];
  return save(p);
}
const score = `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>演示谱例 · 非 Fabulous 扒谱</work-title></work><part-list><score-part id="P1"><part-name>演示吉他</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>-3</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${['C', 'E', 'G', 'B'].map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure></part></score-partwise>`;
async function call(method: string, data: Data = {}): Promise<any> {
  if (disposed) return null;
  switch (method) {
    case 'library':
      return clone(projects);
    case 'get':
    case 'project-get':
      return clone(get(data.id));
    case 'runtime-status':
      return {
        ready: true,
        mode: 'cpu',
        libraryPath: '网页演示 · 仅当前会话',
        runtimePath: '无需模型与运行库（模拟）',
      };
    case 'models':
      return clone(models);
    case 'ui-language':
    case 'playback-budget':
    case 'audio-tools-ensure':
    case 'window':
    case 'take-append':
      return true;
    case 'download-settings':
      return { source: data.source || 'auto' };
    case 'update-check':
      return { current: '网页演示', latest: '网页演示', available: false };
    case 'runtime-install':
      emit({ type: 'runtime-ready', ready: true });
      return true;
    case 'update-download':
    case 'update-install':
      notify('请返回官网下载正式版。网页演示不会安装或更新本机应用。');
      return null;
    case 'update':
      return save(merge(get(data.id), data.patch));
    case 'import':
      notify('已载入同一段预置排练音频；网页不读取或上传本机文件。');
      return [save(initial())];
    case 'project-delete':
      projects = projects.filter((p) => p.id !== data.id);
      return true;
    case 'folders-list':
      return clone(folders);
    case 'folders-edit': {
      if (data.action === 'create') folders.push({ id: makeId(), name: data.name, projectIds: [] });
      if (data.action === 'rename')
        folders = folders.map((f) => (f.id === data.id ? { ...f, name: data.name } : f));
      if (data.action === 'delete') folders = folders.filter((f) => f.id !== data.id);
      if (data.action === 'move')
        folders = folders.map((f) => ({
          ...f,
          projectIds: [
            ...f.projectIds.filter((id: string) => id !== data.projectId),
            ...(f.id === data.id ? [data.projectId] : []),
          ],
        }));
      return clone(folders);
    }
    case 'run': {
      const id = makeId(),
        p = get(data.id);
      notify('模拟分析：不运行模型；所有模型选项均使用同一组预置六轨，和弦／节拍仅作流程示意。');
      let progress = 0;
      const timer = window.setInterval(() => {
        progress += 0.2;
        emit({
          type: 'progress',
          jobId: id,
          projectId: p.id,
          operation: data.operation,
          progress: Math.min(progress, 1),
          message: '模拟分析 · ' + Math.round(progress * 100) + '%',
        });
        if (progress >= 1) {
          clearInterval(timer);
          jobs.delete(id);
          let output;
          if (data.operation === 'align') {
            p.alignment = {
              points: [
                { scoreTime: 0, audioTime: 0, confidence: 0.5 },
                { scoreTime: 3, audioTime: 3, confidence: 0.5 },
              ],
              duration: 3,
              confidence: 0.5,
              needsReview: true,
              transpose: 0,
              uncertain: [],
              notes: [60, 64, 67, 71].map((pitch, i) => ({
                start: i * 0.75,
                end: (i + 1) * 0.75,
                pitch,
                velocity: 0.6,
                drum: false,
                program: 24,
              })),
            };
            output = save(p);
            notify('对齐流程示意：谱例不是 Fabulous 的实际扒谱，同步点仅用于体验编辑。');
          } else output = result(p, data.modelId, data.operation === 'separate');
          emit({ type: 'complete', projectId: p.id, result: output });
        }
      }, 420);
      jobs.set(id, timer);
      return id;
    }
    case 'cancel':
      clearInterval(jobs.get(data.jobId));
      jobs.delete(data.jobId);
      emit({ type: 'cancelled' });
      return true;
    case 'model-download': {
      for (const progress of [0.25, 0.6, 1]) {
        await delay(250);
        emit({
          type: 'progress',
          scope: 'model-download',
          modelId: data.id,
          progress,
          message: '模拟模型准备，不下载权重',
        });
      }
      const model = models.find((m) => m.id === data.id);
      if (model) model.installed = true;
      emit({ type: 'complete', scope: 'model-download', modelId: data.id, progress: 1 });
      return clone(models);
    }
    case 'result-select': {
      const p = get(data.id);
      const row = p.results.find((r: Data) => r.id === data.resultId);
      if (!data.resultId) {
        p.activeResultId = null;
        p.tracks = [];
      }
      if (row) {
        p.activeResultId = row.id;
        p.tracks = clone(row.tracks);
      }
      return save(p);
    }
    case 'result-rename': {
      const p = get(data.id);
      p.results = p.results.map((r: Data) =>
        r.id === data.resultId ? { ...r, name: data.name } : r,
      );
      return save(p);
    }
    case 'session-create': {
      const source = data.sourceId ? get(data.sourceId) : initial();
      const p = {
        ...clone(source),
        id: makeId(),
        kind: data.kind,
        title: data.title,
        practiceMode: data.mode || 'instrument',
        sessionSource: data.sourceId
          ? { projectId: source.id, title: source.title, resultId: data.resultId }
          : undefined,
        takes: [],
        selectedTakeIds: [],
        bookmarks: [],
        sourceGroups: [],
      };
      if (!data.sourceId) p.tracks = [];
      return save(p);
    }
    case 'creation-add-group':
    case 'creation-import-group': {
      const p = get(data.id),
        source = data.sourceId ? get(data.sourceId) : projects.find((p) => !p.kind)!;
      if (!source.tracks.length) result(source);
      p.sourceGroups = [
        ...(p.sourceGroups || []),
        {
          id: makeId(),
          name: source.title,
          sourceTitle: source.title,
          tracks: clone(source.tracks).map((track: Data) => ({ ...track, id: makeId() })),
          gain: 1,
          mute: false,
          solo: false,
          start: data.position || 0,
        },
      ];
      return save(p);
    }
    case 'take-start': {
      const id = makeId();
      takes.set(id, { projectId: data.id, options: data.options, at: performance.now() });
      notify('录音流程演示：不访问麦克风；停止后载入相同长度的预置吉他素材。');
      return { id };
    }
    case 'take-finish': {
      const take = takes.get(data.sessionId);
      if (!take) throw new Error('演示录音不存在');
      takes.delete(data.sessionId);
      return sampleTake(
        get(take.projectId),
        take.options.anchorPosition || 0,
        Math.max(0.25, Math.min(60, (performance.now() - take.at) / 1000)),
      );
    }
    case 'take-import':
      return sampleTake(get(data.id), Number(data.position || 0), 8);
    case 'take-select': {
      const p = get(data.id);
      p.selectedTakeIds = data.takeIds;
      return save(p);
    }
    case 'take-delete':
    case 'take-trash': {
      const p = get(data.id);
      p.takes = (p.takes || []).filter(
        (t: Data) => t.id !== data.takeId && !(data.takeIds || []).includes(t.id),
      );
      p.selectedTakeIds = p.selectedTakeIds.filter((id: string) =>
        p.takes.some((t: Data) => t.id === id),
      );
      return save(p);
    }
    case 'take-open':
      notify('录音只保存在当前网页会话中；此演示没有本机录音文件夹。');
      return true;
    case 'take-recover':
    case 'take-restore':
      return clone(get(data.id));
    case 'attach': {
      const p = get(data.id);
      if (!data.midiBytes && !data.attachmentId)
        p.attachments = [
          { id: 'demo-score', name: '演示谱例（非歌曲扒谱）.musicxml', file: 'demo.musicxml' },
        ];
      if (data.midiBytes) {
        const file = URL.createObjectURL(
          new Blob([new Uint8Array(data.midiBytes)], { type: 'audio/midi' }),
        );
        blobs.add(file);
        p.scoreMidi = file;
      }
      return save(p);
    }
    case 'read-attachment':
      return new TextEncoder().encode(score);
    case 'attachment-delete': {
      const p = get(data.id);
      p.attachments = [];
      return save(p);
    }
    case 'export':
    case 'export-audio': {
      notify(
        '网页仅演示导出入口，真实 .ijam／WAV／MP3 导出请使用 PC 版。试听、混音和变速移调可在此实际体验。',
      );
      return null;
    }
    case 'migration-detect':
      return [{ folder: '演示曲库（示例）', name: 'Audio Jam 演示曲库' }];
    case 'migration-scan':
      return [];
    case 'migration-import':
    case 'migration-file':
      notify('迁移入口为界面演示，不读取真实 Audio Jam 数据库。');
      return [];
    case 'pick-folder':
      return '演示曲库（不访问本机）';
    case 'pair-stop':
    case 'peer-stop':
      return true;
    case 'feedback-open':
      notify('请通过官网的 GitHub 反馈入口提交建议。');
      return true;
    default: {
      const message = ['pair-', 'peer-'].some((prefix) => method.startsWith(prefix))
        ? '网页只演示互传入口，不创建配对码或连接真实设备。'
        : '此项需要本地设备或文件；网页试用只展示界面流程，请下载 PC 版体验。';
      notify(message);
      throw new Error(message);
    }
  }
}
window.jam = {
  language: 'zh-CN',
  call: async (method, data) => clone(await call(method, data)),
  onEvent(callback) {
    events.add(callback);
    if (!opened) {
      opened = true;
      queueMicrotask(() => {
        if (!disposed) emit({ type: 'shared-import', result: clone(projects[0]) });
      });
    }
    return () => events.delete(callback);
  },
  filePath: () => '',
};
window.addEventListener('pagehide', () => {
  disposed = true;
  for (const timer of jobs.values()) clearInterval(timer);
  for (const file of blobs) URL.revokeObjectURL(file);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
