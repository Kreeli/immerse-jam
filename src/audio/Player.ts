import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from './playback-processor.js?worker&url';
import { t as tr } from '../i18n';
import { asset, interpolate, type Project, type SourceGroup, type Track } from '../shared/types';
import { placeEnvelope } from './envelope';
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
  buffer: AudioBuffer;
  track: Track;
  gain: GainNode;
  pan: StereoPannerNode;
  split: ChannelSplitterNode;
  meters: AnalyserNode[];
  meterData: Float32Array<ArrayBuffer>[];
  source?: AudioBufferSourceNode;
};
export class Player {
  context: AudioContext | null = null;
  private capturing = false;
  get captureActive() {
    return this.capturing;
  }
  set captureActive(active: boolean) {
    if (this.capturing === active) return;
    this.capturing = active;
    if (this.project) this.apply(this.project);
  }
  metronomeGain: GainNode | null = null;
  countInGain: GainNode | null = null;
  metroBeats: number[] = [];
  metroScheduled = new Set<string>();
  peakCache = new Map<string, number[]>();
  channels: Channel[] = [];
  mix: GainNode | null = null;
  master: GainNode | null = null;
  dsp: SoundTouchNode | null = null;
  limiter: DynamicsCompressorNode | null = null;
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
    if (this._loop?.a === value?.a && this._loop?.b === value?.b) return;
    const position = this.position();
    this._loop = value;
    if (this.playing) this.seek(position);
  }
  transportGain: GainNode | null = null;
  playSerial = 0;
  private resumeRequested = false;
  scheduledCycles = new Set<number>();
  activeSources = new Set<{ source: AudioBufferSourceNode; gate: GainNode }>();
  private initPromise: Promise<void> | null = null;
  private lifecycleSerial = 0;
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
  notesScheduled = new Set<string>();
  midiGain: GainNode | null = null;
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
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    try {
      await SoundTouchNode.register(ctx, processorUrl);
    } catch (error) {
      await ctx.close();
      throw error;
    }
    if (lifecycle !== this.lifecycleSerial) {
      await ctx.close();
      return;
    }
    this.context = ctx;
    this.mix = ctx.createGain();
    this.metronomeGain = ctx.createGain();
    this.countInGain = ctx.createGain();
    this.metronomeGain.connect(this.mix);
    this.countInGain.connect(this.mix);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.midiGain = ctx.createGain();
    this.midiGain.gain.value = 0.3;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.transportGain = ctx.createGain();
    this.transportGain.gain.value = 0;
    this.midiGain.connect(this.transportGain);
    this.transportGain.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this.initWaveWorker();
    this.rebuildDsp();
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
  async load(project: Project) {
    const generation = ++this.generation;
    this.pause();
    await this.init();
    if (generation !== this.generation || !this.context) return;
    const same = this.project?.id === project.id,
      oldBuffers = new Map(
        (same ? this.channels : []).map((channel) => [channel.track.file, channel.buffer]),
      );
    if (!same) this.peakCache.clear();
    const tracks = sourceTracks(project),
      loaded: Channel[] = [];
    try {
      for (const track of tracks) {
        let buffer = oldBuffers.get(track.file);
        if (!buffer) {
          const response = await fetch(asset(project.id, track.file));
          if (!response.ok) throw new Error(tr('无法读取 {0}', [track.name]));
          buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        }
        if (generation !== this.generation) {
          for (const c of loaded) {
            c.gain.disconnect();
            c.pan.disconnect();
            c.split.disconnect();
          }
          return;
        }
        const gain = this.context!.createGain(),
          pan = this.context!.createStereoPanner();
        gain.connect(pan);
        pan.connect(this.mix!);
        const split = this.context!.createChannelSplitter(2),
          meters = [this.context!.createAnalyser(), this.context!.createAnalyser()];
        pan.connect(split);
        meters.forEach((meter, index) => {
          meter.fftSize = 1024;
          split.connect(meter, index);
        });
        loaded.push({
          buffer,
          track: { ...track },
          gain,
          pan,
          split,
          meters,
          meterData: meters.map((meter) => new Float32Array(meter.fftSize)),
        });
      }
    } catch (error) {
      for (const c of loaded) {
        c.gain.disconnect();
        c.pan.disconnect();
        c.split.disconnect();
        c.meters.forEach((meter) => meter.disconnect());
      }
      throw error;
    }
    if (generation !== this.generation) return;
    for (const c of this.channels) {
      c.gain.disconnect();
      c.pan.disconnect();
      c.split.disconnect();
      c.meters.forEach((meter) => meter.disconnect());
    }
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
          .map((c) => Math.max(0, (c.track.start || 0) + c.buffer.duration)),
      ),
    );
    this.offset = 0;
    this.apply(project);
    for (const channel of loaded) {
      const values =
        this.peakCache.get(channel.track.file) || (await this.calculateWaveform(channel.buffer));
      if (generation !== this.generation) return;
      this.peakCache.set(channel.track.file, values);
      this.trackWaves.set(
        channel.track.id,
        placeEnvelope(values, channel.buffer.duration, channel.track.start || 0, this.duration),
      );
    }
    if (project.kind !== 'creation') await this.waveform('mix');
    if (generation === this.generation) this.onUpdate(0, false);
  }
  apply(project: Project) {
    this.project = project;
    const was = this.playing || this.resumeRequested;
    const position = this.position();
    const changed = this.tempo !== project.practice.tempo || this.pitch !== project.practice.pitch;
    if (changed) this.pause();
    this.tempo = project.practice.tempo;
    this.pitch = project.practice.pitch;
    if (this.dsp) {
      this.dsp.playbackRate.value = this.tempo;
      this.dsp.pitchSemitones.value = this.pitch;
    }
    if (this.master)
      this.master.gain.setTargetAtTime(project.practice.master, this.context!.currentTime, 0.01);
    const tracks = playbackTracks(project, this.captureActive),
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
    if (!this.context || (!this.channels.length && !this.captureActive) || this.playing) return;
    this.resumeRequested = true;
    const serial = ++this.playSerial,
      context = this.context;
    try {
      await context.resume();
    } catch (error) {
      if (serial !== this.playSerial) return;
      this.resumeRequested = false;
      throw error;
    }
    if (serial !== this.playSerial || this.context !== context) return;
    if (!this.captureActive && this.offset >= this.duration - 0.01) this.offset = 0;
    this.metroBeats = beatGrid(this.project!, this.duration);
    if (countIn && this.project?.practice.snapCountIn !== false)
      this.offset = nearestBeat(this.metroBeats, this.offset, this.loop);
    const loop = this.usableLoop();
    if (loop && this.offset >= loop.b) this.offset = loop.a;
    this.dsp!.port.postMessage({ type: 'reset', at: context.currentTime + 0.006, active: true });
    this.transportGain!.gain.cancelAndHoldAtTime(context.currentTime);
    this.transportGain!.gain.linearRampToValueAtTime(0, context.currentTime + 0.005);
    this.transportGain!.gain.setValueAtTime(1, context.currentTime + 0.012);
    this.scheduledCycles.clear();
    this.metroScheduled.clear();
    const origin = this.context.currentTime;
    let delay = countIn ? 0.12 : 0.02;
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
    this.scheduleSources();
    this.playing = true;
    this.notesScheduled.clear();
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    const tick = () => {
      if (!this.playing) return;
      const p = this.position();
      if (!this.captureActive && p >= this.duration - 0.005) {
        this.pause();
        this.offset = this.duration;
        this.onUpdate(this.offset, false);
        return;
      }
      this.onUpdate(p, true);
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
    await context.setSinkId(id === 'default' ? '' : id);
  }
  pause() {
    this.playSerial++;
    this.resumeRequested = false;
    if (this.playing) this.offset = this.position();
    this.playing = false;
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
  }
  seek(position: number) {
    const was = this.playing || this.resumeRequested;
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, position));
    this.onUpdate(this.offset, false);
    if (was) void this.play();
  }
  private scheduleSources() {
    if (!this.context) return;
    const loop = this.usableLoop(),
      now = this.context.currentTime,
      horizon = now + 0.25;
    const firstEnd = loop ? loop.b : this.duration;
    const raw = this.offset + Math.max(0, now - this.started) * this.tempo;
    const cycle = loop && raw >= loop.b ? 1 + Math.floor((raw - loop.b) / (loop.b - loop.a)) : 0;
    for (
      let index = cycle;
      index <= cycle + (loop ? Math.ceil((0.25 * this.tempo) / (loop.b - loop.a)) + 1 : 0);
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
      for (const channel of this.channels) {
        const trackStart = channel.track.start || 0,
          start = Math.max(from, trackStart),
          end = Math.min(to, trackStart + channel.buffer.duration);
        if (!(end > start)) continue;
        const nominal = at + (start - from) / this.tempo,
          begins = Math.max(nominal, now + 0.003),
          ends = at + (end - from) / this.tempo;
        if (ends <= begins) continue;
        const source = this.context.createBufferSource(),
          gate = this.context.createGain(),
          fade = Math.min(0.003, (ends - begins) / 3);
        source.buffer = channel.buffer;
        source.playbackRate.value = this.tempo;
        source.connect(gate);
        gate.connect(channel.gain);
        gate.gain.setValueAtTime(0, begins);
        gate.gain.linearRampToValueAtTime(1, begins + fade);
        gate.gain.setValueAtTime(1, ends - fade);
        gate.gain.linearRampToValueAtTime(0, ends);
        const item = { source, gate };
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
      for (const old of this.scheduledCycles) if (old < cycle - 1) this.scheduledCycles.delete(old);
    }
  }
  schedule() {
    if (!this.context || !this.project) return;
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
      epoch <= cycle + (loop ? Math.ceil((0.22 * this.tempo) / (loop.b - loop.a)) + 1 : 0);
      epoch++
    ) {
      const origin =
        epoch === 0
          ? this.started
          : this.started + (loop!.b - this.offset + (epoch - 1) * (loop!.b - loop!.a)) / this.tempo;
      if (epoch > 0 && origin > now + 0.22) break;
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
          if (at > now + 0.22) break;
          if (at >= this.context.currentTime - 0.003) {
            this.metroScheduled.add(key);
            this.click(
              Math.max(this.context.currentTime, at),
              strongBeat(this.project, this.metroBeats, i),
            );
          }
        }
      }
      const alignment = this.project.alignment;
      if (this.project.practice.midi && alignment) {
        alignment.notes.forEach((n, i) => {
          const key = epoch + ':' + i;
          if (this.notesScheduled.has(key)) return;
          const start = interpolate(alignment.points, n.start),
            stop = interpolate(alignment.points, n.end);
          const at = origin + (start - offset) / this.tempo;
          if (start >= offset - 0.002 && start < end && at >= now && at < now + 0.22) {
            this.notesScheduled.add(key);
            const duration = Math.max(0.02, (Math.min(stop, end) - start) / this.tempo);
            if (at >= this.context!.currentTime)
              this.note(n.pitch, n.velocity, n.program, n.drum, at, duration);
          }
        });
      }
    }
    for (const set of [this.metroScheduled, this.notesScheduled])
      for (const key of set) if (Number(key.split(':')[0]) < cycle - 1) set.delete(key);
  }
  note(
    pitch: number,
    velocity: number,
    program: number,
    drum: boolean,
    at: number,
    duration: number,
  ) {
    const ctx = this.context!,
      gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime((velocity / 127) * 0.16, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(duration, 60) + 0.08);
    gain.connect(this.midiGain!);
    let source: AudioScheduledSourceNode;
    if (drum) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.14), ctx.sampleRate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp((-i / d.length) * 7);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.connect(gain);
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = program >= 24 && program < 40 ? 'triangle' : program >= 80 ? 'sawtooth' : 'sine';
      osc.frequency.value =
        440 * 2 ** ((pitch + this.pitch + (this.project?.alignment?.transpose || 0) - 69) / 12);
      osc.connect(gain);
      source = osc;
    }
    source.start(at);
    source.stop(at + Math.min(duration, 60) + 0.1);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }
  click(at: number, strong = false, countIn = false) {
    const ctx = this.context!,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = strong ? 1600 : 1000;
    gain.gain.setValueAtTime(0.16, at);
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
    if (this.waveWorker) {
      const id = ++this.peakSerial;
      try {
        return await new Promise<number[]>((resolve, reject) => {
          this.peakJobs.set(id, { resolve, reject });
          const buffers = Array.from(
            { length: buffer.numberOfChannels },
            (_, index) => buffer.getChannelData(index).slice().buffer,
          );
          try {
            this.waveWorker!.postMessage(
              { id, buffers, length: buffer.length, sampleRate: buffer.sampleRate },
              buffers,
            );
          } catch (error) {
            this.peakJobs.delete(id);
            reject(error);
          }
        });
      } catch {
        /* Keep audio usable if background workers are unavailable. */
      }
    }
    const step = Math.max(
        1,
        Math.ceil(buffer.length / Math.max(1, Math.ceil(buffer.duration * 100))),
      ),
      data = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
      peaks: number[] = [];
    let last = performance.now();
    for (let start = 0; start < buffer.length; start += step) {
      let peak = 0;
      for (const samples of data)
        for (let i = start; i < Math.min(buffer.length, start + step); i++)
          peak = Math.max(peak, Math.abs(samples[i]));
      peaks.push(peak);
      if (performance.now() - last > 6) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        last = performance.now();
      }
    }
    return peaks;
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
    return source === 'mix'
      ? this.mixWaves.get(this.waveKey()) || null
      : this.trackWaves.get(source) || null;
  }
  waveformRegion(source: string, override?: SourceGroup) {
    const group =
      override || creationGroups(this.project!).find((group) => source === 'group:' + group.id);
    return group
      ? groupWaveRegion(
          group,
          new Map(this.channels.map((channel) => [channel.track.id, channel.buffer.duration])),
        )
      : { origin: 0, duration: this.duration };
  }
  async waveform(source = 'mix', groupOverride?: SourceGroup): Promise<number[]> {
    if (!this.channels.length || !this.context) return [];
    const cached = this.cachedWaveform(source);
    if (cached) return cached;
    const generation = this.generation;
    if (source.startsWith('group:')) {
      const group =
        groupOverride ||
        creationGroups(this.project!).find((group) => group.id === source.slice(6));
      if (!group) return [];
      const tracks = groupTracks(group),
        key = source + '|' + this.generation + '|' + JSON.stringify(tracks),
        found = this.mixWaves.get(key);
      if (found) return found;
      const rate = this.context.sampleRate,
        region = this.waveformRegion(source, group),
        offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(region.duration * rate)), rate);
      for (const track of tracks) {
        if (track.mute) continue;
        const channel = this.channels.find((channel) => channel.track.id === track.id);
        if (!channel) continue;
        const input = offline.createBufferSource(),
          gain = offline.createGain(),
          pan = offline.createStereoPanner();
        input.buffer = channel.buffer;
        gain.gain.value = track.gain;
        pan.pan.value = track.pan;
        input.connect(gain);
        gain.connect(pan);
        pan.connect(offline.destination);
        const start = (track.start || 0) - region.origin,
          offset = Math.max(0, -start);
        if (offset < channel.buffer.duration) input.start(Math.max(0, start), offset);
      }
      const values = await this.calculateWaveform(await offline.startRendering());
      if (generation === this.generation) {
        if (this.mixWaves.size >= 8) this.mixWaves.delete(this.mixWaves.keys().next().value!);
        this.mixWaves.set(key, values);
      }
      return values;
    }
    if (source !== 'mix') {
      const channel = this.channels.find((channel) => channel.track.id === source);
      if (!channel) throw new Error(tr('所选波形的音轨不存在'));
      const values = await this.calculateWaveform(channel.buffer);
      if (generation === this.generation) this.trackWaves.set(source, values);
      return values;
    }
    const key = this.waveKey(),
      existing = this.mixInFlight.get(key);
    if (existing) return existing;
    const task = (async () => {
      const solo = this.channels.some((channel) => channel.track.solo && !channel.track.mute),
        audible = this.channels.filter(
          (channel) =>
            !channel.track.mute && (!solo || channel.track.solo) && channel.track.gain > 0,
        );
      let peaks: number[];
      if (!audible.length || this.project?.practice.master === 0)
        peaks = new Array(Math.ceil(this.duration * 100)).fill(0);
      else {
        const rate = this.context!.sampleRate,
          offline = new OfflineAudioContext(2, Math.ceil(this.duration * rate), rate),
          master = offline.createGain();
        master.gain.value = this.project?.practice.master ?? 0.8;
        master.connect(offline.destination);
        for (const channel of audible) {
          const input = offline.createBufferSource(),
            gain = offline.createGain(),
            pan = offline.createStereoPanner();
          input.buffer = channel.buffer;
          gain.gain.value = channel.track.gain;
          pan.pan.value = channel.track.pan;
          input.connect(gain);
          gain.connect(pan);
          pan.connect(master);
          const start = channel.track.start || 0,
            offset = Math.max(0, -start);
          if (offset < channel.buffer.duration) input.start(Math.max(0, start), offset);
        }
        const buffer = await offline.startRendering();
        peaks = await this.calculateWaveform(buffer);
      }
      if (generation === this.generation) {
        if (this.mixWaves.size >= 4) this.mixWaves.delete(this.mixWaves.keys().next().value!);
        this.mixWaves.set(key, peaks);
      }
      return peaks;
    })();
    this.mixInFlight.set(key, task);
    try {
      return await task;
    } finally {
      this.mixInFlight.delete(key);
    }
  }
  dispose() {
    this.lifecycleSerial++;
    this.pause();
    this.generation++;
    if (this.mixWarmTimer) clearTimeout(this.mixWarmTimer);
    this.waveWorker?.terminate();
    this.waveWorker = null;
    for (const job of this.peakJobs.values()) job.reject(new Error(tr('播放器已关闭')));
    this.peakJobs.clear();
    void this.context?.close();
    this.context = null;
    this.dsp?.port.close();
    this.dsp = null;
    this.mix = null;
    this.master = null;
    this.transportGain = null;
    this.metronomeGain = null;
    this.countInGain = null;
    this.midiGain = null;
    this.limiter = null;
    this.channels = [];
    this.peakCache.clear();
    this.trackWaves.clear();
    this.mixWaves.clear();
    this.mixInFlight.clear();
  }
}
