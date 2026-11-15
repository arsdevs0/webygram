import { Buffer } from 'buffer';
export const randomBytes = (size: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(size)));
export default { randomBytes };
