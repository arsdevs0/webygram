// Public app shell only. Telegram credentials, /api responses and user media are never cached here.
const SHELL_CACHE = 'webygram-shell-v2';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/webygram-logo.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL_CACHE);
  // Make the launch page and install icons downloadable even on the first visit.
  await Promise.all(SHELL_FILES.map(async path => {
    try {
      const request = new Request(new URL(path, self.location.origin), { cache: 'reload' });
      const response = await fetch(request);
      if (response.ok && !response.redirected) await cache.put(path, response);
    } catch { /* Keep the working online app available if the connection drops. */ }
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('webygram-shell-') && key !== SHELL_CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && event.request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const immutable = /^\/(assets\/|voice\/ort\/)/.test(url.pathname);
    const publicFile = /^\/(icons\/|voice\/neural-bridge\.worklet\.js$|voice\/llvc-v1\.json$|webygram-logo\.svg$|telegram-doodles\.svg$|manifest\.webmanifest$)/.test(url.pathname);
    if (event.request.mode === 'navigate' || immutable || publicFile) event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const key = event.request.mode === 'navigate' ? '/' : event.request;
      if (immutable) { const cached = await cache.match(key); if (cached) return cached; }
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(key, response.clone());
        return response;
      } catch {
        return (await cache.match(key)) || new Response('Webygram is offline. Reconnect to use Telegram.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }
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
