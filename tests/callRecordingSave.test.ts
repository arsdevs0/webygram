import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerCallRecordingRoutes } from '../src/server/callRecordings.ts';

test('recording save checks account ownership and deduplicates concurrent retries and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webygram-recording-test-'));
  let sent = 0;
  let handler: any;
  const session = { accountId: '12345', client: { connected: true, sendFile: async (recipient: string, options: any) => {
    assert.equal(recipient, 'me');
    assert.equal(options.silent, true);
    assert.ok(options.file.name.startsWith('Team VC — '));
    sent++;
    return { id: 456 };
  } } };
  const register = () => registerCallRecordingRoutes({ post: (_path: string, fn: any) => { handler = fn; } } as any, directory, () => session as any);
  const body = { id: '12345678-1234-1234-1234-123456789abc', accountId: '12345', name: 'Team VC', startedAt: Date.UTC(2026, 10, 15), duration: 30, fileDataUrl: 'data:audio/webm;codecs=opus;base64,YXVkaW8=' };
  const invoke = async (request = body) => {
    let status = 200; let result: any;
    const response = { status(code: number) { status = code; return this; }, json(value: any) { result = value; return this; } };
    await handler({ body: request }, response);
    return { status, result };
  };
  try {
    register();
    assert.equal((await invoke({ ...body, accountId: 'other' })).status, 409);
    assert.equal((await invoke({ ...body, id: '../../outside' })).status, 400);
    assert.equal(sent, 0);
    const responses = await Promise.all([invoke(), invoke()]);
    assert.ok(responses.every(response => response.status === 200 && response.result.messageId === '456'));
    assert.equal(sent, 1);
    register();
    assert.equal((await invoke()).result.messageId, '456');
    assert.equal(sent, 1);
  } finally {
    for (const name of await readdir(directory)) await unlink(join(directory, name));
    await rmdir(directory);
  }
});
