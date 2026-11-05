import { useEffect, useState } from 'react';
import Select from '../../shared/Select';
import { jamCall } from '../../platform/project-call';
import {
  DEFAULT_ENGINE,
  SAMPLE_RATES,
  useEnginePreferences,
  type AudioSystem,
  type AudioEnginePreferences,
  type NativeAudioInfo,
} from '../../audio/engine-preferences';
import type { Player } from '../../audio/Player';
import { t as tr, message } from '../../i18n';
export default function AudioEngineSettings({
  player,
  disabled,
  onBusy,
}: {
  player: Player;
  disabled: boolean;
  onBusy: (value: boolean) => void;
}) {
  const preferences = useEnginePreferences();
  const [info, setInfo] = useState<NativeAudioInfo | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const systems: { id: AudioSystem; label: string }[] = [
    { id: 'web-audio', label: tr('兼容音频输出') },
    { id: 'wasapi', label: tr('Windows Audio（共享模式）') },
    { id: 'wasapi-exclusive', label: tr('Windows Audio（独占模式）') },
    { id: 'wasapi-low-latency', label: tr('Windows Audio（低延迟共享）') },
    { id: 'directsound', label: 'DirectSound' },
    { id: 'asio', label: 'ASIO' },
  ];
  const refresh = async () => {
    setLoading(true);
    try {
      const response = await jamCall<NativeAudioInfo>('audio-output-info');
      setInfo(
        response && Array.isArray(response.devices) ? response : { available: false, devices: [] },
      );
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const locked = disabled || busy || loading || player.playing || player.starting;
  const commit = async (next: AudioEnginePreferences) => {
    setBusy(true);
    onBusy(true);
    setError('');
    setNotice('');
    try {
      await player.configureAudio(next);
      setNotice(tr('音频设置已应用；更换系统、设备或采样率后请重新校准延迟。'));
    } catch (e) {
      setError(
        (e as Error & { restorationFailed?: boolean }).restorationFailed
          ? tr('音频设备未响应，请重新选择输出设备') + ' ' + message((e as Error).message)
          : tr('切换失败，已恢复原音频设置：{0}', [message((e as Error).message)]),
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const native = preferences.backend !== 'web-audio',
    devices = info?.devices.filter((d) => d.backend === preferences.backend) || [],
    savedMissing =
      native &&
      preferences.deviceId !== 'default' &&
      !devices.some((d) => d.deviceId === preferences.deviceId),
    state = player.audioOutputState;
  return (
    <section className="settings-card audio-engine-settings">
      <div className="settings-card-heading">
        <h3>{tr('音频播放')}</h3>
        <button disabled={busy || loading || disabled} onClick={() => void refresh()}>
          {loading ? tr('检查中') : tr('刷新音频系统')}
        </button>
      </div>
      {(player.playing || player.starting) && (
        <p className="notice">{tr('请先停止播放、录音或校准再切换音频系统')}</p>
      )}
      <fieldset disabled={locked} className="settings-fieldset">
        <label className="settings-row">
          <span>
            <strong>{tr('音频系统')}</strong>
            <small>{tr('共享模式可与其他应用同时播放；独占模式会单独使用所选输出设备。')}</small>
          </span>
          <Select
            aria-label={tr('音频系统')}
            value={preferences.backend}
            onChange={(e) => {
              const backend = e.target.value as AudioSystem;
              const deviceId =
                backend === 'asio'
                  ? info?.devices.find((d) => d.backend === 'asio')?.deviceId
                  : 'default';
              if (deviceId) void commit({ ...preferences, backend, deviceId });
            }}
          >
            {systems.map((s) => (
              <option
                key={s.id}
                value={s.id}
                disabled={
                  s.id !== 'web-audio' &&
                  (!info?.available || !info.devices.some((d) => d.backend === s.id))
                }
              >
                {s.label}
              </option>
            ))}
          </Select>
        </label>
        {native && (
          <label className="settings-row">
            <strong>{tr('原生输出设备')}</strong>
            <Select
              aria-label={tr('原生输出设备')}
              value={preferences.deviceId}
              onChange={(e) => void commit({ ...preferences, deviceId: e.target.value })}
            >
              {preferences.backend !== 'asio' && (
                <option value="default">{tr('系统默认输出')}</option>
              )}
              {savedMissing && (
                <option value={preferences.deviceId}>{tr('已保存设备（当前未检测到）')}</option>
              )}
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="settings-row">
          <span>
            <strong>{tr('播放采样率')}</strong>
            <small>{tr('更改后重新载入音频引擎，保留当前工程与播放位置。')}</small>
          </span>
          <Select
            aria-label={tr('播放采样率')}
            value={preferences.sampleRate}
            onChange={(e) => void commit({ ...preferences, sampleRate: Number(e.target.value) })}
          >
            {SAMPLE_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {tr('{0} Hz', [rate])}
              </option>
            ))}
          </Select>
        </label>
      </fieldset>
      <p className="settings-readout">
        {player.context ? tr('处理采样率：{0} Hz', [state.sampleRate]) : tr('播放器尚未初始化')}
        {state.deviceSampleRate ? ' · ' + tr('设备采样率：{0} Hz', [state.deviceSampleRate]) : ''}
        {state.deviceBufferFrames
          ? ' · ' + tr('设备缓冲：{0} 采样', [state.deviceBufferFrames])
          : ''}
      </p>
      {native && (
        <p className="muted">
          {tr(
            '共享模式使用 Windows 设备采样率，必要时转换；独占和 ASIO 按设备支持情况打开所选采样率。录音输入仍使用下方的 Windows 录音设备。',
          )}
        </p>
      )}
      {info && !info.available && (
        <p className="notice">{tr('原生音频输出暂不可用，可继续使用兼容音频输出。')}</p>
      )}
      {info?.available && !info.devices.some((d) => d.backend === 'asio') && (
        <p className="muted">{tr('未检测到可用的64位ASIO驱动。')}</p>
      )}
      <div className="settings-section-footer">
        <button disabled={locked} onClick={() => void commit({ ...DEFAULT_ENGINE })}>
          {tr('恢复兼容音频输出')}
        </button>
        <small role="status">{busy ? tr('正在切换音频系统…') : notice}</small>
      </div>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
