import type { StreamingAudio } from './StreamingAudio';
export class StreamTrack {
  readonly node: AudioWorkletNode;
  private delivered = new Set<number>();
  private signature = '';
  private closed = false;
  private headSerial = 0;
  constructor(
    private context: AudioContext,
    private stream: StreamingAudio,
    private track: string,
    output: AudioNode,
  ) {
    this.node = new AudioWorkletNode(context, 'immerse-stream-track', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.connect(output);
  }
  read(index: number): Promise<void> {
    if (this.delivered.has(index)) return Promise.resolve();
    const task = this.stream.read(this.context, this.track, index).then((buffer) => {
      if (this.closed || this.delivered.has(index)) return;
      // Give the render thread ownership; copying large arrays on its deadline
      // causes audible underruns on slower tablets. The worker retains windows.
      this.node.port.postMessage({ type: 'window', index, pcm: buffer }, [buffer.buffer]);
      this.delivered.add(index);
    });
    return task;
  }
  async prime(first: number, count: number) {
    const end = first + count - 2;
    if (
      this.delivered.has(Math.floor(first / 48000)) &&
      this.delivered.has(Math.floor(end / 48000))
    )
      return;
    const serial = this.headSerial;
    const samples = await this.stream.readPart(this.track, first, count);
    if (this.closed || serial !== this.headSerial) return;
    this.node.port.postMessage({ type: 'head', first, pcm: samples }, [samples.buffer]);
  }
  resetHeads(clear = true) {
    this.headSerial++;
    if (clear) this.node.port.postMessage({ type: 'clear-heads' });
  }
  retain(indices: number[]) {
    const unique = [...new Set(indices)].sort((a, b) => a - b),
      signature = unique.join(',');
    if (signature === this.signature) return;
    this.signature = signature;
    const keep = new Set(unique);
    for (const index of this.delivered) if (!keep.has(index)) this.delivered.delete(index);
    this.node.port.postMessage({ type: 'retain', indices: unique });
  }
  play(
    frame: number,
    offset: number,
    tempo: number,
    start: number,
    duration: number,
    loop: { a: number; b: number } | null,
    crossfade = true,
  ) {
    this.node.port.postMessage({
      type: 'play',
      frame,
      offset,
      tempo,
      start,
      duration,
      loop,
      crossfade,
    });
  }
  stop(frame: number) {
    this.node.port.postMessage({ type: 'stop', frame });
  }
  close() {
    this.closed = true;
    this.node.port.postMessage({ type: 'close' });
    this.node.disconnect();
    this.node.port.close();
  }
}
