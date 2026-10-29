import type { JamEvent } from '../../shared/types';
import methods from '../../../shared/ipc-methods.json';
declare global {
  interface Window {
    ImmerseNative?: {
      postMessage(message: string): void;
      onmessage: ((event: { data: string }) => void) | null;
    };
  }
}
if (window.ImmerseNative) {
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  const listeners = new Set<(event: JamEvent) => void>();
  let next = 0;
  window.ImmerseNative.onmessage = (event) => {
    const reply = JSON.parse(event.data);
    if (reply.event) {
      for (const listener of listeners) listener(reply.event);
      return;
    }
    const task = pending.get(reply.id);
    if (!task) return;
    pending.delete(reply.id);
    if (reply.error) task.reject(new Error(reply.error));
    else task.resolve(reply.result);
  };
  window.jam = {
    call(method, data) {
      if (method === 'export-audio' && !data?.stems)
        return import('./render').then(({ exportMix }) => exportMix(data, window.jam.call));
      if (!methods.includes(method) && !method.startsWith('android-'))
        return Promise.reject(new Error('Unsupported operation'));
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          let payload =
            method === 'take-append' && data?.bytes
              ? { ...data, bytes: Array.from(data.bytes) }
              : data;
          if (method === 'peer-append' && data?.chunk instanceof Uint8Array)
            payload = { ...data, chunk: btoa(String.fromCharCode(...data.chunk)) };
          window.ImmerseNative!.postMessage(JSON.stringify({ id, method, data: payload || {} }));
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    },
    onEvent(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    filePath() {
      return '';
    },
  };
  document.documentElement.dataset.platform = 'android';
}
