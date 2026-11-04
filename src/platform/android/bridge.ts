import type { JamEvent } from '../../shared/types';
import methods from '../../../shared/ipc-methods.json';
import { encodeBytes, decodeBytes } from './binary';
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
    {
      method: string;
      timer: ReturnType<typeof setTimeout>;
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
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
    clearTimeout(task.timer);
    if (reply.error) task.reject(new Error(reply.error));
    else
      task.resolve(
        task.method === 'read-attachment' && typeof reply.result === 'string'
          ? decodeBytes(reply.result)
          : reply.result,
      );
  };
  window.jam = {
    call(method, data) {
      if (method === 'export-audio' && !data?.stems)
        return import('./render').then(({ exportMix }) => exportMix(data, window.jam.call));
      if (method === 'take-finish')
        return import('./render').then(({ finishTake }) => finishTake(data, window.jam.call));
      if (method === 'take-recover')
        return import('./render').then(({ recoverTakes }) =>
          recoverTakes(data, window.jam.call, (message) => {
            for (const listener of listeners) listener({ type: 'error', message });
          }),
        );
      if (!methods.includes(method) && !method.startsWith('android-'))
        return Promise.reject(new Error('Unsupported operation'));
      const id = ++next;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => {
            pending.delete(id);
            reject(new Error('原生操作长时间未响应，请检查当前任务后重试'));
          },
          method === 'android-playback-state' ? 15000 : 10 * 60 * 1000,
        );
        pending.set(id, { method, timer, resolve, reject });
        try {
          let payload = data;
          if (method === 'take-append' && data?.bytes) {
            const { bytes, ...rest } = data;
            payload = {
              ...rest,
              pcm: encodeBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)),
            };
          }
          if (method === 'peer-append' && data?.chunk instanceof Uint8Array)
            payload = { ...data, chunk: encodeBytes(data.chunk) };
          const message = JSON.stringify({ id, method, data: payload || {} });
          if (message.length > 2_000_000) throw new Error('数据过大，请减少附件或轨道后重试');
          window.ImmerseNative!.postMessage(message);
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
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
