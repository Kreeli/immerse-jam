import { useRef, useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function AnalysisMeta({
  project,
  onProject,
}: {
  project: Project;
  onProject: (project: Project) => void;
}) {
  const taps = useRef<number[]>([]),
    [editing, setEditing] = useState<'bpm' | 'key' | null>(null),
    [draft, setDraft] = useState('');
  const setBpm = (bpm: number) => {
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 350) return;
    const first = Math.max(0, project.analysis?.downbeat || 0),
      analysis = { key: '—', bpm, chords: [], beats: [], method: 'manual', ...project.analysis };
    analysis.bpm = Math.round(bpm * 100) / 100;
    analysis.tempoReviewed = true;
    analysis.tempoMethod = 'manual';
    analysis.beats = Array.from(
      { length: Math.max(0, Math.ceil((project.duration - first) / (60 / bpm))) },
      (_, i) => first + (i * 60) / bpm,
    );
    analysis.downbeats = analysis.beats.filter(
      (_beat, index) => index % (analysis.beatsPerBar || 4) === 0,
    );
    onProject({ ...project, analysis });
  };
  const reviewed = project.analysis?.tempoReviewed;
  return (
    <div className="analysis-meta-wrap">
      <small className="analysis-meta">
        <button
          title={tr('修正调性')}
          onClick={() => {
            setDraft(project.analysis?.key || 'C');
            setEditing(editing === 'key' ? null : 'key');
          }}
        >
          {project.analysis?.key || tr('调性待分析')}
        </button>
        <button
          title={reviewed ? tr('已手动校准，可继续调整') : tr('自动估计，点击校准或选择半速／倍速')}
          onClick={() => {
            setDraft(String(project.analysis?.bpm || 120));
            setEditing(editing === 'bpm' ? null : 'bpm');
          }}
        >
          ♩ {project.analysis?.bpm ? (reviewed ? '' : '≈ ') + project.analysis.bpm : '—'} BPM
        </button>
        <button
          title={tr('随音乐节拍连续点击至少四次')}
          onClick={() => {
            const now = performance.now();
            taps.current = taps.current.filter((value) => now - value < 8000).slice(-8);
            taps.current.push(now);
            if (taps.current.length >= 4) {
              const intervals = taps.current
                  .slice(1)
                  .map((value, index) => value - taps.current[index])
                  .sort((a, b) => a - b),
                median = intervals[Math.floor(intervals.length / 2)],
                kept = intervals.filter((value) => Math.abs(value - median) < median * 0.25);
              if (kept.length >= 2) setBpm(60000 / (kept.reduce((a, b) => a + b, 0) / kept.length));
            }
          }}
        >
          Tap
        </button>
      </small>
      {editing && (
        <form
          className="analysis-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (editing === 'bpm') setBpm(+draft);
            else if (draft.trim())
              onProject({
                ...project,
                analysis: {
                  bpm: 0,
                  chords: [],
                  beats: [],
                  method: 'manual',
                  ...project.analysis,
                  key: draft.trim().slice(0, 20),
                },
              });
            setEditing(null);
          }}
        >
          <label>
            {editing === 'bpm' ? 'BPM' : tr('调性')}
            <input
              aria-label={editing === 'bpm' ? tr('校准 BPM') : tr('歌曲调性')}
              type={editing === 'bpm' ? 'number' : 'text'}
              min={editing === 'bpm' ? 20 : undefined}
              max={editing === 'bpm' ? 350 : undefined}
              step={editing === 'bpm' ? '.01' : undefined}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {editing === 'bpm' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setBpm((project.analysis?.bpm || 120) / 2);
                  setEditing(null);
                }}
              >
                ½
              </button>
              <button
                type="button"
                onClick={() => {
                  setBpm((project.analysis?.bpm || 120) * 2);
                  setEditing(null);
                }}
              >
                ×2
              </button>
              <small>
                {reviewed
                  ? tr('已校准')
                  : project.analysis?.tempoMethod === 'beat-this'
                    ? tr('节拍模型估计')
                    : tr('基础节拍估计')}
              </small>
            </>
          )}
          <button type="submit">{tr('保存')}</button>
          <button type="button" onClick={() => setEditing(null)}>
            {tr('取消')}
          </button>
        </form>
      )}
    </div>
  );
}
