import type { Project, Track } from '../../shared/types';

/** Fixed one-second PCM windows; original media never enters a whole-song AudioBuffer. */
export class StreamingAudio {
  readonly chunks = new Map<string, Float32Array>();
  private pending = new Map<string, Promise<Float32Array>>();
  private requests = new Map<string, AbortController>();
  private active = 0;
  private waiters: { key: string; wake: () => void }[] = [];
  private closed = false;
  readonly durations: Map<string, number>;
  private constructor(
    readonly id: string,
    readonly tracks: Track[],
    metadata: { id: string; duration: number }[],
  ) {
    this.durations = new Map(metadata.map((t) => [t.id, t.duration]));
  }
  static async open(project: Project, tracks: Track[]) {
    const data = await window.jam.call('android-stream-open', {
      id: project.id,
      tracks: tracks.map(({ id, file }) => ({ id, file })),
    });
    return new StreamingAudio(data.id, tracks, data.tracks);
  }
  async append(tracks: Track[], removed: string[] = []) {
    if (this.closed) throw new Error('Playback closed');
    const result = await window.jam.call('android-stream-append', {
      session: this.id,
      tracks: tracks.map(({ id, file }) => ({ id, file })),
      removed,
    });
    if (this.closed) throw new Error('Playback closed');
    for (const id of removed) {
      const index = this.tracks.findIndex((t) => t.id === id);
      if (index >= 0) this.tracks[index] = { ...this.tracks[index], id: '' };
      this.durations.delete(id);
    }
    for (const track of tracks) this.tracks.push(track);
    for (const track of result.tracks) this.durations.set(track.id, track.duration);
  }
  private key(track: string, index: number) {
    return `${track}|${index}`;
  }
  peek(track: string, index: number) {
    return this.chunks.get(this.key(track, index));
  }
  read(_context: AudioContext, track: string, index: number): Promise<Float32Array> {
    return this.request(track, index * 48000, 48002, this.key(track, index), true);
  }
  readPart(track: string, first: number, count: number): Promise<Float32Array> {
    return this.request(track, first, count, `${track}|part:${first}:${count}`, false);
  }
  private request(
    track: string,
    first: number,
    count: number,
    key: string,
    cache: boolean,
  ): Promise<Float32Array> {
    const cached = this.chunks.get(key),
      pending = this.pending.get(key);
    if (cached?.byteLength) return Promise.resolve(cached);
    if (cached) this.chunks.delete(key); // transferred to its track's render thread
    if (pending) {
      if (!this.requests.get(key)?.signal.aborted) return pending;
      return pending.catch(() => {}).then(() => this.request(track, first, count, key, cache));
    }
    const request = new AbortController();
    this.requests.set(key, request);
    const task = (async () => {
      let acquired = false;
      try {
        while (this.active >= 3) {
          request.signal.throwIfAborted();
          await new Promise<void>((wake) =>
            cache ? this.waiters.push({ key, wake }) : this.waiters.unshift({ key, wake }),
          );
        }
        request.signal.throwIfAborted();
        this.active++;
        acquired = true;
        if (this.closed) throw new Error('Playback closed');
        const slot = this.tracks.findIndex((t) => t.id === track);
        const response = await fetch(
          `/stream/${this.id}/pcm/${slot}/${first}${count === 48002 ? '' : '/' + count}`,
          {
            signal: request.signal,
          },
        );
        if (!response.ok) throw new Error(await response.text());
        const pcm = new Float32Array(await response.arrayBuffer());
        if (this.closed) throw new Error('Playback closed');
        if (!pcm.length || pcm.length % 2 || pcm.length > 48002 * 2)
          throw new Error('Invalid PCM window');
        const buffer = pcm;
        if (cache) this.chunks.set(key, buffer);
        // A second, global cap protects unusually wide projects and repeated seeks.
        while ([...this.chunks.values()].reduce((n, b) => n + b.byteLength, 0) > 48 * 1024 * 1024)
          this.chunks.delete(this.chunks.keys().next().value!);
        return buffer;
      } finally {
        if (acquired) {
          this.active--;
          this.waiters.shift()?.wake();
        }
        this.pending.delete(key);
        this.requests.delete(key);
      }
    })();
    this.pending.set(key, task);
    return task;
  }
  retain(windows: { track: string; index: number }[], keepParts = false) {
    const keys = new Set(windows.map((t) => this.key(t.track, t.index)));
    for (const key of this.chunks.keys()) if (!keys.has(key)) this.chunks.delete(key);
    // A distant seek must not wait behind obsolete disk reads from the old
    // position. Fetch cancellation also keeps the native request queue short.
    for (const [key, request] of this.requests)
      if (!keys.has(key) && !(keepParts && key.includes('|part:'))) request.abort();
    const cancelled = this.waiters.filter(
      (item) => !keys.has(item.key) && !(keepParts && item.key.includes('|part:')),
    );
    this.waiters = this.waiters.filter(
      (item) => keys.has(item.key) || (keepParts && item.key.includes('|part:')),
    );
    cancelled.forEach((item) => item.wake());
  }
  cancelParts() {
    for (const [key, request] of this.requests) if (key.includes('|part:')) request.abort();
    const cancelled = this.waiters.filter((item) => item.key.includes('|part:'));
    this.waiters = this.waiters.filter((item) => !item.key.includes('|part:'));
    cancelled.forEach((item) => item.wake());
  }
  async envelope(tracks: Track[], origin: number, duration: number, master: number) {
    if (this.closed) return [];
    const { url } = await window.jam.call('android-stream-wave', {
      session: this.id,
      tracks: tracks.map(({ id, start, gain, pan }) => ({ id, start, gain, pan })),
      origin,
      duration,
      master,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    return Array.from(new Float32Array(await response.arrayBuffer()));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.chunks.clear();
    for (const request of this.requests.values()) request.abort();
    for (const item of this.waiters.splice(0)) item.wake();
    void window.jam.call('android-stream-close', { session: this.id }).catch(() => {});
  }
}
