import { t as tr } from '../../i18n';
const roots: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};
const shapes: Record<string, number[]> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  sus2: [0, 2, 4, 4, 0, 0],
};
const open: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  G: [3, 2, 0, 0, 0, 3],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  D7: [-1, -1, 0, 2, 1, 2],
  G7: [3, 2, 0, 0, 0, 1],
};
export default function ChordDiagram({ label }: { label: string }) {
  const normalized = label.replaceAll('♯', '#').replaceAll('♭', 'b'),
    match = /^([A-G][#b]?)(m7|maj7|sus2|sus4|m|7)?$/.exec(normalized);
  if (!match) return null;
  const base = shapes[match[2] || ''];
  if (!base) return null;
  const shift = (roots[match[1]] - 4 + 12) % 12,
    frets = open[normalized] || base.map((f) => (f < 0 ? -1 : f + shift)),
    positive = frets.filter((f) => f > 0),
    start = Math.max(1, Math.min(...positive)),
    low = Math.max(...positive) > 4 ? start : 1;
  return (
    <svg
      className="chord-diagram"
      viewBox="0 0 145 140"
      aria-label={tr('{0} 吉他和弦指法', [label])}
    >
      <text x="72" y="15" textAnchor="middle" fill="currentColor" fontSize="15">
        {label}
      </text>
      {Array.from({ length: 6 }, (_, i) => (
        <line key={'s' + i} x1={28 + i * 18} x2={28 + i * 18} y1={38} y2={120} stroke="#817787" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line
          key={'f' + i}
          x1={28}
          x2={118}
          y1={38 + i * 20.5}
          y2={38 + i * 20.5}
          stroke="#817787"
          strokeWidth={i === 0 && low === 1 ? 3 : 1}
        />
      ))}
      {low > 1 && (
        <text x="10" y="52" fill="currentColor" fontSize="11">
          {low}
        </text>
      )}
      {frets.map((f, i) =>
        f < 0 ? (
          <text key={i} x={28 + i * 18} y="31" fill="#91869b" textAnchor="middle" fontSize="12">
            ×
          </text>
        ) : f === 0 ? (
          <circle key={i} cx={28 + i * 18} cy={27} r={3} fill="none" stroke="#c5b9cd" />
        ) : (
          <circle
            key={i}
            cx={28 + i * 18}
            cy={38 + (f - low + 0.5) * 20.5}
            r={5.3}
            fill="#ed849b"
          />
        ),
      )}
      <text x="72" y="137" textAnchor="middle" fill="#807486" fontSize="8">
        E A D G B e
      </text>
    </svg>
  );
}
