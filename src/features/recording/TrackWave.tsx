import { useEffect, useMemo, useState } from 'react';
import type { Player } from '../../audio/Player';
import type { LiveEnvelope } from '../../audio/live-envelope';
import { t as tr } from '../../i18n';
import type { SourceGroup } from '../../shared/types';
import Waveform from '../player/Waveform';
export interface TimelineProps {
  player: Player;
  position: number;
  duration: number;
  windowSeconds: number;
  recording: boolean;
  loading: boolean;
  onSeek: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}
export function LiveWave({ live, ...timeline }: TimelineProps & { live: LiveEnvelope }) {
  const snapshot = useMemo(
    () => live.window(timeline.position, timeline.windowSeconds),
    [live, live.revision, Math.floor(timeline.position * 100), timeline.windowSeconds],
  );
  return (
    <Waveform
      {...timeline}
      peaks={snapshot.peaks}
      peakOrigin={snapshot.origin}
      peakDuration={snapshot.duration}
      amplitudeScale={0.5}
      preserveBins
      source="live-recording"
      a={null}
      b={null}
      disabled
      label={tr('实时录音波形')}
    />
  );
}
export default function TrackWave({
  source,
  signature = '',
  group,
  ...timeline
}: TimelineProps & { source: string; signature?: string; group?: SourceGroup }) {
  const [peaks, setPeaks] = useState<number[]>([]),
    [error, setError] = useState('');
  const generation = timeline.player.generation;
  const region = source.startsWith('group:')
    ? timeline.player.waveformRegion(source, group)
    : { origin: 0, duration: timeline.player.duration };
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (timeline.loading) return;
    const cached = timeline.player.cachedWaveform(source);
    if (cached) setPeaks(cached);
    else setPeaks([]);
    void timeline.player
      .waveform(source, group)
      .then((values) => {
        if (!cancelled) setPeaks(values);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [source, generation, signature, timeline.loading]);
  return (
    <>
      {error && <small role="status">{error}</small>}
      <Waveform
        {...timeline}
        peaks={peaks}
        peakDuration={region.duration}
        peakOrigin={region.origin}
        source={source}
        a={null}
        b={null}
        disabled={timeline.recording}
        label={tr('音轨波形')}
      />
    </>
  );
}
