import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, stat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicDownload } from '../src/utils/atomicDownload.ts';

test('publishes every byte only after a multi-chunk download finishes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webygram-download-'));
  const file = join(dir, 'media.bin');
  try {
    const chunks = [Buffer.alloc(1024 * 1024, 3), Buffer.alloc(512 * 1024, 7)];
    const size = await atomicDownload(file, async writer => {
      for (const chunk of chunks) await writer.write(chunk);
      await assert.rejects(stat(file), { code: 'ENOENT' });
      writer.close();
    });
    assert.equal(size, 1536 * 1024);
    assert.deepEqual(await readFile(file), Buffer.concat(chunks));
    await assert.rejects(stat(`${file}.part`), { code: 'ENOENT' });
  } finally { await unlink(file).catch(() => {}); await unlink(`${file}.part`).catch(() => {}); await rmdir(dir); }
});
test('failed and empty downloads leave no partial or completed cache entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webygram-download-'));
  const file = join(dir, 'media.bin');
  try {
    await assert.rejects(atomicDownload(file, async writer => {
      await writer.write(Buffer.from('partial'));
      throw new Error('Disconnected');
    }), /Disconnected/);
    await assert.rejects(stat(file), { code: 'ENOENT' });
    await assert.rejects(stat(`${file}.part`), { code: 'ENOENT' });
    await assert.rejects(atomicDownload(file, async () => {}), /Empty media/);
    await assert.rejects(stat(`${file}.part`), { code: 'ENOENT' });
  } finally { await unlink(file).catch(() => {}); await unlink(`${file}.part`).catch(() => {}); await rmdir(dir); }
});
