import { jamCall } from '../../platform/project-call';
import { isAndroid } from '../../platform/environment';
import { ChevronRight, RefreshCw, SlidersHorizontal, Volume2 } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Player } from '../../audio/Player';
import { sourceTracks } from '../../audio/performance';
import { t as tr } from '../../i18n';
import type { Practice, Project, Track } from '../../shared/types';
import { keyLabel, transpose } from '../analysis/transposition';
import ResultPicker from '../models/ResultPicker';
import PracticeModeControl from '../recording/PracticeModeControl';
import TakeTiming from '../recording/TakeTiming';
import CountInControl from './CountInControl';
import PresetControls from './PresetControls';
import TrackControl, { trackLabel } from './TrackControl';
import SortableTracks from '../../shared/SortableTracks';
import { trackColor } from '../../styles/palette';
interface Props {
  project: Project;
  player: Player;
  loading: boolean;
  waveSource: string;
  onWaveSource: Dispatch<SetStateAction<string>>;
  onProject: (p: Project) => void;
  onAdopt: (p: Project) => void;
  onError: (message: string) => void;
  onPractice: (patch: Partial<Practice>) => void;
  onTrackState: (track: Track, action: 'listen' | 'close') => void;
  onTrackChange: (track: Track, patch: Partial<Track>) => void;
  recording: boolean;
}
export default function Mixer({
  project,
  player,
  loading,
  waveSource,
  onWaveSource,
  onProject,
  onAdopt,
  onError,
  onPractice,
  onTrackState,
  onTrackChange,
  recording,
}: Props) {
  const [timingIds, setTimingIds] = useState<Set<string>>(() => new Set());
  const act = async (work: () => Promise<unknown>) => {
    try {
      return await work();
    } catch (error) {
      onError((error as Error).message);
      return null;
    }
  };
  return (
    <aside className="mixer nr-console-body">
      {project.kind !== 'creation' && (
        <ResultPicker
          project={project}
          onProject={onAdopt}
          onError={onError}
          loading={loading || recording}
        />
      )}
      <div className="panel-heading">
        <h3>
          <SlidersHorizontal size={16} />
          {tr('播放设定')}
        </h3>
        <button
          title={tr('恢复混音')}
          className="icon-button"
          onClick={() =>
            onProject({
              ...project,
              sourceMix: project.sourceMix
                ? { ...project.sourceMix, gain: 1, pan: 0, mute: false, solo: false }
                : undefined,
              sourceGroups: project.sourceGroups?.map((group) => ({
                ...group,
                gain: 1,
                pan: 0,
                mute: false,
                solo: false,
                tracks: group.tracks.map((track) => ({
                  ...track,
                  gain: 1,
                  pan: 0,
                  mute: false,
                  solo: false,
                })),
              })),
              tracks: project.tracks.map((t) => ({
                ...t,
                gain: 1,
                pan: 0,
                mute: false,
                solo: false,
              })),
              takes: project.takes?.map((t) => ({
                ...t,
                gain: 1,
                pan: 0,
                mute: false,
                solo: false,
              })),
              originalMix: project.originalMix
                ? { ...project.originalMix, gain: 1, pan: 0, mute: false, solo: false }
                : undefined,
            })
          }
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {!isAndroid && (
        <PracticeModeControl
          project={project}
          onProject={onProject}
          disabled={recording || loading}
        />
      )}
      <label className="master-control nr-master">
        <span>
          <Volume2 size={15} />
          {tr('总音量')}
          <b>{Math.round(project.practice.master * 100)}%</b>
        </span>
        <input
          aria-label={tr('总音量')}
          className="nr-range"
          style={
            {
              '--p': project.practice.master * 100 + '%',
              '--c': 'var(--text-2)',
            } as React.CSSProperties
          }
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={project.practice.master}
          onChange={(e) => onPractice({ master: +e.target.value })}
        />
      </label>
      {!isAndroid && <PresetControls project={project} onProject={onProject} onError={onError} />}
      {project.kind !== 'creation' && (
        <>
          <div className="mixer-subheading">
            {tr('音轨')}
            <span>{sourceTracks(project).length}</span>
          </div>
          <SortableTracks
            items={sourceTracks(project)}
            projectId={project.id}
            scope="mixer"
            label={trackLabel}
            disabled={loading || recording}
          >
            {(track) => {
              const take = project.takes?.find((take) => take.id === track.id);
              const open = timingIds.has(track.id);
              return (
                <div className="mixer-track-entry">
                  <TrackControl
                    track={track}
                    selected={waveSource === track.id}
                    editingDisabled={recording || loading}
                    onSelect={() =>
                      onWaveSource((source) => (source === track.id ? 'mix' : track.id))
                    }
                    meterPlayer={player}
                    onState={(action) => onTrackState(track, action)}
                    color={trackColor(track.name)}
                    onChange={(patch) => onTrackChange(track, patch)}
                    onTiming={
                      take
                        ? () =>
                            setTimingIds((before) => {
                              const next = new Set(before);
                              next.has(track.id) ? next.delete(track.id) : next.add(track.id);
                              return next;
                            })
                        : undefined
                    }
                    timingOpen={open}
                    onRemove={
                      take
                        ? () =>
                            void act(async () => {
                              const p = await jamCall<Project>('take-select', {
                                id: project.id,
                                takeIds: (project.selectedTakeIds || []).filter(
                                  (id) => id !== track.id,
                                ),
                              });
                              onAdopt(p);
                            })
                        : undefined
                    }
                  />
                  {take && open && (
                    <TakeTiming take={take} onChange={(patch) => onTrackChange(track, patch)} />
                  )}
                </div>
              );
            }}
          </SortableTracks>
        </>
      )}
      {isAndroid && (
        <details className="mobile-advanced-mix">
          <summary>
            <ChevronRight size={16} />
            <span>{tr('伴奏与录音设置')}</span>
          </summary>
          <PracticeModeControl
            project={project}
            onProject={onProject}
            disabled={recording || loading}
          />
          <PresetControls project={project} onProject={onProject} onError={onError} />
        </details>
      )}
      <div className="mixer-section">
        <div className="mixer-subheading">
          {tr('音调')}
          <span>
            {project.practice.pitch > 0 ? '+' : ''}
            {project.practice.pitch}
            {tr('半音')}
          </span>
        </div>
        <div className="pitch-buttons">
          <button
            disabled={recording || loading}
            onClick={() => onPractice({ pitch: Math.max(-12, project.practice.pitch - 1) })}
          >
            −
          </button>
          <strong>
            {project.analysis
              ? keyLabel(transpose(project.analysis.key, project.practice.pitch))
              : tr('原调')}
          </strong>
          <button
            disabled={recording || loading}
            onClick={() => onPractice({ pitch: Math.min(12, project.practice.pitch + 1) })}
          >
            +
          </button>
        </div>
      </div>
      <div className="mixer-section toggles">
        <CountInControl
          practice={project.practice}
          bpm={project.analysis?.bpm || 120}
          onChange={onPractice}
        />
      </div>
    </aside>
  );
}
