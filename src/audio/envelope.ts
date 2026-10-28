export function fixedEnvelope(
  peaks: number[],
  duration: number,
  windowSeconds: number,
  width: number,
) {
  const stride = Math.max(
      1,
      Math.ceil((peaks.length * windowSeconds) / Math.max(duration, 0.001) / Math.max(1, width)),
    ),
    values: number[] = [];
  for (let start = 0; start < peaks.length; start += stride) {
    let value = 0;
    for (let i = start; i < Math.min(start + stride, peaks.length); i++)
      value = Math.max(value, Math.abs(peaks[i] || 0));
    values.push(value);
  }
  return { values, step: (stride * duration) / Math.max(1, peaks.length) };
}
export function placeEnvelope(
  peaks: number[],
  sourceDuration: number,
  start: number,
  duration: number,
) {
  const count = Math.max(0, Math.ceil(duration * 100)),
    step = sourceDuration / Math.max(1, peaks.length),
    result = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    const relative = i / 100 - start;
    if (relative >= -1e-8 && relative < sourceDuration - 1e-8)
      result[i] =
        peaks[
          Math.min(peaks.length - 1, Math.floor((relative + 1e-8) / Math.max(step, 0.00001)))
        ] || 0;
  }
  return result;
}
