import type { CaptureSession } from '../../audio/capture';
import type { RecordingSettings } from '../../shared/types';

export type InputDevice = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>;
export async function recordingDevices(permission = false): Promise<InputDevice[]> {
  if (window.ImmerseNative) return window.jam.call('android-capture-devices', { permission });
  if (permission) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
  }
  return navigator.mediaDevices.enumerateDevices();
}

/** Bounded binary capture packets, timestamped on the native audio clock. */
export class NativeCapture implements CaptureSession {
  frames = 0;
  error: Error | null = null;
  queue: Promise<unknown> = Promise.resolve();
  private at = Infinity;
  private sequence = 0;
  private stopping: Promise<void> | null = null;
  private polling: Promise<void> = Promise.resolve();
  private constructor(
    private context: AudioContext,
    private id: string,
    private clockOffset: number,
    private onChunk: (sequence: number, time: number, bytes: Uint8Array) => Promise<unknown>,
    private onProgress: (seconds: number, level: number) => void,
    private onLost: () => void,
  ) {}
  static async open(
    context: AudioContext,
    settings: RecordingSettings,
    onChunk: (sequence: number, time: number, bytes: Uint8Array) => Promise<unknown>,
    onProgress: (seconds: number, level: number) => void,
    onLost: () => void,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const pending = window.jam.call<{ id: string }>('android-capture-open', {
      device: settings.inputDeviceId,
      channel: settings.channel,
    });
    // A system permission prompt can outlive the calibration dialog. Cancel
    // promptly and release any input that completes opening after cancellation.
    const { id } = await new Promise<{ id: string }>((resolve, reject) => {
      const abort = () => reject(signal?.reason || new DOMException('Cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      pending.then(
        (value) => {
          signal?.removeEventListener('abort', abort);
          if (signal?.aborted) {
            void window.jam.call('android-capture-close', { session: value.id }).catch(() => {});
            abort();
          } else resolve(value);
        },
        (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
    let capture: NativeCapture | undefined;
    try {
      signal?.throwIfAborted();
      // Permission prompts and input startup are excluded. Choose the shortest
      // round trip to map CLOCK_MONOTONIC to the running WebAudio clock.
      let shortest = Infinity,
        offset = 0;
      for (let i = 0; i < 3; i++) {
        const begin = context.currentTime,
          start = performance.now();
        const { seconds } = await window.jam.call('android-capture-clock');
        const elapsed = performance.now() - start;
        if (elapsed < shortest) {
          shortest = elapsed;
          offset = (begin + context.currentTime) / 2 - seconds;
        }
        signal?.throwIfAborted();
      }
      capture = new NativeCapture(context, id, offset, onChunk, onProgress, onLost);
      capture.polling = capture.poll();
      return capture;
    } catch (error) {
      await window.jam.call('android-capture-close', { session: id }).catch(() => {});
      throw error;
    }
  }
  arm(at: number) {
    this.at = at;
  }
  private async poll() {
    try {
      while (true) {
        const response = await fetch(`/capture/${this.id}/read`);
        if (response.status === 204) {
          if (!this.stopping) throw new Error('录音输入已停止，已保留收到的录音');
          break;
        }
        if (!response.ok) throw new Error(await response.text());
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength) continue;
        if (bytes.byteLength < 16 || (bytes.byteLength - 8) % 8)
          throw new Error('Invalid capture packet');
        const time = new DataView(bytes).getFloat64(0, true) + this.clockOffset;
        const first = Math.max(0, Math.round((this.at - time) * 48000));
        const count = (bytes.byteLength - 8) / 8 - first;
        if (count <= 0 || !Number.isFinite(first)) continue;
        const samples = new Float32Array(bytes, 8 + first * 8, count * 2);
        this.frames += count;
        let energy = 0;
        for (const value of samples) energy += value * value;
        this.onProgress(this.frames / this.context.sampleRate, Math.sqrt(energy / samples.length));
        // Wait for persistence before polling the next packet. Native buffering
        // is bounded and reports an interruption instead of losing samples.
        this.queue = this.onChunk(
          this.sequence++,
          time + first / 48000,
          new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
        );
        await this.queue;
      }
    } catch (error) {
      this.error = error as Error;
      // Calling stop synchronously here could await this very polling task.
      queueMicrotask(this.onLost);
    }
  }
  stop() {
    if (!this.stopping)
      this.stopping = (async () => {
        try {
          await window.jam.call('android-capture-stop', { session: this.id });
          await this.polling;
        } finally {
          await window.jam.call('android-capture-close', { session: this.id }).catch(() => {});
        }
      })();
    return this.stopping;
  }
}
