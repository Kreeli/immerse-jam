import * as alphaTab from '@coderline/alphatab';
import { Midi } from '@tonejs/midi';
import { FileMusic, Plus, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { message, t as tr } from '../../i18n';
import { interpolate, type Attachment, type MidiNote, type Project } from '../../shared/types';
export default function Score({
  project,
  position,
  onProject,
  onAlign,
  onError,
}: {
  project: Project;
  position: number;
  onProject: (p: Project) => void;
  onAlign: () => void;
  onError: (m: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    api = useRef<alphaTab.AlphaTabApi | null>(null);
  const [active, setActive] = useState<Attachment | null>(null),
    [notes, setNotes] = useState<MidiNote[]>([]),
    [status, setStatus] = useState(''),
    [tracks, setTracks] = useState<
      {
        index: number;
        name: string;
      }[]
    >([]),
    [visibleTrack, setVisibleTrack] = useState(-1);
  const [manualScoreTime, setManualScoreTime] = useState('0');
  const scores = project.attachments.filter((a) =>
    /\.(gp[345x]?|gtp|musicxml|mxl|xml|mid|midi)$/i.test(a.name),
  );
  useEffect(() => {
    setActive(scores[0] || null);
  }, [project.id, project.attachments.length]);
  useEffect(() => {
    if (!active || !host.current) return;
    let disposed = false;
    setStatus(tr('正在打开乐谱…'));
    setTracks([]);
    setNotes([]);
    setVisibleTrack(-1);
    void (async () => {
      const bytes = await window.jam.call<Uint8Array>('read-attachment', {
        id: project.id,
        attachmentId: active.id,
      });
      if (disposed) return;
      if (/\.midi?$/i.test(active.name)) {
        const m = new Midi(bytes);
        setNotes(
          m.tracks.flatMap((t) =>
            t.notes.map((n) => ({
              start: n.time,
              end: n.time + n.duration,
              pitch: n.midi,
              velocity: n.velocity * 127,
              program: t.instrument.number,
              drum: t.instrument.percussion,
            })),
          ),
        );
        const updated = await window.jam.call<Project>('attach', {
          id: project.id,
          midiBytes: Array.from(bytes),
        });
        if (!disposed) {
          onProject(updated);
          setStatus(tr('MIDI 已导入，可进行自动对齐'));
        }
        return;
      }
      const a = new alphaTab.AlphaTabApi(host.current!, {
        core: {
          useWorkers: false,
          scriptFile: './alphatab/alphaTab.js',
          fontDirectory: './alphatab/font/',
        },
        display: { scale: 1.05 },
        player: {
          playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
          enableCursor: true,
          enableUserInteraction: true,
        },
      });
      api.current = a;
      a.error.on((e) => onError(String(e)));
      a.scoreLoaded.on((score) => {
        if (disposed) return;
        setTracks(score.tracks.map((t) => ({ index: t.index, name: t.name })));
        setStatus(tr('乐谱已展开，可自动对齐'));
        const midi = new alphaTab.midi.MidiFile();
        const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
        const generator = new alphaTab.midi.MidiFileGenerator(score, a.settings, handler);
        generator.generate();
        void window.jam
          .call<Project>('attach', { id: project.id, midiBytes: Array.from(midi.toBinary()) })
          .then((p) => {
            if (!disposed) onProject(p);
          })
          .catch((e) => onError(e.message));
      });
      a.load(bytes);
    })().catch((e) => onError(e.message));
    return () => {
      disposed = true;
      api.current?.destroy();
      api.current = null;
    };
  }, [active?.id, project.id]);
  useEffect(() => {
    if (api.current?.player && project.alignment) {
      const t = interpolate(project.alignment.points, position, true);
      const output = api.current.player.output as alphaTab.synth.IExternalMediaSynthOutput;
      output.updatePosition(Math.max(0, t * 1000));
    }
  }, [position, project.alignment]);
  useEffect(() => {
    const a = api.current;
    if (a?.score)
      a.renderTracks(visibleTrack < 0 ? a.score.tracks : [a.score.tracks[visibleTrack]]);
  }, [visibleTrack]);
  const scoreTime = project.alignment
    ? interpolate(project.alignment.points, position, true)
    : position;
  return (
    <div className="score-panel">
      <div className="score-toolbar">
        <select
          value={active?.id || ''}
          onChange={(e) => setActive(scores.find((a) => a.id === e.target.value) || null)}
        >
          <option value="">{tr('选择乐谱 / MIDI')}</option>
          {scores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {tracks.length > 0 && (
          <select value={visibleTrack} onChange={(e) => setVisibleTrack(+e.target.value)}>
            <option value={-1}>{tr('全部谱轨')}</option>
            {tracks.map((t) => (
              <option key={t.index} value={t.index}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button className="primary small" onClick={onAlign} disabled={!project.scoreMidi}>
          <Target size={15} />
          {tr('自动对齐原曲')}
        </button>
        <button
          className="small"
          onClick={() =>
            void window.jam
              .call<Project>('attach', { id: project.id })
              .then(onProject)
              .catch((e) => onError(e.message))
          }
        >
          <Plus size={15} />
          {tr('导入乐谱')}
        </button>
      </div>
      {!active && (
        <div className="empty">
          <FileMusic size={48} />
          <h2>{tr('把乐谱和音乐放在一起')}</h2>
          <p>{tr('支持 Guitar Pro、MusicXML 和 MIDI。导入后自动匹配原曲时间轴。')}</p>
        </div>
      )}
      {active && (
        <div className="score-status">
          <span>{message(status)}</span>
          {project.alignment && (
            <span className={project.alignment.needsReview ? 'amber' : 'green'}>
              {tr('匹配可信度')}
              {Math.round(project.alignment.confidence * 100)}% ·{' '}
              {project.alignment.needsReview ? tr('建议检查同步点') : tr('已生成同步点')}
            </span>
          )}
        </div>
      )}
      <div
        ref={host}
        className={'notation ' + (/\.midi?$/i.test(active?.name || '') ? 'hidden' : '')}
      />
      {!!notes.length && (
        <div className="piano-roll">
          <div className="piano-title">
            {tr('MIDI 音符 \u00B7')}
            {notes.length}
            {tr('个音符')}
          </div>
          <svg viewBox="0 0 1000 420" preserveAspectRatio="none">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1={0} x2={1000} y1={i * 35} y2={i * 35} stroke="#303039" />
            ))}
            {notes
              .filter((n) => n.start >= scoreTime - 3 && n.start <= scoreTime + 12)
              .map((n, i) => (
                <rect
                  key={i}
                  x={((n.start - scoreTime + 3) / 15) * 1000}
                  y={390 - (n.pitch - 24) * 5}
                  width={Math.max(3, ((n.end - n.start) / 15) * 1000)}
                  height={4}
                  rx={2}
                  fill={n.start <= scoreTime && n.end > scoreTime ? '#f8bd71' : '#f06b83'}
                />
              ))}
            <line x1={200} x2={200} y1={0} y2={420} stroke="#fff" strokeWidth={2} />
          </svg>
        </div>
      )}
      {!!project.alignment?.points.length && (
        <div className="sync-editor">
          <div>
            <h3>{tr('同步点修正')}</h3>
            <p>{tr('不确定的片段以橙色标记。可整体偏移，或把指定谱面时间对齐到当前原曲位置。')}</p>
          </div>
          <div className="remote-actions">
            <button
              className="small"
              onClick={() => {
                const value = window.prompt(tr('整体移动同步点（秒），正数表示原曲更晚进入'), '0');
                if (value === null) return;
                const delta = Number(value);
                if (!Number.isFinite(delta)) return;
                const alignment = structuredClone(project.alignment!);
                alignment.points = alignment.points.map((p) => ({
                  ...p,
                  audioTime: Math.max(0, Math.min(project.duration, p.audioTime + delta)),
                }));
                onProject({ ...project, alignment });
              }}
            >
              {tr('整体偏移')}
            </button>
            <label>
              {tr('谱面秒数')}
              <input
                aria-label={tr('手动同步的谱面秒数')}
                type="number"
                min="0"
                step=".1"
                value={manualScoreTime}
                onChange={(e) => setManualScoreTime(e.target.value)}
              />
            </label>
            <button
              className="small"
              onClick={() => {
                const value = Number(manualScoreTime);
                if (!Number.isFinite(value) || value < 0 || value > project.alignment!.duration) {
                  onError(tr('谱面时间超出范围'));
                  return;
                }
                const alignment = structuredClone(project.alignment!);
                const delta = position - interpolate(alignment.points, value);
                alignment.points = alignment.points
                  .filter((p) => Math.abs(p.scoreTime - value) > 0.01)
                  .map((p) =>
                    p.scoreTime >= value
                      ? {
                          ...p,
                          audioTime: Math.max(
                            position,
                            Math.min(project.duration, p.audioTime + delta),
                          ),
                        }
                      : p,
                  );
                const previous = alignment.points.filter((p) => p.scoreTime < value).at(-1);
                if (previous && previous.audioTime > position) {
                  onError(tr('当前原曲位置早于前一个同步点，请先整体偏移或重新对齐'));
                  return;
                }
                alignment.points.push({ scoreTime: value, audioTime: position, confidence: 1 });
                alignment.points.sort((a, b) => a.scoreTime - b.scoreTime);
                onProject({ ...project, alignment });
              }}
            >
              <Plus size={15} />
              {tr('对齐到当前位置')}
            </button>
          </div>
          <div className="sync-points">
            {project.alignment.points
              .filter((_, i) => i % 8 === 0)
              .map((p) => (
                <label key={p.scoreTime} className={p.confidence < 0.55 ? 'uncertain' : ''}>
                  <span>
                    {tr('谱')}
                    {p.scoreTime.toFixed(1)}
                    {tr('秒 →')}
                  </span>
                  <input
                    aria-label={tr('谱 {0} 秒对应原曲位置', [p.scoreTime])}
                    type="number"
                    step="0.1"
                    value={p.audioTime.toFixed(2)}
                    onChange={(e) => {
                      const alignment = structuredClone(project.alignment!);
                      const index = alignment.points.findIndex((a) => a.scoreTime === p.scoreTime);
                      const value = +e.target.value;
                      const prev = alignment.points[index - 1]?.audioTime ?? 0,
                        next = alignment.points[index + 1]?.audioTime ?? project.duration;
                      if (Number.isFinite(value) && value >= prev && value <= next) {
                        alignment.points[index].audioTime = value;
                        alignment.points[index].confidence = 1;
                        onProject({ ...project, alignment });
                      }
                    }}
                  />
                  <span>{tr('秒')}</span>
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
