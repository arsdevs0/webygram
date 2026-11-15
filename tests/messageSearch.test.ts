import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'telegram';
import { registerMessageSearchRoutes } from '../src/server/messageSearch.ts';

const peer = new Api.PeerUser({ userId: 42n as any });
const message = (id: number) => new Api.Message({ id, peerId: peer, date: 100, message: 'matching text' });
function harness(overrides: Record<string, any> = {}) {
  const handlers = new Map<string, any>();
  const calls: any[] = [];
  const client = { connected: true, invoke: async (request: any) => { calls.push(request); return { messages: [], users: [], chats: [] }; }, ...overrides };
  registerMessageSearchRoutes({ get: (path: string, handler: any) => handlers.set(path, handler) } as any, {
    client: () => client as any, resolvePeer: async (_client, id) => { calls.push(id); return new Api.InputPeerSelf(); },
    peerId: p => String((p as Api.PeerUser).userId), cache: new Map(),
    serialize: (m, chatId) => ({ id: String(m.id), chatId, text: m.message }),
  });
  async function request(path: string, query: Record<string, any> = {}, params: Record<string, string> = {}) {
    let status = 200; let body: any;
    const res = { status: (n: number) => { status = n; return res; }, json: (value: any) => { body = value; return res; } };
    await handlers.get(path)({ query, params }, res);
    return { status, body };
  }
  return { calls, request };
}
const search = '/api/tg/search/messages';
const context = '/api/tg/search/context/:chatId/:messageId';

test('global search maps all Telegram media filters and forwards the pagination cursor', async () => {
  const expected = { media: Api.InputMessagesFilterPhotoVideo, files: Api.InputMessagesFilterDocument, links: Api.InputMessagesFilterUrl, music: Api.InputMessagesFilterMusic, voice: Api.InputMessagesFilterRoundVoice, messages: Api.InputMessagesFilterEmpty };
  for (const [filter, Filter] of Object.entries(expected)) {
    const h = harness();
    assert.equal((await h.request(search, { q: 'match', filter, offsetId: '81', offsetRate: '6', offsetPeer: '42' })).status, 200);
    const rpc = h.calls.at(-1);
    assert.ok(rpc instanceof Api.messages.SearchGlobal);
    assert.ok(rpc.filter instanceof Filter);
    assert.equal(rpc.offsetId, 81); assert.equal(rpc.offsetRate, 6);
  }
});

test('scoped search preserves topic scope; empty media searches are supported', async () => {
  const h = harness();
  await h.request(search, { filter: 'media', chatId: '42', topMsgId: '7' });
  const rpc = h.calls.at(-1);
  assert.ok(rpc instanceof Api.messages.Search);
  assert.equal(rpc.topMsgId, 7); assert.equal(rpc.q, '');
});

test('search returns navigable chat/message hits and a continuation cursor', async () => {
  const h = harness({ invoke: async () => ({ messages: Array.from({ length: 30 }, (_, i) => message(100 - i)), users: [new Api.User({ id: 42n as any, firstName: 'Test person' })], chats: [], nextRate: 8, count: 90 }) });
  const { body } = await h.request(search, { q: 'match' });
  assert.equal(body.results[0].chat.title, 'Test person');
  assert.equal(body.results[0].message.chatId, '42');
  assert.equal(body.hasMore, true);
  assert.deepEqual(body.nextCursor, { offsetId: 71, offsetPeer: '42', offsetRate: 8 });
});

test('search rejects unauthenticated and invalid filters without a Telegram RPC', async () => {
  assert.equal((await harness({ connected: false }).request(search)).status, 401);
  const h = harness();
  assert.equal((await h.request(search, { filter: '__proto__' })).status, 400);
  assert.deepEqual((await h.request(search)).body, { results: [], hasMore: false });
  assert.equal(h.calls.length, 0);
});

test('opening a result fetches the exact message when the surrounding page omits it', async () => {
  const h = harness({ getMessages: async (_peer: any, opts: any) => opts.ids ? [message(9)] : [message(10), message(8)] });
  const { status, body } = await h.request(context, {}, { chatId: '42', messageId: '9' });
  assert.equal(status, 200); assert.deepEqual(body.messages.map((m: any) => m.id), ['8', '9', '10']);
});

test('deleted or invalid search targets fail explicitly instead of opening another message', async () => {
  const h = harness({ getMessages: async () => [] });
  assert.equal((await h.request(context, {}, { chatId: '42', messageId: '9' })).status, 404);
  assert.equal((await h.request(context, {}, { chatId: '42', messageId: 'NaN' })).status, 400);
});
