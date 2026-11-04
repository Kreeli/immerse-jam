import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../../audio/Player';
import type { LiveEnvelope } from '../../audio/live-envelope';
import { t as tr } from '../../i18n';
import type { Bookmark, SourceGroup } from '../../shared/types';
import Waveform from '../player/Waveform';
export interface TimelineProps {
  player: Player;
  position: number;
  duration: number;
  windowSeconds: number;
  marks?: Bookmark[];
  a?: number | null;
  b?: number | null;
  onWindow?: (seconds: number) => void;
  active?: boolean;
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
      // The painter divides by this full-scale value: 1.08 / 3 gives a fixed
      // display gain of three without changing captured PCM or auto-normalising.
      amplitudeScale={0.36}
      preserveBins
      source="live-recording"
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
  const identity = source + '|' + generation;
  const previousIdentity = useRef(identity);
  const region = source.startsWith('group:')
    ? timeline.player.waveformRegion(source, group)
    : { origin: 0, duration: timeline.player.duration };
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (timeline.loading) return;
    const cached = timeline.player.cachedWaveform(source);
    if (cached) setPeaks(cached);
    else if (previousIdentity.current !== identity) setPeaks([]);
    previousIdentity.current = identity;
    const timer = setTimeout(
      () => {
        void timeline.player
          .waveform(source, group)
          .then((values) => {
            if (!cancelled && values.length) setPeaks(values);
          })
          .catch((error) => {
            if (!cancelled) setError(error.message);
          });
      },
      group ? 120 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
        disabled={timeline.recording}
        label={tr('音轨波形')}
      />
    </>
  );
}
