import { jamCall } from '../platform/project-call';
import { prepareProjectActions } from '../platform/project-call';
import { difference, merge } from '../../shared/project-patch.cjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Player } from '../audio/Player';
import { useAudioDefaults } from '../audio/device-preferences';
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
import { isAndroid } from '../platform/environment';
import { isPlaybackToggleKey, playerShortcut } from '../shared/shortcuts';
export function useWorkspace() {
  usePreferences();
  const audioDefaults = useAudioDefaults();
  const [libraryReady, setLibraryReady] = useState(false);
  const [settingsSection, setSettingsSection] = useState('general');
  const openSettings = (section = 'general') => {
    setSettingsSection(section);
    setModal('settings');
  };
  const [library, setLibrary] = useState<Project[]>([]),
    [folders, setFolders] = useState<ProjectFolder[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [showPlayer, setShowPlayer] = useState(false),
    [creatingSession, setCreatingSession] = useState<'practice' | 'creation' | null>(null),
    [deletingProject, setDeletingProject] = useState<Project | null>(null),
    [editingProject, setEditingProject] = useState<Project | null>(null),
    [page, setPage] = useState(isAndroid ? 'practice' : 'library'),
    [view, setView] = useState('wave'),
    [modal, setModal] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false),
    [checkingRuntime, setCheckingRuntime] = useState(!isAndroid),
    [loading, setLoading] = useState(false),
    [loadProgress, setLoadProgress] = useState(''),
    [peaks, setPeaks] = useState<number[]>([]),
    [models, setModels] = useState<Model[]>([]),
    [modelId, setModelId] = useState('roformer-sw'),
    [mode, setMode] = useState('six'),
    [job, setJob] = useState<JamEvent | null>(null),
    [toast, setToast] = useState(''),
    [runtimeMode, setRuntimeMode] = useState('cuda'),
    [runtimeMessage, setRuntimeMessage] = useState(''),
    [runtimeDownload, setRuntimeDownload] = useState<JamEvent | null>(null),
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
  useEffect(() => setSelected([]), [modal]);
  const [recoveryProject, setRecoveryProject] = useState<Project | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingRange, setPendingRange] = useState<number | null>(null),
    [activeRange, setActiveRange] = useState<string | null>(null),
    [marksTab, setMarksTab] = useState<'ranges' | 'points'>('ranges'),
    [countInRemaining, setCountInRemaining] = useState(0);
  const [waveSource, setWaveSource] = useState('mix'),
    [waveWindow, setWaveWindow] = useState(20),
    [waveLoading, setWaveLoading] = useState(false);
  const [modelDownloads, setModelDownloads] = useState<Record<string, ModelDownload>>({});
  const [engine] = useState(() => new Player());
  const player = useRef(engine),
    pendingNotes = useRef(new Map<string, string>()),
    current = useRef<Project | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  current.current = project;
  const notify = useCallback((message: string) => {
    setToast(translateMessage(message));

    if (toastTimer.current) clearTimeout(toastTimer.current);

    toastTimer.current = setTimeout(() => setToast(''), 6500);
  }, []);
  useEffect(() => {
    if (isAndroid || !project || recording) return;
    let cancelled = false;
    const route = async () => {
      try {
        await player.current.setOutputDevice(
          project.recordingSettings?.outputDeviceId || audioDefaults.outputDeviceId,
        );
      } catch {
        if (!cancelled) {
          await player.current.setOutputDevice('default');
          notify(tr('输出设备不可用，播放已临时使用系统默认设备'));
        }
      }
    };
    void route().catch((error) => !cancelled && notify(error.message));
    const changed = () => {
      void route().catch((error) => !cancelled && notify(error.message));
    };
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', changed);
    };
  }, [
    project?.id,
    project?.recordingSettings?.outputDeviceId,
    audioDefaults.outputDeviceId,
    recording,
    notify,
  ]);
  const refresh = useCallback(async () => {
    const [projects, groups] = await Promise.all([
      jamCall<Project[]>('library'),
      jamCall<ProjectFolder[]>('folders-list').catch(() => []),
    ]);
    setLibrary(projects);
    setFolders(groups);
    setLibraryReady(true);
  }, []);
  const adopt = useCallback((p: Project) => {
    const notes = pendingNotes.current.get(p.id);
    if (notes !== undefined) p = { ...p, notes };
    current.current = p;
    setProject(p);

    setLibrary((list) => [p, ...list.filter((s) => s.id !== p.id)]);
  }, []);
  const adoptIfCurrent = useCallback(
    (p: Project) => {
      if (current.current?.id === p.id) adopt(p);
      else setLibrary((list) => list.map((item) => (item.id === p.id ? p : item)));
    },
    [adopt],
  );
  const notesTasks = useRef(new Map<string, Promise<void>>());
  const edits = useRef(new Map<string, { base: Project; next: Project; task?: Promise<void> }>());
  const failedNotes = useRef(new Set<string>());
  const failedEdits = useRef(new Set<string>());
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const updateSaveState = useCallback(() => {
    if (failedNotes.current.size || failedEdits.current.size) setSaveState('error');
    else setSaveState(edits.current.size || pendingNotes.current.size ? 'saving' : 'saved');
  }, []);
  const canAutoSave = useCallback(
    (id: string) => !failedNotes.current.has(id) && !failedEdits.current.has(id),
    [],
  );
  const flushNotes = useCallback(
    async (targetId?: string, automatic = false) => {
      if (!targetId && saveTimer.current) clearTimeout(saveTimer.current);
      await Promise.all(
        [...pendingNotes.current.keys()]
          .filter((id) => (!targetId || id === targetId) && (!automatic || canAutoSave(id)))
          .map((id) => {
            const existing = notesTasks.current.get(id);
            if (existing) return existing;
            const task = (async () => {
              try {
                while (pendingNotes.current.has(id)) {
                  const notes = pendingNotes.current.get(id)!;
                  await jamCall('update', { id, patch: { notes } });
                  if (pendingNotes.current.get(id) === notes) pendingNotes.current.delete(id);
                }
                failedNotes.current.delete(id);
              } catch (error) {
                failedNotes.current.add(id);
                notify((error as Error).message);
                throw error;
              } finally {
                notesTasks.current.delete(id);
                updateSaveState();
              }
            })();
            notesTasks.current.set(id, task);
            return task;
          })
          .map((task) => (automatic ? task.catch(() => {}) : task)),
      );
    },
    [notify, canAutoSave, updateSaveState],
  );
  const saveNotes = useCallback(
    (p: Project) => {
      pendingNotes.current.set(p.id, p.notes || '');
      adopt(p);
      updateSaveState();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushNotes(undefined, true).catch(() => {}), 300);
    },
    [adopt, flushNotes, updateSaveState],
  );
  const openProject = useCallback(
    (p: Project) => {
      if (recording) {
        notify(tr('请先停止录音后再返回'));
        return;
      }
      void flushNotes(undefined, true).catch(() => {});
      if (p.broken) {
        setRecoveryProject(p);
        return;
      }
      if (current.current?.id !== p.id) setView('wave');
      adopt(p);
      setShowPlayer(true);
    },
    [adopt, flushNotes, recording, notify],
  );
  const deleteProject = async () => {
    if (!deletingProject) return;
    const target = deletingProject;
    if (current.current?.id === target.id) player.current.pause();
    await jamCall('project-delete', { id: target.id });
    if (current.current?.id === target.id) {
      setProject(null);
      setShowPlayer(false);
      setPage(target.kind ? 'practice' : 'library');
    }
    setLibrary((list) => list.filter((item) => item.id !== target.id));
    setDeletingProject(null);
    notify(tr('已移至回收站'));
  };
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstEdit = useRef(0);
  const flushEdits = useCallback(
    async (targetId?: string, automatic = false) => {
      if (!targetId) {
        if (editTimer.current) clearTimeout(editTimer.current);
        firstEdit.current = 0;
      }
      await flushNotes(targetId, automatic);
      await Promise.all(
        [...edits.current]
          .filter(([id]) => (!targetId || id === targetId) && (!automatic || canAutoSave(id)))
          .map(async ([id, edit]) => {
            if (edit.task) return edit.task;
            edit.task = (async () => {
              try {
                while (true) {
                  const patch = difference(edit.base, edit.next);
                  if (!Object.keys(patch).length) break;
                  const sent = edit.next;
                  const saved = await jamCall<Project>('update', { id, patch });
                  edit.next = merge(saved, difference(sent, edit.next));
                  edit.base = saved;
                  if (current.current?.id === id) adopt(edit.next);
                  else setLibrary((list) => list.map((p) => (p.id === id ? edit.next : p)));
                }
                edits.current.delete(id);
                failedEdits.current.delete(id);
              } catch (error) {
                failedEdits.current.add(id);
                notify((error as Error).message);
                throw error;
              } finally {
                edit.task = undefined;
                updateSaveState();
              }
            })();
            return edit.task;
          }),
      );
    },
    [adopt, notify, flushNotes, canAutoSave, updateSaveState],
  );
  useEffect(() => prepareProjectActions(flushEdits), [flushEdits]);
  const discardChanges = useCallback(async () => {
    const id = current.current?.id;
    if (!id) return;
    await Promise.allSettled([edits.current.get(id)?.task, notesTasks.current.get(id)]);
    const projects = await jamCall<Project[]>('library');
    const restored = projects.find((item) => item.id === id);
    if (!restored) throw new Error(tr('项目不存在'));
    edits.current.delete(id);
    pendingNotes.current.delete(id);
    failedNotes.current.delete(id);
    failedEdits.current.delete(id);
    if (current.current?.id === id) {
      adopt(restored);
      if (player.current.project?.id === id) player.current.apply(restored);
    }
    updateSaveState();
  }, [adopt, updateSaveState]);
  const save = useCallback(
    (p: Project) => {
      const base = project?.id === p.id ? project : library.find((item) => item.id === p.id);
      if (!base) return;
      if (
        player.current.captureOwner &&
        (p.practice.tempo !== base.practice.tempo || p.practice.pitch !== base.practice.pitch)
      ) {
        notify(tr('请先停止录音后再返回'));
        return;
      }
      const patch = difference(base, p);
      if (!Object.keys(patch).length) return;
      const edit = edits.current.get(p.id) || { base, next: base };
      edit.next = merge(edit.next, patch);
      edits.current.set(p.id, edit);
      const latest = current.current?.id === p.id ? current.current : base;
      adopt(merge(latest, patch));
      // Sound changes immediately; writes are coalesced during a gesture.
      if (player.current.project?.id === p.id) player.current.apply(merge(latest, patch));
      updateSaveState();
      if (editTimer.current) clearTimeout(editTimer.current);
      if (!firstEdit.current) firstEdit.current = Date.now();
      editTimer.current = setTimeout(
        () => void flushEdits(undefined, true).catch(() => {}),
        Math.max(0, Math.min(250, 1000 - (Date.now() - firstEdit.current))),
      );
    },
    [project, library, adopt, flushEdits, updateSaveState],
  );
  useEffect(() => {
    const flush = () => {
      void flushEdits(undefined, true).catch(() => {});
    };
    window.addEventListener('pointerup', flush);
    window.addEventListener('keyup', flush);
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pointerup', flush);
      window.removeEventListener('keyup', flush);
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flushEdits]);
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

    void jamCall('runtime-status')
      .then((s) => {
        setCheckingRuntime(false);
        setReady(s.ready);

        setInstalling(s.installing);

        setRuntimeMode(s.mode || 'cuda');

        // An installed environment still being checked is not an installation failure.
      })
      .catch((error) => {
        setCheckingRuntime(false);
        notify(error.message);
      });

    void jamCall<Model[]>('models').then((items) => {
      setModels(items);
      const installed =
        items.find((model) => model.installed && model.id === 'roformer-sw') ||
        items.find((model) => model.installed && model.stems.length === 6) ||
        items.find((model) => model.installed && model.stems.length === 4) ||
        (isAndroid ? items.find((model) => model.installed && model.stems.length > 0) : undefined);
      if (installed) {
        setModelId(installed.id);
        setMode(
          installed.stems.length === 2 ? 'vocal' : installed.stems.length === 4 ? 'basic' : 'six',
        );
      }
    });

    const off = window.jam.onEvent((e) => {
      if (e.type === 'closing') {
        const detail = { tasks: [] as Promise<void>[] };
        window.dispatchEvent(new CustomEvent('immerse-before-close', { detail }));
        void Promise.all(detail.tasks)
          .then(() => flushEdits())
          .then(() => jamCall('window', { action: 'close-ready' }))
          .catch(() => jamCall('window', { action: 'close-cancel' }));
        return;
      }
      if (e.type === 'import-report') {
        notify(e.message || '');
        return;
      }
      // Native output errors belong to the player; they must not clear a processing job.
      if (e.scope === 'native-audio') return;
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

            progress: e.progress ?? (e.type === 'error' ? list[id]?.progress : undefined),
            file: e.file ?? (e.type === 'error' ? list[id]?.file : undefined),
            received: e.received ?? (e.type === 'error' ? list[id]?.received : undefined),
            total: e.total ?? (e.type === 'error' ? list[id]?.total : undefined),
            bytesPerSecond: e.bytesPerSecond,
          },
        }));

        if (e.type === 'complete') void jamCall<Model[]>('models').then(setModels);

        return;
      }

      if (e.scope === 'runtime') {
        setRuntimeDownload(e);
        if (e.message) setRuntimeMessage(e.message);

        if (e.type === 'error') {
          setInstalling(false);

          notify(e.message || tr('环境安装失败'));
        }

        return;
      }

      if (e.type === 'runtime-ready' || e.type === 'runtime-status') {
        setRuntimeDownload(null);
        setReady(!!e.ready);

        setInstalling(false);

        return;
      }

      if (e.type === 'incoming') {
        setIncoming(e);

        return;
      }
      if (e.type === 'shared-import' && e.result?.id) {
        adopt(e.result);
        setShowPlayer(true);
        void refresh();
        notify(tr('已接收并导入'));
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

        void jamCall<Model[]>('models').then(setModels);

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

    player.current.onError = notify;
    player.current.onLoadProgress = setLoadProgress;
    player.current.onUpdate = (t, p) => {
      setPosition(t);

      setPlaying(p);

      setCountInRemaining(player.current.countInRemaining());
    };
    const dispose = () => player.current.dispose();
    window.addEventListener('pagehide', dispose);

    return () => {
      off();

      window.removeEventListener('pagehide', dispose);
      player.current.dispose();
    };
  }, []);
  const [audioRevision, setAudioRevision] = useState(0);
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

    if (player.current.canAppend(project)) {
      void player.current
        .append(project)
        .then(() => {
          if (!disposed) {
            setAudioRevision((value) => value + 1);
            const latest = current.current;
            if (latest?.id === project.id && latest.duration !== player.current.duration)
              save({ ...latest, duration: player.current.duration });
          }
        })
        .catch((error) => {
          if (!disposed) notify(error.message);
        });
      return () => {
        disposed = true;
      };
    }
    setLoading(true);

    setPeaks(player.current.previewWaveform(project) || []);

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
        audioRevision,
        player.current.captureMix,

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

    const imported = await act(() => jamCall<Project[]>('import', paths ? { paths } : {}));

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
  const run = async (operation: string, refreshRhythm = false) => {
    if (isAndroid) {
      notify(tr('手机端仅支持外部导入的音轨与分析'));
      return;
    }
    await flushEdits();
    if (!project) return;

    if (!ready || checkingRuntime) {
      setCheckingRuntime(true);
      const status = await act(() => jamCall('runtime-status'));
      setCheckingRuntime(false);
      setReady(!!status?.ready);
      if (!status?.ready) {
        openSettings('models');
        notify(tr('请先准备应用自己的本地运行环境'));

        return;
      }
    }

    setJob({ type: 'progress', message: tr('准备本地任务…'), operation, projectId: project.id });

    const id = await act(() =>
      jamCall('run', { id: project.id, operation, modelId, mode, refreshRhythm }),
    );

    if (id)
      setJob((j) => ({ ...j, type: 'progress', jobId: typeof id === 'string' ? id : id.jobId }));
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

    if (player.current.playing || player.current.starting) player.current.pause();
    else
      void player.current.play(!!current.current?.practice.countIn).catch((e) => notify(e.message));
  }, [loading, notify, save]);
  const playbackSpaceHeld = useRef(false);
  useEffect(() => {
    const focusStyle = document.documentElement.dataset;
    const clearControlFocus = () => {
      delete focusStyle.controlFocus;
    };
    const onPointerDown = () => {
      focusStyle.controlFocus = 'pointer';
    };
    const onFocusIn = () => {
      if (focusStyle.controlFocus === 'space') clearControlFocus();
    };
    const consumeSpace = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const listener = (e: KeyboardEvent, playbackSpace = false) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        e.defaultPrevented ||
        e.isComposing ||
        target?.closest(
          'textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="menu"]',
        ) ||
        (!playbackSpace && target?.closest('.desktop-window-controls,.layout-switch')) ||
        (target instanceof HTMLInputElement &&
          !(playbackSpace && ['range', 'button', 'checkbox', 'radio'].includes(target.type))) ||
        modal ||
        creatingSession ||
        deletingProject ||
        (!playbackSpace && recording) ||
        document.querySelector('[role="dialog"],[role="menu"][data-state="open"],[role="listbox"]')
      )
        return;

      if (playbackSpace) {
        consumeSpace(e);
        playbackSpaceHeld.current = true;
        // Chromium can switch to keyboard focus styling even on a cancelled keydown.
        focusStyle.controlFocus = 'space';
        if (!e.repeat && !recording && !loading && current.current?.duration) togglePlay();
        return;
      }
      const action = playerShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'toggle') togglePlay();
      else if (action === 'back') player.current.seek(player.current.position() - 5);
      else if (action === 'forward') player.current.seek(player.current.position() + 5);
      else if (action === 'loop') captureRange();
      else if (action === 'marker') addPoint();
    };

    const onSpaceDown = (e: KeyboardEvent) => {
      if (!isPlaybackToggleKey(e) || e.ctrlKey || e.metaKey || e.altKey) {
        clearControlFocus();
        return;
      }
      if (playbackSpaceHeld.current && e.repeat) consumeSpace(e);
      else listener(e, true);
    };
    const onSpaceUp = (e: KeyboardEvent) => {
      if (!playbackSpaceHeld.current || !isPlaybackToggleKey(e)) return;
      playbackSpaceHeld.current = false;
      consumeSpace(e);
    };
    const onWindowBlur = () => {
      playbackSpaceHeld.current = false;
      clearControlFocus();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPlaybackToggleKey(e)) listener(e);
    };
    window.addEventListener('keydown', onSpaceDown, true);
    window.addEventListener('keyup', onSpaceUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onSpaceDown, true);
      window.removeEventListener('keyup', onSpaceUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    modal,
    creatingSession,
    deletingProject,
    recording,
    loading,
    togglePlay,
    captureRange,
    addPoint,
  ]);
  const songList = library.filter(
    (p) =>
      !p.kind &&
      (!page.startsWith('playlist:') || p.playlist === page.slice(9)) &&
      (page !== 'starred' || p.starred) &&
      (p.title + ' ' + p.artist).toLowerCase().includes(query.toLowerCase()),
  );
  return {
    editingProject,
    setEditingProject,
    checkingRuntime,
    adoptIfCurrent,
    flushEdits,
    discardChanges,
    saveState,
    saveNotes,
    flushNotes,
    recoveryProject,
    setRecoveryProject,
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
    settingsSection,
    openSettings,
    libraryReady,
    query,
    setQuery,
    position,
    setPosition,
    playing,
    setPlaying,
    ready,
    setReady,
    loading,
    loadProgress,
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
    runtimeDownload,
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
