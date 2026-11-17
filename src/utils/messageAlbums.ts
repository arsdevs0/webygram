import type { TelegramMessage } from '../types/telegram.ts';
export function groupTimelineMessages(messages: TelegramMessage[]): TelegramMessage[][] {
  const groups: TelegramMessage[][] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    const first = previous?.[0];
    const canGroup = Boolean(message.groupedId && message.media && ['photo', 'video', 'gif'].includes(message.media.type) && !message.media.isDisappearing && !message.isDeletedBySender);
    if (canGroup && first && first.groupedId === message.groupedId && first.chatId === message.chatId && first.senderId === message.senderId && !first.media?.isDisappearing && !first.isDeletedBySender) previous!.push(message);
    else groups.push([message]);
  }
  return groups;
}
export function albumForwardSelection(messages: TelegramMessage[], selected: TelegramMessage): TelegramMessage[] {
  return selected.groupedId ? messages.filter(message => message.groupedId === selected.groupedId && message.chatId === selected.chatId && !message.isPending && !message.isDeletedBySender) : [selected];
}
