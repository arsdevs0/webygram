// Audio callbacks only resample and move small buffers. Neural inference is in a Worker.
class NeuralVoiceBridge extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 832;
    this.ratio = 16000 / sampleRate;
    this.active = false;
    this.epoch = 0;
    this.queue = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === 'connect') {
        this.channel = data.port;
        this.channel.onmessage = ({ data: frame }) => {
          if (!this.active || frame.epoch !== this.epoch || frame.type !== 'audio') return;
          this.inFlight--;
          if (this.queue.length >= 4) return this.fail();
          this.queue.push(frame.samples);
        };
        this.channel.start();
      } else if (data.type === 'active' && this.active !== data.value) {
        this.active = data.value;
        this.reset();
      }
    };
    this.reset();
  }
  reset() {
    this.epoch++;
    this.queue.length = 0;
    this.capture = new Float32Array(this.chunkSize);
    this.captureFill = 0;
    this.inFlight = 0;
    this.position = 0;
    this.playing = false;
    this.inputTime = 0;
    this.nextSampleAt = 0;
    this.previous = 0;
    this.channel?.postMessage({ type: 'reset', epoch: this.epoch });
  }
  fail() {
    this.active = false;
    this.reset();
    this.port.postMessage({ type: 'stalled' });
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!this.active || !input || !this.channel) { output.fill(0); return true; }
    for (let i = 0; i < output.length; i++) {
      const value = input[i] || 0;
      // A prefilter in the Web Audio graph removes frequencies above 8 kHz.
      while (this.nextSampleAt <= this.inputTime) {
        const fraction = this.nextSampleAt - (this.inputTime - 1);
        this.capture[this.captureFill++] = this.previous + (value - this.previous) * fraction;
        this.nextSampleAt += 1 / this.ratio;
        if (this.captureFill === this.chunkSize) {
          if (this.inFlight >= 4) { this.fail(); output.fill(0, i); return true; }
          const samples = this.capture;
          this.channel.postMessage({ type: 'chunk', samples, epoch: this.epoch }, [samples.buffer]);
          this.inFlight++;
          this.capture = new Float32Array(this.chunkSize);
          this.captureFill = 0;
        }
      }
      this.previous = value; this.inputTime++;
      if (!this.playing && this.queue.length >= 2) {
        this.playing = true;
        this.port.postMessage({ type: 'playing' });
      }
      if (this.playing) {
        if (!this.queue.length) { this.fail(); output.fill(0, i); return true; }
        const frame = this.queue[0];
        const index = Math.floor(this.position);
        const next = index + 1 < frame.length ? frame[index + 1] : (this.queue[1]?.[0] ?? frame[index]);
        output[i] = Math.max(-.98, Math.min(.98, frame[index] + (next - frame[index]) * (this.position - index)));
        this.position += this.ratio;
        if (this.position >= frame.length) { this.position -= frame.length; this.queue.shift(); }
      } else output[i] = 0;
    }
    return true;
  }
}
registerProcessor('neural-voice-bridge', NeuralVoiceBridge);
