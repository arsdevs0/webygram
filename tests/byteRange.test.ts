import assert from 'node:assert/strict';
import test from 'node:test';
import { parseByteRange } from '../src/utils/byteRange.ts';

test('serves bounded, open-ended, and suffix ranges used by video players', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange('bytes=0-999', 100), { start: 0, end: 99 });
});
test('caps playback chunks while allowing a complete download', () => {
  assert.deepEqual(parseByteRange('bytes=50-', 1000, 100), { start: 50, end: 149 });
  assert.deepEqual(parseByteRange('bytes=0-', 1000), { start: 0, end: 999 });
});
test('rejects invalid, multipart, overflowing and unsatisfiable ranges', () => {
  for (const header of ['bytes=-', 'bytes=-0', 'bytes=100-', 'bytes=40-20', 'bytes=0-1,4-5', 'items=0-9', 'bytes=9007199254740992-']) {
    assert.equal(parseByteRange(header, 100), null, header);
  }
  assert.equal(parseByteRange('bytes=0-', 0), null);
});
