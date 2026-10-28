import { useEffect, useRef } from 'react';
import { asset, type Project } from '../../shared/types';
export default function SyncedVideo({
  project,
  position,
  playing,
}: {
  project: Project;
  position: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = project.practice.tempo;
    if (Math.abs(v.currentTime - position) > 0.25) v.currentTime = position;
    if (playing) void v.play().catch(() => {});
    else v.pause();
  }, [position, playing, project.practice.tempo]);
  return (
    <video
      ref={ref}
      className="video-preview"
      src={asset(project.id, project.original)}
      muted
      playsInline
    />
  );
}
