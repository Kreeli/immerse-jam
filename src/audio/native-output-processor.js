// The final stereo mix is sent to the native output; the browser destination stays silent.
class NativeOutputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.position = 0;
    this.samples = new Float32Array(1024);
    this.port.onmessage = (event) => {
      this.enabled = event.data.enabled === true;
      this.position = 0;
    };
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.enabled) return true;
    const input = inputs[0];
    if (!input?.[0]?.length) return true;
    const left = input[0],
      right = input[1] || left;
    for (let i = 0; i < left.length; i++) {
      const l = left[i],
        r = right[i];
      this.samples[this.position++] = Number.isFinite(l) ? Math.max(-0.98, Math.min(0.98, l)) : 0;
      this.samples[this.position++] = Number.isFinite(r) ? Math.max(-0.98, Math.min(0.98, r)) : 0;
      if (this.position === this.samples.length) {
        const samples = this.samples.buffer;
        this.port.postMessage(samples, [samples]);
        this.samples = new Float32Array(1024);
        this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('immerse-native-output', NativeOutputProcessor);
