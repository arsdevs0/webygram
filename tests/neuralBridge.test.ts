import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function bridge(rate = 48000, echo = false) {
  let Processor: any;
  const events: any[] = [], frames: any[] = [];
  vm.runInNewContext(fs.readFileSync(new URL('../public/voice/neural-bridge.worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class { port = { postMessage(message: any) { events.push(message); } }; },
    sampleRate: rate, registerProcessor(_name: string, cls: any) { Processor = cls; },
  });
  const instance = new Processor();
  const channel: any = { start() {}, postMessage(frame: any) { if (frame.type !== 'chunk') return; frames.push(frame); if (echo) channel.onmessage({ data: { type: 'audio', samples: new Float32Array(frame.samples), epoch: frame.epoch } }); } };
  instance.port.onmessage({ data: { type: 'connect', port: channel } });
  instance.port.onmessage({ data: { type: 'active', value: true } });
  return { instance, frames, events, channel };
}
test('neural bridge resamples 44.1 and 48 kHz without changing duration or invalid output', () => {
  for (const rate of [44100, 48000]) {
    const { instance, frames, events } = bridge(rate, true);
    let energy = 0;
    for (let offset = 0; offset < rate; offset += 128) {
      const input = Float32Array.from({ length: 128 }, (_, i) => .2 * Math.sin(2 * Math.PI * 130 * (offset + i) / rate));
      const output = new Float32Array(128);
      instance.process([[input]], [[output]]);
      for (const sample of output) { assert.ok(Number.isFinite(sample) && Math.abs(sample) <= .98); energy += sample * sample; }
    }
    assert.ok(energy > rate * .01);
    assert.equal(frames.length, 19); assert.ok(frames.every(frame => frame.samples.length === 832));
    assert.equal(events.filter(event => event.type === 'playing').length, 1);
    assert.equal(events.filter(event => event.type === 'stalled').length, 0);
  }
});
test('neural bridge bounds outstanding frames and falls back when inference stops', () => {
  const { instance, frames, events } = bridge();
  for (let i = 0; i < 150; i++) instance.process([[new Float32Array(128).fill(.1)]], [[new Float32Array(128)]]);
  assert.equal(frames.length, 4); assert.equal(instance.active, false);
  assert.equal(events.filter(event => event.type === 'stalled').length, 1);
});
test('neural bridge rejects delayed audio after disabling and re-enabling', () => {
  const { instance, channel } = bridge();
  const oldEpoch = instance.epoch;
  instance.port.onmessage({ data: { type: 'active', value: false } });
  instance.port.onmessage({ data: { type: 'active', value: true } });
  channel.onmessage({ data: { type: 'audio', samples: new Float32Array(832).fill(.3), epoch: oldEpoch } });
  channel.onmessage({ data: { type: 'audio', samples: new Float32Array(832).fill(.3), epoch: oldEpoch } });
  const output = new Float32Array(128);
  instance.process([[new Float32Array(128)]], [[output]]);
  assert.ok(output.every(value => value === 0)); assert.equal(instance.queue.length, 0);
});
