export function calculatePeaks(channels, length, sampleRate) {
  const count = Math.max(1, Math.ceil((length / sampleRate) * 100)),
    step = Math.max(1, Math.ceil(length / count)),
    peaks = new Float32Array(Math.ceil(length / step));
  for (let start = 0, index = 0; start < length; start += step, index++) {
    let peak = 0;
    for (const samples of channels)
      for (let i = start; i < Math.min(start + step, length); i++)
        peak = Math.max(peak, Math.abs(samples[i] || 0));
    peaks[index] = peak;
  }
  return peaks;
}
if (typeof self !== 'undefined' && typeof document === 'undefined')
  self.onmessage = (event) => {
    const { id, buffers, length, sampleRate } = event.data;
    try {
      const peaks = calculatePeaks(
        buffers.map((buffer) => new Float32Array(buffer)),
        length,
        sampleRate,
      );
      self.postMessage({ id, peaks }, [peaks.buffer]);
    } catch (error) {
      self.postMessage({ id, error: String(error) });
    }
  };
