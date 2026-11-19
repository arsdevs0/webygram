import { Api } from 'telegram';
/** A failed content RPC must never be reported as a successful open receipt. */
export async function sendMediaSeenReceipt(client: { invoke: (request: any) => Promise<any> }, peer: any, messageId: number) {
  const channel = peer instanceof Api.InputPeerChannel;
  const contents = await client.invoke(channel
    ? new Api.channels.ReadMessageContents({ channel: peer, id: [messageId] })
    : new Api.messages.ReadMessageContents({ id: [messageId] }));
  if (contents === false) throw new Error('Telegram did not accept the content receipt.');
  const readAt = Date.now();
  let historyRead = true;
  try {
    await client.invoke(channel ? new Api.channels.ReadHistory({ channel: peer, maxId: messageId })
      : new Api.messages.ReadHistory({ peer, maxId: messageId }));
  } catch { historyRead = false; }
  return { contentsSeen: true, historyRead, readAt };
}
