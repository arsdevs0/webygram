/** Telegram can invalidate a file reference while the cached message stays valid. */
export async function withFreshMedia<T, R>(message: T, download: (message: T) => Promise<R>, refresh: () => Promise<T | undefined>): Promise<R> {
  try {
    return await download(message);
  } catch (error) {
    const reason = String((error as Error)?.message || error);
    if (!/FILE_REFERENCE_(?:\d+_)?(?:EXPIRED|INVALID|EMPTY)/i.test(reason)) throw error;
    const fresh = await refresh();
    if (!fresh) throw error;
    return download(fresh);
  }
}

/** Prefer a real 640px preview, independently of Telegram's size ordering. */
export function chooseThumbnail<T extends { w: number; h: number }>(sizes: T[]): T | undefined {
  const sorted = sizes.filter(s => s.w > 0 && s.h > 0).sort((a, b) => Math.max(a.w, a.h) - Math.max(b.w, b.h));
  return sorted.find(s => Math.max(s.w, s.h) >= 640) || sorted.at(-1);
}

export function imageMime(bytes: Buffer): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}
