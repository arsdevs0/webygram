import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';

test('real gateway isolates visitors, persists profiles, and protects private files', { timeout: 45000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tgplus-gateway-test-'));
  let child;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });
  const start = async () => {
    child = fork(path.resolve('build/gateway.mjs'), [], {
      env: { ...process.env, NODE_ENV: 'production', DATA_DIR: root, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    });
    const ready = await Promise.race([
      once(child, 'message').then(([m]) => m),
      once(child, 'exit').then(() => { throw new Error('Gateway exited before ready'); }),
    ]);
    assert.equal(ready.type, 'GATEWAY_READY');
    return `http://127.0.0.1:${ready.port}`;
  };
  let base = await start();
  const open = async (cookie, marker) => {
    const response = await fetch(base + '/api/browser/session', {
      method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ marker }),
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly; SameSite=Strict/);
    return { ...(await response.json()), cookie: setCookie.split(';')[0] };
  };
  const a = await open();
  const b = await open();
  assert.notEqual(a.cookie, b.cookie);
  assert.equal((await fetch(base + '/api/tg/vault')).status, 401);
  assert.equal((await fetch(base + '/api/tg/vault', { headers: { cookie: a.cookie, origin: 'https://other.example' } })).status, 403);

  const aId = crypto.createHash('sha256').update(a.cookie.split('=')[1]).digest('hex');
  const vault = path.join(root, '.tgplus-browser-profiles', aId, 'data', '.tgplus-vault');
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(vault, 'vault-index.json'), JSON.stringify({ fixture: { id: 'only-browser-a', savedAt: 1 } }));
  const read = async browser => {
    const response = await fetch(base + '/api/tg/vault', { headers: { cookie: browser.cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    return response.json();
  };
  assert.equal((await read(a)).items[0].id, 'only-browser-a');
  assert.deepEqual((await read(b)).items, []);
  assert.deepEqual((await read(await open(undefined, a.marker))).items, []);
  assert.deepEqual((await read(await open(a.cookie, undefined))).items, []);

  await stop();
  base = await start();
  const restored = await open(a.cookie, a.marker);
  assert.equal(restored.cookie, a.cookie);
  assert.equal((await read(restored)).items[0].id, 'only-browser-a');
  // Production only serves the built public directory, never the workspace.
  const privateRequest = await fetch(base + '/.tgplus-session.json');
  assert.match(privateRequest.headers.get('content-type'), /text\/html/);
});
