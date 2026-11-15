import { CustomFile } from 'telegram/client/uploads';

// Native File lets GramJS upload a buffer of any size without opening an empty path.
export class BrowserFile {
  constructor(name: string, size: number, path: string, buffer?: Uint8Array) {
    return buffer ? new File([new Uint8Array(buffer)], name) : new CustomFile(name, size, path);
  }
}
