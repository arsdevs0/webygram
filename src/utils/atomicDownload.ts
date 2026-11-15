import { createWriteStream } from 'node:fs';
import { rename, stat, unlink } from 'node:fs/promises';
import { finished } from 'node:stream/promises';

export interface DownloadWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): void;
}

/** Wait for disk writes to finish before making a cached download visible. */
export async function atomicDownload(path: string, download: (writer: DownloadWriter) => Promise<unknown>) {
  const partial = `${path}.part`;
  const stream = createWriteStream(partial);
  const completed = finished(stream);
  void completed.catch(() => {});
  const writer: DownloadWriter = {
    write: chunk => new Promise((resolve, reject) => {
      stream.write(chunk, error => error ? reject(error) : resolve());
    }),
    close: () => { if (!stream.writableEnded) stream.end(); },
  };
  try {
    await download(writer);
    writer.close();
    await completed;
    const { size } = await stat(partial);
    if (!size) throw new Error('Empty media download');
    await rename(partial, path);
    return size;
  } catch (error) {
    stream.destroy();
    await completed.catch(() => {});
    await unlink(partial).catch(() => {});
    throw error;
  }
}
