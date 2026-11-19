import * as ort from 'onnxruntime-web/wasm';

interface Manifest {
  sampleRate: number; chunkSamples: number; contextSamples: number;
  inputShapes: Record<string, number[]>; modelBytes: number; sha256: string;
}
let session: ort.InferenceSession;
let manifest: Manifest;
let feed: Record<string, ort.Tensor> = {};
let previous: Float32Array;
let channel: MessagePort;
let epoch = 0;
let resetPending = true;
let running = false;
const queue: { samples: Float32Array; epoch: number }[] = [];
const stateNames = ['encoder', 'decoder', 'output', 'prenet'];

function resetState() {
  for (const tensor of Object.values(feed)) tensor.dispose();
  feed = {};
  for (const name of stateNames) {
    const shape = manifest.inputShapes[name];
    feed[name] = new ort.Tensor('float32', new Float32Array(shape.reduce((a, b) => a * b, 1)), shape);
  }
  previous = new Float32Array(manifest.contextSamples);
  resetPending = false;
}
async function convert(samples: Float32Array) {
  const audio = new Float32Array(manifest.chunkSamples + manifest.contextSamples);
  audio.set(previous); audio.set(samples, manifest.contextSamples);
  previous.set(samples.subarray(samples.length - previous.length));
  feed.audio = new ort.Tensor('float32', audio, manifest.inputShapes.audio);
  const result = await session.run(feed);
  for (const tensor of Object.values(feed)) tensor.dispose();
  feed = {};
  for (const name of stateNames) feed[name] = result['next_' + name];
  const converted = new Float32Array(result.converted.data as Float32Array);
  result.converted.dispose();
  if (converted.length !== manifest.chunkSamples || !converted.every(Number.isFinite)) {
    throw Error('AI returned invalid audio. Lightweight effects are active.');
  }
  return converted;
}
async function cachedModel(url: string) {
  let cache: Cache | undefined;
  try { cache = await caches.open('webygram-voice-model-v1'); } catch { /* Storage is optional. */ }
  let response = await cache?.match(url);
  const wasCached = Boolean(response);
  if (!response) response = await fetch(url);
  if (!response.ok) throw Error('AI voice download failed. Check your connection and retry.');
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== manifest.modelBytes || digest !== manifest.sha256) {
    await cache?.delete(url);
    throw Error('AI voice download was incomplete. Tap Retry AI.');
  }
  if (!wasCached) {
    try { await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); }
    catch { /* Quota/private browsing must not prevent conversion. */ }
  }
  return bytes;
}
async function initialize(data: { manifestUrl: string; modelUrl: string; runtimeUrl: string }) {
  ort.env.wasm.numThreads = 1; // Works without cross-origin isolation or SharedArrayBuffer.
  ort.env.wasm.proxy = false; // This module already runs off the UI/audio threads.
  ort.env.wasm.wasmPaths = data.runtimeUrl;
  const response = await fetch(data.manifestUrl);
  if (!response.ok) throw Error('AI voice assets are unavailable on this deployment.');
  manifest = await response.json();
  if (manifest.sampleRate !== 16000 || manifest.chunkSamples !== 832 || manifest.contextSamples !== 32) {
    throw Error('Unsupported AI voice model version.');
  }
  const model = await cachedModel(data.modelUrl);
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  self.postMessage({ type: 'checking' });
  resetState();
  const times: number[] = [];
  const samples = new Float32Array(manifest.chunkSamples);
  for (let step = 0; step < 24; step++) {
    for (let i = 0; i < samples.length; i++) {
      samples[i] = .12 * Math.sin(2 * Math.PI * 130 * (step * samples.length + i) / 16000)
        + .04 * Math.sin(2 * Math.PI * 260 * (step * samples.length + i) / 16000);
    }
    const start = performance.now(); await convert(samples);
    if (step >= 4) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p50ms = times[Math.floor(times.length * .5)];
  const p95ms = times[Math.floor(times.length * .95)];
  const budgetMs = manifest.chunkSamples / 16;
  // Leave headroom for jitter, encoding and the rest of the app.
  if (p50ms > budgetMs * .9 || p95ms > budgetMs * 1.7) {
    self.postMessage({ type: 'slow', p50ms, p95ms });
    for (const tensor of Object.values(feed)) tensor.dispose();
    feed = {}; await session.release(); return;
  }
  resetState();
  self.postMessage({ type: 'ready', p50ms, p95ms, chunkSamples: manifest.chunkSamples });
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const frame = queue.shift()!;
      if (frame.epoch !== epoch) continue;
      if (resetPending) resetState();
      const start = performance.now();
      const samples = await convert(frame.samples);
      if (frame.epoch !== epoch) { resetPending = true; continue; }
      channel.postMessage({ type: 'audio', samples, epoch, ms: performance.now() - start }, [samples.buffer]);
    }
  } catch (error) { self.postMessage({ type: 'error', message: (error as Error).message }); }
  finally { running = false; }
}
self.onmessage = ({ data }) => {
  if (data.type === 'init') void initialize(data).catch(error => self.postMessage({ type: 'error', message: error.message }));
  if (data.type === 'connect') {
    channel = data.port;
    channel.onmessage = ({ data: frame }) => {
      if (frame.type === 'reset') { epoch = frame.epoch; queue.length = 0; resetPending = true; }
      else if (frame.type === 'chunk' && frame.epoch === epoch) {
        if (queue.length >= 3) { self.postMessage({ type: 'error', message: 'AI cannot keep up. Lightweight effects are active.' }); return; }
        queue.push(frame); void pump();
      }
    };
    channel.start();
  }
};
