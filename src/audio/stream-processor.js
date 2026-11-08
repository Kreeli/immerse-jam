// Continuous sample clock over bounded disk windows. A window boundary never
// starts/stops a source or resets interpolation phase.
class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.windows = new Map();
    this.heads = [];
    this.state = null;
    this.pendingState = null;
    this.transition = null;
    this.stopFrame = Infinity;
    this.last = [0, 0];
    this.starved = 0;
    this.recovery = 1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'window')
        this.windows.set(data.index, { pcm: data.pcm, channels: data.channels });
      else if (data.type === 'head') {
        this.heads.push({ first: data.first, pcm: data.pcm });
        this.heads = this.heads.slice(-4);
      } else if (data.type === 'clear-heads') this.heads = [];
      else if (data.type === 'retain') {
        const keep = new Set(data.indices);
        for (const key of this.windows.keys()) if (!keep.has(key)) this.windows.delete(key);
      } else if (data.type === 'play') {
        if (this.state && currentFrame < this.stopFrame && data.frame > currentFrame)
          this.pendingState = data;
        else {
          this.state = data;
          this.pendingState = null;
          this.transition = null;
          this.starved = 0;
          this.recovery = 1;
        }
        this.stopFrame = Infinity;
      } else if (data.type === 'stop') {
        this.stopFrame = data.frame;
        this.pendingState = null;
        this.transition = null;
      } else if (data.type === 'close') {
        this.closed = true;
        this.state = null;
        this.windows.clear();
        this.heads = [];
      }
    };
  }
  process(_inputs, outputs) {
    if (this.closed) return false;
    const out = outputs[0];
    let state = this.state;
    if (!out?.length) return true;
    // Usually an entire render block lies inside one disk window. Resolve the
    // common clock, loop, cache and fades once per block rather than per sample.
    const length = out[0].length;
    if (
      state &&
      currentFrame >= state.frame &&
      currentFrame + length <= this.stopFrame &&
      !this.starved &&
      this.recovery === 1 &&
      !this.transition &&
      (!this.pendingState || currentFrame + length <= this.pendingState.frame)
    ) {
      let time = state.offset + ((currentFrame - state.frame) * state.tempo) / sampleRate;
      const loop = state.loop,
        wrapped = loop && time >= loop.b;
      if (wrapped) time = loop.a + ((time - loop.b) % (loop.b - loop.a));
      const span = (length * state.tempo) / sampleRate,
        local = time - state.start;
      if (
        local > 0.003 &&
        local + span < state.duration - 0.003 &&
        (!loop ||
          (time + span < loop.b - 0.003 * state.tempo &&
            (!wrapped || time > loop.a + 0.003 * state.tempo)))
      ) {
        let position = local * 48000;
        if (Math.abs(position - Math.round(position)) < 1e-7) position = Math.round(position);
        const index = Math.floor(position / 48000),
          chunk = this.windows.get(index),
          step = (state.tempo * 48000) / sampleRate;
        const from = position - index * 48000,
          end = from + (length - 1) * step;
        if (chunk && end + 1 < (chunk.pcm ? chunk.pcm.length / 2 : chunk.channels[0].length)) {
          const pcm = chunk.pcm,
            channels = chunk.channels;
          if (step === 1) {
            const first = Math.floor(from),
              fraction = from - first;
            for (let i = 0; i < length; i++) {
              const frame = first + i;
              if (pcm) {
                const p = frame * 2;
                out[0][i] = pcm[p] * (1 - fraction) + pcm[p + 2] * fraction;
                if (out[1]) out[1][i] = pcm[p + 1] * (1 - fraction) + pcm[p + 3] * fraction;
              } else {
                out[0][i] = channels[0][frame] * (1 - fraction) + channels[0][frame + 1] * fraction;
                if (out[1])
                  out[1][i] =
                    channels[1][frame] * (1 - fraction) + channels[1][frame + 1] * fraction;
              }
            }
          } else
            for (let i = 0; i < length; i++) {
              const at = from + i * step,
                frame = Math.floor(at),
                fraction = at - frame;
              if (pcm) {
                const p = frame * 2;
                out[0][i] = pcm[p] * (1 - fraction) + pcm[p + 2] * fraction;
                if (out[1]) out[1][i] = pcm[p + 1] * (1 - fraction) + pcm[p + 3] * fraction;
              } else {
                out[0][i] = channels[0][frame] * (1 - fraction) + channels[0][frame + 1] * fraction;
                if (out[1])
                  out[1][i] =
                    channels[1][frame] * (1 - fraction) + channels[1][frame + 1] * fraction;
              }
            }
          this.last[0] = out[0][length - 1];
          this.last[1] = (out[1] || out[0])[length - 1];
          return true;
        }
      }
    }
    const fadeFrames = Math.max(1, Math.round(sampleRate * 0.003));
    for (let i = 0; i < out[0].length; i++) {
      const frame = currentFrame + i;
      let left = 0,
        right = 0;
      if (this.pendingState && frame >= this.pendingState.frame) {
        this.transition =
          this.pendingState.crossfade === false ? null : { state, frame: this.pendingState.frame };
        this.state = state = this.pendingState;
        this.pendingState = null;
      }
      if (state && frame >= state.frame && frame < this.stopFrame) {
        if (this.sample(state, frame)) {
          if (this.starved) {
            this.recovery = 0;
            this.starved = 0;
          }
          this.recovery = Math.min(1, this.recovery + 1 / fadeFrames);
          left = this.sampleLeft * this.recovery;
          right = this.sampleRight * this.recovery;
          const transition = this.transition;
          if (transition) {
            const weight = Math.min(1, (frame - transition.frame) / fadeFrames);
            if (weight < 1) {
              this.sample(transition.state, frame);
              left = this.sampleLeft * (1 - weight) + left * weight;
              right = this.sampleRight * (1 - weight) + right * weight;
            } else this.transition = null;
          }
          this.last[0] = left;
          this.last[1] = right;
        } else {
          this.starved++;
          const gain = Math.max(0, 1 - this.starved / fadeFrames);
          left = this.last[0] * gain;
          right = this.last[1] * gain;
        }
      }
      out[0][i] = left;
      if (out[1]) out[1][i] = right;
    }
    return true;
  }
  // Reused fields avoid allocating a result for every sample in a seek blend.
  sample(state, frame) {
    this.sampleLeft = this.sampleRight = 0;
    if (!state || frame < state.frame) return true;
    let time = state.offset + ((frame - state.frame) * state.tempo) / sampleRate;
    const loop = state.loop,
      wrapped = loop && time >= loop.b;
    if (wrapped) time = loop.a + ((time - loop.b) % (loop.b - loop.a));
    const local = time - state.start;
    if (local < 0 || local >= state.duration) return true;
    const position = Math.max(0, local * 48000),
      index = Math.floor(position / 48000);
    let chunk = this.windows.get(index),
      sourceFrame = Math.floor(position) - index * 48000;
    if (!chunk) {
      const head = this.heads.find(
        (h) => position >= h.first && position + 1 < h.first + h.pcm.length / 2,
      );
      if (head) {
        chunk = head;
        sourceFrame = Math.floor(position) - head.first;
      }
    }
    if (!chunk) return false;
    const channels = chunk.channels,
      pcm = chunk.pcm,
      length = pcm ? pcm.length / 2 : channels[0].length;
    if (sourceFrame >= length) return false;
    const next = Math.min(sourceFrame + 1, length - 1),
      fraction = position - Math.floor(position);
    let left = pcm
      ? pcm[sourceFrame * 2] * (1 - fraction) + pcm[next * 2] * fraction
      : channels[0][sourceFrame] * (1 - fraction) + channels[0][next] * fraction;
    let right = pcm
      ? pcm[sourceFrame * 2 + 1] * (1 - fraction) + pcm[next * 2 + 1] * fraction
      : channels[1][sourceFrame] * (1 - fraction) + channels[1][next] * fraction;
    const edge = Math.max(
      0,
      Math.min(
        1,
        local / 0.003,
        (state.duration - local) / 0.003,
        loop
          ? Math.min(
              (loop.b - time) / (0.003 * state.tempo),
              wrapped ? (time - loop.a) / (0.003 * state.tempo) : 1,
            )
          : 1,
      ),
    );
    this.sampleLeft = left * edge;
    this.sampleRight = right * edge;
    return true;
  }
}
registerProcessor('immerse-stream-track', StreamProcessor);
