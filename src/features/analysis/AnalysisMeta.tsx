import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
import { keyLabel } from './transposition';
export default function AnalysisMeta({
  project,
  onProject,
  readOnly = false,
}: {
  project: Project;
  onProject: (project: Project) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState('');
  const key = project.analysis?.key ? keyLabel(project.analysis.key) : tr('调性待分析');
  return (
    <div className="analysis-meta-wrap">
      <small className="analysis-meta">
        {readOnly ? (
          <span>{key}</span>
        ) : (
          <button
            title={tr('修正调性')}
            onClick={() => {
              setDraft(project.analysis?.key || 'C');
              setEditing(!editing);
            }}
          >
            {key}
          </button>
        )}
        <span>
          {project.analysis?.bpm ? Math.round(project.analysis.bpm * 100) / 100 : '—'} BPM
        </span>
      </small>
      {editing && !readOnly && (
        <form
          className="analysis-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim())
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
            setEditing(false);
          }}
        >
          <label>
            {tr('调性')}
            <input
              aria-label={tr('歌曲调性')}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="submit">{tr('保存')}</button>
          <button type="button" onClick={() => setEditing(false)}>
            {tr('取消')}
          </button>
        </form>
      )}
    </div>
  );
}
