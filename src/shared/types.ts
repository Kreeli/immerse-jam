export interface ModelDownload {
  status: 'progress' | 'complete' | 'error';
  message?: string;
  progress?: number;
}
export interface Track {
  id: string;
  name: string;
  label?: string;
  file: string;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  eq?: number[];
  start?: number;
}
export interface Take extends Track {
  duration: number;
  offsetMs: number;
  rawFile?: string;
  mode: 'instrument' | 'mixed';
  createdAt: string;
  recordedTempo: number;
  recordedPitch: number;
  inputLabel?: string;
  latencyMs: number;
}
export interface RecordingSettings {
  mode: 'instrument' | 'mixed';
  inputDeviceId: string;
  outputDeviceId: string;
  channel: 'stereo' | 'left' | 'right' | 'mono';
  latencyMs: number;
}
export interface SeparationResult {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  mode: string;
  createdAt: string;
  directory: string;
  tracks: Track[];
}
export interface ChordSlot {
  id: string;
  label: string | null;
}
export interface ChartBar {
  id: string;
  start: number;
  end: number;
  pickup?: boolean;
  splitAt?: number;
  slots: ChordSlot[];
}
export interface ChordChart {
  id: string;
  name: string;
  source: 'manual' | 'recognized';
  timingSource: 'detected' | 'fixed';
  bpm: number;
  meter: number;
  firstDownbeat: number;
  barsPerRow: number;
  bars: ChartBar[];
  bank: string[];
  sections: Record<string, string>;
  createdAt: string;
}
export interface Attachment {
  id: string;
  name: string;
  file: string;
  legacyRemark?: string;
}
export interface Bookmark {
  id: string;
  title: string;
  start: number;
  end?: number;
}
export interface Chord {
  start: number;
  end: number;
  label: string;
  confidence: number;
}
export interface ChordRow {
  id: string;
  name: string;
  bars: string[];
}
export interface ChordLayout {
  barsPerRow: number;
  rows: ChordRow[];
}
export interface Analysis {
  key: string;
  bpm: number;
  chords: Chord[];
  beats: number[];
  downbeats?: number[];
  method: string;
  beatsPerBar?: number;
  downbeat?: number;
  layout?: ChordLayout;
  tempoMethod?: string;
  tempoCandidates?: number[];
  tempoReviewed?: boolean;
  tempoStability?: number;
}
export interface SyncPoint {
  scoreTime: number;
  audioTime: number;
  confidence: number;
}
export interface MidiNote {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
  drum: boolean;
  program: number;
}
export interface Alignment {
  points: SyncPoint[];
  notes: MidiNote[];
  duration: number;
  confidence: number;
  needsReview: boolean;
  transpose: number;
  uncertain: { scoreTime: number; audioTime: number }[];
}
export interface Practice {
  lastPlayedAt?: string;
  tempo: number;
  pitch: number;
  master: number;
  eq: number[];
  metronome?: boolean;
  metronomeVolume?: number;
  midi?: boolean;
  countIn?: boolean;
  countInBpm?: number;
  countInBeats?: number;
  snapCountIn?: boolean;
}
export interface Project {
  kind?: 'practice' | 'creation';
  sessionSource?: { projectId: string; title: string; resultId: string | null };
  practiceMode?: 'instrument' | 'mixed';
  selectedTakeIds?: string[];
  takes?: Take[];
  recordingSettings?: RecordingSettings;
  results?: SeparationResult[];
  activeResultId?: string | null;
  chordCharts?: ChordChart[];
  activeChordChartId?: string;
  originalMix?: Track;
  presets?: {
    takeMix?: Pick<Take, 'id' | 'gain' | 'pan' | 'mute' | 'solo'>[];
    selectedTakeIds?: string[];
    name: string;
    tracks: Track[];
    practice: Practice;
    originalMix?: Track;
  }[];
  notes?: string;
  schemaVersion: number;
  id: string;
  title: string;
  artist: string;
  original: string;
  playback?: string;
  duration: number;
  tracks: Track[];
  attachments: Attachment[];
  bookmarks: Bookmark[];
  practice: Practice;
  starred: boolean;
  updatedAt: string;
  createdAt: string;
  waveform?: { peaks: number[]; duration: number };
  analysis?: Analysis;
  alignment?: Alignment;
  scoreMidi?: string;
  playlist?: string;
}
export interface Model {
  id: string;
  name: string;
  description: string;
  adapter: string;
  stems: string[];
  sampleRate: number;
  installed: boolean;
  recommended?: boolean;
  custom?: boolean;
  license: string;
}
export interface JamEvent {
  type: string;
  message?: string;
  progress?: number;
  jobId?: string;
  projectId?: string;
  operation?: string;
  scope?: string;
  result?: any;
  id?: string;
  name?: string;
  size?: number;
  ready?: boolean;
  remote?: boolean;
}
declare global {
  interface Window {
    jam: {
      language?: 'zh-CN' | 'en';
      call<T = any>(method: string, data?: any): Promise<T>;
      onEvent(callback: (event: JamEvent) => void): () => void;
      filePath(file: File): string;
    };
  }
}
export function asset(id: string, file: string) {
  return `immerse://asset/${id}/${file.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}
export function time(t: number) {
  if (!Number.isFinite(t)) return '00:00';
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
export function interpolate(points: SyncPoint[], value: number, inverse = false) {
  if (!points.length) return value;
  const key = inverse ? 'audioTime' : 'scoreTime',
    out = inverse ? 'scoreTime' : 'audioTime';
  let lo = 0,
    hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid][key] < value) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo],
    a = points[Math.max(0, lo - 1)];
  if (b[key] === a[key]) return a[out] + value - a[key];
  return a[out] + ((value - a[key]) * (b[out] - a[out])) / (b[key] - a[key]);
}
