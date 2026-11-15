import type { Express } from 'express';
import { Api, helpers, type TelegramClient } from 'telegram';

const filters = {
  all: Api.InputMessagesFilterEmpty, messages: Api.InputMessagesFilterEmpty,
  media: Api.InputMessagesFilterPhotoVideo, files: Api.InputMessagesFilterDocument,
  links: Api.InputMessagesFilterUrl, music: Api.InputMessagesFilterMusic,
  voice: Api.InputMessagesFilterRoundVoice,
};

export function registerMessageSearchRoutes(app: Express, deps: {
  client: () => TelegramClient | null;
  resolvePeer: (client: TelegramClient, id: string) => Promise<any>;
  peerId: (peer: Api.TypePeer) => string;
  cache: Map<string, any>;
  serialize: (message: Api.Message, chatId: string, senderName?: string, avatar?: string) => any;
}) {
  function cacheEntities(result: { users?: any[]; chats?: any[] }) {
    for (const e of [...(result.users || []), ...(result.chats || [])]) {
      const id = e instanceof Api.User ? String(e.id) : e instanceof Api.Channel ? `-100${e.id}` : `-${e.id}`;
      deps.cache.set(id, e);
    }
  }
  function summary(id: string) {
    const e = deps.cache.get(id);
    return { id, type: e instanceof Api.User ? e.bot ? 'bot' : 'user' : e instanceof Api.Channel && e.broadcast ? 'channel' : 'group',
      title: e?.title || [e?.firstName, e?.lastName].filter(Boolean).join(' ') || e?.username || 'Chat',
      username: e?.username, avatarUrl: e?.photo ? `/api/tg/avatar/${encodeURIComponent(id)}` : '', isVerified: Boolean(e?.verified) };
  }
  function serialize(message: Api.Message) {
    const chatId = deps.peerId(message.peerId);
    const senderId = message.fromId ? deps.peerId(message.fromId) : chatId;
    const sender = summary(senderId);
    return { chat: summary(chatId), message: deps.serialize(message, chatId, sender.title, sender.avatarUrl) };
  }
  app.get('/api/tg/search/messages', async (req, res) => {
    const client = deps.client();
    if (!client?.connected) return res.status(401).json({ error: 'Sign in to search Telegram.' });
    const filterName = String(req.query.filter || 'all');
    if (!Object.hasOwn(filters, filterName)) return res.status(400).json({ error: 'Unknown search filter.' });
    const q = String(req.query.q || '').trim().slice(0, 256);
    const chatId = String(req.query.chatId || '');
    const offsetId = Math.max(0, Number(req.query.offsetId) || 0);
    const offsetRate = Math.max(0, Number(req.query.offsetRate) || 0);
    const minDate = Math.max(0, Number(req.query.minDate) || 0);
    const maxDate = Math.max(0, Number(req.query.maxDate) || 0);
    if (!q && ['all', 'messages'].includes(filterName)) return res.json({ results: [], hasMore: false });
    try {
      const Filter = filters[filterName as keyof typeof filters];
      const common = { q, filter: new Filter(), limit: 30, minDate, maxDate, offsetId };
      const result = await client.invoke(chatId
        ? new Api.messages.Search({ ...common, peer: await deps.resolvePeer(client, chatId), addOffset: 0, maxId: 0, minId: 0, hash: helpers.readBigIntFromBuffer(Buffer.alloc(8), true, false), ...(Number(req.query.topMsgId) > 0 ? { topMsgId: Number(req.query.topMsgId) } : {}) })
        : new Api.messages.SearchGlobal({ ...common, offsetRate, offsetPeer: req.query.offsetPeer ? await deps.resolvePeer(client, String(req.query.offsetPeer)) : new Api.InputPeerEmpty() }));
      if (!('messages' in result)) return res.json({ results: [], hasMore: false });
      cacheEntities(result);
      const messages = result.messages.filter((m): m is Api.Message => m instanceof Api.Message);
      const last = messages.at(-1);
      const nextCursor = last ? { offsetId: last.id, offsetPeer: deps.peerId(last.peerId), offsetRate: 'nextRate' in result ? result.nextRate || 0 : 0 } : undefined;
      return res.json({ results: messages.map(serialize), count: 'count' in result ? result.count : messages.length, hasMore: result.messages.length >= 30 && Boolean(last), nextCursor });
    } catch (error) { return res.status(400).json({ error: (error as Error).message || 'Telegram search failed. Try again.' }); }
  });

  app.get('/api/tg/search/context/:chatId/:messageId', async (req, res) => {
    const client = deps.client();
    if (!client?.connected) return res.status(401).json({ error: 'Not authenticated.' });
    const messageId = Number(req.params.messageId);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) return res.status(400).json({ error: 'Invalid message.' });
    try {
      const peer = await deps.resolvePeer(client, req.params.chatId);
      const result = await client.getMessages(peer, { offsetId: messageId, addOffset: -15, limit: 40 });
      const messages = result.filter((m): m is Api.Message => m instanceof Api.Message);
      if (!messages.some(m => m.id === messageId)) {
        const target = await client.getMessages(peer, { ids: [messageId] });
        messages.push(...target.filter((m): m is Api.Message => m instanceof Api.Message));
      }
      if (!messages.some(m => m.id === messageId)) return res.status(404).json({ error: 'This message was deleted or is no longer available.' });
      return res.json({ messages: messages.map(m => serialize(m).message).sort((a, b) => Number(a.id) - Number(b.id)) });
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  });
}
