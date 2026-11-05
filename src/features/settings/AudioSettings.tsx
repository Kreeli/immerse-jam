import { useEffect, useState } from 'react';
import Select from '../../shared/Select';
import AudioEngineSettings from './AudioEngineSettings';
import { useEnginePreferences } from '../../audio/engine-preferences';
import { recordingDevices, type InputDevice } from '../../platform/android/NativeCapture';
import {
  DEFAULT_AUDIO,
  getAudioDefaults,
  setAudioDefaults,
  useAudioDefaults,
  type AudioDefaults,
} from '../../audio/device-preferences';
import { reconcileRecordingDevices } from '../recording/device-selection';
import LatencyCalibration from '../recording/LatencyCalibration';
import type { Player } from '../../audio/Player';
import type { Project } from '../../shared/types';
import { t as tr, message } from '../../i18n';
export default function AudioSettings({
  player,
  project,
  disabled,
  onActive,
  applyToProject,
  onEngineBusy,
}: {
  player: Player;
  project: Project | null;
  disabled: boolean;
  onActive: (value: boolean) => void;
  applyToProject: () => Promise<void>;
  onEngineBusy: (value: boolean) => void;
}) {
  const engine = useEnginePreferences();
  const defaults = useAudioDefaults(),
    [engineBusy, setEngineBusy] = useState(false),
    [devices, setDevices] = useState<InputDevice[]>([]),
    [busy, setBusy] = useState(false),
    [calibrating, setCalibrating] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [latency, setLatency] = useState(String(defaults.latencyMs));
  const locked = disabled || busy || calibrating || engineBusy;
  useEffect(() => setLatency(String(defaults.latencyMs)), [defaults.latencyMs]);
  const commit = async (patch: Partial<AudioDefaults>) => {
    setBusy(true);
    setError('');
    const previous = getAudioDefaults();
    const routed =
      patch.outputDeviceId !== undefined && !project?.recordingSettings?.outputDeviceId;
    try {
      if (routed) await player.setOutputDevice(patch.outputDeviceId!);
      setAudioDefaults(patch);
      setLatency(String(getAudioDefaults().latencyMs));
      setNotice(tr('设置已保存'));
    } catch (e) {
      if (routed) await player.setOutputDevice(previous.outputDeviceId).catch(() => {});
      setError(message((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async (permission = false) => {
    try {
      const available = await recordingDevices(permission);
      setDevices(available);
      const checked = reconcileRecordingDevices(
        { mode: 'instrument', ...getAudioDefaults() },
        available,
      );
      if (checked.changed && !locked) {
        await commit(checked.settings);
        setNotice(tr('原设备不可用，已恢复系统默认，请重新检查延迟。'));
      }
    } catch (e) {
      setError(message((e as Error).message));
    }
  };
  useEffect(() => {
    let alive = true;
    void recordingDevices()
      .then((list) => {
        if (alive) setDevices(list);
      })
      .catch((e) => {
        if (alive) setError(message(e.message));
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const changed = () => {
      if (!locked) void refresh();
    };
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', changed);
  }, [locked, defaults, project?.recordingSettings]);
  const options = (kind: 'audioinput' | 'audiooutput', selected: string) => {
    const list = devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default');
    return (
      <>
        <option value="default">
          {kind === 'audioinput' ? tr('系统默认输入') : tr('系统默认输出')}
        </option>
        {selected !== 'default' && !list.some((d) => d.deviceId === selected) && (
          <option value={selected}>{tr('已保存设备（当前未检测到）')}</option>
        )}
        {list.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || tr('音频设备 {0}', [i + 1])}
          </option>
        ))}
      </>
    );
  };
  return (
    <div className="settings-stack">
      <AudioEngineSettings
        player={player}
        disabled={disabled || busy || calibrating}
        onBusy={(value) => {
          setEngineBusy(value);
          onEngineBusy(value);
        }}
      />
      <section className="settings-card">
        <h3>{tr('默认音频设备')}</h3>
        <p className="muted">{tr('新工程使用以下设置；已有工程的单独设置会保留。')}</p>
        {disabled && <p className="notice">{tr('录音或校准期间不能切换设备。')}</p>}
        <fieldset disabled={locked} className="settings-fieldset">
          <label className="settings-row">
            <strong>{tr('默认输入设备')}</strong>
            <Select
              aria-label={tr('默认输入设备')}
              value={defaults.inputDeviceId}
              onChange={(e) => void commit({ inputDeviceId: e.target.value })}
            >
              {options('audioinput', defaults.inputDeviceId)}
            </Select>
          </label>
          <label className="settings-row" hidden={engine.backend !== 'web-audio'}>
            <strong>{tr('默认输出设备')}</strong>
            <Select
              aria-label={tr('默认输出设备')}
              value={defaults.outputDeviceId}
              onChange={(e) => void commit({ outputDeviceId: e.target.value })}
            >
              {options('audiooutput', defaults.outputDeviceId)}
            </Select>
          </label>
          <label className="settings-row">
            <strong>{tr('输入声道')}</strong>
            <Select
              aria-label={tr('默认输入声道')}
              value={defaults.channel}
              onChange={(e) => void commit({ channel: e.target.value as AudioDefaults['channel'] })}
            >
              <option value="stereo">{tr('双声道保留')}</option>
              <option value="left">{tr('只取左声道')}</option>
              <option value="right">{tr('只取右声道')}</option>
              <option value="mono">{tr('混为单声道')}</option>
            </Select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{tr('延迟校正（毫秒）')}</strong>
              <small>{tr('录音偏晚填正数，偏早填负数；按设备组合保存。')}</small>
            </span>
            <input
              type="number"
              min="-2000"
              max="2000"
              step="1"
              aria-label={tr('默认延迟校正')}
              aria-describedby={error ? 'audio-settings-error' : undefined}
              value={latency}
              aria-invalid={
                latency.trim() === '' ||
                !Number.isFinite(Number(latency)) ||
                Math.abs(Number(latency)) > 2000
              }
              onChange={(e) => setLatency(e.target.value)}
              onBlur={() => {
                if (
                  !latency.trim() ||
                  !Number.isFinite(Number(latency)) ||
                  Math.abs(Number(latency)) > 2000
                ) {
                  setError(tr('延迟校正需要在-2000至2000毫秒之间'));
                  return;
                }
                void commit({ latencyMs: Number(latency) });
              }}
            />
          </label>
          <button onClick={() => void refresh(true)}>{tr('授权 / 刷新录音设备')}</button>
        </fieldset>
        <p className="settings-readout">
          {tr('当前播放采样率')}：
          {player.context ? tr('{0} Hz', [player.context.sampleRate]) : tr('播放器尚未初始化')}
        </p>
        {project && (
          <div className="settings-project-defaults">
            <p>
              {project.recordingSettings
                ? tr('当前工程使用单独的录音设置。')
                : tr('当前工程使用默认音频设置。')}
            </p>
            <button
              disabled={locked}
              onClick={() => {
                setBusy(true);
                setError('');
                void applyToProject()
                  .then(() => setNotice(tr('默认设置已用于当前工程')))
                  .catch((e) => setError(message(e.message)))
                  .finally(() => setBusy(false));
              }}
            >
              {tr('将默认设置用于当前工程')}
            </button>
          </div>
        )}
      </section>
      <section className="settings-card">
        <h3>{tr('延迟校准')}</h3>
        <p className="muted">{tr('连接好录音设备后，使用现有校准工具测量并试听。')}</p>
        <fieldset className="settings-fieldset" disabled={busy || (disabled && !calibrating)}>
          <LatencyCalibration
            player={player}
            settings={{ mode: 'instrument', ...defaults }}
            onError={(e) => setError(message(e))}
            onBusy={(value) => {
              setCalibrating(value);
              onActive(value);
            }}
            onApply={(ms) => {
              void commit({ latencyMs: ms });
            }}
          />
        </fieldset>
      </section>
      <div className="settings-section-footer">
        <button disabled={locked} onClick={() => void commit({ ...DEFAULT_AUDIO })}>
          {tr('恢复音频默认值')}
        </button>
        <small role="status">{notice}</small>
      </div>
      {error && (
        <p id="audio-settings-error" className="settings-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
