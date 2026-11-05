import processorUrl from './native-output-processor.js?url';
import { jamCall } from '../platform/project-call';
import type { AudioEnginePreferences, AudioOutputState } from './engine-preferences';
export class NativeAudioOutput {
  readonly node: AudioWorkletNode;
  info: AudioOutputState;
  private id = '';
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> = Promise.resolve();
  private serial = 0;
  private pending = 0;
  private closed = false;
  private off: () => void;
  private state = () => {
    if (this.context.state !== 'running') void this.suspend().catch(() => {});
  };
  constructor(
    private context: AudioContext,
    private config: AudioEnginePreferences,
    private onError: (error: Error) => void,
  ) {
    this.info = { backend: config.backend, sampleRate: context.sampleRate };
    this.node = new AudioWorkletNode(context, 'immerse-native-output', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.connect(context.destination);
    this.node.port.onmessage = (event) => {
      const id = this.id,
        serial = this.serial;
      if (!id || this.closed) return;
      if (this.pending >= 8) {
        this.fail(new Error('音频输出积压，请增大缓冲或改用兼容模式'));
        return;
      }
      this.pending++;
      void jamCall('audio-output-write', { streamId: id, samples: event.data })
        .then((result) => {
          if (!result.accepted && serial === this.serial) throw new Error('原生音频输出已断开');
        })
        .catch((error) => {
          if (serial === this.serial) this.fail(error);
        })
        .finally(() => {
          this.pending--;
        });
    };
    this.off = window.jam.onEvent((event) => {
      if (
        event.scope === 'native-audio' &&
        event.type === 'error' &&
        (event as typeof event & { streamId?: string }).streamId === this.id
      )
        this.fail(new Error(event.message || '原生音频输出中断'));
    });
    context.addEventListener('statechange', this.state);
  }
  static async open(
    context: AudioContext,
    config: AudioEnginePreferences,
    onError: (error: Error) => void,
  ) {
    await context.audioWorklet.addModule(processorUrl);
    const output = new NativeAudioOutput(context, config, onError);
    try {
      await output.resume();
      return output;
    } catch (error) {
      await output.close();
      throw error;
    }
  }
  private fail(error: Error) {
    void this.suspend().catch(() => {});
    this.onError(error);
  }
  async resume() {
    if (this.closed) throw new Error('播放器已关闭');
    if (this.starting) return this.starting;
    if (this.id) return;
    const serial = ++this.serial;
    this.starting = (async () => {
      await this.stopping;
      const result = await jamCall<AudioOutputState & { streamId: string }>(
        'audio-output-start',
        this.config,
      );
      if (this.closed || serial !== this.serial) {
        await jamCall('audio-output-stop', { streamId: result.streamId });
        return;
      }
      this.info = result;
      this.id = result.streamId;
      this.node.port.postMessage({ enabled: true });
    })();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async suspend() {
    this.serial++;
    this.node.port.postMessage({ enabled: false });
    const id = this.id;
    this.id = '';
    if (id) {
      this.stopping = this.stopping
        .catch(() => {})
        .then(() => jamCall('audio-output-stop', { streamId: id }))
        .then(() => {});
      await this.stopping;
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.context.removeEventListener('statechange', this.state);
    this.off();
    await this.suspend().catch(() => {});
    this.node.disconnect();
    this.node.port.close();
  }
}
