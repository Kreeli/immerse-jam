import { t as tr } from '../i18n';
import type { RecordingSettings } from '../shared/types';
import captureUrl from './capture-processor.js?url';
const installed = new WeakSet<AudioContext>();
export class AudioCapture {
  stream: MediaStream;
  node: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
  frames = 0;
  queue: Promise<unknown> = Promise.resolve();
  error: Error | null = null;
  done: (() => void) | null = null;
  stopping = false;
  level = 0;
  constructor(
    context: AudioContext,
    stream: MediaStream,
    channel: RecordingSettings['channel'],
    onChunk: (sequence: number, time: number, bytes: Uint8Array) => Promise<unknown>,
    onProgress: (seconds: number, level: number) => void,
    onLost: () => void,
  ) {
    this.stream = stream;
    this.node = new AudioWorkletNode(context, 'immerse-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { channel },
    });
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(this.node);
    this.node.connect(context.destination);
    this.node.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'done') {
        this.done?.();
        return;
      }
      if (data.type !== 'chunk') return;
      const samples = data.samples as Float32Array;
      this.frames = data.frames;
      let energy = 0;
      for (const value of samples) energy += value * value;
      this.level = Math.sqrt(energy / Math.max(1, samples.length));
      onProgress(this.frames / context.sampleRate, this.level);
      if (this.error) return;
      this.queue = this.queue
        .then(() => onChunk(data.sequence, data.contextTime, new Uint8Array(samples.buffer)))
        .catch((error) => {
          this.error = error;
          onLost();
        });
    };
    this.node.onprocessorerror = () => {
      this.error = new Error(tr('录音处理已中断，已收到的部分仍可保存'));
      onLost();
    };
    for (const track of stream.getTracks())
      track.onended = () => {
        if (!this.stopping) {
          this.error = new Error(tr('录音设备已断开，已保留收到的录音'));
          onLost();
        }
      };
  }
  static async open(
    context: AudioContext,
    settings: RecordingSettings,
    onChunk: (sequence: number, time: number, bytes: Uint8Array) => Promise<unknown>,
    onProgress: (seconds: number, level: number) => void,
    onLost: () => void,
  ) {
    if (!installed.has(context)) {
      await context.audioWorklet.addModule(captureUrl);
      installed.add(context);
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
        sampleRate: { ideal: context.sampleRate },
      },
    });
    try {
      if (
        settings.channel === 'right' &&
        stream.getAudioTracks()[0].getSettings().channelCount === 1
      )
        throw new Error(tr('所选输入只有一个声道，请选择单声道或左声道'));
      return new AudioCapture(context, stream, settings.channel, onChunk, onProgress, onLost);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }
  arm(at: number) {
    this.node.port.postMessage({ type: 'arm', at });
  }
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    await Promise.race([
      new Promise<void>((resolve) => {
        this.done = resolve;
        this.node.port.postMessage({ type: 'stop' });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
    this.source.disconnect();
    this.node.disconnect();
    this.node.port.close();
    this.stream.getTracks().forEach((track) => track.stop());
    await this.queue;
  }
}
