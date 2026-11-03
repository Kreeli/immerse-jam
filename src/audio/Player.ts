import { StreamTrack } from '../platform/android/StreamTrack';
import streamProcessorUrl from './stream-processor.js?url';
import { StreamingAudio } from '../platform/android/StreamingAudio';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from './playback-processor.js?worker&url';
import { t as tr } from '../i18n';
import { asset, type Project, type SourceGroup, type Track } from '../shared/types';
import { placeEnvelope } from './envelope';
import { WaveHistory, waveHistoryKey } from './wave-history';
import { beatGrid, localInterval, nearestBeat, strongBeat } from './metronome';
import {
  creationGroups,
  groupTracks,
  groupWaveRegion,
  playbackTracks,
  sessionDuration,
  sourceTracks,
} from './performance';
type Channel = {
  recorded: boolean;
  buffer: AudioBuffer;
  duration: number;
  track: Track;
  gain: GainNode;
  pan: StereoPannerNode;
  split: ChannelSplitterNode;
  meters: AnalyserNode[];
  meterData: Float32Array<ArrayBuffer>[];
  source?: AudioBufferSourceNode;
  stream?: StreamTrack;
};
export class Player {
  context: AudioContext | null = null;
  private streaming: StreamingAudio | null = null;
  scrubbing = false;
  private seekSerial = 0;
  private preview: number | null = null;
  private visualClock: { wall: number; audio: number } | null = null;
  private seekTarget: number | null = null;
  private streamCarry: { track: string; index: number }[] = [];
  private carryUntil = 0;
  private streamFillAt = -Infinity;
  private warmSignature = '';
  private warmPromise: Promise<void> = Promise.resolve();
  private scrubWarmTimer: ReturnType<typeof setTimeout> | null = null;
  onError: (message: string) => void = () => {};
  onLoadProgress: (message: string) => void = () => {};
  private nativeActive = false;
  private nativeEvent = (event: Event) => {
    const action = (event as CustomEvent<string>).detail;
    if (action === 'pause' || action === 'route-changed') this.pause();
    else if (action === 'play') void this.play().catch(() => this.pause());
    else if (action === 'tick' && this.playing) {
      this.schedule();
      if (document.hidden) this.onUpdate(this.position(), this.playing);
    }
  };
  private async nativePlayback(active: boolean) {
    if (!window.ImmerseNative || active === this.nativeActive) return;
    this.nativeActive = active;
    try {
      await window.jam.call('android-playback-state', {
        playing: active,
        title: this.project?.title || 'Immerse Jam',
      });
    } catch (error) {
      this.nativeActive = false;
      if (active) throw error;
    }
  }
  private get horizon() {
    return window.ImmerseNative ? 1.25 : 0.25;
  }
  private capturing = false;
  get captureActive() {
    return this.capturing;
  }
  set captureActive(active: boolean) {
    if (this.capturing === active) return;
    if (!active && this.playing) this.keepCaptureMix = true;
    this.capturing = active;
    if (this.project) this.apply(this.project);
    if (!active) this.scheduleIdleSuspend();
  }
  metronomeGain: GainNode | null = null;
  countInGain: GainNode | null = null;
  metroBeats: number[] = [];
  metroScheduled = new Set<string>();
  peakCache = new Map<string, number[]>();
  private waveHistory = new WaveHistory();
  channels: Channel[] = [];
  mix: GainNode | null = null;
  master: GainNode | null = null;
  dsp: SoundTouchNode | null = null;
  limiter: WaveShaperNode | null = null;
  project: Project | null = null;
  playing = false;
  offset = 0;
  started = 0;
  tempo = 1;
  pitch = 0;
  duration = 0;
  private _loop: {
    a: number;
    b: number;
  } | null = null;
  get loop() {
    return this._loop;
  }
  set loop(value: { a: number; b: number } | null) {
    this.loopAfterCapture = undefined;
    if (this._loop?.a === value?.a && this._loop?.b === value?.b) return;
    const position = this.position();
    this._loop = value;
    if (this.playing) this.seek(position);
  }
  transportGain: GainNode | null = null;
  playSerial = 0;
  private resumeRequested = false;
  get starting() {
    return this.resumeRequested;
  }
  scheduledCycles = new Set<number>();
  activeSources = new Set<{ source: AudioBufferSourceNode; gate: GainNode; channel: Channel }>();
  private initPromise: Promise<void> | null = null;
  private lifecycleSerial = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private audioLeases = 0;
  private resetSerial = 0;
  private async resetTransport() {
    const context = this.context!,
      dsp = this.dsp!,
      id = ++this.resetSerial;
    const now = context.currentTime;
    this.transportGain!.gain.cancelAndHoldAtTime(now);
    this.transportGain!.gain.linearRampToValueAtTime(0, now + 0.005);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(tr('音频设备未响应，请重新选择输出设备')));
      }, 2500);
      const listener = (event: MessageEvent) => {
        if (event.data.type === 'reset-done' && event.data.id === id) {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        dsp.port.removeEventListener('message', listener);
      };
      dsp.port.addEventListener('message', listener);
      dsp.port.start();
      dsp.port.postMessage({ type: 'reset', id, at: now + 0.008, active: true });
    });
  }
  private openTransport() {
    const now = this.context!.currentTime;
    this.transportGain!.gain.cancelScheduledValues(now);
    this.transportGain!.gain.setValueAtTime(0, now);
    this.transportGain!.gain.linearRampToValueAtTime(1, now + 0.01);
  }
  private scheduleIdleSuspend() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (
      !this.context ||
      this.playing ||
      this.resumeRequested ||
      this.captureActive ||
      this.audioLeases
    )
      return;
    const context = this.context;
    this.idleTimer = setTimeout(
      () => {
        this.idleTimer = null;
        if (
          this.context === context &&
          !this.playing &&
          !this.resumeRequested &&
          !this.captureActive &&
          !this.audioLeases &&
          context.state === 'running'
        )
          void context.suspend().catch(() => {});
      },
      window.ImmerseNative ? 8000 : 80,
    );
  }
  async acquireAudio() {
    await this.init();
    this.audioLeases++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.audioLeases = Math.max(0, this.audioLeases - 1);
      this.scheduleIdleSuspend();
    };
    try {
      await this.context!.resume();
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
  async previewClicks() {
    const release = await this.acquireAudio();
    try {
      await this.resetTransport();
      this.openTransport();
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
  timer: ReturnType<typeof setInterval> | null = null;
  raf = 0;
  generation = 0;
  trackWaves = new Map<string, number[]>();
  mixWaves = new Map<string, number[]>();
  mixInFlight = new Map<string, Promise<number[]>>();
  waveWorker: Worker | null = null;
  peakSerial = 0;
  peakJobs = new Map<
    number,
    {
      resolve: (value: number[]) => void;
      reject: (reason: Error) => void;
    }
  >();
  mixWarmTimer: ReturnType<typeof setTimeout> | null = null;
  countInInterval = 0;
  countInBeats = 0;
  voices = new Set<AudioScheduledSourceNode>();
  onUpdate: (position: number, playing: boolean) => void = () => {};
  async init() {
    if (this.initPromise) return this.initPromise;
    if (this.context) return;
    this.initPromise = this.initialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
  private async initialize() {
    const lifecycle = this.lifecycleSerial;
    // A 4 ms interactive sink underruns repeatedly on the tested Android
    // tablet. A bounded 40 ms render budget keeps six stems continuous.
    const ctx = new AudioContext({
      latencyHint: window.ImmerseNative ? 0.04 : 'interactive',
      sampleRate: 48000,
    });
    try {
      await SoundTouchNode.register(ctx, processorUrl);
      if (window.ImmerseNative) await ctx.audioWorklet.addModule(streamProcessorUrl);
    } catch (error) {
      await ctx.close();
      throw error;
    }
    if (lifecycle !== this.lifecycleSerial) {
      await ctx.close();
      return;
    }
    this.context = ctx;
    window.addEventListener('immerse-audio', this.nativeEvent);
    this.mix = ctx.createGain();
    this.metronomeGain = ctx.createGain();
    this.countInGain = ctx.createGain();
    this.metronomeGain.connect(this.mix);
    this.countInGain.connect(this.mix);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    // Stateless peak protection, identical to desktop and Android exports.
    // A compressor's lookahead retains old samples across pause/seek/resume.
    this.limiter = ctx.createWaveShaper();
    this.limiter.curve = Float32Array.from({ length: 65537 }, (_, i) =>
      Math.max(-0.98, Math.min(0.98, (i / 65536) * 2 - 1)),
    );
    this.transportGain = ctx.createGain();
    this.transportGain.gain.value = 0;
    this.transportGain.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.initWaveWorker();
    this.rebuildDsp();
    this.scheduleIdleSuspend();
  }
  rebuildDsp() {
    if (!this.context || !this.mix) return;
    if (this.dsp) return;
    this.mix.disconnect();
    this.dsp = new SoundTouchNode({ context: this.context });
    this.dsp.playbackRate.value = this.tempo;
    this.dsp.pitchSemitones.value = this.pitch;
    this.mix.connect(this.dsp);
    this.dsp.connect(this.transportGain!);
  }
  private appendTask: Promise<void> | null = null;
  private keepCaptureMix = false;
  private loopAfterCapture: { a: number; b: number } | null | undefined;
  get captureLoop() {
    return this.loopAfterCapture === undefined ? this.loop : this.loopAfterCapture;
  }
  get captureMix() {
    return this.captureActive || this.keepCaptureMix;
  }
  restoreLoopAfterCapture(loop: { a: number; b: number } | null) {
    if (this.playing) this.loopAfterCapture = loop;
    else this.loop = loop;
  }
  private createChannel(
    track: Track,
    buffer: AudioBuffer,
    stream: StreamingAudio | null,
    recorded: boolean,
  ): Channel {
    const context = this.context!,
      gain = context.createGain(),
      pan = context.createStereoPanner();
    gain.connect(pan);
    pan.connect(this.mix!);
    const split = context.createChannelSplitter(2),
      meters = [context.createAnalyser(), context.createAnalyser()];
    pan.connect(split);
    meters.forEach((meter, index) => {
      meter.fftSize = 1024;
      split.connect(meter, index);
    });
    return {
      recorded,
      buffer,
      track: { ...track },
      duration: stream?.durations.get(track.id) ?? buffer.duration,
      gain,
      pan,
      split,
      meters,
      meterData: meters.map((m) => new Float32Array(m.fftSize)),
      stream: stream ? new StreamTrack(context, stream, track.id, gain) : undefined,
    };
  }
  canAppend(project: Project) {
    if (!this.context || this.project?.id !== project.id) return false;
    const tracks = sourceTracks(project),
      takeIds = new Set((project.takes || []).map((t) => t.id));
    return (
      (tracks.length !== this.channels.length ||
        tracks.some((t) => !this.channels.some((c) => c.track.id === t.id))) &&
      this.channels.every(
        (c) =>
          (c.recorded && !tracks.some((t) => t.id === c.track.id)) ||
          tracks.some(
            (t) =>
              t.id === c.track.id &&
              t.file === c.track.file &&
              (t.start || 0) === (c.track.start || 0),
          ),
      ) &&
      tracks
        .filter((t) => !this.channels.some((c) => c.track.id === t.id))
        .every((t) => takeIds.has(t.id))
    );
  }
  append(project: Project): Promise<void> {
    if (this.appendTask)
      return this.appendTask.then(() =>
        this.canAppend(project) ? this.append(project) : undefined,
      );
    if (!this.canAppend(project))
      return Promise.reject(new Error(tr('录音音轨已变化，请重新打开工程')));
    const generation = this.generation,
      context = this.context!,
      stream = this.streaming;
    this.appendTask = (async () => {
      const tracks = sourceTracks(project),
        added = tracks.filter((t) => !this.channels.some((c) => c.track.id === t.id)),
        removed = this.channels.filter((c) => !tracks.some((t) => t.id === c.track.id)),
        loaded: Channel[] = [];
      try {
        if (stream)
          await stream.append(
            added,
            removed.map((c) => c.track.id),
          );
        else
          await window.jam.call('playback-budget', {
            id: project.id,
            files: tracks.map((t) => t.file),
          });
        for (const track of added) {
          let buffer = context.createBuffer(2, 1, 48000);
          if (!stream) {
            const response = await fetch(asset(project.id, track.file));
            if (!response.ok) throw new Error(tr('无法读取 {0}', [track.name]));
            buffer = await context.decodeAudioData(await response.arrayBuffer());
          }
          loaded.push(this.createChannel(track, buffer, stream, true));
        }
        if (
          this.generation !== generation ||
          this.context !== context ||
          this.project?.id !== project.id
        )
          return;
        for (const channel of removed) {
          for (const item of this.activeSources)
            if (item.channel === channel) {
              item.source.stop();
              this.activeSources.delete(item);
            }
          channel.stream?.close();
          channel.gain.disconnect();
          channel.pan.disconnect();
          channel.split.disconnect();
          channel.meters.forEach((m) => m.disconnect());
        }
        this.channels = this.channels.filter((c) => !removed.includes(c));
        this.channels.push(...loaded);
        this.duration = Math.max(this.duration, sessionDuration(project, 0));
        this.generation++;
        this.trackWaves.clear();
        this.mixWaves.clear();
        this.apply(this.project!);
        if (this.playing) {
          if (stream) {
            for (const channel of loaded)
              channel.stream!.play(
                Math.ceil(this.started * context.sampleRate),
                this.offset,
                this.tempo,
                channel.track.start || 0,
                channel.duration,
                this.usableLoop(),
              );
            this.streamFillAt = -Infinity;
            this.scheduleStreamSources();
          } else {
            const loop = this.usableLoop(),
              now = context.currentTime;
            for (const index of this.scheduledCycles) {
              const from = index === 0 ? this.offset : (loop?.a ?? 0),
                to = loop ? loop.b : this.duration;
              const at =
                index === 0
                  ? this.started
                  : this.started +
                    (loop!.b - this.offset + (index - 1) * (loop!.b - loop!.a)) / this.tempo;
              for (const channel of loaded) this.scheduleBufferChannel(channel, from, to, at, now);
            }
          }
        }
        this.onUpdate(this.position(), this.playing);
      } finally {
        for (const channel of loaded)
          if (!this.channels.includes(channel)) {
            channel.stream?.close();
            channel.gain.disconnect();
            channel.pan.disconnect();
            channel.split.disconnect();
            channel.meters.forEach((m) => m.disconnect());
          }
      }
    })().finally(() => {
      this.appendTask = null;
    });
    return this.appendTask;
  }
  async load(project: Project) {
    const generation = ++this.generation;
    this.pause();
    this.onLoadProgress(tr('正在准备音轨'));
    const same = this.project?.id === project.id,
      oldBuffers = new Map(
        (same ? this.channels : []).map((channel) => [channel.track.file, channel.buffer]),
      );
    // Detach old buffers before duration inspection and decoding the next song.
    // Otherwise a large project temporarily holds both complete songs in RAM.
    for (const c of this.channels) {
      c.stream?.close();
      c.gain.disconnect();
      c.pan.disconnect();
      c.split.disconnect();
      c.meters.forEach((meter) => meter.disconnect());
    }
    this.channels = [];
    this.streaming?.close();
    this.streaming = null;
    if (!window.ImmerseNative)
      await window.jam.call('playback-budget', {
        id: project.id,
        files: sourceTracks(project).map((track) => track.file),
      });
    const tracks = sourceTracks(project);
    const opening = window.ImmerseNative
      ? StreamingAudio.open(project, tracks)
      : Promise.resolve(null);
    const [, streaming] = await Promise.all([this.init(), opening]);
    if (generation !== this.generation || !this.context) {
      streaming?.close();
      return;
    }
    if (!same) this.peakCache.clear();
    const loaded: Channel[] = [];
    this.streaming = streaming;

    try {
      for (const [index, track] of tracks.entries()) {
        this.onLoadProgress(tr('正在载入音轨 {0}/{1}', [index + 1, tracks.length]));
        let buffer = streaming
          ? this.context.createBuffer(2, 1, 48000)
          : oldBuffers.get(track.file);
        if (!buffer) {
          const response = await fetch(asset(project.id, track.file));
          if (!response.ok) throw new Error(tr('无法读取 {0}', [track.name]));
          buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        }
        if (generation !== this.generation) {
          for (const c of loaded) {
            c.stream?.close();
            c.gain.disconnect();
            c.pan.disconnect();
            c.split.disconnect();
          }
          return;
        }
        loaded.push(
          this.createChannel(
            track,
            buffer,
            streaming,
            !!project.takes?.some((t) => t.id === track.id),
          ),
        );
      }
    } catch (error) {
      for (const c of loaded) {
        c.stream?.close();
        c.gain.disconnect();
        c.pan.disconnect();
        c.split.disconnect();
        c.meters.forEach((meter) => meter.disconnect());
      }
      streaming?.close();
      throw error;
    }
    if (generation !== this.generation) return;
    this.channels = loaded;
    this.trackWaves.clear();
    this.mixWaves.clear();
    this.project = project;
    this.duration = sessionDuration(
      project,
      Math.max(
        0,
        ...loaded
          .filter((c) => !(project.takes || []).some((t) => t.id === c.track.id))
          .map((c) => Math.max(0, (c.track.start || 0) + c.duration)),
      ),
    );
    this.offset = 0;
    this.apply(project);
    if (!streaming)
      for (const channel of loaded) {
        const values =
          this.peakCache.get(channel.track.file) || (await this.calculateWaveform(channel.buffer));
        if (generation !== this.generation) return;
        this.peakCache.set(channel.track.file, values);
        this.trackWaves.set(
          channel.track.id,
          placeEnvelope(values, channel.duration, channel.track.start || 0, this.duration),
        );
      }
    if (project.kind !== 'creation' && !streaming) {
      this.onLoadProgress(tr('正在准备波形'));
      await this.waveform('mix');
    } else if (project.kind !== 'creation') void this.waveform('mix').catch(() => {});
    if (streaming) await this.prepareStream();
    if (generation === this.generation) this.onUpdate(0, false);
  }
  apply(project: Project) {
    this.project = project;
    const was = this.playing || this.resumeRequested;
    const position = this.position();
    const changed = this.tempo !== project.practice.tempo || this.pitch !== project.practice.pitch;
    if (changed) this.pause(false);
    this.tempo = project.practice.tempo;
    this.pitch = project.practice.pitch;
    if (this.dsp) {
      this.dsp.playbackRate.value = this.tempo;
      this.dsp.pitchSemitones.value = this.pitch;
    }
    if (this.master)
      this.master.gain.setTargetAtTime(project.practice.master, this.context!.currentTime, 0.01);
    const tracks = playbackTracks(project, this.captureMix),
      solo = tracks.some((t) => t.solo && !t.mute);
    this.metroBeats = beatGrid(project, this.duration);
    this.metronomeGain?.gain.setTargetAtTime(
      project.practice.metronome ? (project.practice.metronomeVolume ?? 0.5) : 0,
      this.context!.currentTime,
      0.005,
    );
    this.countInGain?.gain.setTargetAtTime(
      project.practice.metronomeVolume ?? 0.5,
      this.context!.currentTime,
      0.005,
    );
    for (const channel of this.channels) {
      // A result switch can apply its mix before asynchronous decoding completes.
      // Never relabel an old buffer with a different result's file path.
      const track =
        tracks.find((t) => t.id === channel.track.id && t.file === channel.track.file) ||
        channel.track;
      channel.track = track;
      channel.gain.gain.setTargetAtTime(
        track.mute || (solo && !track.solo) ? 0 : track.gain,
        this.context!.currentTime,
        0.01,
      );
      channel.pan.pan.value = track.pan;
    }
    if (this.mixWarmTimer) clearTimeout(this.mixWarmTimer);
    if (project.kind !== 'creation' && !this.cachedWaveform('mix'))
      this.mixWarmTimer = setTimeout(() => void this.waveform('mix').catch(() => {}), 200);
    if (changed && was) {
      this.offset = position;
      void this.play();
    }
  }
  position() {
    return Math.max(
      0,
      Math.min(
        this.captureActive ? Infinity : this.duration,
        this.playing
          ? this.loopPosition(
              this.offset + Math.max(0, this.context!.currentTime - this.started) * this.tempo,
            )
          : this.offset,
      ),
    );
  }
  private usableLoop() {
    const loop = this.loop;
    return !this.captureActive &&
      loop &&
      Number.isFinite(loop.a) &&
      Number.isFinite(loop.b) &&
      loop.a >= 0 &&
      loop.b <= this.duration &&
      loop.b - loop.a >= 0.02
      ? loop
      : null;
  }
  private loopPosition(position: number) {
    const loop = this.usableLoop();
    return loop && position >= loop.b
      ? loop.a + ((position - loop.b) % (loop.b - loop.a))
      : position;
  }
  async play(countIn = false) {
    if (!this.playing && this.project && this.canAppend(this.project))
      await this.append(this.project);
    if (!this.context || (!this.channels.length && !this.captureActive) || this.playing) return;
    this.resumeRequested = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.scrubWarmTimer) {
      clearTimeout(this.scrubWarmTimer);
      this.scrubWarmTimer = null;
    }
    const serial = ++this.playSerial,
      context = this.context;
    try {
      await this.nativePlayback(true);
      if (serial !== this.playSerial) return;
      await context.resume();
    } catch (error) {
      if (serial !== this.playSerial) return;
      this.resumeRequested = false;
      void this.nativePlayback(false);
      throw error;
    }
    if (serial !== this.playSerial || this.context !== context) return;
    if (!this.captureActive && this.offset >= this.duration - 0.01) this.offset = 0;
    this.metroBeats = beatGrid(this.project!, this.duration);
    if (countIn && this.project?.practice.snapCountIn !== false)
      this.offset = nearestBeat(this.metroBeats, this.offset, this.loop);
    const loop = this.usableLoop();
    if (loop && this.offset >= loop.b) this.offset = loop.a;
    try {
      if (this.streaming) await this.prepareStream();
      if (serial !== this.playSerial || this.context !== context) return;
      await this.resetTransport();
    } catch (error) {
      if (serial === this.playSerial) {
        this.resumeRequested = false;
        void this.nativePlayback(false);
        this.scheduleIdleSuspend();
        throw error;
      }
      return;
    }
    if (serial !== this.playSerial || this.context !== context) return;
    this.resumeRequested = false;
    this.openTransport();
    this.scheduledCycles.clear();
    this.metroScheduled.clear();
    const origin = this.context.currentTime;
    let delay = countIn ? 0.12 : window.ImmerseNative ? Math.max(0.008, context.baseLatency) : 0.02;
    this.countInBeats = 0;
    this.countInInterval = 0;
    if (countIn) {
      const bpm = this.project?.practice.countInBpm || this.project?.analysis?.bpm || 120,
        beats = this.project?.practice.countInBeats || 4;
      const interval = localInterval(this.metroBeats, this.offset, 60 / bpm) / this.tempo;
      this.countInInterval = interval;
      this.countInBeats = beats;
      const countStart = origin + 0.12;
      for (let i = 0; i < beats; i++) this.click(countStart + i * interval, i === 0, true);
      delay += beats * interval;
    }
    this.started = origin + delay;
    if (this.streaming) {
      const frame = Math.ceil(this.started * context.sampleRate);
      this.started = frame / context.sampleRate;
      for (const channel of this.channels)
        channel.stream!.play(
          frame,
          this.offset,
          this.tempo,
          channel.track.start || 0,
          channel.duration,
          this.usableLoop(),
        );
    }
    this.playing = true;
    this.scheduleSources();
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    let lastPaint = 0;
    const tick = (stamp: number) => {
      if (!this.playing) return;
      const p = this.position();
      if (!this.captureActive && p >= this.duration - 0.005) {
        this.pause();
        this.offset = this.duration;
        this.onUpdate(this.offset, false);
        return;
      }
      if (!window.ImmerseNative || stamp - lastPaint >= 100) {
        lastPaint = stamp;
        this.onUpdate(this.displayPosition(), true);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.onUpdate(this.offset, true);
    this.raf = requestAnimationFrame(tick);
  }
  async setOutputDevice(id: string) {
    await this.init();
    const context = this.context as AudioContext & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (!context.setSinkId) {
      if (id && id !== 'default')
        throw new Error(tr('此系统暂不支持切换播放设备，请在 Windows 声音设置中选择输出'));
      return;
    }
    const sink = id === 'default' ? '' : id;
    if ((context as AudioContext & { sinkId?: string }).sinkId !== sink)
      await context.setSinkId(sink);
  }
  pause(releaseNative = true) {
    this.seekSerial++;
    this.preview = null;
    this.seekTarget = null;
    if (this.scrubWarmTimer) clearTimeout(this.scrubWarmTimer);
    this.scrubWarmTimer = null;
    if (releaseNative) void this.nativePlayback(false);
    this.playSerial++;
    this.resumeRequested = false;
    if (this.playing) this.offset = this.position();
    this.playing = false;
    if (this.loopAfterCapture !== undefined) {
      this._loop = this.loopAfterCapture;
      this.loopAfterCapture = undefined;
    }
    if (this.keepCaptureMix) {
      this.keepCaptureMix = false;
      if (this.project) this.apply(this.project);
    }
    const now = this.context?.currentTime || 0;
    if (this.transportGain) {
      this.transportGain.gain.cancelAndHoldAtTime(now);
      this.transportGain.gain.linearRampToValueAtTime(0, now + 0.005);
    }
    this.dsp?.port.postMessage({ type: 'reset', at: now + 0.006, active: false });
    for (const item of this.activeSources) {
      try {
        item.source.stop(now + 0.006);
      } catch {
        /* source may already be complete */
      }
    }
    this.activeSources.clear();
    this.streamFillAt = -Infinity;
    for (const channel of this.channels)
      channel.stream?.stop(Math.ceil((now + 0.006) * this.context!.sampleRate));
    for (const channel of this.channels) channel.source = undefined;
    for (const source of this.voices) {
      try {
        source.stop(now + 0.006);
      } catch {}
    }
    this.voices.clear();
    if (this.timer) clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.onUpdate(this.offset, false);
    this.scheduleIdleSuspend();
  }
  displayPosition() {
    if (this.preview !== null) return this.preview;
    if (!this.playing || !this.context) {
      this.visualClock = null;
      return this.position();
    }
    // Android exposes currentTime in output-buffer bursts. Draw against a
    // monotonic presentation clock, gently corrected to the real audio clock.
    // The scheduler/recording clock remains sample accurate and unchanged.
    const wall = performance.now() / 1000,
      audio = this.context.currentTime;
    const old = this.visualClock;
    let presented = audio;
    if (old && wall - old.wall < 0.25) {
      const dt = Math.max(0, wall - old.wall),
        predicted = old.audio + dt;
      presented = predicted + Math.max(-dt * 0.05, Math.min(dt * 0.05, (audio - predicted) * 0.1));
    }
    this.visualClock = { wall, audio: presented };
    return Math.max(
      0,
      Math.min(
        this.captureActive ? Infinity : this.duration,
        this.loopPosition(this.offset + Math.max(0, presented - this.started) * this.tempo),
      ),
    );
  }
  beginScrub() {
    this.scrubbing = true;
    this.preview = this.displayPosition();
  }
  endScrub() {
    if (!this.scrubbing) return;
    const target = this.displayPosition();
    this.scrubbing = false;
    this.seek(target);
  }
  seek(position: number) {
    let target = Math.max(0, Math.min(this.duration, position));
    const loop = this.usableLoop();
    if (loop && target >= loop.b) target = loop.a;
    this.preview = target;
    this.seekTarget = target;
    const serial = ++this.seekSerial;
    if (this.scrubWarmTimer) clearTimeout(this.scrubWarmTimer);
    this.scrubWarmTimer = null;
    if (this.scrubbing) {
      if (this.streaming)
        this.scrubWarmTimer = setTimeout(() => {
          this.scrubWarmTimer = null;
          void this.prepareStream(target, true).catch(() => {});
        }, 40);
      return;
    }
    if (this.playing) {
      void this.movePlayback(target, serial).catch((error) => {
        if (serial !== this.seekSerial || error.name === 'AbortError') return;
        this.preview = null;
        this.seekTarget = null;
        this.onError(error.message);
      });
      return;
    }
    const wasStarting = this.resumeRequested;
    if (wasStarting) this.pause(false);
    this.offset = target;
    this.preview = null;
    this.seekTarget = null;
    this.onUpdate(target, false);
    if (wasStarting) void this.play().catch((error) => this.onError(error.message));
  }
  private async movePlayback(target: number, serial: number) {
    // Storage preparation happens while the old position continues playing.
    if (this.streaming) await this.prepareStream(target, true);
    if (serial !== this.seekSerial || !this.playing || !this.context) return;
    if (this.tempo !== 1 || this.pitch !== 0) {
      // Time stretching owns a FIFO; clear it to prevent old-position residue.
      // Only the short DSP reset remains silent, never the storage request.
      this.pause(false);
      this.offset = target;
      await this.play();
      return;
    }
    const context = this.context,
      frame = Math.ceil(
        (context.currentTime + Math.max(0.012, context.baseLatency)) * context.sampleRate,
      ),
      at = frame / context.sampleRate;
    this.streamCarry = this.streaming
      ? this.streamPlan(
          context.currentTime,
          this.started,
          Math.max(0, at - context.currentTime) + 0.006,
        ).map((e) => ({ track: e.channel.track.id, index: e.index }))
      : [];
    this.carryUntil = at + 0.006;
    for (const item of this.activeSources) {
      item.gate.gain.cancelAndHoldAtTime(at);
      item.gate.gain.linearRampToValueAtTime(0, at + 0.003);
      try {
        item.source.stop(at + 0.003);
      } catch {}
    }
    for (const voice of this.voices) {
      try {
        voice.stop(at);
      } catch {}
    }
    this.voices.clear();
    this.offset = target;
    this.started = at;
    this.preview = null;
    this.seekTarget = null;
    this.streamFillAt = -Infinity;
    this.scheduledCycles.clear();
    this.metroScheduled.clear();
    for (const channel of this.channels)
      channel.stream?.play(
        frame,
        target,
        this.tempo,
        channel.track.start || 0,
        channel.duration,
        this.usableLoop(),
      );
    this.schedule();
    this.onUpdate(target, true);
  }
  private prepareStream(offset = this.offset, preservePlayback = false): Promise<void> {
    if (!this.streaming || !this.context) return Promise.resolve();
    const signature = `${this.generation}|${offset}|${this.tempo}|${JSON.stringify(this.usableLoop())}`;
    if (signature === this.warmSignature) return this.warmPromise;
    this.warmSignature = signature;
    this.streaming.cancelParts();
    for (const channel of this.channels) channel.stream!.resetHeads(!preservePlayback);
    const stream = this.streaming,
      prefix = 0.35 * this.tempo;
    if (!preservePlayback) {
      const plan = this.streamPlan(
        this.context.currentTime,
        this.context.currentTime + 0.01,
        0.4,
        offset,
      );
      stream.retain(plan.map((e) => ({ track: e.channel.track.id, index: e.index })));
    }
    const starts = [offset],
      loop = this.usableLoop();
    if (loop && loop.b - offset < prefix) starts.push(loop.a);
    const tasks: Promise<void>[] = [];
    for (const at of starts)
      for (const channel of this.channels) {
        const start = channel.track.start || 0,
          from = Math.max(at, start),
          to = Math.min(at + prefix, start + channel.duration);
        if (to <= from) continue;
        const first = Math.max(0, Math.floor((from - start) * 48000));
        tasks.push(
          channel.stream!.prime(first, Math.min(48002, Math.ceil((to - from) * 48000) + 2)),
        );
      }
    this.warmPromise = Promise.all(tasks)
      .then(() => {})
      .catch((error) => {
        if (this.warmSignature === signature) this.warmSignature = '';
        throw error;
      });
    return this.warmPromise;
  }
  private streamPlan(now: number, origin: number, ahead: number, offset = this.offset) {
    const entries: {
      channel: Channel;
      index: number;
      cycle: number;
      from: number;
      to: number;
      nominal: number;
      fadeIn: boolean;
      fadeOut: boolean;
    }[] = [];
    const loop = this.usableLoop(),
      raw = offset + Math.max(0, now - origin) * this.tempo;
    const cycle = loop && raw >= loop.b ? 1 + Math.floor((raw - loop.b) / (loop.b - loop.a)) : 0;
    const count = loop ? Math.min(128, Math.ceil((ahead * this.tempo) / (loop.b - loop.a)) + 2) : 1;
    for (let epoch = cycle; epoch < cycle + count; epoch++) {
      const from = epoch === 0 ? offset : loop!.a,
        to = loop?.b ?? this.duration;
      const at =
        epoch === 0
          ? origin
          : origin + (loop!.b - offset + (epoch - 1) * (loop!.b - loop!.a)) / this.tempo;
      if (at > now + ahead && epoch !== 0) break;
      for (const channel of this.channels) {
        const start = channel.track.start || 0;
        const first = Math.max(from, start),
          end = Math.min(to, start + channel.duration);
        const visible = Math.max(first, from + (now - at) * this.tempo);
        const last = Math.min(end, from + (now + ahead - at) * this.tempo);
        if (last <= visible) continue;
        for (
          let index = Math.max(0, Math.floor(visible - start));
          index <= Math.floor(last - start - 1 / 48000);
          index++
        ) {
          const a = Math.max(first, start + index),
            b = Math.min(end, start + index + 1);
          entries.push({
            channel,
            index,
            cycle: epoch,
            from: a - start,
            to: b - start,
            nominal: at + (a - from) / this.tempo,
            fadeIn: a === first,
            fadeOut: b === end,
          });
        }
      }
    }
    return entries.sort((a, b) => a.nominal - b.nominal);
  }
  private scheduleStreamSources() {
    const stream = this.streaming!,
      serial = this.playSerial;
    const now = this.context!.currentTime;
    if (now - this.streamFillAt < 0.08) return;
    this.streamFillAt = now;
    const ahead = Math.min(
      6,
      Math.max(0.4, 80 / Math.max(1, this.channels.length) - 1) / this.tempo,
    );
    const upcoming = this.streamPlan(now, this.started, ahead);
    if (this.seekTarget !== null) upcoming.push(...this.streamPlan(now, now, 0.6, this.seekTarget));
    if (now > this.carryUntil) this.streamCarry = [];
    const keep = [
      ...upcoming.map((e) => ({ track: e.channel.track.id, index: e.index })),
      ...this.streamCarry,
    ];
    stream.retain(keep, this.seekTarget !== null);
    for (const channel of this.channels)
      channel.stream!.retain(keep.filter((e) => e.track === channel.track.id).map((e) => e.index));
    for (const e of upcoming)
      void e.channel.stream!.read(e.index).catch((error) => {
        if (
          serial === this.playSerial &&
          this.channels.includes(e.channel) &&
          error.name !== 'AbortError'
        ) {
          this.pause();
          this.onError(error.message);
        }
      });
  }
  private scheduleBufferChannel(
    channel: Channel,
    from: number,
    to: number,
    at: number,
    now: number,
  ) {
    const context = this.context;
    if (!context) return;
    const trackStart = channel.track.start || 0,
      start = Math.max(from, trackStart),
      end = Math.min(to, trackStart + channel.duration);
    if (!(end > start)) return;
    const nominal = at + (start - from) / this.tempo,
      begins = Math.max(nominal, now + 0.003),
      ends = at + (end - from) / this.tempo;
    if (ends <= begins) return;
    const source = context.createBufferSource(),
      gate = context.createGain(),
      fade = Math.min(0.003, (ends - begins) / 3);
    source.buffer = channel.buffer;
    source.playbackRate.value = this.tempo;
    source.connect(gate);
    gate.connect(channel.gain);
    gate.gain.setValueAtTime(0, begins);
    gate.gain.linearRampToValueAtTime(1, begins + fade);
    gate.gain.setValueAtTime(1, ends - fade);
    gate.gain.linearRampToValueAtTime(0, ends);
    const item = { source, gate, channel };
    this.activeSources.add(item);
    channel.source = source;
    source.onended = () => {
      this.activeSources.delete(item);
      source.disconnect();
      gate.disconnect();
    };
    source.start(
      begins,
      start - trackStart + (begins - nominal) * this.tempo,
      (ends - begins) * this.tempo,
    );
  }
  private scheduleSources() {
    if (!this.context) return;
    if (this.streaming) {
      this.scheduleStreamSources();
      return;
    }
    const loop = this.usableLoop(),
      now = this.context.currentTime,
      horizon = now + this.horizon;
    const firstEnd = loop ? loop.b : this.duration;
    const raw = this.offset + Math.max(0, now - this.started) * this.tempo;
    const cycle = loop && raw >= loop.b ? 1 + Math.floor((raw - loop.b) / (loop.b - loop.a)) : 0;
    for (
      let index = cycle;
      index <= cycle + (loop ? Math.ceil((this.horizon * this.tempo) / (loop.b - loop.a)) + 1 : 0);
      index++
    ) {
      const from = index === 0 ? this.offset : loop!.a,
        to = loop ? loop.b : firstEnd;
      const at =
        index === 0
          ? this.started
          : this.started + (loop!.b - this.offset + (index - 1) * (loop!.b - loop!.a)) / this.tempo;
      if (at > horizon && index !== 0) break;
      if (this.scheduledCycles.has(index)) continue;
      this.scheduledCycles.add(index);
      for (const channel of this.channels) this.scheduleBufferChannel(channel, from, to, at, now);
      for (const old of this.scheduledCycles) if (old < cycle - 1) this.scheduledCycles.delete(old);
    }
  }
  schedule() {
    if (!this.context || !this.project) return;
    if (this.playing && !this.captureActive && this.position() >= this.duration - 0.005) {
      this.pause();
      this.offset = this.duration;
      this.onUpdate(this.offset, false);
      return;
    }
    this.scheduleSources();
    const position = this.position(),
      loop = this.usableLoop(),
      now = this.context.currentTime,
      raw = this.offset + Math.max(0, now - this.started) * this.tempo,
      cycle = loop && raw >= loop.b ? 1 + Math.floor((raw - loop.b) / (loop.b - loop.a)) : 0;
    if (this.captureActive && (this.metroBeats.at(-1) || 0) < position + 1)
      this.metroBeats = beatGrid(this.project, position + 30);
    for (
      let epoch = cycle;
      epoch <= cycle + (loop ? Math.ceil((this.horizon * this.tempo) / (loop.b - loop.a)) + 1 : 0);
      epoch++
    ) {
      const origin =
        epoch === 0
          ? this.started
          : this.started + (loop!.b - this.offset + (epoch - 1) * (loop!.b - loop!.a)) / this.tempo;
      if (epoch > 0 && origin > now + this.horizon) break;
      const offset = epoch === 0 ? this.offset : loop!.a,
        end = loop?.b || this.duration;
      if (this.project.practice.metronome) {
        for (let i = 0; i < this.metroBeats.length; i++) {
          const beat = this.metroBeats[i];
          const key = epoch + ':' + i,
            at = origin + (beat - offset) / this.tempo;
          if (
            beat < offset - 0.002 ||
            beat >= end ||
            at < now - 0.003 ||
            this.metroScheduled.has(key)
          )
            continue;
          if (at > now + this.horizon) break;
          if (at >= this.context.currentTime - 0.003) {
            this.metroScheduled.add(key);
            this.click(
              Math.max(this.context.currentTime, at),
              strongBeat(this.project, this.metroBeats, i),
            );
          }
        }
      }
    }
    for (const key of this.metroScheduled)
      if (Number(key.split(':')[0]) < cycle - 1) this.metroScheduled.delete(key);
  }
  click(at: number, strong = false, countIn = false) {
    const ctx = this.context!,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = strong ? 1600 : 1000;
    // Shared by the metronome, count-in and calibration reference clicks.
    gain.gain.setValueAtTime(0.4, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    osc.connect(gain);
    gain.connect(countIn ? this.countInGain! : this.metronomeGain!);
    osc.start(at);
    osc.stop(at + 0.045);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
  }
  countInRemaining() {
    return this.playing && this.context && this.countInInterval
      ? Math.max(
          0,
          Math.min(
            this.countInBeats,
            Math.ceil((this.started - this.context.currentTime) / this.countInInterval),
          ),
        )
      : 0;
  }
  trackLevel(id: string) {
    const channel = this.channels.find((channel) => channel.track.id === id);
    if (!channel || !this.playing || !this.context || this.context.currentTime < this.started)
      return { peak: 0, rms: 0 };
    let peak = 0,
      sum = 0,
      length = 0;
    channel.meters.forEach((meter, index) => {
      const data = channel.meterData[index];
      meter.getFloatTimeDomainData(data);
      for (const value of data) {
        peak = Math.max(peak, Math.abs(value));
        sum += value * value;
      }
      length += data.length;
    });
    return { peak, rms: Math.sqrt(sum / Math.max(1, length)) };
  }
  initWaveWorker() {
    try {
      const worker = new Worker(new URL('./waveform-worker.js', import.meta.url), {
        type: 'module',
      });
      this.waveWorker = worker;
      worker.onmessage = (event) => {
        const job = this.peakJobs.get(event.data.id);
        if (!job) return;
        this.peakJobs.delete(event.data.id);
        if (event.data.error) job.reject(new Error(event.data.error));
        else job.resolve(Array.from(event.data.peaks as Float32Array));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        for (const job of this.peakJobs.values()) job.reject(new Error(tr('波形缓存线程不可用')));
        this.peakJobs.clear();
        worker.terminate();
        if (this.waveWorker === worker) this.waveWorker = null;
      };
    } catch {
      this.waveWorker = null;
    }
  }
  async calculateWaveform(buffer: AudioBuffer): Promise<number[]> {
    const peaks: number[] = [],
      step = Math.max(1, Math.round(buffer.sampleRate / 100));
    // Never clone a whole decoded track merely to calculate its envelope.
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    let last = performance.now();
    for (let start = 0; start < buffer.length; start += step) {
      let peak = 0;
      for (const samples of channels)
        for (let i = start; i < Math.min(buffer.length, start + step); i++)
          peak = Math.max(peak, Math.abs(samples[i]));
      peaks.push(peak);
      if (performance.now() - last > 6) {
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
    return peaks;
  }
  private waveQueue: Promise<unknown> = Promise.resolve();
  private async renderEnvelope(
    tracks: Track[],
    origin: number,
    duration: number,
    master: number,
    valid: () => boolean,
  ) {
    if (this.streaming) return this.streaming.envelope(tracks, origin, duration, master);
    const rate = this.context!.sampleRate,
      values: number[] = [];
    // One two-second PCM buffer at a time, with a global queue across mix keys.
    // This retains real sample cancellation/panning without allocating a song-sized offline context.
    for (let time = 0; time < duration; time += 2) {
      if (!valid()) return [];
      const length = Math.min(2, duration - time),
        offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(length * rate)), rate),
        output = offline.createGain();
      output.gain.value = master;
      output.connect(offline.destination);
      for (const track of tracks) {
        if (track.mute || !track.gain) continue;
        const channel = this.channels.find((c) => c.track.id === track.id);
        if (!channel) continue;
        const from = Math.max(origin + time, track.start || 0),
          to = Math.min(origin + time + length, (track.start || 0) + channel.duration);
        if (to <= from) continue;
        const source = offline.createBufferSource(),
          gain = offline.createGain(),
          pan = offline.createStereoPanner();
        source.buffer = channel.buffer;
        gain.gain.value = track.gain;
        pan.pan.value = track.pan;
        source.connect(gain);
        gain.connect(pan);
        pan.connect(output);
        source.start(from - origin - time, from - (track.start || 0), to - from);
      }
      values.push(...(await this.calculateWaveform(await offline.startRendering())));
    }
    return values;
  }
  waveKey() {
    return JSON.stringify([
      this.generation,
      this.channels.map((channel) => [
        channel.track.file,
        channel.track.gain,
        channel.track.pan,
        channel.track.mute,
        channel.track.solo,
        channel.track.start,
      ]),
      this.project?.practice.master,
    ]);
  }
  cachedWaveform(source = 'mix'): number[] | null {
    if (source !== 'mix') return this.trackWaves.get(source) || null;
    const found = this.mixWaves.get(this.waveKey());
    if (found) return found;
    if (!this.project) return null;
    const cached = this.waveHistory.get(
      waveHistoryKey(
        this.project,
        this.channels.map((c) => c.track),
        'mix',
        0,
        this.duration,
        this.project.practice.master,
      ),
    );
    if (cached) this.mixWaves.set(this.waveKey(), cached);
    return cached;
  }
  previewWaveform(project: Project) {
    return this.waveHistory.get(
      waveHistoryKey(
        project,
        playbackTracks(project, false),
        'mix',
        0,
        project.duration,
        project.practice.master,
      ),
    );
  }
  waveformRegion(source: string, override?: SourceGroup) {
    const group =
      override || creationGroups(this.project!).find((group) => source === 'group:' + group.id);
    return group
      ? groupWaveRegion(
          group,
          new Map(this.channels.map((channel) => [channel.track.id, channel.duration])),
        )
      : { origin: 0, duration: this.duration };
  }
  async waveform(source = 'mix', groupOverride?: SourceGroup): Promise<number[]> {
    if (
      source !== 'mix' &&
      !source.startsWith('group:') &&
      !this.channels.some((c) => c.track.id === source) &&
      this.appendTask
    )
      await this.appendTask;
    if (!this.channels.length || !this.context) return [];
    const cached = this.cachedWaveform(source);
    if (cached) return cached;
    const generation = this.generation;
    if (source !== 'mix' && !source.startsWith('group:')) {
      const channel = this.channels.find((c) => c.track.id === source);
      if (!channel) throw new Error(tr('所选波形的音轨不存在'));
      const values = placeEnvelope(
        this.streaming
          ? await this.streaming.envelope(
              [{ ...channel.track, start: 0, gain: 1, pan: 0 }],
              0,
              channel.duration,
              1,
            )
          : await this.calculateWaveform(channel.buffer),
        channel.duration,
        channel.track.start || 0,
        this.duration,
      );
      if (generation === this.generation) this.trackWaves.set(source, values);
      return values;
    }
    const group = source.startsWith('group:')
      ? groupOverride || creationGroups(this.project!).find((g) => g.id === source.slice(6))
      : undefined;
    if (source !== 'mix' && !group) return [];
    const key = group
        ? source + '|' + generation + '|' + JSON.stringify(groupTracks(group))
        : this.waveKey(),
      found = this.mixWaves.get(key),
      existing = this.mixInFlight.get(key);
    if (found) return found;
    if (existing) return existing;
    const tracks = group ? groupTracks(group) : this.channels.map((c) => ({ ...c.track }));
    const solo = tracks.some((t) => t.solo && !t.mute);
    const audible = tracks.filter((t) => !t.mute && (!solo || t.solo));
    const region = group
        ? this.waveformRegion(source, group)
        : { origin: 0, duration: this.duration },
      master = group ? 1 : (this.project?.practice.master ?? 0.8);
    const historyKey = waveHistoryKey(
        this.project!,
        tracks,
        source,
        region.origin,
        region.duration,
        master,
      ),
      previous = this.waveHistory.get(historyKey);
    if (previous) {
      this.mixWaves.set(key, previous);
      return previous;
    }
    const task = this.waveQueue
      .catch(() => {})
      .then(async () => {
        const valid = () => generation === this.generation && (group || key === this.waveKey());
        if (!valid()) return [];
        const values = await this.renderEnvelope(
          audible,
          region.origin,
          region.duration,
          master,
          () => !!valid(),
        );
        if (valid()) {
          if (this.mixWaves.size >= 8) this.mixWaves.delete(this.mixWaves.keys().next().value!);
          this.mixWaves.set(key, values);
          this.waveHistory.set(historyKey, values);
        }
        return values;
      });
    this.waveQueue = task;
    this.mixInFlight.set(key, task);
    try {
      return await task;
    } finally {
      this.mixInFlight.delete(key);
    }
  }
  dispose() {
    window.removeEventListener('immerse-audio', this.nativeEvent);
    this.lifecycleSerial++;
    this.pause();
    this.streaming?.close();
    this.streaming = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.audioLeases = 0;
    this.generation++;
    if (this.scrubWarmTimer) clearTimeout(this.scrubWarmTimer);
    this.scrubWarmTimer = null;
    if (this.mixWarmTimer) clearTimeout(this.mixWarmTimer);
    this.waveWorker?.terminate();
    this.waveWorker = null;
    for (const job of this.peakJobs.values()) job.reject(new Error(tr('播放器已关闭')));
    this.peakJobs.clear();
    for (const channel of this.channels) channel.stream?.close();
    void this.context?.close();
    this.context = null;
    this.dsp?.port.close();
    this.dsp = null;
    this.mix = null;
    this.master = null;
    this.transportGain = null;
    this.metronomeGain = null;
    this.countInGain = null;
    this.limiter = null;
    this.channels = [];
    this.peakCache.clear();
    this.trackWaves.clear();
    this.mixWaves.clear();
    this.mixInFlight.clear();
    this.waveHistory.clear();
  }
}
