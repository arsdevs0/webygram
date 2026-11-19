import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer, build, preview } from 'vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || process.argv[2]).href);
process.env.VITE_DIRECT_TELEGRAM = 'false';
fs.mkdirSync('.local', { recursive: true });
if (!fs.existsSync('.local/voice-fixture.wav')) {
  const rate=48000, length=rate*10, wav=Buffer.alloc(44+length*2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(length*2,40);
  for(let i=0;i<length;i++) {
    let value=0;
    for(let harmonic=1;harmonic<=40;harmonic++) {
      const hz=130*harmonic;
      const envelope=.25+3*Math.exp(-Math.pow((hz-650)/160,2))+2*Math.exp(-Math.pow((hz-1700)/250,2));
      value+=Math.sin(2*Math.PI*hz*i/rate)*envelope/harmonic;
    }
    wav.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(value*3600))),44+i*2);
  }
  fs.writeFileSync('.local/voice-fixture.wav',wav);
}
let server;
if (process.env.NEURAL_PRODUCTION === 'true') {
  await build({ logLevel: 'error', build: { outDir: '.local/neural-production-test', emptyOutDir: true,
    rolldownOptions: { input: 'tests/ui/neuralVoice.html' } } });
  const production = await preview({ build: { outDir: '.local/neural-production-test' }, preview: { host: '127.0.0.1', port: 0 } });
  server = { httpServer: production.httpServer, close: () => new Promise(resolve => production.httpServer.close(resolve)) };
} else {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
}
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+process.cwd()+'/.local/voice-fixture.wav','--autoplay-policy=no-user-gesture-required'] });
const errors = [], requests = [], checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(origin + '/tests/ui/neuralVoice.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(350);
  assert.equal(requests.filter(url => /llvc-v1|\/voice\/ort\/|neuralVoice.worker/.test(url)).length, 0);
  checks.push('AI model/runtime absent from normal startup');
  await page.getByRole('button', { name: /AI Woman/ }).click();
  await page.waitForFunction(() => ['active','slow','error'].includes(window.voice.getState().neuralStatus), null, { timeout: 90000 });
  const state = await page.evaluate(() => window.voice.getState());
  console.log('Device check', JSON.stringify(state));
  assert.equal(state.neuralStatus, 'active', state.neuralMessage);
  assert.equal(state.activeEngine, 'neural');
  checks.push('real ONNX worker inference passes measured device check');
  const sample = async () => page.evaluate(async () => {
    const context = window.voice.audioContext;
    const analyser = context.createAnalyser(); analyser.fftSize = 4096;
    const source = context.createMediaStreamSource(window.voice.getProcessedOutputStream()); source.connect(analyser);
    await new Promise(resolve => setTimeout(resolve, 300));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    let energy = 0; for (const value of samples) { if (!Number.isFinite(value)) throw Error('Invalid sample'); energy += value * value; }
    source.disconnect(); analyser.disconnect(); return Math.sqrt(energy / samples.length);
  });
  assert.ok(await sample() > .003, 'Neural output must be audible');
  const trackId = await page.evaluate(() => window.voice.getProcessedOutputStream().getAudioTracks()[0].id);
  await page.getByRole('button', { name: 'Record Test', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  await page.waitForTimeout(1700); await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
  const recording = await page.evaluate(async () => {
    const bytes = await (await fetch(document.querySelector('audio').src)).arrayBuffer();
    const audio = await window.voice.audioContext.decodeAudioData(bytes);
    const samples = audio.getChannelData(0); let energy = 0; for (const value of samples) energy += value * value;
    return { duration: audio.duration, rms: Math.sqrt(energy / samples.length) };
  });
  assert.ok(recording.duration > 1 && recording.rms > .003);
  checks.push('actual MediaRecorder neural output decodes and is audible');
  for (const width of [320, 360, 390]) for (const dark of [false, true]) {
    await page.setViewportSize({ width, height: 640 });
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    assert.equal(await page.evaluate(() => {
      const panel = document.querySelector('[role=dialog]');
      return document.documentElement.scrollWidth <= innerWidth + 1 && panel.scrollWidth <= panel.clientWidth + 1;
    }), true);
  }
  await page.screenshot({ path: '.local/neural-voice-390-dark.png' });
  checks.push('AI studio fits 320/360/390 px in both themes');
  await page.getByRole('button', { name: /Natural Woman/ }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.voice.getState().activeEngine), 'dsp');
  assert.ok(await sample() > .003);
  assert.equal(await page.evaluate(() => window.voice.getProcessedOutputStream().getAudioTracks()[0].id), trackId);
  checks.push('AI to lightweight effects keeps audible stable output track');
  const downloads = requests.filter(url => /llvc-v1.onnx/.test(url)).length;
  await page.getByRole('button', { name: /AI Woman/ }).click();
  await page.waitForFunction(() => ['active','slow','error'].includes(window.voice.getState().neuralStatus), null, { timeout: 90000 });
  const repeat = await page.evaluate(() => window.voice.getState());
  assert.equal(repeat.neuralStatus, 'active', repeat.neuralMessage);
  assert.equal(requests.filter(url => /llvc-v1.onnx/.test(url)).length, downloads);
  checks.push('repeat activation reuses cached model and registered worklet');
  // Simulate a stopped worker to exercise the real audio-thread backpressure.
  await page.evaluate(() => window.voice.neuralSession.worker.terminate());
  await page.waitForFunction(() => window.voice.getState().neuralStatus === 'error');
  assert.equal(await page.evaluate(() => window.voice.getState().activeEngine), 'dsp');
  assert.ok(await sample() > .003, 'Fallback must keep the mic audible');
  checks.push('worker stall falls back to audible effects with an honest status');
  assert.deepEqual(errors, []);
  fs.writeFileSync('.local/neural-voice-results.json', JSON.stringify({ passed: true, checks, p50ms: state.neuralP50Ms, p95ms: state.neuralP95Ms, recording }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, recording }));
} catch (error) { console.error(error); console.error(errors); process.exitCode = 1; }
finally { await browser.close(); await server.close(); }

