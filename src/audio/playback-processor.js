import {
  SoundTouchProcessorBase,
  STANDARD_PARAMETER_DESCRIPTORS,
} from '@soundtouchjs/worklet-base';
import * as registry from '@soundtouchjs/core';
import { registerLanczosStrategy } from '@soundtouchjs/interpolation-strategy-lanczos';
registerLanczosStrategy(registry);

// Keep one worklet alive. Reset the FIFO on the render clock, after the output
// gate has faded out, so seeking never replays samples from the previous position.
class PlaybackProcessor extends SoundTouchProcessorBase {
  static get parameterDescriptors() {
    return STANDARD_PARAMETER_DESCRIPTORS;
  }
  constructor(options) {
    super('[Immerse playback]', {
      sampleRate,
      sampleBufferType: 'circular',
      interpolationStrategy: 'lanczos',
    });
    this.active = false;
    this.pending = [];
    this.fade = -1;
    const inherited = this.port.onmessage;
    this.port.onmessage = (event) => {
      if (event.data.type === 'reset') this.pending.push(event.data);
      else inherited?.(event);
    };
  }
  process(inputs, outputs, parameters) {
    let reset = false;
    while (this.pending.length && currentTime >= this.pending[0].at) {
      const command = this.pending.shift();
      this._pipe.clear();
      // SoundTouch 2.1.1's circular stretch adapter owns a second input queue
      // which Stretch.clear() does not drain. Clear that queue too, without
      // recreating the worklet or its processing buffers on every seek.
      const stretchInput = this._pipe.stretch.getInputBufferAdapter();
      stretchInput.receive(stretchInput.frameCount);
      this._samples.fill(0);
      this._outputSamples.fill(0);
      this.active = command.active;
      if (command.id) this.port.postMessage({ type: 'reset-done', id: command.id });
      this.fade = -1;
      reset = true;
    }
    // A render quantum can straddle the old source's stop time. Discard the
    // entire reset quantum rather than feeding its old prefix into the new FIFO.
    if (!this.active || reset) {
      for (const bus of outputs) for (const channel of bus) channel.fill(0);
      return true;
    }
    return super.process(inputs, outputs, parameters);
  }
  onProcessComplete(result) {
    const count = Math.round(sampleRate * 0.005);
    for (let i = 0; i < result.frameCount; i++) {
      if (
        this.fade < 0 &&
        Math.max(Math.abs(result.leftOutput[i]), Math.abs(result.rightOutput[i])) > 1e-7
      )
        this.fade = 0;
      if (this.fade >= 0 && this.fade < count) {
        const gain = ++this.fade / count;
        result.leftOutput[i] *= gain;
        result.rightOutput[i] *= gain;
      }
    }
    if (this._blockCount % 100 === 0)
      this.port.postMessage({
        type: 'metrics',
        framesBuffered: result.available,
        underrunCount: this._underrunCount,
        blockCount: this._blockCount,
        outputRms: result.outputRms,
        outputPeak: result.outputPeak,
      });
  }
}
registerProcessor('soundtouch-processor', PlaybackProcessor);
