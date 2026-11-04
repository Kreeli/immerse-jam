import { isAndroid } from '../../platform/environment';
import { useEffect, useRef, useState } from 'react';
import { AudioCapture, type CaptureSession } from '../../audio/capture';
import { analyzeLatency, type CalibrationChunk } from '../../audio/latency';
import type { Player } from '../../audio/Player';
import { t as tr } from '../../i18n';
import type { RecordingSettings } from '../../shared/types';
export default function LatencyCalibration({
  player,
  settings,
  onApply,
  onBusy,
  onError,
}: {
  player: Player;
  settings: RecordingSettings;
  onApply: (ms: number) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [running, setRunning] = useState(false),
    [beat, setBeat] = useState(0),
    [result, setResult] = useState<ReturnType<typeof analyzeLatency> | null>(null),
    [level, setLevel] = useState(0);
  const [adjustment, setAdjustment] = useState(0),
    [previewing, setPreviewing] = useState(false);
  const preview = useRef<{ chunks: CalibrationChunk[]; targets: number[] } | null>(null);
  const stopPreview = useRef<() => void>(() => {});
  const cancel = useRef(false),
    controller = useRef<AbortController | null>(null),
    capture = useRef<CaptureSession | null>(null);
  const stop = () => {
    if (!controller.current) return;
    cancel.current = true;
    controller.current?.abort();
    player.pause();
    void capture.current?.stop();
  };
  useEffect(
    () => () => {
      stop();
      stopPreview.current();
    },
    [],
  );
  useEffect(() => {
    stop();
    stopPreview.current();
    setResult(null);
    preview.current = null;
  }, [settings.inputDeviceId, settings.outputDeviceId, settings.channel]);
  useEffect(() => {
    const interrupt = (event: Event) => {
      if (['pause', 'route-changed'].includes((event as CustomEvent<string>).detail)) {
        stop();
        stopPreview.current();
        setResult(null);
        preview.current = null;
      }
    };
    window.addEventListener('immerse-audio', interrupt);
    return () => window.removeEventListener('immerse-audio', interrupt);
  }, []);
  const run = async () => {
    stopPreview.current();
    preview.current = null;
    setRunning(true);
    setResult(null);
    setBeat(0);
    cancel.current = false;
    const abort = new AbortController();
    controller.current = abort;
    onBusy(true);
    const chunks: CalibrationChunk[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;
    let releaseAudio: (() => void) | undefined;
    const position = player.position(),
      loop = player.loop;
    try {
      player.pause();
      await player.init();
      abort.signal.throwIfAborted();
      await player.setOutputDevice(settings.outputDeviceId);
      abort.signal.throwIfAborted();
      releaseAudio = await player.previewClicks();
      abort.signal.throwIfAborted();
      player.countInGain!.gain.value = player.project?.practice.metronomeVolume ?? 0.5;
      capture.current = await AudioCapture.open(
        player.context!,
        settings,
        async (_sequence, time, bytes) => {
          chunks.push({
            time,
            samples: new Float32Array(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            ),
          });
        },
        (_seconds, value) => setLevel(value),
        () => {
          cancel.current = true;
        },
        abort.signal,
        true,
      );
      abort.signal.throwIfAborted();
      const start = player.context!.currentTime + (isAndroid ? 0.6 : 0.35),
        interval = 2 / 3,
        targets = Array.from({ length: 8 }, (_, i) => start + (i + 4) * interval);
      capture.current.arm(start - 0.1);
      for (let i = 0; i < 12; i++) player.click(start + i * interval, i % 4 === 0, true);
      await new Promise<void>((resolve) => {
        timer = setInterval(() => {
          const now = player.context!.currentTime;
          setBeat(Math.max(0, Math.min(12, Math.floor((now - start) / interval) + 1)));
          if (cancel.current || now > start + 12 * interval + 0.35) resolve();
        }, 40);
      });
      if (timer) clearInterval(timer);
      await capture.current.stop();
      await capture.current.queue;
      if (!cancel.current) {
        const measured = analyzeLatency(chunks, player.context!.sampleRate, targets, isAndroid);
        preview.current = { chunks, targets };
        setAdjustment(measured.offsetMs);
        setResult(measured);
      }
    } catch (error) {
      if (!cancel.current) onError((error as Error).message);
    } finally {
      if (timer) clearInterval(timer);
      await capture.current?.stop();
      capture.current = null;
      controller.current = null;
      player.pause();
      player.loop = loop;
      player.seek(position);
      releaseAudio?.();
      setRunning(false);
      setLevel(0);
      onBusy(false);
    }
  };
  const listen = async (corrected: boolean) => {
    stopPreview.current();
    const recording = preview.current;
    if (!recording) return;
    setPreviewing(true);
    onBusy(true);
    let release: (() => void) | undefined;
    const sources: AudioBufferSourceNode[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const source of sources) {
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      player.pause();
      release?.();
      setPreviewing(false);
      onBusy(false);
    };
    stopPreview.current = finish;
    try {
      release = await player.previewClicks();
      if (stopped) {
        release();
        return;
      }
      const ctx = player.context!,
        origin = ctx.currentTime + 0.15;
      const first = recording.targets[0] - 0.35,
        duration = 3.5;
      for (const target of recording.targets)
        if (target >= first && target < first + duration)
          player.click(origin + target - first, false, true);
      // Replay captured attacks against the same click clock; correction moves
      // the input earlier, exactly as recording placement does.
      for (const chunk of recording.chunks) {
        const time = chunk.time - (corrected ? adjustment / 1000 : 0),
          frames = chunk.samples.length / 2;
        const skip = Math.max(0, Math.ceil((first - time) * ctx.sampleRate));
        const count = Math.min(
          frames - skip,
          Math.floor((first + duration - time) * ctx.sampleRate) - skip,
        );
        if (count <= 0) continue;
        const buffer = ctx.createBuffer(2, count, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const output = buffer.getChannelData(c);
          for (let i = 0; i < count; i++) output[i] = chunk.samples[(i + skip) * 2 + c];
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(player.transportGain!);
        source.start(origin + time + skip / ctx.sampleRate - first);
        sources.push(source);
      }
      timer = setTimeout(finish, (duration + 0.25) * 1000);
    } catch (error) {
      finish();
      onError((error as Error).message);
    }
  };
  return (
    <div className="latency-calibration">
      <strong>{tr('跟拍延迟校准')}</strong>
      {isAndroid ? (
        <p>{tr('戴好耳机，先听四拍，再跟拍八次。')}</p>
      ) : (
        <>
          <p>{tr('连接好本次使用的耳机和输入设备后再校准；换耳机或蓝牙路由后需要重新检查。')}</p>
          <p>
            {tr(
              '先听四拍，再跟随八拍快速扫弦、skank 或拍一下。输入应只有短音；请戴耳机，避免节拍器本身从 AUX 或扬声器进入录音。',
            )}
          </p>
          <small>
            {tr(
              '结果包含设备链路和人的跟拍偏差，不等同于纯声卡延迟。会剔除明显偏离的几次，也可继续手动微调。',
            )}
          </small>
        </>
      )}
      {running ? (
        <div className="calibration-running">
          <span>
            {beat < 5 ? tr('先听预备拍') : tr('跟着每拍发出短音')} · {beat}/12
          </span>
          <meter aria-label={tr('校准输入电平')} min="0" max=".3" value={level} />
          <button className="small" onClick={stop}>
            {tr('取消校准')}
          </button>
        </div>
      ) : (
        <button className="small" disabled={previewing} onClick={() => void run()}>
          {tr('测试并估计延迟')}
        </button>
      )}
      {result && (
        <div className="calibration-result">
          <strong>
            {tr('建议校正')}
            {adjustment} ms
          </strong>
          <span>
            {tr('采用')}
            {result.accepted}/{result.total}
            {tr('次 \u00B7 波动约')}
            {result.spreadMs} ms
          </span>
          {result.spreadMs > 60 && (
            <p role="status">{tr('跟拍波动较大，建议重新校准后再应用。')}</p>
          )}
          <label>
            {tr('校正值（毫秒）')}
            <input
              type="number"
              min="-2000"
              max="2000"
              value={adjustment}
              disabled={previewing}
              onChange={(e) =>
                setAdjustment(Math.max(-2000, Math.min(2000, Number(e.target.value) || 0)))
              }
            />
          </label>
          <div className="remote-actions">
            <button disabled={previewing} onClick={() => void listen(false)}>
              {tr('试听校正前')}
            </button>
            <button disabled={previewing} onClick={() => void listen(true)}>
              {tr('试听校正后')}
            </button>
            {previewing && <button onClick={() => stopPreview.current()}>{tr('停止试听')}</button>}
          </div>
          <button
            className="small primary"
            disabled={previewing || result.spreadMs > 60}
            onClick={() => onApply(adjustment)}
          >
            {tr('应用校正值')}
          </button>
        </div>
      )}
    </div>
  );
}
