// Analysis stores a bare tonic for major and an "m" suffix for minor.
// Expand only the display label so existing projects and chord symbols stay intact.
export function keyLabel(key: string) {
  const match = key.trim().match(/^([A-G][#♯b♭]?)\s*:?\s*(.*)$/);
  if (!match) return key;
  const [, tonic, mode] = match;
  if (!mode || mode === 'M' || /^(maj(?:or)?|大调)$/i.test(mode)) return `${tonic} major`;
  if (/^(m|min(?:or)?|小调)$/i.test(mode)) return `${tonic} minor`;
  return key;
}

export function transpose(label: string, semitones: number) {
  if (!semitones || label === 'N') return label;
  const notes = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const aliases: Record<string, number> = {
    C: 0,
    'C#': 1,
    'C♯': 1,
    Db: 1,
    'D♭': 1,
    D: 2,
    'D#': 3,
    'D♯': 3,
    Eb: 3,
    'E♭': 3,
    E: 4,
    F: 5,
    'F#': 6,
    'F♯': 6,
    Gb: 6,
    'G♭': 6,
    G: 7,
    'G#': 8,
    'G♯': 8,
    Ab: 8,
    'A♭': 8,
    A: 9,
    'A#': 10,
    'A♯': 10,
    Bb: 10,
    'B♭': 10,
    B: 11,
  };
  return label.replace(/[A-G][#♯b♭]?/g, (n) => notes[((aliases[n] ?? 0) + semitones + 120) % 12]);
}
