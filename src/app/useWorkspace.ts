import { useCallback, useEffect, useRef, useState } from 'react';
import { Player } from '../audio/Player';
import { sourceTracks } from '../audio/performance';
import { toggleTrackState } from '../audio/track-state';
import { t as tr, message as translateMessage } from '../i18n';
import type {
  JamEvent,
  Model,
  ModelDownload,
  Project,
  ProjectFolder,
  Track,
} from '../shared/types';
import { usePreferences } from './preferences';
export function useWorkspace() {
  usePreferences();
  const [library, setLibrary] = useState<Project[]>([]),
    [folders, setFolders] = useState<ProjectFolder[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [showPlayer, setShowPlayer] = useState(false),
    [creatingSession, setCreatingSession] = useState<'practice' | 'creation' | null>(null),
    [deletingProject, setDeletingProject] = useState<Project | null>(null),
    [page, setPage] = useState('library'),
    [view, setView] = useState('wave'),
    [modal, setModal] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [peaks, setPeaks] = useState<number[]>([]),
    [models, setModels] = useState<Model[]>([]),
    [modelId, setModelId] = useState('roformer-sw'),
    [mode, setMode] = useState('six'),
    [job, setJob] = useState<JamEvent | null>(null),
    [toast, setToast] = useState(''),
    [runtimeMode, setRuntimeMode] = useState('cuda'),
    [runtimeMessage, setRuntimeMessage] = useState(''),
    [installing, setInstalling] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [pair, setPair] = useState<any>(null),
    [migration, setMigration] = useState<any[]>([]),
    [migrationFolder, setMigrationFolder] = useState(''),
    [incoming, setIncoming] = useState<JamEvent | null>(null),
    [loopA, setLoopA] = useState<number | null>(null),
    [loopB, setLoopB] = useState<number | null>(null),
    [loop, setLoop] = useState(false),
    [mix, setMix] = useState(true);
  const [sidePanel, setSidePanel] = useState<'mixer' | 'ranges' | 'points'>('mixer');
  const [recording, setRecording] = useState(false);
  const [pendingRange, setPendingRange] = useState<number | null>(null),
    [activeRange, setActiveRange] = useState<string | null>(null),
    [marksTab, setMarksTab] = useState<'ranges' | 'points'>('ranges'),
    [countInRemaining, setCountInRemaining] = useState(0);
  const [waveSource, setWaveSource] = useState('mix'),
    [waveWindow, setWaveWindow] = useState(20),
    [waveLoading, setWaveLoading] = useState(false);
  const [modelDownloads, setModelDownloads] = useState<Record<string, ModelDownload>>({});
  const scrubResume = useRef(false);
  const [engine] = useState(() => new Player());
  const player = useRef(engine),
    current = useRef<Project | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  current.current = project;
  const notify = useCallback((message: string) => {
    setToast(translateMessage(message));

    if (toastTimer.current) clearTimeout(toastTimer.current);

    toastTimer.current = setTimeout(() => setToast(''), 6500);
  }, []);
  const refresh = useCallback(async () => {
    const [projects, groups] = await Promise.all([
      window.jam.call<Project[]>('library'),
      window.jam.call<ProjectFolder[]>('folders-list'),
    ]);
    setLibrary(projects);
    setFolders(groups);
  }, []);
  const adopt = useCallback((p: Project) => {
    setProject(p);

    setLibrary((list) => [p, ...list.filter((s) => s.id !== p.id)]);
  }, []);
  const openProject = useCallback(
    (p: Project) => {
      if (current.current?.id !== p.id) setView('wave');
      adopt(p);
      setShowPlayer(true);
    },
    [adopt],
  );
  const deleteProject = async () => {
    if (!deletingProject) return;
    const target = deletingProject;
    if (current.current?.id === target.id) player.current.pause();
    await window.jam.call('project-delete', { id: target.id });
    if (current.current?.id === target.id) {
      setProject(null);
      setShowPlayer(false);
      setPage(target.kind ? 'practice' : 'library');
    }
    setLibrary((list) => list.filter((item) => item.id !== target.id));
    setDeletingProject(null);
    notify(tr('已移至回收站'));
  };
  const save = useCallback(
    (p: Project) => {
      adopt(p);

      void window.jam.call('update', { id: p.id, patch: p }).catch((e) => notify(e.message));
    },

    [adopt, notify],
  );
  const act = useCallback(
    async (fn: () => Promise<any>) => {
      try {
        return await fn();
      } catch (e) {
        notify((e as Error).message);

        return null;
      }
    },

    [notify],
  );
  useEffect(() => {
    void refresh();

    void window.jam.call('runtime-status').then((s) => {
      setReady(s.ready);

      setInstalling(s.installing);

      setRuntimeMode(s.mode || 'cuda');

      if (!s.ready) setModal('settings');
    });

    void window.jam.call<Model[]>('models').then((items) => {
      setModels(items);
      const installed =
        items.find((model) => model.installed && model.id === 'roformer-sw') ||
        items.find((model) => model.installed && model.stems.length === 6) ||
        items.find((model) => model.installed && model.stems.length === 4);
      if (installed) {
        setModelId(installed.id);
        setMode(installed.stems.length === 4 ? 'basic' : 'six');
      }
    });

    const off = window.jam.onEvent((e) => {
      if (e.scope === 'audio-tools') {
        if (e.type === 'ready') setJob(null);
        else setJob({ ...e, operation: 'tools' });
        return;
      }
      if (e.scope === 'model-download') {
        const id = (
          e as JamEvent & {
            modelId: string;
          }
        ).modelId;

        setModelDownloads((list) => ({
          ...list,

          [id]: {
            status: e.type === 'complete' ? 'complete' : e.type === 'error' ? 'error' : 'progress',

            message: e.message,

            progress: e.progress,
          },
        }));

        if (e.type === 'complete') void window.jam.call<Model[]>('models').then(setModels);

        return;
      }

      if (e.scope === 'runtime') {
        if (e.message) setRuntimeMessage(e.message);

        if (e.type === 'error') {
          setInstalling(false);

          notify(e.message || tr('环境安装失败'));
        }

        return;
      }

      if (e.type === 'runtime-ready' || e.type === 'runtime-status') {
        setReady(!!e.ready);

        setInstalling(false);

        return;
      }

      if (e.type === 'incoming') {
        setIncoming(e);

        return;
      }

      if (e.type === 'library-changed') {
        void refresh();

        return;
      }

      if (e.type === 'complete') {
        setJob(null);

        if (e.result?.id) {
          setLibrary((list) => [e.result, ...list.filter((p) => p.id !== e.result.id)]);

          if (current.current?.id === e.result.id) setProject(e.result);
        }

        void window.jam.call<Model[]>('models').then(setModels);

        notify(tr('本地处理完成'));
      } else if (e.type === 'error') {
        setJob(null);

        notify(e.message || tr('处理未完成'));
      } else if (e.type === 'cancelled') {
        setJob(null);

        notify(tr('已取消，之前的项目已保留'));
      } else if (e.type === 'progress' || e.type === 'log') {
        setJob((j) => ({ ...j, ...e }));
      }
    });

    player.current.onUpdate = (t, p) => {
      setPosition(t);

      setPlaying(p);

      setCountInRemaining(player.current.countInRemaining());
    };

    return () => {
      off();

      player.current.pause();
    };
  }, []);
  const fingerprint = project
    ? project.id +
      '|' +
      sourceTracks(project)
        .map((t) => t.file + '@' + (t.start || 0))

        .join('|')
    : '';
  useEffect(() => {
    if (!project) return;

    let disposed = false;

    const same = player.current.project?.id === project.id,
      previous = player.current.position(),
      resume = same && player.current.playing;

    setLoading(true);

    setPeaks([]);

    setWaveSource('mix');

    if (!same) {
      setLoop(false);

      setLoopA(null);

      setLoopB(null);

      setPendingRange(null);

      setActiveRange(null);
    }

    void player.current

      .load(project)

      .then(() => {
        if (disposed) return;

        if (same) player.current.seek(previous);

        setLoading(false);

        if (resume) void player.current.play().catch((e) => notify(e.message));

        if (project.duration !== player.current.duration) {
          const p = { ...current.current!, duration: player.current.duration };

          save(p);
        }
      })

      .catch((e) => {
        if (!disposed) {
          setLoading(false);

          notify(e.message);
        }
      });

    return () => {
      disposed = true;
    };
  }, [fingerprint]);
  useEffect(() => {
    if (project && player.current.project?.id === project.id) player.current.apply(project);
  }, [project]);
  const waveformMixKey = project
    ? JSON.stringify([
        project.practice.master,

        sourceTracks(project).map((t) => [t.id, t.gain, t.pan, t.mute, t.solo, t.start]),

        project.originalMix,
        project.practiceMode,
        recording,
        player.current.captureActive,
      ])
    : '';
  useEffect(() => {
    if (loading || !project || player.current.project?.id !== project.id) return;
    if (project.kind === 'creation') {
      setPeaks([]);
      setWaveLoading(false);
      return;
    }

    let disposed = false;

    const cached = player.current.cachedWaveform(waveSource);

    if (cached) {
      setPeaks(cached);

      setWaveLoading(false);

      return;
    }

    setWaveLoading(true);

    const timer = setTimeout(
      () => {
        void player.current

          .waveform(waveSource)

          .then((values) => {
            if (!disposed) {
              setPeaks(values);

              setWaveLoading(false);
            }
          })

          .catch((e) => {
            if (!disposed) {
              setWaveLoading(false);

              notify(e.message);
            }
          });
      },

      waveSource === 'mix' ? 100 : 0,
    );

    return () => {
      disposed = true;

      clearTimeout(timer);
    };
  }, [fingerprint, loading, waveSource, waveformMixKey]);
  useEffect(() => {
    player.current.loop =
      loop && loopA !== null && loopB !== null && loopB > loopA ? { a: loopA, b: loopB } : null;
  }, [loop, loopA, loopB]);
  const importSongs = async (paths?: string[]) => {
    setLoading(true);

    const imported = await act(() => window.jam.call<Project[]>('import', paths ? { paths } : {}));

    setLoading(false);

    if (imported?.length) {
      await refresh();

      openProject(imported[0]);

      setPage('library');

      setModal(null);
    }
  };
  const patchPractice = (patch: any) =>
    project && save({ ...project, practice: { ...project.practice, ...patch } });
  const run = async (operation: string) => {
    if (!project) return;

    if (!ready) {
      setModal('settings');

      notify(tr('请先准备应用自己的本地运行环境'));

      return;
    }

    setJob({ type: 'progress', message: tr('准备本地任务…'), operation, projectId: project.id });

    const id = await act(() =>
      window.jam.call('run', { id: project.id, operation, modelId, mode }),
    );

    if (id) setJob((j) => ({ ...j, type: 'progress', jobId: id }));
    else setJob(null);
  };
  const captureRange = useCallback(() => {
    const p = current.current;

    if (!p) return;

    const now = player.current.position();

    setMarksTab('ranges');
    setSidePanel('ranges');
    setMix(true);

    if (pendingRange === null) {
      setPendingRange(now);

      setLoop(false);

      setActiveRange(null);

      setLoopA(now);

      setLoopB(null);

      return;
    }

    if (now <= pendingRange + 0.03) {
      notify(tr('结束位置需要在开始位置之后'));

      return;
    }

    const mark = {
      id: crypto.randomUUID(),

      title: tr('循环段落 {0}', [
        p.bookmarks.filter((item) => item.end !== undefined && item.end > item.start).length + 1,
      ]),

      start: pendingRange,

      end: now,
    };

    save({ ...p, bookmarks: [...p.bookmarks, mark] });

    setLoopA(mark.start);

    setLoopB(mark.end);

    setActiveRange(mark.id);

    setPendingRange(null);

    setLoop(true);

    player.current.seek(mark.start);
  }, [pendingRange, save, notify]);
  const addPoint = useCallback(() => {
    const p = current.current;

    if (!p) return;

    save({
      ...p,

      bookmarks: [
        ...p.bookmarks,

        {
          id: crypto.randomUUID(),

          title: tr('标记点 {0}', [
            p.bookmarks.filter((item) => item.end === undefined || item.end <= item.start).length +
              1,
          ]),

          start: player.current.position(),
        },
      ],
    });

    setMarksTab('points');
    setSidePanel('points');
    setMix(true);
  }, [save]);
  const changeTrackState = (track: Track, action: 'listen' | 'close') => {
    const p = current.current;

    if (!p) return;

    const changed = toggleTrackState(
        p.kind === 'creation' ? p.takes || [] : sourceTracks(p),
        track.id,
        action,
      ),
      state = changed.find((t) => t.id === track.id)!;

    if ((p.takes || []).some((t) => t.id === track.id))
      save({
        ...p,

        takes: p.takes!.map((t) =>
          t.id === track.id ? { ...t, mute: state.mute, solo: state.solo } : t,
        ),
      });
    else if (p.tracks.length)
      save({
        ...p,

        tracks: p.tracks.map((t) =>
          t.id === track.id ? { ...t, mute: state.mute, solo: state.solo } : t,
        ),
      });
    else save({ ...p, originalMix: { ...track, mute: state.mute, solo: state.solo } });
  };
  const changeTrack = (track: Track, patch: Partial<Track>) => {
    const p = current.current;

    if (!p) return;

    if ((p.takes || []).some((t) => t.id === track.id))
      save({ ...p, takes: p.takes!.map((t) => (t.id === track.id ? { ...t, ...patch } : t)) });
    else if (p.tracks.length)
      save({ ...p, tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, ...patch } : t)) });
    else save({ ...p, originalMix: { ...track, ...patch } });
  };
  const togglePlay = useCallback(() => {
    if (loading || !current.current) return;

    if (current.current)
      save({
        ...current.current,

        practice: { ...current.current.practice, lastPlayedAt: new Date().toISOString() },
      });

    if (player.current.playing) player.current.pause();
    else
      void player.current.play(!!current.current?.practice.countIn).catch((e) => notify(e.message));
  }, [loading, notify, save]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches('input,textarea,select') ||
        modal ||
        creatingSession ||
        deletingProject ||
        recording ||
        document.querySelector('[role="dialog"]')
      )
        return;

      if (e.code === 'Space') {
        e.preventDefault();

        togglePlay();
      }

      if (e.code === 'ArrowLeft') player.current.seek(player.current.position() - 5);

      if (e.code === 'ArrowRight') player.current.seek(player.current.position() + 5);

      if (e.key.toLowerCase() === 'l') captureRange();

      if (e.key.toLowerCase() === 'm') addPoint();
    };

    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, [modal, creatingSession, deletingProject, recording, togglePlay, captureRange, addPoint]);
  const songList = library.filter(
    (p) =>
      !p.kind &&
      (!page.startsWith('playlist:') || p.playlist === page.slice(9)) &&
      (page !== 'starred' || p.starred) &&
      (p.title + ' ' + p.artist).toLowerCase().includes(query.toLowerCase()),
  );
  return {
    folders,
    setFolders,
    sidePanel,
    setSidePanel,
    deletingProject,
    setDeletingProject,
    deleteProject,
    showPlayer,
    setShowPlayer,
    openProject,
    creatingSession,
    setCreatingSession,
    library,
    setLibrary,
    project,
    setProject,
    page,
    setPage,
    view,
    setView,
    modal,
    setModal,
    query,
    setQuery,
    position,
    setPosition,
    playing,
    setPlaying,
    ready,
    setReady,
    loading,
    setLoading,
    peaks,
    setPeaks,
    models,
    setModels,
    modelId,
    setModelId,
    mode,
    setMode,
    job,
    setJob,
    toast,
    setToast,
    runtimeMode,
    setRuntimeMode,
    runtimeMessage,
    setRuntimeMessage,
    installing,
    setInstalling,
    selected,
    setSelected,
    pair,
    setPair,
    migration,
    setMigration,
    migrationFolder,
    setMigrationFolder,
    incoming,
    setIncoming,
    loopA,
    setLoopA,
    loopB,
    setLoopB,
    loop,
    setLoop,
    mix,
    setMix,
    recording,
    setRecording,
    pendingRange,
    setPendingRange,
    activeRange,
    setActiveRange,
    marksTab,
    setMarksTab,
    countInRemaining,
    setCountInRemaining,
    waveSource,
    setWaveSource,
    waveWindow,
    setWaveWindow,
    waveLoading,
    setWaveLoading,
    modelDownloads,
    setModelDownloads,
    scrubResume,
    player,
    notify,
    refresh,
    adopt,
    save,
    act,
    importSongs,
    patchPractice,
    run,
    captureRange,
    addPoint,
    changeTrackState,
    changeTrack,
    togglePlay,
    songList,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
