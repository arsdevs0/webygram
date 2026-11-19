export const VIEW_ONCE_SECONDS = 0x7fffffff;
export interface ReceiptMedia { isDisappearing?: boolean; expireSeconds?: number; viewed?: boolean; expiresAt?: number; isExpired?: boolean; }
export function startMediaReceipt<T extends ReceiptMedia>(media: T, readAt = Date.now()): T & ReceiptMedia {
  const seconds = media.expireSeconds || 5;
  return { ...media, viewed: true, ...(media.isDisappearing && seconds !== VIEW_ONCE_SECONDS
    ? { expiresAt: media.expiresAt ?? readAt + seconds * 1000 } : {}) };
}
export function mediaSecondsRemaining(media?: ReceiptMedia | null, now = Date.now()): number | null {
  if (!media?.isDisappearing || media.expireSeconds === VIEW_ONCE_SECONDS || !media.expiresAt) return null;
  return Math.max(0, Math.ceil((media.expiresAt - now) / 1000));
}
