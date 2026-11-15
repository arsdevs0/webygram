import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function processor() {
  const source = readFileSync(new URL('../src/services/voiceChangerEngine.ts', import.meta.url), 'utf8');
  const code = source.split('const PHASE_VOCODER_WORKLET_CODE = `')[1].split('`;')[0];
  let Processor: any;
  vm.runInNewContext(code, { AudioWorkletProcessor: class { port = { postMessage() {} }; }, sampleRate: 48000, registerProcessor: (_name: string, cls: any) => { Processor = cls; } });
  return new Processor();
}
function render(instance: any, ratio: number, enabled: boolean, frequency = 180, samples = 48000) {
  const result = new Float32Array(samples);
  const parameters = { pitchRatio: [ratio], formantRatio: [1], enabled: [enabled ? 1 : 0], gateThreshold: [0], femaleCalibration: [0], femaleTargetHz: [198] };
  for (let offset = 0; offset < samples; offset += 128) {
    const input = new Float32Array(128);
    for (let i = 0; i < 128; i++) input[i] = frequency ? 0.2 * Math.sin(2 * Math.PI * frequency * (i + offset) / 48000) : 0;
    const output = new Float32Array(128);
    instance.process([[input]], [[output]], parameters);
    result.set(output.subarray(0, Math.min(128, samples - offset)), offset);
  }
  return result;
}
function peakFrequency(samples: Float32Array) {
  const segment = samples.subarray(24000, 36000);
  let best = 0; let peak = 0;
  for (let frequency = 100; frequency <= 360; frequency++) {
    let real = 0; let imaginary = 0;
    for (let i = 0; i < segment.length; i++) {
      const angle = 2 * Math.PI * frequency * i / 48000;
      real += segment[i] * Math.cos(angle); imaginary += segment[i] * Math.sin(angle);
    }
    const energy = real * real + imaginary * imaginary;
    if (energy > best) { best = energy; peak = frequency; }
  }
  return peak;
}

test('voice bypass preserves the microphone waveform', () => {
  const output = render(processor(), 1, false);
  for (let i = 0; i < output.length; i++) assert.ok(Math.abs(output[i] - 0.2 * Math.sin(2 * Math.PI * 180 * i / 48000)) < 1e-7);
});
test('live pitch shift produces the target fundamental without clipping or invalid samples', () => {
  const output = render(processor(), 1.5, true);
  assert.ok(output.every(value => Number.isFinite(value) && Math.abs(value) <= 0.981));
  const peak = peakFrequency(output);
  assert.ok(Math.abs(peak - 270) < 12, `Expected 270 Hz, got ${peak} Hz`);
});
test('re-enabling voice effects cannot replay stale audio after silent bypass', () => {
  const instance = processor();
  render(instance, 1.5, true);
  render(instance, 1, false, 0, 48000);
  const output = render(instance, 1.5, true, 0, 4096);
  assert.ok(output.every(value => Math.abs(value) < 1e-7));
});

test('pitch detection remains finite for low voices with long autocorrelation lags', () => {
  const instance = processor();
  render(instance, 1.5, true, 110);
  assert.ok(Number.isFinite(instance.detectedF0));
  assert.ok(Math.abs(instance.detectedF0 - 110) < 3, `Expected 110 Hz, got ${instance.detectedF0}`);
  assert.ok(instance.yinDiff.every((value: number) => Number.isFinite(value)));
});
