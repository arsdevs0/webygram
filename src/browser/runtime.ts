import './globals';
import { initializeStorage } from './storage';
let engine: { fetch(request: Request): Promise<Response> };
let initializing: Promise<void> | undefined;

export function initializeDirectTelegram() {
  return initializing ||= (async () => {
    if (!navigator.serviceWorker) throw new Error('Open the app over HTTPS in a browser that supports service workers.');
    if (navigator.locks) await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('webygram-direct-engine', { ifAvailable: true }, async lock => {
        if (!lock) { reject(new Error('Webygram is already open in another tab. Close that tab, then retry here.')); return; }
        resolve();
        await new Promise(() => {}); // The browser releases this lock when the tab closes.
      }).catch(reject);
    });
    await initializeStorage();
    const { startEngine } = await import('virtual:telegram-engine');
    engine = await startEngine();
    navigator.serviceWorker.addEventListener('message', async event => {
      if (event.data?.type !== 'TELEGRAM_MEDIA_REQUEST' || !event.ports[0]) return;
      const port = event.ports[0];
      const { url, method, headers } = event.data;
      const target = new URL(url);
      if (target.origin !== location.origin || !target.pathname.startsWith('/api/')) { port.close(); return; }
      const abort = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      port.onmessage = async message => {
        try {
          if (message.data === 'cancel') { abort.abort(); await reader?.cancel(); port.close(); }
          if (message.data === 'pull' && reader) {
            const { done, value } = await reader.read();
            if (done) { port.postMessage({ done: true }); port.close(); }
            else { const bytes = new Uint8Array(value); port.postMessage({ bytes }, [bytes.buffer]); }
          }
        } catch { port.postMessage({ error: 'Media stream interrupted. Retry the download.' }); port.close(); }
      };
      try {
        const response = await engine.fetch(new Request(url, { method, headers, signal: abort.signal }));
        reader = response.body?.getReader();
        port.postMessage({ status: response.status, headers: [...response.headers], empty: !reader });
      } catch { port.postMessage({ status: 503, headers: [], empty: true }); port.close(); }
    });
    await navigator.serviceWorker.register('/telegram-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Reload to activate local media handling.')), 10000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  })();
}
export async function directFetch(request: Request) {
  await initializeDirectTelegram();
  return engine.fetch(request);
}
