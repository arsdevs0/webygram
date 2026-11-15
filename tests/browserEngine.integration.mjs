import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { indexedDB } from 'fake-indexeddb';

const local = new Map();
const location = new URL('https://webygram.test/');
const localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) };
const window = Object.assign(new EventTarget(), { location, crypto: globalThis.crypto, localStorage });
Object.assign(globalThis, { window, location, localStorage, indexedDB });
const realInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => realInterval(...args).unref();
const engine = await import(process.env.BROWSER_ENGINE_URL);
await engine.storage.initializeStorage();

test('the actual bundled browser engine starts with no Node server or saved workspace data', async () => {
  const app = await engine.startEngine();
  const status = await app.fetch(new Request('https://webygram.test/api/tg/status'));
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.isConnected, false); assert.equal(body.hasSavedSession, false); assert.equal(body.vaultCount, 0);
  const missingPhone = await app.fetch(new Request('https://webygram.test/api/tg/auth/send-code', { method: 'POST', body: '{}' }));
  assert.equal(missingPhone.status, 400);
  const qr = await app.fetch(new Request('https://webygram.test/api/tg/auth/qr-status'));
  assert.equal(qr.status, 200); assert.equal((await qr.json()).status, 'idle');
  const vault = await app.fetch(new Request('https://webygram.test/api/tg/vault'));
  assert.equal(vault.status, 200);
});

test('bundled GramJS uploads native files over 20 MB and stored vault paths without Node fs', async () => {
  const tg = new engine.TelegramClient(new engine.StringSession(''), 2040, 'test', { useWSS: true });
  let total = 0;
  tg.getSender = async () => ({ send: async request => { total += request.bytes.length; assert.ok(request.bytes.every(byte => byte === 7)); return true; } });
  const bytes = new Uint8Array(21 * 1024 * 1024).fill(7);
  const file = new engine.BrowserFile('large.bin', bytes.length, '', bytes);
  await tg.uploadFile({ file, workers: 2 });
  assert.equal(total, bytes.length);
  engine.storage.writeFileSync('/vault/upload.bin', bytes.subarray(0, 100003));
  total = 0;
  await tg.uploadFile({ file: new engine.BrowserFile('upload.bin', 100003, '/vault/upload.bin'), workers: 1 });
  assert.equal(total, 100003);
});

test('bundled GramJS writes all cached-photo bytes through the atomic browser writer', async () => {
  const { Api } = engine;
  const tg = new engine.TelegramClient(new engine.StringSession(''), 2040, 'test', { useWSS: true });
  const bytes = Buffer.alloc(100003, 19);
  const media = new Api.MessageMediaPhoto({ photo: new Api.Photo({ id: 1n, accessHash: 1n,
    fileReference: Buffer.alloc(0), date: 0, dcId: 2,
    sizes: [new Api.PhotoCachedSize({ type: 'x', w: 100, h: 100, bytes })] }) });
  await engine.storage.atomicDownload('/vault/download.jpg', writer => tg.downloadMedia(media, { outputFile: writer }));
  assert.deepEqual(await engine.storage.promises.readFile('/vault/download.jpg'), bytes);
});

test('browser Opus worker produces real OGG pages with an end-of-stream marker', async () => {
  const source = fs.readFileSync(new URL('../node_modules/opus-recorder/dist/encoderWorker.min.js', import.meta.url), 'utf8');
  globalThis.Worker = class {
    constructor() {
      this.context = vm.createContext({ self: { location: { href: 'https://webygram.test/encoder.js' } },
        importScripts() {}, console, performance, atob, TextDecoder, WebAssembly, setTimeout, clearTimeout,
        postMessage: data => queueMicrotask(() => this.onmessage?.({ data })), close() {} });
      vm.runInContext(source, this.context);
    }
    postMessage(data) { this.context.onmessage({ data }); }
    terminate() {}
  };
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i * 2 * Math.PI * 440 / 48000) * 0.2);
  const bytes = await engine.encodeOpus(samples, 48000);
  assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
  assert.ok(bytes.includes(Buffer.from('OpusHead')));
  let offset = 0, pages = 0, end = false;
  while (offset < bytes.length) {
    assert.equal(bytes.subarray(offset, offset + 4).toString(), 'OggS');
    end = Boolean(bytes[offset + 5] & 4);
    const count = bytes[offset + 26];
    const size = bytes.subarray(offset + 27, offset + 27 + count).reduce((a, b) => a + b, 0);
    offset += 27 + count + size; pages++;
  }
  assert.equal(offset, bytes.length); assert.ok(pages >= 4); assert.ok(end);
});
