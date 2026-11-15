export type ByteRange = { start: number; end: number };

/** Only single byte ranges are served. Invalid and unsatisfiable ranges return null. */
export function parseByteRange(header: string, size: number, maxLength = Infinity): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return null;
  if (first === undefined && (!last || last <= 0)) return null;
  const start = first ?? Math.max(0, size - last!);
  const end = Math.min(first === undefined ? size - 1 : last ?? size - 1, size - 1, start + maxLength - 1);
  return start >= size || end < start ? null : { start, end };
}
