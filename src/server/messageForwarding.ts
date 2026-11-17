import { Api, helpers } from 'telegram';
import { isForwardRestriction, type ForwardRequest, type ForwardBatchResult } from '../utils/forwardOptions.ts';
type RandomId = ReturnType<typeof helpers.generateRandomLong>;
interface Delivery { id: string; sent: Set<number>; randomIds: Map<number, RandomId>; commentId: RandomId; commentSent: boolean; complete: boolean; error?: string }
export function createForwardJob(request: ForwardRequest) {
  return { request, deliveries: request.toChatIds.map(id => ({ id, sent: new Set<number>(),
    randomIds: new Map(request.messageIds.map(messageId => [messageId, helpers.generateRandomLong(true)])),
    commentId: helpers.generateRandomLong(true), commentSent: false, complete: false } as Delivery)),
    running: undefined as Promise<ForwardBatchResult> | undefined };
}
export type ForwardJob = ReturnType<typeof createForwardJob>;
interface ForwardClient { getInputEntity(peer: any): Promise<any>; invoke(request: any): Promise<any> }
export function runForwardJob(job: ForwardJob, client: ForwardClient, resolve: (id: string) => Promise<any>,
  copyRestricted?: (peer: any, messageId: number, options: ForwardRequest, randomId: RandomId) => Promise<void>): Promise<ForwardBatchResult> {
  if (job.running) return job.running;
  job.running = (async () => {
    const request = job.request;
    const fromPeer = await client.getInputEntity(await resolve(request.fromChatId));
    for (const delivery of job.deliveries) {
      if (delivery.complete) continue;
      delivery.error = undefined;
      try {
        const toPeer = await client.getInputEntity(await resolve(delivery.id));
        if (request.comment && !delivery.commentSent) {
          await client.invoke(new Api.messages.SendMessage({ peer: toPeer, message: request.comment,
            randomId: delivery.commentId, silent: request.silent, scheduleDate: request.scheduleDate }));
          delivery.commentSent = true;
        }
        // Original chunk boundaries and random IDs survive partial or uncertain retries.
        for (let offset = 0; offset < request.messageIds.length; offset += 100) {
          const ids = request.messageIds.slice(offset, offset + 100).filter(id => !delivery.sent.has(id));
          if (!ids.length) continue;
          try {
            await client.invoke(new Api.messages.ForwardMessages({ fromPeer, toPeer, id: ids,
              randomId: ids.map(id => delivery.randomIds.get(id)!), dropAuthor: request.hideSenderTag,
              dropMediaCaptions: request.hideCaptions, silent: request.silent, scheduleDate: request.scheduleDate }));
            ids.forEach(id => delivery.sent.add(id));
          } catch (error) {
            if (!copyRestricted || !isForwardRestriction(error)) throw error;
            for (const id of ids) { await copyRestricted(toPeer, id, request, delivery.randomIds.get(id)!); delivery.sent.add(id); }
          }
        }
        delivery.complete = true;
      } catch (error) { delivery.error = (error as Error).message || 'Forward failed'; }
    }
    return { ok: job.deliveries.every(d => d.complete), count: request.messageIds.length,
      targets: job.deliveries.map(d => ({ chatId: d.id, deliveredMessageIds: [...d.sent], complete: d.complete, error: d.error })) };
  })().finally(() => { job.running = undefined; });
  return job.running;
}
