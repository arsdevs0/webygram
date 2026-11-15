import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker(client: any, nativeFetch: any = fetch) {
  const handlers: Record<string, (event: any) => void> = {};
  const self = { location: new URL('https://app.test/'), addEventListener: (name: string, handler: any) => handlers[name] = handler,
    clients: { get: async () => client, matchAll: async () => client ? [client] : [] } };
  vm.runInNewContext(readFileSync(new URL('../public/telegram-sw.js', import.meta.url), 'utf8'), {
    self, URL, Response, ReadableStream, MessageChannel, setTimeout, clearTimeout, fetch: nativeFetch,
  });
  return (request: Request): Promise<Response> | undefined => {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request, clientId: 'open-tab', respondWith: (value: Promise<Response>) => response = value });
    return response;
  };
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

test('service worker leaves assets, other origins and POST requests alone', () => {
  const relay = worker(null);
  assert.equal(relay(new Request('https://app.test/assets/app.js')), undefined);
  assert.equal(relay(new Request('https://telegram.org/api/test')), undefined);
  assert.equal(relay(new Request('https://app.test/api/test', { method: 'POST', body: '{}' })), undefined);
});

test('service worker reports closed app and supports switching back to Node mode', async () => {
  assert.equal((await worker(null)(new Request('https://app.test/api/tg/media/test')))!.status, 503);
  const relay = worker({ postMessage: (_message: any, [port]: MessagePort[]) => { port.postMessage({ network: true }); port.close(); } },
    async () => new Response('node mode'));
  assert.equal(await (await relay(new Request('https://app.test/api/test')))!.text(), 'node mode');
});
