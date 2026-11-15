import { Buffer } from 'buffer';

type RecordEntry = { path: string; blob: Blob; head: Uint8Array; updated: number };
const records = new Map<string, RecordEntry>();
const metadata = new Map<string, Buffer>();
const pending = new Set<Promise<void>>();
let database: IDBDatabase;
let storageError: Error | undefined;
const key = (value: string) => String(value).replaceAll('\\', '/');
const ready = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
export async function initializeStorage() {
  database?.close();
  records.clear(); metadata.clear(); storageError = undefined;
  const request = indexedDB.open('webygram-local-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'path' });
  database = await ready(request);
  const transaction = database.transaction('files', 'readonly');
  const values = await ready(transaction.objectStore('files').getAll()) as RecordEntry[];
  for (const entry of values) {
    records.set(entry.path, entry);
    if (/\.json(?:$|\.)/.test(entry.path)) metadata.set(entry.path, Buffer.from(await entry.blob.arrayBuffer()));
  }
}
function persist(entry: RecordEntry | string) {
  const job = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    if (typeof entry === 'string') store.delete(entry); else store.put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage write was cancelled.'));
  });
  pending.add(job);
  void job.catch(error => { storageError = error; window.dispatchEvent(new CustomEvent('webygram-storage-error')); }).finally(() => pending.delete(job));
}
export async function flushStorage() {
  await Promise.all([...pending]);
  if (storageError) throw new Error('Browser storage could not save data. Free some site storage and retry.');
}
function requireRecord(file: string) {
  const entry = records.get(key(file));
  if (!entry) throw new Error('Local file does not exist: ' + file);
  return entry;
}
export function writeFileSync(file: string, data: string | Uint8Array) {
  const name = key(file);
  const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  const entry: RecordEntry = { path: name, blob: new Blob([new Uint8Array(bytes)]), head: new Uint8Array(bytes.subarray(0, 64)), updated: Date.now() };
  records.set(name, entry);
  if (/\.json(?:$|\.)/.test(name)) metadata.set(name, bytes);
  persist(entry);
}
export function readFileSync(file: string, encoding?: string): any {
  const name = key(file);
  const bytes = metadata.get(name) || Buffer.from(requireRecord(name).head);
  if (!encoding && !metadata.has(name) && requireRecord(name).blob.size > bytes.length) {
    // Synchronous binary reads in the shared engine only inspect media magic bytes.
    return bytes;
  }
  return encoding ? bytes.toString(encoding as BufferEncoding) : bytes;
}
export function existsSync(file: string) { return records.has(key(file)); }
export function statSync(file: string) { const r = requireRecord(file); return { size: r.blob.size, mtimeMs: r.updated, isFile: () => true, isDirectory: () => false }; }
export const lstatSync = statSync;
// GramJS checks this constructor even when its output is our atomic writer.
export class WriteStream {}
export function unlinkSync(file: string) { records.delete(key(file)); metadata.delete(key(file)); persist(key(file)); }
export function renameSync(from: string, to: string) {
  const record = requireRecord(from);
  const next = { ...record, path: key(to) };
  records.set(key(to), next);
  if (metadata.has(key(from))) metadata.set(key(to), metadata.get(key(from))!);
  persist(next); unlinkSync(from);
}
export const mkdirSync = () => {};
export const accessSync = () => {};
export const constants = { W_OK: 2 };
export const openSync = (file: string) => key(file);
export function readSync(file: string, target: Uint8Array, offset: number, length: number, position: number) {
  const head = requireRecord(file).head.subarray(position, position + length); target.set(head, offset); return head.length;
}
export const closeSync = () => {};
export const promises = {
  async readFile(file: string) { return Buffer.from(await requireRecord(file).blob.arrayBuffer()); },
  async stat(file: string) { return statSync(file); },
  async lstat(file: string) { return statSync(file); },
  async unlink(file: string) { unlinkSync(file); await flushStorage(); },
  async rename(from: string, to: string) { renameSync(from, to); await flushStorage(); },
  async open(file: string) {
    const blob = requireRecord(file).blob;
    return { async read(buffer: Uint8Array, offset: number, length: number, position: number) {
      const bytes = new Uint8Array(await blob.slice(position, position + length).arrayBuffer()); buffer.set(bytes, offset); return { bytesRead: bytes.length, buffer };
    }, async close() {} };
  },
};
export function createReadStream(file: string, options?: { start: number; end: number }) {
  let cancelled = false;
  const listeners = new Map<string, (error?: Error) => void>();
  const stream = {
    once(event: string, callback: (error?: Error) => void) { listeners.set(event, callback); return stream; },
    destroy() { cancelled = true; },
    pipe(response: any) {
      void (async () => {
        try {
          const blob = requireRecord(file).blob;
          const part = options ? blob.slice(options.start, options.end + 1) : blob;
          const reader = part.stream().getReader();
          try {
            while (!cancelled && !response.destroyed) {
              const { done, value } = await reader.read(); if (done) break;
              if (!response.write(value)) await new Promise<void>(resolve => {
                const done = () => { response.off('drain', done); response.off('close', done); resolve(); };
                response.once('drain', done); response.once('close', done);
              });
            }
            if (!cancelled && !response.destroyed) response.end();
          } finally { await reader.cancel(); }
        } catch (error) { listeners.get('error')?.(error as Error); response.destroy(error); }
      })();
      return response;
    },
  };
  return stream;
}
export async function atomicDownload(file: string, download: (writer: any) => Promise<unknown>) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  await download({ write: async (bytes: Uint8Array) => { chunks.push(new Uint8Array(bytes)); }, close() {} });
  const blob = new Blob(chunks);
  if (!blob.size) throw new Error('Empty media download');
  const entry = { path: key(file), blob, head: new Uint8Array(await blob.slice(0, 64).arrayBuffer()), updated: Date.now() };
  records.set(entry.path, entry); persist(entry); await flushStorage(); return blob.size;
}
export default { writeFileSync, readFileSync, existsSync, statSync, lstatSync, WriteStream, unlinkSync, renameSync, mkdirSync, accessSync, constants, openSync, readSync, closeSync, promises, createReadStream };
