import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB, IDBDatabase } from 'fake-indexeddb';
import * as storage from '../src/browser/storage.ts';
import createRouter from '../src/browser/router.ts';

Object.assign(globalThis, { indexedDB, window: new EventTarget() });
await storage.initializeStorage();

test('browser vault persists all bytes and upload file slices across reload', async () => {
  const bytes = Buffer.alloc(1024 * 1024 + 37);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await storage.atomicDownload('/vault/video', async writer => {
    await writer.write(bytes.subarray(0, 1000));
    assert.equal(storage.existsSync('/vault/video'), false);
    await writer.write(bytes.subarray(1000));
  });
  storage.writeFileSync('/session.json.tmp', JSON.stringify({ session: 'disposable-test-session' }));
  storage.renameSync('/session.json.tmp', '/session.json');
  await storage.flushStorage();
  await storage.initializeStorage();
  assert.deepEqual(await storage.promises.readFile('/vault/video'), bytes);
  assert.equal((await storage.promises.lstat('/vault/video')).size, bytes.length);
  assert.equal(storage.readFileSync('/session.json', 'utf8'), '{"session":"disposable-test-session"}');
  const handle = await storage.promises.open('/vault/video');
  const target = Buffer.alloc(1700);
  const { bytesRead } = await handle.read(target, 0, 1700, 65500);
  assert.equal(bytesRead, 1700);
  assert.deepEqual(target, bytes.subarray(65500, 67200));
  await handle.close();
});

test('browser vault rejects partial and empty downloads', async () => {
  await assert.rejects(storage.atomicDownload('/vault/failed', async writer => {
    await writer.write(Buffer.from('partial')); throw new Error('Disconnected');
  }), /Disconnected/);
  assert.equal(storage.existsSync('/vault/failed'), false);
  await assert.rejects(storage.atomicDownload('/vault/empty', async () => {}), /Empty media/);
  assert.equal(storage.existsSync('/vault/empty'), false);
});

test('browser routes wait for middleware and handle JSON, errors, HEAD and ranged streams', async () => {
  const app = createRouter();
  app.use('/api', async (req, _res, next) => { assert.ok(req.path.startsWith('/')); next(); });
  app.post('/api/settings/:name', async (req, res) => {
    await Promise.resolve();
    storage.writeFileSync('/settings.json', JSON.stringify(req.body));
    res.json({ name: req.params.name, body: req.body, query: req.query.q });
  });
  app.get('/api/error', async () => { throw new Error('Expected failure'); });
  app.get('/api/media', (_req, res) => {
    res.status(206).setHeader('Content-Length', '100000');
    storage.createReadStream('/vault/video', { start: 60000, end: 159999 }).pipe(res);
  });
  const response = await app.fetch(new Request('https://app.test/api/settings/a%20b?q=yes', { method: 'POST', body: '{"enabled":true}' }));
  assert.deepEqual(await response.json(), { name: 'a b', body: { enabled: true }, query: 'yes' });
  const error = await app.fetch(new Request('https://app.test/api/error'));
  assert.equal(error.status, 500); assert.equal((await error.json()).error, 'Expected failure');
  const media = await app.fetch(new Request('https://app.test/api/media'));
  assert.equal(media.status, 206);
  const bytes = await storage.promises.readFile('/vault/video');
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes.subarray(60000, 160000));
  const head = await app.fetch(new Request('https://app.test/api/media', { method: 'HEAD' }));
  assert.equal(head.headers.get('Content-Length'), '100000'); assert.equal(await head.text(), '');
  const missing = await app.fetch(new Request('https://app.test/api/unknown'));
  assert.equal(missing.status, 404);
});

test('aborted requests reject promptly and cancelled streams stop producers', async () => {
  const app = createRouter();
  let closed = false;
  app.get('/stream', (_req, res) => { res.once('close', () => closed = true); res.write('first'); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(app.fetch(new Request('https://app.test/stream', { signal: controller.signal })), /abort/i);
  const response = await app.fetch(new Request('https://app.test/stream'));
  await response.body!.cancel(); assert.equal(closed, true);
});

test('storage failure is visible and never reported as successful persistence', async () => {
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () { throw new DOMException('Disk full', 'QuotaExceededError'); };
  let warned = false;
  window.addEventListener('webygram-storage-error', () => warned = true, { once: true });
  storage.writeFileSync('/failed.json', '{}');
  await assert.rejects(storage.flushStorage());
  assert.equal(warned, true);
  const app = createRouter(); app.get('/api/test', (_req, res) => res.json({ ok: true }));
  assert.equal((await app.fetch(new Request('https://app.test/api/test'))).status, 507);
  IDBDatabase.prototype.transaction = transaction;
  await storage.initializeStorage();
  assert.equal(storage.existsSync('/failed.json'), false);
  storage.unlinkSync('/session.json'); await storage.flushStorage(); await storage.initializeStorage();
  assert.equal(storage.existsSync('/session.json'), false);
});
