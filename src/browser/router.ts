import { Buffer } from 'buffer';
import { flushStorage, createReadStream } from './storage.ts';

type Handler = (request: any, response: any, next: () => Promise<void>) => unknown;
export default function createRouter() {
  const routes: { method: string; path: string; handler: Handler }[] = [];
  const middleware: { path: string; handler: Handler }[] = [];
  const app = {
    use(path: string | Handler, handler?: Handler) { middleware.push(typeof path === 'string' ? { path, handler: handler! } : { path: '', handler: path }); },
    get(path: string, handler: Handler) { routes.push({ method: 'GET', path, handler }); },
    post(path: string, handler: Handler) { routes.push({ method: 'POST', path, handler }); },
    delete(path: string, handler: Handler) { routes.push({ method: 'DELETE', path, handler }); },
    async fetch(input: Request) {
      input.signal.throwIfAborted();
      const url = new URL(input.url);
      const route = routes.find(r => (input.method === r.method || input.method === 'HEAD' && r.method === 'GET') && match(r.path, url.pathname));
      if (!route) return Response.json({ error: 'This action is not available in the browser client.' }, { status: 404 });
      const request = { params: match(route.path, url.pathname), query: Object.fromEntries(url.searchParams),
        headers: { ...Object.fromEntries(input.headers), 'x-profile-worker-key': 'browser' }, path: url.pathname,
        body: ['GET', 'HEAD'].includes(input.method) ? {} : await input.json().catch(() => ({})) };
      return new Promise<Response>(resolve => {
        let status = 200, started = false, ended = false, destroyed = false;
        const headers = new Headers({ 'Cache-Control': 'no-store' });
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const listeners = new Map<string, Set<(...args: any[]) => void>>();
        const emit = (name: string) => { for (const fn of [...listeners.get(name) || []]) fn(); };
        const cleanup = () => { input.signal.removeEventListener('abort', onAbort); emit('close'); listeners.clear(); };
        const stream = new ReadableStream<Uint8Array>({
          start(c) { controller = c; }, pull() { emit('drain'); },
          cancel() { destroyed = true; cleanup(); },
        });
        const start = () => { if (!started) { started = true; resolve(new Response(input.method === 'HEAD' ? null : stream, { status, headers })); } };
        const response: any = {
          get headersSent() { return started; }, get writableEnded() { return ended; }, get destroyed() { return destroyed; },
          status(code: number) { status = code; return response; },
          setHeader(name: string, value: any) { headers.set(name, String(value)); return response; },
          once(name: string, fn: (...args: any[]) => void) {
            const once = (...args: any[]) => { listeners.get(name)?.delete(once); fn(...args); };
            (once as any).original = fn;
            if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(once); return response;
          },
          off(name: string, fn: any) { for (const listener of listeners.get(name) || []) if (listener === fn || (listener as any).original === fn) listeners.get(name)!.delete(listener); },
          flushHeaders: start,
          write(value: string | Uint8Array) { if (destroyed || ended) return false; start(); if (input.method === 'HEAD') return true; controller.enqueue(new Uint8Array(typeof value === 'string' ? Buffer.from(value) : value)); return (controller.desiredSize || 0) > 0; },
          end(value?: any) { if (destroyed || ended) return response; if (value !== undefined) response.write(value); start(); ended = true; controller.close(); cleanup(); return response; },
          send(value: any) { if (typeof value === 'object' && !(value instanceof Uint8Array)) return response.json(value); return response.end(value); },
          json(value: unknown) {
            void flushStorage().then(() => { headers.set('Content-Type', 'application/json'); response.end(JSON.stringify(value)); }).catch(error => {
              status = 507; headers.set('Content-Type', 'application/json'); response.end(JSON.stringify({ error: error.message }));
            }); return response;
          },
          sendFile(file: string) { return createReadStream(file).pipe(response); },
          destroy(error?: Error) { if (destroyed || ended) return; destroyed = true; start(); controller.error(error || new Error('Media stream interrupted')); cleanup(); },
        };
        const onAbort = () => response.destroy(new Error('Request cancelled'));
        input.signal.addEventListener('abort', onAbort, { once: true });
        const chain = [...middleware.filter(m => url.pathname.startsWith(m.path)), { path: '', handler: route.handler }];
        const run = async (index: number): Promise<void> => {
          const item = chain[index]; if (!item || ended) return;
          request.path = url.pathname.slice(item.path.length) || '/';
          let next: Promise<void> | undefined;
          await item.handler(request, response, () => next = run(index + 1));
          await next;
        };
        void run(0).catch(error => { if (started) response.destroy(error); else response.status(500).json({ error: error.message }); });
      });
    },
  };
  return app;
}
createRouter.json = () => (_req: any, _res: any, next: () => void) => next();
function match(pattern: string, path: string): Record<string, string> | undefined {
  const names: string[] = [];
  const expression = pattern.split('/').map(segment => { if (segment.startsWith(':')) { names.push(segment.slice(1)); return '([^/]+)'; } return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('/');
  const matched = path.match(new RegExp('^' + expression + '/?$'));
  return matched ? Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(matched[i + 1])])) : undefined;
}
