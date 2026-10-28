import { FileMusic, RefreshCw, SlidersHorizontal, Volume2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { Player } from '../../audio/Player';
import { sourceTracks } from '../../audio/performance';
import { t as tr } from '../../i18n';
import type { Practice, Project, Track } from '../../shared/types';
import { transpose } from '../analysis/transposition';
import ResultPicker from '../models/ResultPicker';
import PracticeRecorder from '../recording/PracticeRecorder';
import TakeTiming from '../recording/TakeTiming';
import CountInControl from './CountInControl';
import PresetControls from './PresetControls';
import TrackControl from './TrackControl';
const colors = ['#ed7894', '#d9a86c', '#91bda9', '#a092cd', '#7fa8d3', '#8e949d'];
interface Props {
  project: Project;
  player: Player;
  loading: boolean;
  waveSource: string;
  onWaveSource: Dispatch<SetStateAction<string>>;
  onProject: (p: Project) => void;
  onAdopt: (p: Project) => void;
  onError: (message: string) => void;
  onRecording: (active: boolean) => void;
  onPractice: (patch: Partial<Practice>) => void;
  onTrackState: (track: Track, action: 'listen' | 'close') => void;
  onTrackChange: (track: Track, patch: Partial<Track>) => void;
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
  onRecording,
  onPractice,
  onTrackState,
  onTrackChange,
}: Props) {
  const act = async (work: () => Promise<unknown>) => {
    try {
      return await work();
    } catch (error) {
      onError((error as Error).message);
      return null;
    }
  };
  return (
    <aside className="mixer">
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
      {project.kind !== 'creation' && (
        <ResultPicker project={project} onProject={onAdopt} onError={onError} loading={loading} />
      )}
      <label className="master-control">
        <span>
          <Volume2 size={15} />
          {tr('总音量')}
          <b>{Math.round(project.practice.master * 100)}%</b>
        </span>
        <input
          aria-label={tr('总音量')}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={project.practice.master}
          onChange={(e) => onPractice({ master: +e.target.value })}
        />
      </label>
      <PresetControls project={project} onProject={onProject} onError={onError} />
      <PracticeRecorder
        project={project}
        player={player}
        onProject={onProject}
        onError={onError}
        onActive={onRecording}
      />
      <div className="mixer-subheading">
        {tr('音轨')}
        <span>{sourceTracks(project).length}</span>
      </div>
      {sourceTracks(project).map((t, i) => (
        <div key={t.id} className="mixer-track-entry">
          <TrackControl
            key={t.id}
            track={t}
            selected={waveSource === t.id}
            onSelect={() => onWaveSource((source) => (source === t.id ? 'mix' : t.id))}
            meterPlayer={player}
            onState={(action) => onTrackState(t, action)}
            color={colors[i % colors.length]}
            onChange={(patch) => onTrackChange(t, patch)}
          />
          {project.takes?.some((take) => take.id === t.id) && (
            <TakeTiming
              take={project.takes.find((take) => take.id === t.id)!}
              creation={project.kind === 'creation'}
              onChange={(patch) => onTrackChange(t, patch)}
              onRemove={() =>
                void act(async () => {
                  const p = await window.jam.call<Project>(
                    project.kind === 'creation' ? 'take-delete' : 'take-select',
                    project.kind === 'creation'
                      ? { id: project.id, takeId: t.id }
                      : {
                          id: project.id,
                          takeIds: (project.selectedTakeIds || []).filter((id) => id !== t.id),
                        },
                  );
                  onAdopt(p);
                })
              }
            />
          )}
        </div>
      ))}
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
          <button onClick={() => onPractice({ pitch: Math.max(-12, project.practice.pitch - 1) })}>
            −
          </button>
          <strong>
            {project.analysis
              ? transpose(project.analysis.key, project.practice.pitch)
              : tr('原调')}
          </strong>
          <button onClick={() => onPractice({ pitch: Math.min(12, project.practice.pitch + 1) })}>
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
        <label>
          <FileMusic size={16} />
          {tr('MIDI 同步发声')}
          <input
            type="checkbox"
            checked={!!project.practice.midi}
            onChange={(e) => onPractice({ midi: e.target.checked })}
          />
        </label>
        <small>{tr('导入乐谱 / MIDI 并自动对齐后生效')}</small>
      </div>
    </aside>
  );
}
