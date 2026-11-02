// Simulated capture only. Never requests microphone permission or reads a real device.
export interface CaptureSession {
  frames: number;
  error: Error | null;
  queue: Promise<unknown>;
  arm(at: number): void;
  stop(): Promise<void>;
}
export class AudioCapture {
  static async open(
    context: AudioContext,
    _settings: unknown,
    onChunk: (sequence: number, time: number, bytes: Uint8Array) => Promise<unknown>,
    onProgress: (elapsed: number, level: number) => void,
    _onLost: () => void,
    signal?: AbortSignal,
  ): Promise<CaptureSession> {
    if (signal) throw new Error('网页试用不测量真实设备延迟。请在 PC 版戴耳机进行校准。');
    let timer = 0,
      sequence = 0,
      start = Infinity;
    const session: CaptureSession = {
      frames: 0,
      error: null,
      queue: Promise.resolve(),
      arm(at) {
        start = at;
        timer = window.setInterval(() => {
          if (context.currentTime < start) return;
          const elapsed = context.currentTime - start;
          session.frames = Math.round(elapsed * context.sampleRate);
          const pcm = new Float32Array(Math.round(context.sampleRate * 0.15) * 2);
          for (let i = 0; i < pcm.length; i++)
            pcm[i] = Math.sin(i * 0.04) * 0.07 * (0.5 + 0.5 * Math.sin(elapsed * 4));
          const index = sequence++;
          const time = context.currentTime;
          session.queue = session.queue.then(() =>
            onChunk(index, time, new Uint8Array(pcm.buffer)),
          );
          onProgress(elapsed, 0.08 + 0.04 * Math.sin(elapsed * 5));
        }, 150);
      },
      async stop() {
        clearInterval(timer);
        await session.queue;
      },
    };
    return session;
  }
}
