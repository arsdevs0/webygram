import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMessagePage } from '../src/utils/messageMerge.ts';
import type { TelegramMessage } from '../src/types/telegram.ts';

const message = (id: string, timestamp = 1000, extra: Partial<TelegramMessage> = {}): TelegramMessage => ({
  id, timestamp, chatId: 'test', senderId: '1', senderName: 'Test', text: id,
  isOutgoing: false, isRead: false, ...extra,
});

test('retains websocket arrivals with the same second-resolution timestamp as the fetched page', () => {
  const initial = message('1');
  const arrived = message('2');
  assert.deepEqual(mergeMessagePage([initial, arrived], [initial], [initial]).map(m => m.id), ['1', '2']);
});
test('a stale history response cannot undo a live edit or a read receipt', () => {
  const initial = message('1');
  const edited = { ...initial, text: 'edited', isRead: true };
  assert.equal(mergeMessagePage([edited], [{ ...initial }], [initial])[0], edited);
});
test('a stale response cannot resurrect a message deleted during the request', () => {
  const initial = message('1');
  assert.deepEqual(mergeMessagePage([], [initial], [initial]), []);
});
test('preserves anti-delete and TTL vault flags across refreshes', () => {
  const kept = message('1', 1000, { isDeletedBySender: true, deletedAt: 2000, isSavedFromTTL: true });
  const refreshed = mergeMessagePage([kept], [message('1')], [kept])[0];
  assert.equal(refreshed.isDeletedBySender, true);
  assert.equal(refreshed.isSavedFromTTL, true);
  assert.equal(refreshed.deletedAt, 2000);
  assert.deepEqual(mergeMessagePage([kept], [message('2')], [kept]).map(m => m.id), ['1', '2']);
});
test('keeps older history and pending sends, removes missing messages inside the refreshed page', () => {
  const older = message('1', 500);
  const removed = message('2', 1500);
  const pending = message('pending', 2500, { isPending: true });
  const initial = [older, removed, pending];
  assert.deepEqual(mergeMessagePage(initial, [message('3', 1000), message('4', 2000)], initial).map(m => m.id), ['1', '3', '4', 'pending']);
});
test('empty and out-of-order pages preserve cached history without duplicates', () => {
  const initial = [message('1', 500)];
  assert.deepEqual(mergeMessagePage(initial, [], initial), initial);
  assert.deepEqual(mergeMessagePage(initial, [message('3', 2000), message('2', 1000), message('2', 1000)], initial).map(m => m.id), ['1', '2', '3']);
});
