import { t as tr } from '../../i18n';
import type { Project } from '../../shared/types';
export default function PracticeModeControl({
  project,
  onProject,
  disabled,
}: {
  project: Project;
  onProject: (project: Project) => void;
  disabled: boolean;
}) {
  if (project.kind !== 'practice') return null;
  return (
    <section className="practice-mode-control">
      <div className="mixer-subheading">{tr('跟练方式')}</div>
      <div className="recording-mode-options">
        {(['instrument', 'mixed'] as const).map((mode) => (
          <button
            key={mode}
            disabled={disabled}
            aria-pressed={(project.practiceMode || 'instrument') === mode}
            className={(project.practiceMode || 'instrument') === mode ? 'selected' : ''}
            onClick={() =>
              onProject({
                ...project,
                practiceMode: mode,
                recordingSettings: project.recordingSettings
                  ? { ...project.recordingSettings, mode }
                  : undefined,
              })
            }
          >
            {mode === 'instrument' ? tr('分轨伴奏') : tr('录音含伴奏')}
          </button>
        ))}
      </div>
      <p className="muted">
        {project.practiceMode === 'mixed'
          ? tr('回听录音时不叠加伴奏；录制时下方分轨控制伴奏。')
          : tr('下方分轨控制伴奏，录音作为独立音轨叠加回听。')}
      </p>
    </section>
  );
}
