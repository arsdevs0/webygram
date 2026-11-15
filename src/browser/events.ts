const peers = new Set<LocalSocket>();
export const engineSocket = { readyState: 1, send(data: string) { for (const peer of peers) peer.onmessage?.({ data } as MessageEvent); } };
export class LocalSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor() { peers.add(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
  send(data: string) { if (JSON.parse(data).type === 'PING') this.onmessage?.({ data: '{"type":"PONG"}' } as MessageEvent); }
  close() { peers.delete(this); this.readyState = 3; this.onclose?.(); }
}
