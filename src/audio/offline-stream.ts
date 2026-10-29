import * as registry from '@soundtouchjs/core';
import { registerLanczosStrategy } from '@soundtouchjs/interpolation-strategy-lanczos';
registerLanczosStrategy(registry);

// Export and recording normalization share playback's DSP without whole-song PCM arrays.
export async function processAudio(
  options: { sampleRate: number; tempo: number; pitch: number; frames: number },
  read: () => Promise<Float32Array>,
  write: (samples: Float32Array) => Promise<void>,
) {
  const { sampleRate, tempo, pitch, frames } = options;
  if (
    !Number.isSafeInteger(frames) ||
    frames < 0 ||
    !Number.isFinite(tempo) ||
    tempo < 0.25 ||
    tempo > 4 ||
    !Number.isFinite(pitch) ||
    Math.abs(pitch) > 24 ||
    sampleRate < 8000 ||
    sampleRate > 192000
  )
    throw new Error('Invalid audio processing settings');
  const pipe = new registry.SoundTouch({ sampleRate, interpolationStrategy: 'lanczos' });
  pipe.pitchSemitones = pitch;
  pipe.stretch.tempo = tempo / 2 ** (pitch / 12);
  const expected = Math.round(frames / tempo);
  let received = 0,
    written = 0;
  const drain = async () => {
    while (pipe.outputBuffer.frameCount && written < expected) {
      const count = Math.min(8192, pipe.outputBuffer.frameCount, expected - written);
      const output = new Float32Array(count * 2);
      pipe.outputBuffer.extract(output, 0, count);
      pipe.outputBuffer.receive(count);
      await write(output);
      written += count;
    }
  };
  while (received < frames) {
    const input = await read();
    if (
      !input.length ||
      input.length % 2 ||
      input.length > 16384 ||
      received + input.length / 2 > frames ||
      !input.every(Number.isFinite)
    )
      throw new Error('Invalid audio processing input');
    received += input.length / 2;
    if (tempo === 1 && pitch === 0) {
      await write(input);
      written += input.length / 2;
      continue;
    }
    pipe.inputBuffer.putSamples(input);
    pipe.process();
    await drain();
  }
  for (let i = 0; written < expected && i < 128; i++) {
    pipe.inputBuffer.putSamples(new Float32Array(16384));
    pipe.process();
    await drain();
  }
  if (written !== expected) throw new Error('Audio processing did not finish');
}
