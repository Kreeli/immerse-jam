import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bookmark,
  Check,
  Download,
  FileMusic,
  FolderInput,
  Library,
  LoaderCircle,
  Music2,
  Plus,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
  Menu,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isAndroid } from '../platform/environment';
import donation from '../../assets/author-wechat.png';
import type { LiveEnvelope } from '../audio/live-envelope';
import { sourceTracks } from '../audio/performance';
import { transpose } from '../features/analysis/transposition';
import ChordSheet from '../features/chords/ChordSheet';
import Attachments from '../features/library/Attachments';
import DeleteProjectDialog from '../features/library/DeleteProjectDialog';
import LibraryPage from '../features/library/LibraryPage';
import RecoveryDialog from '../features/library/RecoveryDialog';
import FolderPage, { FolderDialog } from '../features/library/Folders';
import ProjectHeading from '../features/library/ProjectHeading';
import Sidebar from '../features/library/Sidebar';
import DatabaseMigration from '../features/migration/DatabaseMigration';
import { compatible } from '../features/models/compatibility';
import ModelManager from '../features/models/ModelManager';
import Mixer from '../features/player/Mixer';
import PracticeToolbar from '../features/player/PracticeToolbar';
import SidePanel from '../features/player/SidePanel';
import SyncedVideo from '../features/player/SyncedVideo';
import { trackLabel } from '../features/player/TrackControl';
import Transport from '../features/player/Transport';
import Waveform from '../features/player/Waveform';
import CreationTracks from '../features/recording/CreationTracks';
import PracticeHub from '../features/recording/PracticeHub';
import PracticeRecorder from '../features/recording/PracticeRecorder';
import CreateFromSong from '../features/recording/CreateFromSong';
import PracticeWaves from '../features/recording/PracticeWaves';
import SessionCreateDialog from '../features/recording/SessionCreateDialog';
import Score from '../features/score/Score';
import AppearanceSettings from '../features/settings/AppearanceSettings';
import StorageLocations from '../features/settings/StorageLocations';
import AnalysisNote from '../features/settings/AnalysisNote';
import RemoteTransfer from '../features/transfer/RemoteTransfer';
import { t as tr, message as translateMessage } from '../i18n';
import { type Model, type Project, type Track } from '../shared/types';
import { useWorkspace } from './useWorkspace';
const colors = ['#ed7894', '#d9a86c', '#91bda9', '#a092cd', '#7fa8d3', '#8e949d'];
const modes = () => [
  ...(isAndroid ? [{ id: 'vocal', name: tr('人声与伴奏'), desc: tr('随包移动模型 · 两轨') }] : []),
  { id: 'basic', name: tr('基础模式'), desc: tr('人声 / 鼓 / 贝斯 / 其他') },
  { id: 'six', name: tr('完整六轨'), desc: tr('人声 / 鼓 / 贝斯 / 钢琴 / 吉他 / 其他') },
  { id: 'guitarist', name: tr('吉他手'), desc: tr('主奏吉他 / 节奏吉他 / 其他') },
  { id: 'drummer', name: tr('鼓手'), desc: tr('鼓 / 其他') },
  { id: 'bassist', name: tr('贝斯手'), desc: tr('贝斯 / 其他') },
  { id: 'singer', name: tr('歌手'), desc: tr('主唱 / 和声 / 其他') },
];
export default function App() {
  const controller = useWorkspace();
  const [live, setLive] = useState<LiveEnvelope | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [sessionSource, setSessionSource] = useState<Project | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileMixer, setMobileMixer] = useState(false);
  const androidBack = useRef<() => boolean>(() => false);
  const folderProps = {
    folders: controller.folders,
    onFolders: controller.setFolders,
    onError: controller.notify,
  };
  const {
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
    sidePanel,
    setSidePanel,
    showPlayer,
    setShowPlayer,
    openProject,
    creatingSession,
    setCreatingSession,
    deletingProject,
    setDeletingProject,
    deleteProject,
  } = controller;
  const timeline = {
    player: player.current,
    position,
    duration: Math.max(project?.duration || 0, position),
    windowSeconds: waveWindow,
    recording,
    loading,
    onSeek: (seconds: number) => player.current.seek(seconds),
    onScrubStart: () => {
      scrubResume.current = player.current.playing;
      player.current.pause();
    },
    onScrubEnd: () => {
      if (scrubResume.current) {
        scrubResume.current = false;
        void player.current.play().catch((error) => notify(error.message));
      }
    },
  };
  const isVideo = /\.(mp4|webm|mov)$/i.test(project?.original || '');
  androidBack.current = () => {
    if (recording) {
      notify(tr('请先停止录音后再返回'));
      return true;
    }
    if (mobileMixer) {
      setMobileMixer(false);
      return true;
    }
    if (mobileMenu) {
      setMobileMenu(false);
      return true;
    }
    const close = [...document.querySelectorAll<HTMLButtonElement>('.modal-backdrop button')]
      .reverse()
      .find(
        (button) =>
          !button.disabled &&
          /关闭|取消|Close|Cancel/.test(
            button.getAttribute('aria-label') || button.textContent || '',
          ),
      );
    if (close) {
      close.click();
      return true;
    }
    if (deletingProject) {
      setDeletingProject(null);
      return true;
    }
    if (creatingFolder) {
      setCreatingFolder(false);
      return true;
    }
    if (creatingSession) {
      setCreatingSession(null);
      return true;
    }
    if (modal) {
      setModal(null);
      return true;
    }
    if (showPlayer && project) {
      if (view !== 'wave') {
        setView('wave');
        return true;
      }
      setShowPlayer(false);
      setPage(project.kind ? 'practice' : 'library');
      return true;
    }
    if (page !== 'library') {
      setPage('library');
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!isAndroid) return;
    const back = () => {
      void window.jam.call('android-back-result', { handled: androidBack.current() });
    };
    window.addEventListener('immerse-android-back', back);
    return () => window.removeEventListener('immerse-android-back', back);
  }, []);
  useEffect(() => {
    setMobileMenu(false);
    setMobileMixer(false);
  }, [page, modal, project?.id]);
  return (
    <div
      className={
        'app ' +
        (recording ? 'is-recording ' : '') +
        (mobileMenu ? 'mobile-menu-open ' : '') +
        (mobileMixer ? 'mobile-mixer-open ' : '')
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...e.dataTransfer.files].map((f) => window.jam.filePath(f));
        if (!files.length) return;
        if (recording) {
          notify(tr('请先停止录音后再导入文件'));
          return;
        }
        if (project?.kind === 'creation' && showPlayer) {
          void act(async () => {
            for (const file of files) {
              const updated = await window.jam.call<Project | null>(
                /\.(ijam|aum)$/i.test(file) ? 'creation-import-group' : 'take-import',
                { id: project.id, path: file, paths: [file], position: player.current.position() },
              );
              if (updated) adopt(updated);
            }
          });
        } else void importSongs(files);
      }}
    >
      <Sidebar {...controller} onCreateFolder={() => setCreatingFolder(true)} />
      {(mobileMenu || mobileMixer) && (
        <button
          className="mobile-scrim"
          aria-label={tr('关闭侧栏')}
          onClick={() => {
            setMobileMenu(false);
            setMobileMixer(false);
          }}
        />
      )}
      <main className={'workspace ' + (project ? 'has-player' : '')}>
        {isAndroid && (
          <div className="mobile-chrome">
            <button
              className="icon-button"
              aria-label={tr('打开导航')}
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <strong>Immerse Jam</strong>
            {project && showPlayer && (
              <button
                className="icon-button"
                aria-label={tr('打开控制台')}
                onClick={() => setMobileMixer(!mobileMixer)}
              >
                <SlidersHorizontal size={22} />
              </button>
            )}
          </div>
        )}
        <div className="browse-content" hidden={!!project && showPlayer}>
          {page.startsWith('folder:') ? (
            <FolderPage
              key={page}
              {...folderProps}
              id={page.slice(7)}
              library={library}
              onOpen={openProject}
              onDelete={setDeletingProject}
              onCreate={() => setCreatingFolder(true)}
            />
          ) : page === 'practice' ? (
            <PracticeHub
              {...folderProps}
              library={library}
              onOpen={openProject}
              onCreate={setCreatingSession}
              onDelete={setDeletingProject}
            />
          ) : (
            <LibraryPage {...controller} />
          )}
        </div>
        {project && (
          <>
            <div className="player-screen" hidden={!showPlayer}>
              <header className="player-header">
                <button
                  className="icon-button"
                  title={project.kind ? tr('返回列表') : tr('返回曲库')}
                  onClick={() => {
                    setPage(project.kind ? 'practice' : 'library');
                    setShowPlayer(false);
                  }}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="now-cover">
                  <Music2 size={24} />
                </div>
                <ProjectHeading {...folderProps} project={project} onProject={save} />
                <div className="view-switch">
                  {[
                    {
                      id: 'wave',
                      label: project.kind === 'creation' ? tr('音轨') : tr('波形'),
                      icon: AudioLines,
                    },
                    { id: 'chords', label: tr('和弦'), icon: Library },
                    { id: 'score', label: tr('乐谱'), icon: FileMusic },
                    { id: 'attachments', label: tr('附件'), icon: Bookmark },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      className={view === id ? 'selected' : ''}
                      onClick={() => setView(id)}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {!project.kind && (
                  <CreateFromSong
                    project={project}
                    onCreate={(kind) => {
                      setSessionSource(project);
                      setCreatingSession(kind);
                    }}
                  />
                )}
                {project.kind !== 'creation' && (
                  <button
                    className="primary small"
                    disabled={!!job}
                    onClick={() => setModal('separate')}
                  >
                    <Sparkles size={15} />
                    {tr('开始分析')}
                  </button>
                )}
                <button
                  className="icon-button"
                  title={tr('导出歌曲项目')}
                  onClick={() => setModal('export')}
                >
                  <Download size={18} />
                </button>
                <button
                  className={'icon-button ' + (mix ? 'pressed' : '')}
                  title={tr('混音面板')}
                  onClick={() => setMix(!mix)}
                >
                  <SlidersHorizontal size={18} />
                </button>
              </header>
              <PracticeToolbar
                pendingRange={pendingRange}
                loop={loop}
                onRange={captureRange}
                onPoint={addPoint}
                onStop={() => setLoop(false)}
                onCancel={() => {
                  setPendingRange(null);
                  setLoopA(null);
                  setLoopB(null);
                }}
                recording={recording}
                windowSeconds={waveWindow}
                onWindow={setWaveWindow}
              />
              <div className="player-body">
                <div className="practice-area">
                  {view === 'attachments' ? (
                    <Attachments
                      project={project}
                      onProject={save}
                      onNotes={controller.saveNotes}
                      onNotesBlur={() => void controller.flushNotes()}
                      onError={notify}
                    />
                  ) : view === 'score' ? (
                    <Score
                      project={project}
                      position={position}
                      onProject={save}
                      onAlign={() => void run('align')}
                      onError={notify}
                    />
                  ) : view === 'chords' ? (
                    <ChordSheet
                      project={project}
                      position={position}
                      playing={playing}
                      onSeek={(t) => player.current.seek(t)}
                      onProject={save}
                      onAnalyze={() => void run('analyze')}
                      busy={!!job}
                      formatLabel={(label) => transpose(label, project.practice.pitch)}
                    />
                  ) : project.kind === 'creation' ? (
                    <CreationTracks
                      {...timeline}
                      project={project}
                      library={library}
                      live={live}
                      onProject={save}
                      onError={notify}
                      onTrackChange={changeTrack}
                      onTrackState={changeTrackState}
                    />
                  ) : (
                    <div
                      className={
                        'wave-workspace ' +
                        (project.kind === 'practice' ? 'practice-wave-comparison' : '')
                      }
                    >
                      <div className="wave-caption">
                        <div>
                          <button
                            className={
                              'small ' + (waveSource === 'mix' ? 'wave-source-active' : '')
                            }
                            onClick={() => setWaveSource('mix')}
                          >
                            {tr('总混音波形')}
                          </button>
                          <span className="wave-source-name">
                            {waveSource === 'mix'
                              ? sourceTracks(project).length > 1
                                ? tr('{0} 条音轨混合', [sourceTracks(project).length])
                                : sourceTracks(project)[0]
                                  ? trackLabel(sourceTracks(project)[0])
                                  : tr('音轨')
                              : trackLabel(
                                  sourceTracks(project).find((t) => t.id === waveSource) ||
                                    project.originalMix ||
                                    ({ name: tr('原曲') } as Track),
                                )}
                            {waveLoading ? tr(' \u00B7 正在生成波形…') : ''}
                          </span>
                        </div>
                      </div>
                      <>
                        <div className="comparison-lane main-wave-lane">
                          <Waveform
                            {...timeline}
                            peaks={peaks}
                            peakDuration={player.current.duration}
                            source={waveSource}
                            a={loopA}
                            b={loopB}
                            disabled={recording}
                          />
                        </div>
                        {project.kind === 'practice' && (
                          <PracticeWaves {...timeline} project={project} live={live} />
                        )}
                      </>
                      <div className="wave-window-hint">
                        {tr(
                          '播放位置固定在中央 \u00B7 左右拖动波形移动时间窗口 \u00B7 点击音轨切换波形，再点一次回到总混音',
                        )}
                      </div>
                      {isVideo && (
                        <SyncedVideo project={project} position={position} playing={playing} />
                      )}
                    </div>
                  )}
                </div>
                {mix && (
                  <SidePanel
                    tab={sidePanel}
                    onTab={setSidePanel}
                    recording={recording}
                    marks={{
                      marks: project.bookmarks,
                      tab: marksTab,
                      onTab: setMarksTab,
                      activeId: loop ? activeRange : null,
                      onJump: (mark) => {
                        setPendingRange(null);
                        if (mark.end !== undefined && mark.end > mark.start) {
                          setLoopA(mark.start);
                          setLoopB(mark.end);
                          setLoop(true);
                          setActiveRange(mark.id);
                        } else {
                          setLoop(false);
                          setActiveRange(null);
                          setLoopA(null);
                          setLoopB(null);
                        }
                        player.current.seek(mark.start);
                      },
                      onRename: (id, name) =>
                        save({
                          ...project,
                          bookmarks: project.bookmarks.map((mark) =>
                            mark.id === id ? { ...mark, title: name } : mark,
                          ),
                        }),
                      onDelete: (id) => {
                        save({
                          ...project,
                          bookmarks: project.bookmarks.filter((mark) => mark.id !== id),
                        });
                        if (activeRange === id) {
                          setLoop(false);
                          setActiveRange(null);
                          setLoopA(null);
                          setLoopB(null);
                        }
                      },
                    }}
                    mixer={
                      <Mixer
                        key={project.id}
                        project={project}
                        player={player.current}
                        loading={loading}
                        waveSource={waveSource}
                        onWaveSource={setWaveSource}
                        onProject={save}
                        onAdopt={adopt}
                        onError={notify}
                        onPractice={patchPractice}
                        onTrackState={changeTrackState}
                        onTrackChange={changeTrack}
                        recording={recording}
                      />
                    }
                  />
                )}
              </div>
            </div>
            <Transport
              recorder={
                project.kind || project.takes?.length ? (
                  <PracticeRecorder
                    key={project.id}
                    project={project}
                    libraryOnly={!project.kind}
                    player={player.current}
                    onProject={save}
                    onError={notify}
                    onActive={(active) => {
                      setRecording(active);
                      if (active) setShowPlayer(true);
                    }}
                    onLive={setLive}
                    disabled={loading}
                  />
                ) : null
              }
              browsing={!showPlayer}
              onReturn={() => setShowPlayer(true)}
              project={project}
              player={player.current}
              recording={recording}
              loading={loading}
              playing={playing}
              position={position}

              countInRemaining={countInRemaining}

              onTogglePlay={togglePlay}
              onPractice={patchPractice}
            />
          </>
        )}
      </main>
      {controller.recoveryProject && (
        <RecoveryDialog
          project={controller.recoveryProject}
          onClose={() => controller.setRecoveryProject(null)}
          onRecovered={controller.refresh}
          onError={notify}
        />
      )}
      {deletingProject && (
        <DeleteProjectDialog
          project={deletingProject}
          onClose={() => setDeletingProject(null)}
          onDelete={deleteProject}
          onError={notify}
        />
      )}
      {creatingFolder && <FolderDialog {...folderProps} onClose={() => setCreatingFolder(false)} />}
      {creatingSession && (
        <SessionCreateDialog
          kind={creatingSession}
          initialSource={sessionSource || undefined}
          library={library}
          onClose={() => {
            setCreatingSession(null);
            setSessionSource(null);
          }}
          onError={notify}
          onCreated={(p) => {
            setCreatingSession(null);
            setSessionSource(null);
            setPage('practice');
            openProject(p);
          }}
        />
      )}
      {job && (
        <div className="job-card">
          <div>
            <LoaderCircle size={18} className="spin" />
            <strong>
              {job.operation === 'align'
                ? tr('自动对齐乐谱')
                : job.operation === 'analyze'
                  ? tr('分析音乐')
                  : job.operation === 'separate'
                    ? tr('本地音轨分离')
                    : tr('本地处理')}
            </strong>
            {job.jobId && (
              <button onClick={() => void window.jam.call('cancel', { jobId: job.jobId })}>
                <X size={16} />
              </button>
            )}
          </div>
          <p>{translateMessage(job.message || '').slice(-180) || tr('处理中…')}</p>
          <progress value={job.progress ?? undefined} max="1" />
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <section
            className={'modal ' + (modal === 'separate' || modal === 'settings' ? 'wide' : '')}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">IMMERSE JAM</span>
                <h2>
                  {
                    {
                      separate: tr('分析音乐'),
                      settings: tr('设置与模型'),
                      transfer: tr('设备互传'),
                      migration: tr('迁移 Audio Jam'),
                      donate: tr('请作者喝一瓶冰可乐'),
                      feedback: tr('用户反馈'),
                      export: tr('导出音乐'),
                    }[modal]
                  }
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label={tr('关闭窗口')}
                onClick={() => setModal(null)}
              >
                <X size={22} />
              </button>
            </div>
            {modal === 'separate' && (
              <>
                <p className="muted">
                  {isAndroid
                    ? tr('所有计算都在本机完成。复杂分轨方式会随移动模型适配逐步加入。')
                    : tr('选择练习方式，所有计算都在这台电脑完成。')}
                </p>
                <AnalysisNote />
                <button
                  className="analysis-only"
                  disabled={!!job}
                  onClick={() => {
                    setModal(null);
                    void run('analyze');
                  }}
                >
                  <Music2 size={18} />
                  <span>
                    <strong>{tr('识别和弦与节拍')}</strong>
                    <small>{tr('生成可编辑的小节和弦谱，不分离音轨')}</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <h3>{tr('音轨分离')}</h3>
                <div className="mode-grid">
                  {modes().map((m) => (
                    <button
                      key={m.id}
                      className={mode === m.id ? 'selected' : ''}
                      disabled={
                        isAndroid &&
                        (!['vocal', 'basic', 'drummer', 'bassist'].includes(m.id) ||
                          !models.some((model) => compatible(model, m.id)))
                      }
                      onClick={() => {
                        setMode(m.id);
                        const selectedModel = models.find((x) => x.id === modelId);
                        if (selectedModel && !compatible(selectedModel, m.id))
                          setModelId('roformer-sw');
                      }}
                    >
                      <span>
                        {translateMessage(m.name)}
                        {mode === m.id && <Check size={16} />}
                      </span>
                      <small>{m.desc}</small>
                    </button>
                  ))}
                </div>
                <label className="field">
                  {tr('分离模型')}
                  <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    {models
                      .filter(
                        (m) => !['guitar-lead', 'karaoke'].includes(m.id) && compatible(m, mode),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {translateMessage(m.name)}
                          {m.installed ? tr(' \u00B7 已下载') : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="muted">
                  {translateMessage(models.find((m) => m.id === modelId)?.description || '')}
                </p>
                {['guitarist', 'singer'].includes(mode) && (
                  <p className="notice">
                    {tr('此模式会分两阶段计算，首次使用还会下载对应的专用模型。')}
                  </p>
                )}
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>{tr('取消')}</button>
                  <button
                    className="primary"
                    disabled={
                      isAndroid &&
                      !models.some((model) => model.id === modelId && compatible(model, mode))
                    }
                    onClick={() => {
                      setModal(null);
                      void run('separate');
                    }}
                  >
                    <Sparkles size={16} />
                    {tr('开始分析')}
                  </button>
                </div>
              </>
            )}
            {modal === 'settings' && (
              <>
                <AppearanceSettings />
                <AnalysisNote />
                <StorageLocations />
                {!isAndroid && (
                  <>
                    <div className="setup-card">
                      <div className="setup-icon">
                        <AudioLines size={26} />
                      </div>
                      <div>
                        <h3>
                          {ready ? tr('本地运行环境已准备好') : tr('准备 Immerse Jam 的本地引擎')}
                        </h3>
                        <p>
                          {tr('自动下载应用专用运行库，无需预装 Python 或开发工具。模型按需下载。')}
                        </p>
                      </div>
                      <span className={'badge ' + (ready ? 'green' : '')}>
                        {ready ? tr('就绪') : tr('待安装')}
                      </span>
                    </div>
                    <div className="runtime-controls">
                      <select
                        value={runtimeMode}
                        onChange={(e) => setRuntimeMode(e.target.value)}
                        disabled={installing}
                      >
                        <option value="cuda">{tr('NVIDIA 显卡加速')}</option>
                        <option value="cpu">{tr('CPU 通用兼容')}</option>
                      </select>
                      <button
                        className="primary"
                        disabled={installing}
                        onClick={() =>
                          void act(async () => {
                            setInstalling(true);
                            await window.jam.call('runtime-install', { mode: runtimeMode });
                          })
                        }
                      >
                        {installing ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Download size={16} />
                        )}{' '}
                        {installing
                          ? tr('准备中…')
                          : ready
                            ? tr('重新检查 / 切换引擎')
                            : tr('自动安装环境')}
                      </button>
                    </div>
                    {runtimeMessage && (
                      <pre className="install-status">
                        {translateMessage(runtimeMessage.slice(-1400))}
                      </pre>
                    )}
                  </>
                )}
                {isAndroid && (
                  <p className="notice">
                    {tr(
                      '移动引擎已随应用安装。随包模型可离线使用；运行前检查内存，分块处理，过热或内存不足时保留原有结果。',
                    )}
                  </p>
                )}
                <div className="section-heading">
                  <h3>{tr('模型管理')}</h3>
                  <button
                    className="small"
                    onClick={() => void act(() => window.jam.call('model-import'))}
                  >
                    <Plus size={14} />
                    {tr('导入自定义模型')}
                  </button>
                </div>
                <ModelManager
                  models={models}
                  downloads={modelDownloads}
                  onDownload={(id) => {
                    setModelDownloads((list) => ({
                      ...list,
                      [id]: { status: 'progress', progress: 0, message: tr('正在准备下载…') },
                    }));
                    void window.jam
                      .call<Model[]>('model-download', { id })
                      .then(setModels)
                      .catch((e) => {
                        setModelDownloads((list) => ({
                          ...list,
                          [id]: { status: 'error', message: e.message },
                        }));
                        notify(tr('模型下载未完成，可重试继续下载'));
                      });
                  }}
                />
                <p className="muted fine-print">
                  {tr(
                    '自定义模型需包含 manifest.json，导入时验证声部定义与实际输出。模型文件和运行库均保存在应用自己的目录中。',
                  )}
                </p>
              </>
            )}
            {modal === 'export' && project && (
              <>
                <p className="muted">
                  {tr('导出分离音轨、当前练习混音，或包含乐谱和练习设置的完整项目。')}
                </p>
                <div className="export-options">
                  <button
                    onClick={() =>
                      void act(() =>
                        window.jam.call('export', { id: project.id, full: true }),
                      ).then((f) => f && notify(tr('完整项目已导出')))
                    }
                  >
                    <FileMusic size={22} />
                    <strong>{tr('完整歌曲项目')}</strong>
                    <small>{tr('.ijam \u00B7 原曲、分轨、乐谱、标记和设置')}</small>
                  </button>
                  <button
                    onClick={() =>
                      void act(() =>
                        window.jam.call('export-audio', { id: project.id, stems: true }),
                      ).then((f) => f && notify(tr('原曲和分轨已导出')))
                    }
                  >
                    <AudioLines size={22} />
                    <strong>{tr('原曲与各条分轨')}</strong>
                    <small>{tr('保留源文件格式，分别导出')}</small>
                  </button>
                  <button
                    onClick={() =>
                      void act(() =>
                        window.jam.call('export-audio', {
                          id: project.id,
                          region:
                            loop && loopA !== null && loopB !== null
                              ? { a: loopA, b: loopB }
                              : null,
                        }),
                      ).then((f) => f && notify(tr('混音已导出')))
                    }
                  >
                    <Download size={22} />
                    <strong>{loop ? tr('当前循环段落混音') : tr('当前混音')}</strong>
                    <small>{tr('WAV / MP3 \u00B7 应用音量、速度和移调')}</small>
                  </button>
                </div>
              </>
            )}
            {modal === 'donate' && (
              <div className="donation">
                <p>
                  {tr(
                    '如果 Immerse Jam 陪你度过了一段愉快的练琴时间，欢迎自愿请作者喝一瓶冰可乐。',
                  )}
                </p>
                <div className="donation-qr">
                  <img src={donation} alt={tr('作者微信收款码')} />
                </div>
                <p className="muted">{tr('所有功能免费使用，打赏完全自愿。')}</p>
              </div>
            )}
            {modal === 'feedback' && (
              <div className="feedback-options">
                <p>{tr('告诉我遇到的问题或练琴时希望改进的地方。')}</p>
                <button onClick={() => void window.jam.call('feedback-open', { target: 'email' })}>
                  {tr('发送邮件')}
                  <span>meowmeowneko999@gmail.com</span>
                </button>
                <button onClick={() => void window.jam.call('feedback-open', { target: 'github' })}>
                  {tr('前往 GitHub 反馈')}
                  <span>Kreeli / immerse-jam</span>
                </button>
                <small>{tr('可以附上应用版本、操作步骤和截图，方便定位问题。')}</small>
              </div>
            )}
            {modal === 'migration' && (
              <>
                <DatabaseMigration
                  onDone={() => {
                    void refresh();
                    setModal(null);
                  }}
                  onError={notify}
                />
                <hr />
                <p className="muted">
                  {tr(
                    '导入 Audio Jam 导出的 .aum 项目，保留本机已有的原曲、分轨、附件和练习标记。',
                  )}
                </p>
                <button className="primary" onClick={() => void importSongs()}>
                  <FolderInput size={17} />
                  {tr('选择 .aum 项目')}
                </button>
                <div className="migration-folder">
                  <button
                    onClick={() =>
                      void act(async () => {
                        const folder = await window.jam.call<string>('pick-folder');
                        if (folder) {
                          setMigrationFolder(folder);
                          const result = await window.jam.call('migration-scan', { folder });
                          setMigration(result.items);
                        }
                      })
                    }
                  >
                    {tr('扫描导出文件夹')}
                  </button>
                  <small>{migrationFolder || tr('可一次扫描并迁移多个项目')}</small>
                </div>
                {migration.length > 0 && (
                  <>
                    <div className="selection-list">
                      {migration.map((m) => (
                        <label key={m.file}>
                          <input
                            type="checkbox"
                            checked={selected.includes(m.file)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, m.file]
                                  : selected.filter((x) => x !== m.file),
                              )
                            }
                          />
                          <span>{translateMessage(m.name)}</span>
                          <small>{Math.round(m.size / 1048576)} MB</small>
                        </label>
                      ))}
                    </div>
                    <button
                      className="primary"
                      disabled={!selected.length}
                      onClick={() =>
                        void act(async () => {
                          const result = await window.jam.call<Project[]>('migration-import', {
                            files: selected,
                          });
                          await refresh();
                          notify(tr('已迁移 {0} 首歌曲', [result.length]));
                          setModal(null);
                        })
                      }
                    >
                      {tr('迁移选中的')}
                      {selected.length}
                      {tr('首')}
                    </button>
                  </>
                )}
                <p className="notice">
                  {tr(
                    '迁移采用复制导入，原应用的项目文件保持完整。只有云端引用、尚未下载的音轨需要先在原应用中下载或导出。',
                  )}
                </p>
              </>
            )}
            {modal === 'transfer' && (
              <>
                <p className="muted">
                  {tr(
                    '选择歌曲，用手机扫描二维码。双方连接同一 Wi‑Fi 或手机热点，原曲和分轨直接互传。',
                  )}
                </p>
                <div className="selection-list">
                  {library.map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, p.id]
                              : selected.filter((x) => x !== p.id),
                          )
                        }
                      />
                      <span>{p.title}</span>
                      <small>
                        {p.tracks.length}
                        {tr('分轨')}
                      </small>
                    </label>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={!selected.length}
                  onClick={() =>
                    void act(async () =>
                      setPair(await window.jam.call('pair-start', { ids: selected })),
                    )
                  }
                >
                  <Share2 size={16} />
                  {tr('生成配对二维码')}
                </button>
                {pair && (
                  <div className="pair-box">
                    <img src={pair.qr} alt={tr('设备互传配对二维码')} />
                    <div>
                      <strong>{tr('手机扫码接收 / 发送歌曲')}</strong>
                      <p>{tr('配对有效期 30 分钟。')}</p>
                      <input aria-label={tr('配对地址')} readOnly value={pair.url} />
                      <button
                        className="small"
                        onClick={() => {
                          void window.jam.call('pair-stop');
                          setPair(null);
                        }}
                      >
                        {tr('结束本次互传')}
                      </button>
                    </div>
                  </div>
                )}
                <p className="notice">
                  {tr('如果电脑有多个网络连接，请选用手机所在网络的配对地址。')}
                </p>
                <RemoteTransfer ids={selected} onError={notify} />
              </>
            )}
          </section>
        </div>
      )}
      {incoming && (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>{tr('收到歌曲文件')}</h2>
            <p>{incoming.name}</p>
            <p className="muted">
              {Math.round((incoming.size || 0) / 1048576)}
              {tr('MB \u00B7 来自已配对设备')}
            </p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  void window.jam.call(incoming.remote ? 'peer-select' : 'pair-select', {
                    id: incoming.id,
                    accept: false,
                  });
                  setIncoming(null);
                }}
              >
                {tr('暂不导入')}
              </button>
              <button
                className="primary"
                onClick={() =>
                  void act(async () => {
                    await window.jam.call(incoming.remote ? 'peer-select' : 'pair-select', {
                      id: incoming.id,
                      accept: true,
                    });
                    setIncoming(null);
                    await refresh();
                    notify(tr('已接收并导入'));
                  })
                }
              >
                {tr('接收并导入')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
