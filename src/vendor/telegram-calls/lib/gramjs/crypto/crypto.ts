export function randomBytes(count: number): Uint8Array<ArrayBuffer> { return crypto.getRandomValues(new Uint8Array(count)); }
export function createHash(name: string) {
  const chunks: Uint8Array[] = [];
  return { update: (data: Uint8Array) => { chunks.push(new Uint8Array(data)); }, digest: async (): Promise<Uint8Array<ArrayBuffer>> => {
    const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0)); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new Uint8Array(await crypto.subtle.digest(name.toLowerCase() === "sha1" ? "SHA-1" : "SHA-256", bytes));
  } };
}
