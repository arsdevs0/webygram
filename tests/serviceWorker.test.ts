import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker(client: any, nativeFetch: any = fetch, entries = new Map<string, Response>()) {
  const handlers: Record<string, (event: any) => void> = {};
  const self = { location: new URL('https://app.test/'), addEventListener: (name: string, handler: any) => handlers[name] = handler,
    skipWaiting: async () => {}, clients: { claim: async () => {}, get: async () => client, matchAll: async () => client ? [client] : [] } };
  vm.runInNewContext(readFileSync(new URL('../public/telegram-sw.js', import.meta.url), 'utf8'), {
    self, URL, Request, Response, ReadableStream, MessageChannel, setTimeout, clearTimeout, fetch: nativeFetch,
    caches: { match: async (key: Request | string) => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
      keys: async () => [], delete: async () => true,
      open: async () => ({ match: async (key: Request | string) => entries.get(typeof key === 'string' ? key : key.url)?.clone(), put: async (key: Request | string, value: Response) => entries.set(typeof key === 'string' ? key : key.url, value.clone()) }) },
  });
  const relay = (request: Request): Promise<Response> | undefined => {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request, clientId: 'open-tab', respondWith: (value: Promise<Response>) => response = value });
    return response;
  };
  return Object.assign(relay, { lifecycle: async (name: string) => { let pending: Promise<void> | undefined; handlers[name]({ waitUntil: (value: Promise<void>) => pending = value }); await pending; } });
}

test('service worker relays ranges and streams every media chunk from the open page', async () => {
  const chunks = [new Uint8Array(70000).fill(3), new Uint8Array(70000).fill(4), new Uint8Array(70).fill(5)];
  const relay = worker({ postMessage: (message: any, [port]: MessagePort[]) => {
    assert.equal(message.method, 'GET'); assert.equal(new Headers(message.headers).get('range'), 'bytes=100-140169');
    let index = 0;
    port.onmessage = ({ data }) => {
      if (data === 'pull') {
        if (index < chunks.length) port.postMessage({ bytes: chunks[index++] });
        else { port.postMessage({ done: true }); port.close(); }
      }
    };
    port.postMessage({ status: 206, headers: [['Content-Length', '140070']], empty: false });
  } });
  const response = (await relay(new Request('https://app.test/api/tg/media/test', { headers: { Range: 'bytes=100-140169' } })))!;
  assert.equal(response.status, 206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.concat(chunks));
});

test('service worker leaves other origins, unrecognized assets and POST requests alone', () => {
  const relay = worker(null);
  assert.equal(relay(new Request('https://app.test/unknown.txt')), undefined);
  assert.equal(relay(new Request('https://telegram.org/api/test')), undefined);
  assert.equal(relay(new Request('https://app.test/api/test', { method: 'POST', body: '{}' })), undefined);
});

test('service worker caches public app assets and serves the cached copy offline', async () => {
  let requests = 0;
  const relay = worker(null, async () => { requests++; return new Response('public asset'); });
  const request = new Request('https://app.test/assets/app.js');
  assert.equal(await (await relay(request))!.text(), 'public asset');
  assert.equal(await (await relay(request))!.text(), 'public asset');
  assert.equal(requests, 1);
});

test('service worker reports closed app and supports switching back to Node mode', async () => {
  assert.equal((await worker(null)(new Request('https://app.test/api/tg/media/test')))!.status, 503);
  const relay = worker({ postMessage: (_message: any, [port]: MessagePort[]) => { port.postMessage({ network: true }); port.close(); } },
    async () => new Response('node mode'));
  assert.equal(await (await relay(new Request('https://app.test/api/test')))!.text(), 'node mode');
});

test('first installation downloads the launch page and both mandatory icon sizes', async () => {
 const requested:string[]=[];const entries=new Map<string,Response>();
 const relay=worker(null,async (request:Request)=>{requested.push(new URL(request.url).pathname);return new Response('shell');},entries);
 await relay.lifecycle('install');assert.ok(requested.includes('/'));assert.ok(requested.includes('/icons/icon-192.png'));assert.ok(requested.includes('/icons/icon-512.png'));assert.ok(entries.has('/'));
 assert.ok(!requested.some(path=>path.startsWith('/api/')||path.endsWith('.onnx')));
});
test('install metadata refreshes online and falls back to the new copy offline', async () => {
 let offline=false,version=0;const relay=worker(null,async()=>{if(offline)throw Error('offline');return new Response(String(++version));});
 const request=new Request('https://app.test/manifest.webmanifest');
 assert.equal(await (await relay(request))!.text(),'1');assert.equal(await (await relay(request))!.text(),'2');offline=true;
 assert.equal(await (await relay(request))!.text(),'2');
});
