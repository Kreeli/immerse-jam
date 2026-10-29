import { ChevronDown, ChevronRight, Layers, Mic2, Plus, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LiveEnvelope } from '../../audio/live-envelope';
import { creationGroups } from '../../audio/performance';
import { toggleTrackState } from '../../audio/track-state';
import { t as tr } from '../../i18n';
import type { Project, SourceGroup, Track } from '../../shared/types';
import TrackControl from '../player/TrackControl';
import TakeTiming from './TakeTiming';
import TrackWave, { LiveWave, type TimelineProps } from './TrackWave';
function AddSource({
  project,
  library,
  position,
  onClose,
  onProject,
  onError,
}: {
  project: Project;
  library: Project[];
  position: number;
  onClose: () => void;
  onProject: (project: Project) => void;
  onError: (error: string) => void;
}) {
  const songs = library.filter((item) => !item.kind),
    [sourceId, setSourceId] = useState(songs[0]?.id || ''),
    [resultId, setResultId] = useState(''),
    [start, setStart] = useState(String(position.toFixed(3))),
    [busy, setBusy] = useState(false);
  const source = songs.find((song) => song.id === sourceId),
    selected = resultId || source?.activeResultId || source?.results?.[0]?.id || '';
  const add = async (external = false) => {
    setBusy(true);
    try {
      const updated = await window.jam.call<Project | null>(
        external ? 'creation-import-group' : 'creation-add-group',
        { id: project.id, sourceId, resultId: selected || undefined, position: Number(start) },
      );
      if (updated) {
        onProject(updated);
        onClose();
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop source-group-dialog">
      <section className="modal" role="dialog" aria-label={tr('添加分轨项目')}>
        <div className="modal-heading">
          <h2>{tr('添加分轨项目')}</h2>
          <button
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label={tr('关闭窗口')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="session-create-fields">
          <label>
            {tr('音乐库源工程')}
            <select
              aria-label={tr('音乐库源工程')}
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setResultId('');
              }}
            >
              {songs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                </option>
              ))}
            </select>
          </label>
          {source && (
            <label>
              {tr('使用分离结果')}
              <select
                aria-label={tr('使用分离结果')}
                value={selected}
                onChange={(event) => setResultId(event.target.value)}
              >
                {!source.results?.length && <option value="">{tr('原曲')}</option>}
                {source.results?.map((result) => (
                  <option key={result.id} value={result.id}>
                    {result.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {tr('插入位置（秒）')}
            <input
              type="number"
              aria-label={tr('分轨项目插入位置')}
              step=".001"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <p className="muted">{tr('项目作为一个音频分组加入，展开后可以调节内部声部。')}</p>
          <button disabled={busy} onClick={() => void add(true)}>
            <Upload size={15} />
            {tr('从 .ijam / .aum 文件导入')}
          </button>
        </div>
        <div className="modal-actions">
          <button disabled={busy} onClick={onClose}>
            {tr('取消')}
          </button>
          <button className="primary" disabled={busy || !sourceId} onClick={() => void add()}>
            {busy ? tr('正在导入…') : tr('添加')}
          </button>
        </div>
      </section>
    </div>
  );
}
export default function CreationTracks({
  project,
  library,
  live,
  onProject,
  onError,
  onTrackChange,
  onTrackState,
  ...timeline
}: TimelineProps & {
  project: Project;
  library: Project[];
  live: LiveEnvelope | null;
  onProject: (project: Project) => void;
  onError: (error: string) => void;
  onTrackChange: (track: Track, patch: Partial<Track>) => void;
  onTrackState: (track: Track, action: 'listen' | 'close') => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
      () => new Set((project.takes || []).slice(-2).map((take) => take.id)),
    ),
    [adding, setAdding] = useState(false);
  const known = useRef(new Set(project.takes?.map((take) => take.id) || []));
  const endAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live) endAnchor.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [live]);
  useEffect(() => {
    const added = (project.takes || []).filter((take) => !known.current.has(take.id));
    if (added.length) {
      setExpanded((before) => new Set([...before, ...added.map((take) => take.id)]));
      requestAnimationFrame(() =>
        endAnchor.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }),
      );
    }
    known.current = new Set(project.takes?.map((take) => take.id) || []);
  }, [project.takes]);
  const toggle = (id: string) =>
    setExpanded((before) => {
      const next = new Set(before);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const updateGroup = (group: SourceGroup, patch: Partial<SourceGroup>) =>
    onProject(
      group.id === 'source'
        ? {
            ...project,
            sourceMix: {
              gain: group.gain,
              mute: group.mute,
              solo: group.solo,
              start: group.start,
              label: group.label,
              ...patch,
            },
          }
        : {
            ...project,
            sourceGroups: project.sourceGroups?.map((item) =>
              item.id === group.id ? { ...item, ...patch } : item,
            ),
          },
    );
  const groupState = (group: SourceGroup, action: 'listen' | 'close') =>
    updateGroup(
      group,
      action === 'listen' ? { solo: !group.solo, mute: false } : { mute: !group.mute, solo: false },
    );
  const stemChange = (group: SourceGroup, track: Track, patch: Partial<Track>) => {
    const tracks = group.tracks.map((item) =>
      item.id === track.id ? { ...item, ...patch } : item,
    );
    onProject(
      group.id === 'source'
        ? {
            ...project,
            tracks: project.tracks.length ? tracks : [],
            originalMix: project.tracks.length ? project.originalMix : tracks[0],
          }
        : {
            ...project,
            sourceGroups: project.sourceGroups?.map((item) =>
              item.id === group.id ? { ...item, tracks } : item,
            ),
          },
    );
  };
  const importAudio = async () => {
    try {
      const updated = await window.jam.call<Project | null>('take-import', {
        id: project.id,
        position: timeline.position,
      });
      if (updated) onProject(updated);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const groups = creationGroups(project);
  return (
    <div className="creation-tracks">
      <header className="creation-list-heading">
        <div>
          <h3>{tr('创作音轨')}</h3>
          <small>{tr('展开音轨查看波形，播放中可随时叠录。')}</small>
        </div>
        <div>
          <button className="small" disabled={timeline.recording} onClick={() => setAdding(true)}>
            <Plus size={14} />
            {tr('添加分轨项目')}
          </button>
          <button
            className="small"
            disabled={timeline.recording}
            onClick={() => void importAudio()}
          >
            <Upload size={14} />
            {tr('导入音频')}
          </button>
        </div>
      </header>
      {groups.map((group) => (
        <section
          className="creation-audio-object source-object"
          key={group.id}
          data-group-id={group.id}
        >
          <div className="creation-object-heading">
            <button
              className="object-expand"
              aria-label={tr('展开分轨项目 {0}', [group.label || group.name])}
              aria-expanded={expanded.has(group.id)}
              onClick={() => toggle(group.id)}
            >
              {expanded.has(group.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Layers size={19} />
              <strong>{group.label || group.name}</strong>
              <small>{tr('{0} 条分轨', [group.tracks.length])}</small>
            </button>
            <label className="group-volume">
              {tr('音量')}
              <input
                aria-label={tr('分组音量 {0}', [group.name])}
                type="range"
                min="0"
                max="1"
                step=".01"
                value={group.gain}
                onChange={(event) => updateGroup(group, { gain: +event.target.value })}
              />
            </label>
            <button
              className="track-switch"
              aria-pressed={group.solo}
              onClick={() => groupState(group, 'listen')}
            >
              {tr('选听')}
            </button>
            <button
              className="track-switch"
              aria-pressed={group.mute}
              onClick={() => groupState(group, 'close')}
            >
              {tr('关闭声音')}
            </button>
          </div>
          {expanded.has(group.id) && (
            <div className="creation-object-content">
              <TrackWave
                {...timeline}
                source={'group:' + group.id}
                group={group}
                signature={JSON.stringify(group)}
              />
              <details className="source-stems" open>
                <summary>{tr('内部声部')}</summary>
                {group.tracks.map((track) => (
                  <div className="source-stem-row" key={track.id}>
                    <TrackControl
                      grouped
                      track={track}
                      selected={false}
                      onSelect={() => toggle(track.id)}
                      meterPlayer={timeline.player}
                      onState={(action) => {
                        const state = toggleTrackState(group.tracks, track.id, action).find(
                          (item) => item.id === track.id,
                        )!;
                        stemChange(group, track, { mute: state.mute, solo: state.solo });
                      }}
                      color="#91bda9"
                      onChange={(patch) => stemChange(group, track, patch)}
                    />
                    {expanded.has(track.id) && <TrackWave {...timeline} source={track.id} />}
                  </div>
                ))}
              </details>
            </div>
          )}
        </section>
      ))}
      {(project.takes || []).map((take) => (
        <section className="creation-audio-object take-object" key={take.id} data-take-id={take.id}>
          <div className="creation-object-heading">
            <button
              className="object-expand"
              aria-label={tr('展开录音 {0}', [take.label || take.name])}
              aria-expanded={expanded.has(take.id)}
              onClick={() => toggle(take.id)}
            >
              {expanded.has(take.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Mic2 size={18} />
            </button>
            <TrackControl
              track={take}
              selected={false}
              onSelect={() => toggle(take.id)}
              meterPlayer={timeline.player}
              onState={(action) => onTrackState(take, action)}
              color="#ed7894"
              onChange={(patch) => onTrackChange(take, patch)}
            />
          </div>
          {expanded.has(take.id) && (
            <div className="creation-object-content">
              <TrackWave
                {...timeline}
                source={take.id}
                signature={String(take.start) + '|' + take.offsetMs}
              />
              <TakeTiming
                take={take}
                creation
                onChange={(patch) => onTrackChange(take, patch)}
                onRemove={() => {
                  void window.jam
                    .call<Project>('take-delete', { id: project.id, takeId: take.id })
                    .then(onProject)
                    .catch((error) => onError(error.message));
                }}
              />
            </div>
          )}
        </section>
      ))}
      {live && (
        <section className="creation-audio-object live-object">
          <div className="creation-object-heading">
            <i className="record-dot" />
            <strong>{tr('正在录音')}</strong>
          </div>
          <div className="creation-object-content">
            <LiveWave {...timeline} live={live} />
          </div>
        </section>
      )}
      {!groups.length && !project.takes?.length && !live && (
        <div className="empty creation-empty">
          <Mic2 size={36} />
          <h3>{tr('录下第一条音轨')}</h3>
          <p>{tr('点击下方录音，或导入音频与分轨项目。')}</p>
        </div>
      )}
      <div ref={endAnchor} />
      {adding && (
        <AddSource
          project={project}
          library={library}
          position={timeline.position}
          onClose={() => setAdding(false)}
          onProject={onProject}
          onError={onError}
        />
      )}
    </div>
  );
}
