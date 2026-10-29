export class LiveEnvelope {
  readonly step = 0.01;
  peaks: number[] = [];
  duration = 0;
  revision = 0;
  readonly start: number;
  readonly anchorTime: number;
  readonly anchorPosition: number;
  readonly sampleRate: number;
  readonly tempo: number;
  constructor(
    anchorTime: number,
    anchorPosition: number,
    sampleRate: number,
    tempo: number,
    latencyMs: number,
  ) {
    this.anchorTime = anchorTime;
    this.anchorPosition = anchorPosition;
    this.sampleRate = sampleRate;
    this.tempo = tempo;
    this.start = anchorPosition - (latencyMs * tempo) / 1000;
  }
  push(time: number, samples: Float32Array) {
    const frames = Math.floor(samples.length / 2);
    for (let frame = 0; frame < frames; frame++) {
      const relative = (time - this.anchorTime + frame / this.sampleRate) * this.tempo;
      const index = Math.floor((relative + 1e-8) / this.step);
      if (index < 0) continue;
      while (this.peaks.length <= index) this.peaks.push(0);
      this.peaks[index] = Math.max(
        this.peaks[index],
        Math.abs(samples[frame * 2]),
        Math.abs(samples[frame * 2 + 1]),
      );
    }
    this.duration = Math.max(
      this.duration,
      (time - this.anchorTime + frames / this.sampleRate) * this.tempo,
    );
    this.revision++;
  }
  window(position: number, seconds: number) {
    const origin =
      Math.max(0, Math.floor((position - seconds / 2 - this.start) / this.step)) * this.step;
    const first = Math.round(origin / this.step),
      count = Math.ceil(seconds / this.step) + 2;
    return {
      origin: this.start + origin,
      duration: count * this.step,
      peaks: Array.from({ length: count }, (_, i) => this.peaks[first + i] || 0),
    };
  }
}
