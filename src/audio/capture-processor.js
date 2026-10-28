class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channelMode = options.processorOptions?.channel || 'stereo';
    this.startFrame = Infinity;
    this.buffer = new Float32Array(8192);
    this.used = 0;
    this.sequence = 0;
    this.chunkFrame = 0;
    this.frames = 0;
    this.closed = false;
    this.port.onmessage = (event) => {
      if (event.data.type === 'arm') this.startFrame = Math.round(event.data.at * sampleRate);
      if (event.data.type === 'stop') {
        this.flush();
        this.closed = true;
        this.port.postMessage({ type: 'done', frames: this.frames });
      }
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage(
      {
        type: 'chunk',
        sequence: this.sequence++,
        contextTime: this.chunkFrame / sampleRate,
        samples,
        frames: this.frames,
      },
      [samples.buffer],
    );
    this.used = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0] || [],
      length = outputs[0]?.[0]?.length || 128;
    for (const channel of outputs[0] || []) channel.fill(0);
    if (this.closed) return false;
    for (let i = 0; i < length; i++) {
      const frame = currentFrame + i;
      if (frame < this.startFrame) continue;
      let left = input[0]?.[i] || 0,
        right = input[1]?.[i] ?? left;
      if (this.channelMode === 'left') right = left;
      else if (this.channelMode === 'right') left = right;
      else if (this.channelMode === 'mono') left = right = (left + right) / 2;
      if (!this.used) this.chunkFrame = frame;
      this.buffer[this.used++] = left;
      this.buffer[this.used++] = right;
      this.frames++;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('immerse-capture', CaptureProcessor);
