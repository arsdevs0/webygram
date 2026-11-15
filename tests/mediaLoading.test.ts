import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseThumbnail, imageMime, withFreshMedia } from '../src/server/mediaLoading.ts';

test('expired Telegram references refresh once and use the new message', async () => {
  const attempts: number[] = [];
  let refreshes = 0;
  const result = await withFreshMedia(1, async source => {
    attempts.push(source);
    if (source === 1) throw new Error('400: FILE_REFERENCE_0_EXPIRED');
    return 'image bytes';
  }, async () => { refreshes++; return 2; });
  assert.equal(result, 'image bytes');
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(refreshes, 1);
});

test('media retry is bounded and unrelated download failures are preserved', async () => {
  let refreshes = 0;
  await assert.rejects(withFreshMedia(1, async () => { throw new Error('FILE_REFERENCE_EXPIRED'); }, async () => { refreshes++; return 2; }), /FILE_REFERENCE_EXPIRED/);
  assert.equal(refreshes, 1);
  await assert.rejects(withFreshMedia(1, async () => { throw new Error('network unavailable'); }, async () => { refreshes++; return 2; }), /network unavailable/);
  assert.equal(refreshes, 1);
});

test('thumbnail size selection ignores order and avoids tiny stripped previews', () => {
  const sizes = [{ w: 1600, h: 900 }, { w: 90, h: 50 }, { w: 800, h: 450 }, { w: 320, h: 180 }];
  assert.deepEqual(chooseThumbnail(sizes), { w: 800, h: 450 });
  assert.deepEqual(chooseThumbnail(sizes.slice(1).filter(s => s.w < 640)), { w: 320, h: 180 });
  assert.equal(chooseThumbnail([{ w: 0, h: 0 }]), undefined);
  assert.equal(sizes[0].w, 1600);
});

test('thumbnail response MIME follows bytes; error posters and videos are not cached as images', () => {
  assert.equal(imageMime(Buffer.from([255, 216, 255])), 'image/jpeg');
  assert.equal(imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageMime(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(imageMime(Buffer.from('RIFFxxxxWEBP')), 'image/webp');
  assert.equal(imageMime(Buffer.from('<svg>placeholder</svg>')), undefined);
  assert.equal(imageMime(Buffer.from('xxxxftypmp42')), undefined);
});
