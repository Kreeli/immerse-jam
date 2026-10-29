import { useEffect, useRef, useState } from 'react';
import { AudioCapture } from '../../audio/capture';
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
  const cancel = useRef(false),
    controller = useRef<AbortController | null>(null),
    capture = useRef<AudioCapture | null>(null);
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
    },
    [],
  );
  const run = async () => {
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
      );
      abort.signal.throwIfAborted();
      const start = player.context!.currentTime + 0.35,
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
      if (!cancel.current) setResult(analyzeLatency(chunks, player.context!.sampleRate, targets));
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
  return (
    <div className="latency-calibration">
      <strong>{tr('跟拍延迟校准')}</strong>
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
        <button className="small" onClick={() => void run()}>
          {tr('测试并估计延迟')}
        </button>
      )}
      {result && (
        <div className="calibration-result">
          <strong>
            {tr('建议校正')}
            {result.offsetMs} ms
          </strong>
          <span>
            {tr('采用')}
            {result.accepted}/{result.total}
            {tr('次 \u00B7 波动约')}
            {result.spreadMs} ms
          </span>
          <button className="small primary" onClick={() => onApply(result.offsetMs)}>
            {tr('应用校正值')}
          </button>
        </div>
      )}
    </div>
  );
}
