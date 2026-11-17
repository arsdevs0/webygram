
export interface ForwardOptions {
  hideSenderTag?: boolean; hideCaptions?: boolean; silent?: boolean;
  comment?: string; scheduleDate?: number;
}
export interface ForwardRequest extends ForwardOptions {
  fromChatId: string; toChatIds: string[]; messageIds: number[];
}
export interface ForwardTargetResult { chatId: string; deliveredMessageIds: number[]; complete: boolean; error?: string }
export interface ForwardBatchResult { ok: boolean; count: number; targets: ForwardTargetResult[] }
export function normalizeForwardRequest(raw: any, now = Date.now()): ForwardRequest {
  const fromChatId = String(raw.fromChatId || '').trim();
  const toChatIds: string[] = [...new Set<string>(Array.isArray(raw.toChatIds) ? raw.toChatIds.map((id: unknown) => String(id).trim()).filter(Boolean) : [])];
  const ids: number[] = Array.isArray(raw.messageIds) ? raw.messageIds.map(Number) : [];
  if (!fromChatId || !ids.length) throw new Error('Select at least one message to forward.');
  if (!toChatIds.length) throw new Error('Select at least one destination.');
  if (toChatIds.length > 100 || ids.length > 1000) throw new Error('Select up to 100 chats and 1000 messages at a time.');
  if (ids.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647)) throw new Error('Pending or unavailable messages cannot be forwarded.');
  const scheduleDate = raw.scheduleDate == null ? undefined : Number(raw.scheduleDate);
  if (scheduleDate !== undefined && (!Number.isInteger(scheduleDate) || scheduleDate <= Math.floor(now / 1000))) throw new Error('Choose a future time to schedule these messages.');
  if (scheduleDate !== undefined && scheduleDate > Math.floor(now / 1000) + 366 * 86400) throw new Error('Choose a time within the next year.');
  const comment = String(raw.comment || '').trim();
  if (comment.length > 4096) throw new Error('The comment is too long (maximum 4096 characters).');
  const hideCaptions = raw.hideCaptions === true;
  return { fromChatId, toChatIds, messageIds: [...new Set(ids)].sort((a, b) => a - b),
    hideSenderTag: raw.hideSenderTag === true || hideCaptions, hideCaptions,
    silent: raw.silent === true, comment, scheduleDate };
}
export function isForwardRestriction(error: unknown): boolean {
  return /CHAT_FORWARDS_RESTRICTED/.test(String((error as { errorMessage?: string })?.errorMessage || (error as Error)?.message || error));
}
