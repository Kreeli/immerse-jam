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
    this.pending = null;
    this.fade = -1;
    const inherited = this.port.onmessage;
    this.port.onmessage = (event) => {
      if (event.data.type === 'reset') this.pending = event.data;
      else inherited?.(event);
    };
  }
  process(inputs, outputs, parameters) {
    if (this.pending && currentTime >= this.pending.at) {
      this._pipe.clear();
      this._samples.fill(0);
      this._outputSamples.fill(0);
      this.active = this.pending.active;
      this.pending = null;
      this.fade = -1;
    }
    if (!this.active) {
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
