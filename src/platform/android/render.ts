import { processAudio } from '../../audio/offline-stream';

type NativeCall = (method: string, data?: any) => Promise<any>;
function encode(samples: Float32Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export async function exportMix(data: any, call: NativeCall) {
  const session = await call('android-render-start', data);
  try {
    await processAudio(
      session,
      async () => {
        const raw = await call('android-render-read', { id: session.id });
        const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
        return new Float32Array(bytes.buffer);
      },
      async (samples) => {
        await call('android-render-append', { id: session.id, chunk: encode(samples) });
      },
    );
    return await call('android-render-finish', { id: session.id });
  } finally {
    await call('android-render-abort', { id: session.id }).catch(() => {});
  }
}
