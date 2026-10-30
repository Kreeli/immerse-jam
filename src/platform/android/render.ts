import { processAudio } from '../../audio/offline-stream';
import { encodeBytes, decodeBytes } from './binary';

type NativeCall = (method: string, data?: any) => Promise<any>;
function encode(samples: Float32Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return encodeBytes(bytes);
}
async function transform(session: any, call: NativeCall) {
  if (session.project) return session.project;
  try {
    await processAudio(
      session,
      async () => {
        const raw = await call('android-render-read', { id: session.id });
        const bytes = decodeBytes(raw);
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
export async function exportMix(data: any, call: NativeCall) {
  return transform(await call('android-render-start', data), call);
}
export async function finishTake(data: any, call: NativeCall) {
  return transform(await call('android-take-normalize', data), call);
}
export async function recoverTakes(data: any, call: NativeCall) {
  const ids = await call('android-take-recovery-list', data);
  let project;
  for (const id of ids) project = await finishTake({ sessionId: id }, call);
  if (project) return project;
  const library = await call('library');
  const existing = library.find((p: any) => p.id === data.id);
  if (!existing) throw new Error('Project not found');
  return existing;
}
