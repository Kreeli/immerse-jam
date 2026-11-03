import { useId, useMemo } from 'react';
import { Folder } from 'lucide-react';

/** JSX port of PR #6 prototype.html's cover(): three neon strings, stable per song. */
export default function RehearsalCover({
  id,
  size = 64,
  cover,
  folder = false,
}: {
  id: string;
  size?: number;
  cover?: string;
  folder?: boolean;
}) {
  const gradient = useId().replaceAll(':', ''),
    art = useMemo(() => {
      let seed =
        [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
      const hue = seed % 360;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      return {
        hue,
        lines: [0, 1, 2].map((i) => {
          const y = 18 + i * 14,
            a = random() * 10 - 5,
            b = random() * 10 - 5;
          return {
            y,
            a,
            b,
            x: 14 + random() * 36,
            color: `hsl(${(hue + [0, 40, 200][i]) % 360} 85% 62%)`,
          };
        }),
      };
    }, [id]);
  return (
    <span
      className={'nr-cover' + (folder ? ' is-folder' : '')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {cover ? (
        <img src={cover} alt="" />
      ) : folder ? (
        <Folder size={size * 0.6} />
      ) : (
        <svg viewBox="0 0 64 64" preserveAspectRatio="none">
          <defs>
            <radialGradient id={gradient} cx="30%" cy="20%" r="90%">
              <stop offset="0" stopColor={`hsl(${art.hue} 45% 20%)`} />
              <stop offset="1" stopColor="#09080d" />
            </radialGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gradient})`} />
          {art.lines.map((line, i) => (
            <g key={i} fill={line.color} stroke={line.color}>
              <path
                d={`M0 ${line.y} C20 ${line.y + line.a},44 ${line.y + line.b},64 ${line.y}`}
                strokeWidth="2"
                fill="none"
                opacity=".95"
              />
              <circle cx={line.x} cy={line.y + (line.a + line.b) / 4} r="2.6" stroke="none" />
            </g>
          ))}
        </svg>
      )}
    </span>
  );
}
