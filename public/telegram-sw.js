// Only transports same-origin media to the open app tab. No credentials or media
// are cached in the service worker and no /api request is sent to Vercel.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(event.request.method)) return;
  event.respondWith((async () => {
    let client = event.clientId ? await self.clients.get(event.clientId) : undefined;
    if (!client) client = (await self.clients.matchAll({ type: 'window', includeUncontrolled: false })).find(item => item.visibilityState === 'visible');
    if (!client) return new Response('Keep Webygram open to load Telegram media.', { status: 503 });
    return new Promise(resolve => {
      const channel = new MessageChannel();
      let streamController;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; channel.port1.postMessage('cancel'); channel.port1.close(); resolve(new Response('Media request timed out. Retry.', { status: 504 })); }
      }, 45000);
      channel.port1.onmessage = ({ data }) => {
        if (data.network) {
          settled = true; clearTimeout(timer); channel.port1.close(); resolve(fetch(event.request));
        } else if (data.status) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          const stream = data.empty ? null : new ReadableStream({
            start(controller) { streamController = controller; },
            pull() { channel.port1.postMessage('pull'); },
            cancel() { channel.port1.postMessage('cancel'); channel.port1.close(); },
          });
          resolve(new Response(stream, { status: data.status, headers: data.headers }));
          if (data.empty) channel.port1.close();
        } else if (data.bytes) streamController.enqueue(data.bytes);
        else if (data.done) { streamController.close(); channel.port1.close(); }
        else if (data.error) { streamController?.error(new Error(data.error)); channel.port1.close(); }
      };
      client.postMessage({ type: 'TELEGRAM_MEDIA_REQUEST', url: event.request.url, method: event.request.method, headers: [...event.request.headers] }, [channel.port2]);
    });
  })());
});
