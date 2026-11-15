import { LocalSocket } from '../browser/events';
const direct = import.meta.env.VITE_DIRECT_TELEGRAM === 'true';
export async function appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (!direct || url.origin !== location.origin || !url.pathname.startsWith('/api/')) return globalThis.fetch(input, init);
  const { directFetch } = await import('../browser/runtime');
  return directFetch(input instanceof Request ? new Request(input, init) : new Request(url, init));
}
export function createAppSocket(url: string): WebSocket {
  return direct ? new LocalSocket() as unknown as WebSocket : new WebSocket(url);
}
