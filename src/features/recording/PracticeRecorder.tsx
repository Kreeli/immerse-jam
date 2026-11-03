import Select from '../../shared/Select';
import { isAndroid } from '../../platform/environment';
import { jamCall } from '../../platform/project-call';
import {
  Circle,
  FolderOpen,
  LoaderCircle,
  Mic2,
  Settings2,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ModalFrame from '../../shared/ModalFrame';
import { AudioCapture, type CaptureSession } from '../../audio/capture';
import { recordingDevices, type InputDevice } from '../../platform/android/NativeCapture';
import { LiveEnvelope } from '../../audio/live-envelope';
import type { Player } from '../../audio/Player';
import { t as tr } from '../../i18n';
import { time, type Project, type RecordingSettings } from '../../shared/types';
import LatencyCalibration from './LatencyCalibration';
import { requestTakeRemoval, requestTakeTrash } from './TakeRemoval';
const defaults: RecordingSettings = {
  mode: 'instrument',
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  channel: 'stereo',
  latencyMs: 0,
};
function profile(input: string, output: string) {
  return 'immerse.recording.latency.' + input + '|' + output;
}
export default function PracticeRecorder({
  project,
  player,
  onProject,
  onSaved = onProject,
  onError,
  onActive,
  onLive,
  disabled = false,
  libraryOnly = false,
}: {
  project: Project;
  player: Player;
  onProject: (p: Project) => void;
  onSaved?: (p: Project) => void;
  onError: (message: string) => void;
  onActive: (active: boolean) => void;
  onLive: (live: LiveEnvelope | null) => void;
  disabled?: boolean;
  libraryOnly?: boolean;
}) {
  const [dialog, setDialog] = useState<'settings' | 'library' | null>(null),
    [devices, setDevices] = useState<InputDevice[]>([]),
    [settings, setSettings] = useState<RecordingSettings>(() => {
      const value = {
          ...defaults,
          ...project.recordingSettings,
          ...(project.kind === 'practice' ? { mode: project.practiceMode || 'instrument' } : {}),
          ...(isAndroid ? { outputDeviceId: 'default' } : {}),
        },
        saved = localStorage.getItem(profile(value.inputDeviceId, value.outputDeviceId));
      return saved === null ? value : { ...value, latencyMs: Number(saved) || 0 };
    }),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [importPosition, setImportPosition] = useState('0');
  const lastDialog = useRef(dialog);
  if (dialog) lastDialog.current = dialog;
  const shownDialog = dialog || lastDialog.current;
  const props = useRef({ project, onProject, onSaved, onError, onActive });
  props.current = { project, onProject, onSaved, onError, onActive };
  useEffect(() => {
    if (project.kind === 'practice')
      setSettings((previous) => ({ ...previous, mode: project.practiceMode || 'instrument' }));
  }, [project.kind, project.practiceMode]);
  const capture = useRef<CaptureSession | null>(null),
    live = useRef<LiveEnvelope | null>(null),
    session = useRef<string | null>(null),
    stopping = useRef(false),
    restoredLoop = useRef<Player['loop']>(null);
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      props.current.onError((error as Error).message);
    }
  };
  const refreshDevices = async (permission = false) => {
    const available = await recordingDevices(permission);
    setDevices(available);
    if (isAndroid)
      setSettings((old) => ({
        ...old,
        inputDeviceId:
          old.inputDeviceId.startsWith('android:') &&
          available.some((d) => d.deviceId === old.inputDeviceId)
            ? old.inputDeviceId
            : 'default',
        outputDeviceId: 'default',
      }));
  };
  useEffect(() => {
    if (!dialog) return;
    void act(() => refreshDevices());
    const listener = () => {
      void act(() => refreshDevices());
      if (session.current) void stop();
      setSettings((old) => ({ ...old, latencyMs: 0 }));
      props.current.onError(tr('音频设备已变化，请重新检查延迟校正。'));
    };
    navigator.mediaDevices?.addEventListener('devicechange', listener);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', listener);
  }, [dialog]);
  const changeDevice = (key: 'inputDeviceId' | 'outputDeviceId', value: string) =>
    setSettings((old) => {
      const next = { ...old, [key]: value },
        saved = localStorage.getItem(profile(next.inputDeviceId, next.outputDeviceId));
      return { ...next, latencyMs: saved === null ? 0 : Number(saved) || 0 };
    });
  useEffect(() => {
    const interrupt = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if ((action === 'pause' || action === 'route-changed') && session.current) void stop();
      if (action === 'route-changed') {
        setSettings((old) => {
          localStorage.removeItem(profile(old.inputDeviceId, old.outputDeviceId));
          return { ...old, latencyMs: 0 };
        });
        props.current.onError(tr('音频设备已变化，请重新检查延迟校正。'));
      }
    };
    const background = () => {
      if (document.hidden && window.ImmerseNative && session.current) void stop();
    };
    window.addEventListener('immerse-audio', interrupt);
    document.addEventListener('visibilitychange', background);
    return () => {
      window.removeEventListener('immerse-audio', interrupt);
      document.removeEventListener('visibilitychange', background);
    };
  }, []);
  const stop = async () => {
    if (stopping.current || !session.current) return;
    stopping.current = true;
    setBusy(true);
    try {
      await capture.current?.stop();
      player.duration = Math.max(player.duration, player.position());
      const id = session.current;
      session.current = null;
      const saved = await jamCall<Project>('take-finish', { sessionId: id });
      props.current.onSaved(saved);
      if (saved.takes?.some((take) => take.id === id))
        props.current.onError(
          saved.kind !== 'creation' && !saved.selectedTakeIds?.includes(id)
            ? tr('录音已保存到录音库；练习已挂载两条，移出一条后可加入新录音。')
            : tr('录音已保存'),
        );
      if (capture.current?.error) props.current.onError(capture.current.error.message);
    } catch (error) {
      props.current.onError((error as Error).message);
    } finally {
      player.duration = Math.max(player.duration, player.position());
      player.captureActive = false;
      player.restoreLoopAfterCapture(restoredLoop.current);
      live.current = null;
      onLive(null);
      capture.current = null;
      setActive(false);
      setBusy(false);
      props.current.onActive(false);
      stopping.current = false;
    }
  };
  const start = async () => {
    if (busy || active) return;
    setBusy(true);
    stopping.current = false;
    restoredLoop.current = player.captureLoop;
    const wasPlaying = player.playing;
    let releaseAudio: (() => void) | undefined;
    props.current.onActive(true);
    try {
      if (!Number.isFinite(settings.latencyMs) || Math.abs(settings.latencyMs) > 2000)
        throw new Error(tr('延迟校正范围为 −2000 到 2000 毫秒'));
      await jamCall('audio-tools-ensure');
      await player.init();
      await player.setOutputDevice(settings.outputDeviceId);
      releaseAudio = await player.acquireAudio();
      const input = devices.find(
          (device) => device.kind === 'audioinput' && device.deviceId === settings.inputDeviceId,
        ),
        label = input?.label || tr('系统默认输入');
      capture.current = await AudioCapture.open(
        player.context!,
        settings,
        (sequence, contextTime, bytes) => {
          live.current?.push(
            contextTime,
            new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
          );
          return jamCall('take-append', {
            sessionId: session.current,
            sequence,
            contextTime,
            bytes,
          });
        },
        () => {},
        () => void stop(),
      );
      player.loop = null;
      player.captureActive = true;
      if (!player.playing) await player.play(!wasPlaying && !!project.practice.countIn);
      const anchorTime = Math.max(player.started, player.context!.currentTime + 0.025),
        anchorPosition = player.offset + Math.max(0, anchorTime - player.started) * player.tempo;
      const result = await jamCall<{
        id: string;
      }>('take-start', {
        id: project.id,
        options: {
          anchorTime,
          anchorPosition,
          tempo: player.tempo,
          pitch: player.pitch,
          latencyMs: settings.latencyMs,
          sampleRate: player.context!.sampleRate,
          mode: settings.mode,
          inputLabel: label,
        },
      });
      session.current = result.id;
      if (capture.current.error) throw capture.current.error;
      // Starting after IPC has returned still maps every captured frame to the same clock.
      live.current = new LiveEnvelope(
        anchorTime,
        anchorPosition,
        player.context!.sampleRate,
        player.tempo,
        settings.latencyMs,
      );
      onLive(live.current);
      capture.current.arm(anchorTime);
      localStorage.setItem(
        profile(settings.inputDeviceId, settings.outputDeviceId),
        String(settings.latencyMs),
      );
      const updated = await jamCall<Project>('update', {
        id: project.id,
        patch: { recordingSettings: settings },
      });
      props.current.onSaved(updated);
      setActive(true);
      setDialog(null);
    } catch (error) {
      live.current = null;
      onLive(null);
      await capture.current?.stop();
      capture.current = null;
      if (session.current) {
        await jamCall('take-finish', { sessionId: session.current }).catch(() => {});
        session.current = null;
      }
      player.captureActive = false;
      player.restoreLoopAfterCapture(restoredLoop.current);
      props.current.onActive(false);
      props.current.onError((error as Error).message);
    } finally {
      releaseAudio?.();
      setBusy(false);
    }
  };
  useEffect(
    () => () => {
      if (session.current) void stop();
    },
    [],
  );
  const openLibrary = () => {
    setImportPosition(player.position().toFixed(3));
    setDialog('library');
    setBusy(true);
    void act(async () => {
      try {
        props.current.onSaved(await jamCall<Project>('take-recover', { id: project.id }));
      } finally {
        setBusy(false);
      }
    });
  };
  useEffect(() => {
    const action = (event: Event) => {
      if (active || busy || disabled) return;
      if ((event as CustomEvent<string>).detail === 'library') openLibrary();
      else setDialog('settings');
    };
    window.addEventListener('immerse-recorder-action', action);
    return () => window.removeEventListener('immerse-recorder-action', action);
  }, [active, busy, disabled, project.id]);
  const selectTake = async (id: string) => {
    setBusy(true);
    try {
      const selected = props.current.project.selectedTakeIds || [],
        next = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id];
      props.current.onSaved(
        await jamCall<Project>('take-select', { id: project.id, takeIds: next }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="practice-record-actions">
        {!libraryOnly && (
          <button
            className={'transport-record' + (active ? ' active' : '')}
            disabled={busy || (!active && disabled)}
            title={
              active ? tr('停止并保存') : project.kind === 'creation' ? tr('录音') : tr('练琴录音')
            }
            aria-label={
              active ? tr('停止并保存') : project.kind === 'creation' ? tr('录音') : tr('练琴录音')
            }
            aria-pressed={active}
            onClick={() =>
              active
                ? void stop()
                : project.recordingSettings
                  ? void start()
                  : setDialog('settings')
            }
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : active ? (
              <Square size={isAndroid ? 18 : 14} fill="currentColor" strokeWidth={0} />
            ) : (
              <Circle size={isAndroid ? 20 : 14} fill="currentColor" strokeWidth={0} />
            )}
          </button>
        )}
        {!isAndroid && !libraryOnly && (
          <button
            className="icon-button"
            disabled={active || busy || disabled}
            aria-label={tr('录音设置')}
            title={tr('录音设置')}
            onClick={() => setDialog('settings')}
          >
            <Settings2 size={16} />
          </button>
        )}
        {!isAndroid && (
          <button className="small" disabled={active || busy || disabled} onClick={openLibrary}>
            <FolderOpen size={13} />
            {tr('录音库')}
            <small>{project.takes?.length || 0}</small>
          </button>
        )}
      </div>
      <ModalFrame
        open={!!dialog}
        onClose={() => !busy && setDialog(null)}
        className="wide recorder-dialog"
        label={shownDialog === 'settings' ? tr('练琴录音设置') : tr('录音库')}
      >
        <div className="modal-heading">
          <h2>{shownDialog === 'settings' ? tr('录音设置') : tr('录音库')}</h2>
          <button
            className="icon-button"
            aria-label={tr('关闭录音窗口')}
            disabled={busy}
            onClick={() => setDialog(null)}
          >
            <X size={20} />
          </button>
        </div>
        {shownDialog === 'settings' ? (
          <>
            <div className="recording-mode-options" hidden={project.kind === 'practice'}>
              <button
                className={settings.mode === 'instrument' ? 'selected' : ''}
                onClick={() => setSettings({ ...settings, mode: 'instrument' })}
              >
                <strong>{tr('只录乐器')}</strong>
                <small>{tr('保存所选输入，伴奏只用于监听。')}</small>
              </button>
              <button
                className={settings.mode === 'mixed' ? 'selected' : ''}
                onClick={() => setSettings({ ...settings, mode: 'mixed' })}
              >
                <strong>{tr('声卡已混音')}</strong>
                <small>{tr('输入已含 AUX 伴奏与乐器，一起保存。')}</small>
              </button>
            </div>
            <div className="recording-device-grid">
              <label>
                {tr('录音源')}
                <Select
                  aria-label={tr('录音源')}
                  value={settings.inputDeviceId}
                  onChange={(event) => changeDevice('inputDeviceId', event.target.value)}
                >
                  <option value="default">{tr('系统默认输入')}</option>
                  {devices
                    .filter(
                      (device) => device.kind === 'audioinput' && device.deviceId !== 'default',
                    )
                    .map((device, i) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || tr('录音输入 {0}', [i + 1])}
                      </option>
                    ))}
                </Select>
              </label>
              <label>
                {tr('伴奏输出')}
                <Select
                  aria-label={tr('伴奏输出设备')}
                  value={settings.outputDeviceId}
                  onChange={(event) => changeDevice('outputDeviceId', event.target.value)}
                >
                  <option value="default">{tr('系统默认输出')}</option>
                  {devices
                    .filter(
                      (device) => device.kind === 'audiooutput' && device.deviceId !== 'default',
                    )
                    .map((device, i) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || tr('播放输出 {0}', [i + 1])}
                      </option>
                    ))}
                </Select>
              </label>
              <label>
                {tr('输入声道')}
                <Select
                  aria-label={tr('录音输入声道')}
                  value={settings.channel}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      channel: event.target.value as RecordingSettings['channel'],
                    })
                  }
                >
                  <option value="stereo">{tr('双声道保留')}</option>
                  <option value="left">{tr('只取左声道')}</option>
                  <option value="right">{tr('只取右声道')}</option>
                  <option value="mono">{tr('混为单声道')}</option>
                </Select>
              </label>
              <label>
                {tr('录音偏晚校正（毫秒）')}
                <input
                  aria-label={tr('录音延迟校正')}
                  type="number"
                  min="-2000"
                  max="2000"
                  step="1"
                  value={settings.latencyMs}
                  onChange={(event) => setSettings({ ...settings, latencyMs: +event.target.value })}
                />
              </label>
            </div>
            <button className="small" onClick={() => void act(() => refreshDevices(true))}>
              {tr('授权 / 刷新录音设备')}
            </button>
            {!isAndroid && (
              <>
                <p className="muted">
                  {tr(
                    'USB 只输入琴声时选“只录乐器”；AUX 伴奏已混入声卡输入时选“声卡已混音”。软件监听默认关闭，可使用效果器或声卡直接监听。',
                  )}
                </p>
                <p className="muted">
                  {tr(
                    '录音偏晚填正数，偏早填负数；校正值按输入／输出设备组合记住。录完后也能逐轨微调。录音期间不跳转或循环。',
                  )}
                </p>
              </>
            )}
            <LatencyCalibration
              player={player}
              settings={settings}
              onBusy={(value) => {
                setBusy(value);
                props.current.onActive(value);
              }}
              onError={onError}
              onApply={(latencyMs) => {
                setSettings({ ...settings, latencyMs });
                localStorage.setItem(
                  profile(settings.inputDeviceId, settings.outputDeviceId),
                  String(latencyMs),
                );
                props.current.onProject({
                  ...project,
                  recordingSettings: { ...settings, latencyMs },
                });
              }}
            />
            <div className="modal-actions">
              <button disabled={busy} onClick={() => setDialog(null)}>
                {tr('取消')}
              </button>
              <button className="primary" disabled={busy} onClick={() => void start()}>
                {isAndroid ? (
                  <Circle size={15} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Mic2 size={15} />
                )}
                {busy
                  ? tr('准备录音…')
                  : player.playing
                    ? tr('伴奏继续并开始录音')
                    : project.practice.countIn
                      ? tr('预备并开始录音')
                      : tr('开始录音')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              {project.kind === 'creation'
                ? tr('创作模式：录音会加入音轨列表，可多轨叠加。')
                : tr('可保存多次录音，最多选择两条加入练习音轨。移出音轨会保留录音库中的文件。')}
            </p>
            <div className="take-import-controls">
              <div data-take-undo-host={project.id} />
              <button className="small" disabled={busy} onClick={() => requestTakeTrash(project)}>
                <Trash2 size={13} />
                {tr('录音回收站')}
              </button>
              <label>
                {tr('导入开始位置（秒）')}
                <input
                  aria-label={tr('录音导入位置')}
                  type="number"
                  min="0"
                  step=".001"
                  value={importPosition}
                  onChange={(event) => setImportPosition(event.target.value)}
                />
              </label>
              <button
                className="small"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setBusy(true);
                    try {
                      await jamCall('audio-tools-ensure');
                      const result = await jamCall<Project | null>('take-import', {
                        id: project.id,
                        position: Number(importPosition),
                        mode: settings.mode,
                      });
                      if (result) props.current.onSaved(result);
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              >
                <Upload size={13} />
                {busy ? tr('正在导入…') : tr('导入多条录音')}
              </button>
              <button
                className="small"
                onClick={() =>
                  void act(async () => {
                    await jamCall('take-open', { id: project.id });
                  })
                }
              >
                <FolderOpen size={13} />
                {tr('录音文件夹')}
              </button>
            </div>
            <div className="take-library-list">
              {(project.takes || []).map((take) => (
                <div className="take-library-row" key={take.id}>
                  <div>
                    <input
                      aria-label={tr('录音名称 {0}', [take.id])}
                      defaultValue={take.label || take.name}
                      maxLength={120}
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== (take.label || take.name))
                          props.current.onProject({
                            ...project,
                            takes: project.takes!.map((t) =>
                              t.id === take.id ? { ...t, label: name } : t,
                            ),
                          });
                      }}
                    />
                    <small>
                      {time(take.duration)} ·{' '}
                      {take.mode === 'mixed' ? tr('含伴奏混音') : tr('乐器录音')} ·{' '}
                      {new Date(take.createdAt).toLocaleDateString()}
                    </small>
                  </div>
                  {project.kind !== 'creation' && (
                    <button
                      className={
                        'small ' +
                        ((project.selectedTakeIds || []).includes(take.id) ? 'selected' : '')
                      }
                      disabled={
                        busy ||
                        (!(project.selectedTakeIds || []).includes(take.id) &&
                          (project.selectedTakeIds || []).length >= 2)
                      }
                      onClick={() => void act(() => selectTake(take.id))}
                    >
                      {(project.selectedTakeIds || []).includes(take.id)
                        ? tr('移回录音库')
                        : tr('加入音轨')}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={tr('删除录音 {0}', [take.label || take.name])}
                    disabled={busy}
                    onClick={() => requestTakeRemoval(project, take)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!project.takes?.length && (
                <p className="empty">{tr('录制或导入的录音会保存在这里。')}</p>
              )}
            </div>
          </>
        )}
      </ModalFrame>
    </>
  );
}
