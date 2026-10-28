import { useState } from 'react';
import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function PresetControls({
  project,
  onProject,
  onError,
}: {
  project: Project;
  onProject: (project: Project) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState('');
  const save = () => {
    if (!name.trim()) return;
    onProject({
      ...project,
      presets: [
        ...(project.presets || []).filter((preset) => preset.name !== name.trim()),
        {
          name: name.trim(),
          tracks: structuredClone(project.tracks),
          practice: structuredClone(project.practice),
          originalMix: project.originalMix,
          takeMix: project.takes?.map(({ id, gain, pan, mute, solo }) => ({
            id,
            gain,
            pan,
            mute,
            solo,
          })),
          selectedTakeIds: project.selectedTakeIds,
        },
      ],
    });
    setEditing(false);
    setName('');
  };
  return (
    <div className="preset-controls">
      <select
        aria-label={tr('混音预设')}
        value=""
        onChange={(event) => {
          const preset = project.presets?.[+event.target.value];
          if (!preset) return;
          if (
            preset.tracks
              .map((track) => track.file)
              .sort()
              .join('|') !==
            project.tracks
              .map((track) => track.file)
              .sort()
              .join('|')
          ) {
            onError(tr('这个预设属于另一组分离结果，请先选择对应的结果'));
            return;
          }
          onProject({
            ...project,
            tracks: structuredClone(preset.tracks),
            practice: structuredClone(preset.practice),
            originalMix: preset.originalMix,
            takes: project.takes?.map((take) => ({
              ...take,
              ...preset.takeMix?.find((state) => state.id === take.id),
            })),
            selectedTakeIds:
              preset.selectedTakeIds?.filter((id) =>
                project.takes?.some((take) => take.id === id),
              ) || project.selectedTakeIds,
          });
        }}
      >
        <option value="">{tr('载入混音预设')}</option>
        {project.presets?.map((preset, i) => (
          <option key={i} value={i}>
            {preset.name}
          </option>
        ))}
      </select>
      <button className="small" onClick={() => setEditing(true)}>
        {tr('保存')}
      </button>
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <input
            aria-label={tr('预设名称')}
            value={name}
            maxLength={120}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button className="small primary" type="submit">
            {tr('保存')}
          </button>
          <button className="small" type="button" onClick={() => setEditing(false)}>
            {tr('取消')}
          </button>
        </form>
      )}
    </div>
  );
}
