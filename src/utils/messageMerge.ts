import type { TelegramMessage } from '../types/telegram';

/** Preserve websocket arrivals and local sends while a history request is in flight. */
export function mergeMessagePage(existing: TelegramMessage[], incoming: TelegramMessage[], snapshot: TelegramMessage[]) {
  const byId = new Map(existing.map(message => [message.id, message]));
  const before = new Map(snapshot.map(message => [message.id, message]));
  const incomingIds = new Set(incoming.map(message => message.id));
  const oldestTimestamp = Math.min(...incoming.map(message => message.timestamp));
  for (const message of incoming) {
    // A websocket edit, read receipt or deletion wins over an older HTTP response.
    const current = byId.get(message.id);
    if ((before.has(message.id) || current) && current !== before.get(message.id)) continue;
    byId.set(message.id, current?.isDeletedBySender || current?.isSavedFromTTL ? {
      ...message,
      isDeletedBySender: current.isDeletedBySender,
      deletedAt: current.deletedAt,
      isSavedFromTTL: current.isSavedFromTTL,
    } : message);
  }
  return [...byId.values()].filter(message =>
    message.isPending || message.isDeletedBySender || message.isSavedFromTTL || incomingIds.has(message.id) ||
    incoming.length === 0 || message.timestamp < oldestTimestamp || before.get(message.id) !== message
  ).sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id));
}
