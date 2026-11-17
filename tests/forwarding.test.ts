import assert from 'node:assert/strict';
import test from 'node:test';
import { Api } from 'telegram';
import { normalizeForwardRequest, isForwardRestriction } from '../src/utils/forwardOptions.ts';
import { createForwardJob, runForwardJob } from '../src/server/messageForwarding.ts';
const request = (extra: any = {}) => normalizeForwardRequest({ fromChatId: 'source', toChatIds: ['a', 'b'], messageIds: [3, 1, 2], ...extra });
const peer = async (id: string) => id;
const client = (invoke: (req: any) => Promise<any>) => ({ getInputEntity: async (id: any) => ({ className: 'InputPeerSelf', tag: id }), invoke });
test('forward selection is deduplicated and sorted to preserve message/album order', () => {
  const r = request({ toChatIds: ['a', 'a', 'b'], messageIds: [3, 1, 3, 2], hideCaptions: true });
  assert.deepEqual(r.messageIds, [1, 2, 3]); assert.deepEqual(r.toChatIds, ['a', 'b']); assert.equal(r.hideSenderTag, true);
  assert.equal(request({ hideSenderTag: false }).hideSenderTag, false);
});
test('invalid message IDs, empty destinations, invalid dates and oversized comments are rejected', () => {
  for (const messageIds of [[0], [-1], [1.5], ['pending'], [2147483648]]) assert.throws(() => request({ messageIds }));
  assert.throws(() => request({ toChatIds: [] })); assert.throws(() => request({ scheduleDate: NaN }));
  assert.throws(() => request({ scheduleDate: Math.floor(Date.now() / 1000) - 1 }));
  assert.throws(() => request({ comment: 'x'.repeat(4097) }));
});
test('native requests forward captions, authors, silent/schedule flags and comment in order', async () => {
  const calls: any[] = [], date = Math.floor(Date.now() / 1000) + 600;
  const job = createForwardJob(request({ toChatIds: ['a'], hideCaptions: true, silent: true, scheduleDate: date, comment: 'hello' }));
  const result = await runForwardJob(job, client(async r => { calls.push(r); }), peer);
  assert.equal(result.ok, true); assert.equal(calls.length, 2);
  assert.ok(calls[0] instanceof Api.messages.SendMessage); assert.equal(calls[0].message, 'hello');
  assert.ok(calls[1] instanceof Api.messages.ForwardMessages); assert.deepEqual(calls[1].id, [1, 2, 3]);
  for (const r of calls) { assert.equal(r.silent, true); assert.equal(r.scheduleDate, date); }
  assert.equal(calls[1].dropAuthor, true); assert.equal(calls[1].dropMediaCaptions, true);
});
test('partial failures keep completed destinations and retry only the failed destination', async () => {
  const calls: string[] = []; let fail = true;
  const tg = client(async r => { calls.push(r.toPeer.tag); if (r.toPeer.tag === 'b' && fail) throw new Error('CHAT_WRITE_FORBIDDEN'); });
  const job = createForwardJob(request()); const first = await runForwardJob(job, tg, peer);
  assert.equal(first.ok, false); assert.deepEqual(first.targets.map(t => t.complete), [true, false]);
  fail = false; const second = await runForwardJob(job, tg, peer);
  assert.equal(second.ok, true); assert.deepEqual(calls, ['a', 'b', 'b']);
});
test('uncertain network retries reuse Telegram random IDs and do not repeat the comment', async () => {
  const forwardIds: string[][] = []; let comments = 0, fail = true;
  const tg = client(async r => { if (r instanceof Api.messages.SendMessage) { comments++; return; }
    forwardIds.push(r.randomId.map(String)); if (fail) throw new Error('timeout after submission'); });
  const job = createForwardJob(request({ toChatIds: ['a'], comment: 'context' }));
  await runForwardJob(job, tg, peer); fail = false; await runForwardJob(job, tg, peer);
  assert.equal(comments, 1); assert.deepEqual(forwardIds[0], forwardIds[1]);
});
test('large selections chunk requests at 100 and retain successful chunks on retry', async () => {
  const sizes: number[] = []; let fail = true;
  const tg = client(async r => { sizes.push(r.id.length); if (r.id[0] === 101 && fail) throw new Error('timeout'); });
  const job = createForwardJob(request({ toChatIds: ['a'], messageIds: Array.from({ length: 205 }, (_, i) => i + 1) }));
  const first = await runForwardJob(job, tg, peer); assert.equal(first.targets[0].deliveredMessageIds.length, 100);
  fail = false; await runForwardJob(job, tg, peer); assert.deepEqual(sizes, [100, 100, 100, 5]);
});
test('content-copy fallback only runs on the exact forward restriction and reports incomplete copies', async () => {
  let copies = 0;
  const job = createForwardJob(request({ toChatIds: ['a'] }));
  await runForwardJob(job, client(async () => { throw new Error('CHAT_WRITE_FORBIDDEN'); }), peer, async () => { copies++; });
  assert.equal(copies, 0);
  const first = await runForwardJob(job, client(async () => { throw new Error('CHAT_FORWARDS_RESTRICTED'); }), peer,
    async (_peer, id) => { if (id === 2) throw new Error('media missing'); copies++; });
  assert.equal(first.ok, false); assert.deepEqual(first.targets[0].deliveredMessageIds, [1]);
  assert.equal(isForwardRestriction({ errorMessage: 'CHAT_FORWARDS_RESTRICTED' }), true);
});
test('concurrent retries share one delivery operation', async () => {
  let calls = 0; const job = createForwardJob(request({ toChatIds: ['a'] }));
  const tg = client(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); });
  const results = await Promise.all([runForwardJob(job, tg, peer), runForwardJob(job, tg, peer)]);
  assert.equal(calls, 1); assert.equal(results[0], results[1]);
});
