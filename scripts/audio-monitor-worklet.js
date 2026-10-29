class Monitor extends AudioWorkletProcessor {
  process(inputs) {
    let peak = 0;
    for (const channel of inputs[0] || [])
      for (const value of channel) peak = Math.max(peak, Math.abs(value));
    this.port.postMessage({ time: currentTime, peak });
    return true;
  }
}
registerProcessor('regression-monitor', Monitor);
