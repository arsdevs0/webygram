import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
test('Vercel SPA routing preserves real voice, icon, manifest and license assets', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const spa = new RegExp('^' + config.rewrites[0].source + '$');
  for (const path of ['/voice/llvc-v1.onnx', '/voice/llvc-v1.json', '/voice/neural-bridge.worklet.js', '/voice/ort/ort-wasm-simd-threaded.mjs', '/voice/ort/ort-wasm-simd-threaded.wasm', '/icons/icon-192.png', '/manifest.webmanifest', '/webygram-logo.svg', '/telegram-doodles.svg', '/licenses/LLVC-MIT.txt']) {
    assert.equal(spa.test(path), false, path + ' must not serve HTML');
    assert.ok(fs.existsSync(new URL('../public' + path, import.meta.url)));
  }
  assert.equal(spa.test('/'), true); assert.equal(spa.test('/chat/123'), true);
  assert.equal(spa.test('/api/tg/status'), false);
});
test('shipped neural model bytes match the manifest used to validate cached downloads', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../public/voice/llvc-v1.json', import.meta.url), 'utf8'));
  const model = fs.readFileSync(new URL('../public/voice/llvc-v1.onnx', import.meta.url));
  assert.equal(model.length, manifest.modelBytes);
  assert.equal(crypto.createHash('sha256').update(model).digest('hex'), manifest.sha256);
  assert.equal(manifest.sampleRate, 16000); assert.equal(manifest.chunkSamples, 832);
});
