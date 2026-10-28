export type CalibrationChunk = {
  time: number;
  samples: Float32Array;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
export function analyzeLatency(chunks: CalibrationChunk[], sampleRate: number, targets: number[]) {
  const step = Math.max(1, Math.round(sampleRate * 0.005)),
    bins: {
      time: number;
      energy: number;
    }[] = [];
  for (const chunk of chunks)
    for (let frame = 0; frame < chunk.samples.length / 2; frame += step) {
      let sum = 0,
        count = 0;
      for (let i = frame; i < Math.min(chunk.samples.length / 2, frame + step); i++) {
        sum += chunk.samples[i * 2] ** 2 + chunk.samples[i * 2 + 1] ** 2;
        count += 2;
      }
      bins.push({
        time: chunk.time + frame / sampleRate,
        energy: Math.sqrt(sum / Math.max(1, count)),
      });
    }
  const noise = median(
      bins
        .map((bin) => bin.energy)
        .sort((a, b) => a - b)
        .slice(0, Math.max(1, Math.floor(bins.length * 0.3))),
    ),
    peak = Math.max(0, ...bins.map((bin) => bin.energy)),
    threshold = Math.max(0.004, noise * 4, peak * 0.1),
    onsets: number[] = [];
  for (let i = 1; i < bins.length; i++) {
    const bin = bins[i],
      previous = bins[i - 1];
    if (
      bin.energy > threshold &&
      bin.energy > previous.energy * 1.65 &&
      bin.time - (onsets.at(-1) ?? -100) > 0.22
    )
      onsets.push(bin.time);
  }
  const used = new Set<number>(),
    differences: number[] = [];
  for (const target of targets) {
    let index = -1,
      distance = 0.31;
    onsets.forEach((time, i) => {
      if (!used.has(i) && Math.abs(time - target) < distance) {
        distance = Math.abs(time - target);
        index = i;
      }
    });
    if (index >= 0) {
      used.add(index);
      differences.push((onsets[index] - target) * 1000);
    }
  }
  if (differences.length < 5)
    throw new Error('有效短音不足五次。请戴耳机，用短促的扫弦或拍击跟随节拍，然后重试。');
  const center = median(differences),
    mad = median(differences.map((value) => Math.abs(value - center))),
    accepted = differences.filter((value) => Math.abs(value - center) <= Math.max(25, mad * 3));
  if (accepted.length < 5) throw new Error('几次跟拍的偏差较大，请再试一次，尽量保持稳定。');
  const offsetMs = Math.round(median(accepted)),
    spreadMs = Math.round(
      Math.sqrt(
        accepted.reduce((sum, value) => sum + (value - offsetMs) ** 2, 0) / accepted.length,
      ),
    );
  return { offsetMs, spreadMs, accepted: accepted.length, total: targets.length };
}
