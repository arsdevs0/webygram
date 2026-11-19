import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { startMediaReceipt, mediaSecondsRemaining, VIEW_ONCE_SECONDS } from '../src/utils/mediaReceipt.ts';
import { sendMediaSeenReceipt } from '../src/server/mediaReceipts.ts';

test('timed media starts on content receipt and never resets on duplicate receipts', () => {
  const original = { isDisappearing: true, expireSeconds: 5 };
  assert.equal(mediaSecondsRemaining(original, 1000), null);
  const opened = startMediaReceipt(original, 1000);
  assert.equal(opened.expiresAt, 6000);
  assert.equal(startMediaReceipt(opened, 3000).expiresAt, 6000);
  assert.equal(mediaSecondsRemaining(opened, 3100), 3);
  assert.equal(mediaSecondsRemaining(opened, 9000), 0);
  assert.equal(Object.hasOwn(original, 'viewed'), false);
});

test('view-once and ordinary media do not start a seconds countdown', () => {
  for (const media of [{ isDisappearing: true, expireSeconds: VIEW_ONCE_SECONDS }, { isDisappearing: false }]) {
    const opened = startMediaReceipt(media, 1000);
    assert.equal(opened.viewed, true);
    assert.equal(opened.expiresAt, undefined);
    assert.equal(mediaSecondsRemaining(opened, 5000), null);
  }
});

test('failed content receipt rejects without attempting history read', async () => {
  const calls: any[] = [];
  await assert.rejects(sendMediaSeenReceipt({ invoke: async request => { calls.push(request); throw Error('offline'); } }, new Api.InputPeerSelf(), 7), /offline/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof Api.messages.ReadMessageContents);
});

test('successful content read remains accurate when history read fails', async () => {
  const calls: any[] = [];
  const result = await sendMediaSeenReceipt({ invoke: async request => { calls.push(request); if (calls.length === 2) throw Error('history failed'); return true; } }, new Api.InputPeerSelf(), 7);
  assert.equal(result.contentsSeen, true);
  assert.equal(result.historyRead, false);
  assert.ok(result.readAt > 0);
});

test('channel contents use the channel RPC before reading history', async () => {
  const calls: any[] = [];
  const result = await sendMediaSeenReceipt({ invoke: async request => { calls.push(request); return true; } }, new Api.InputPeerChannel({ channelId: bigInt(42), accessHash: bigInt(99) }), 7);
  assert.ok(calls[0] instanceof Api.channels.ReadMessageContents);
  assert.ok(calls[1] instanceof Api.channels.ReadHistory);
  assert.equal(result.historyRead, true);
});
