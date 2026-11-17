import type { Express } from 'express';
import { Api, helpers, utils, type TelegramClient } from 'telegram';

export function serializeNativeCall(call: any) {
  let custom: any = {};
  try { custom = JSON.parse(call.customParameters?.data || '{}'); } catch {}
  return { id: String(call.id), accessHash: call.accessHash?.toString(), state: call.className,
    adminId: call.adminId?.toString(), participantId: call.participantId?.toString(), video: Boolean(call.video),
    gAHash: call.gAHash ? Array.from(call.gAHash) : undefined, gB: call.gB ? Array.from(call.gB) : undefined,
    gAOrB: call.gAOrB ? Array.from(call.gAOrB) : undefined, keyFingerprint: call.keyFingerprint?.toString(),
    p2pAllowed: Boolean(call.p2pAllowed), shouldUseSctp: custom.shouldUseSctp ?? true,
    connections: (call.connections || []).filter((c: any) => c instanceof Api.PhoneConnectionWebrtc).map((c: any) =>
      ({ ip:c.ip, ipv6:c.ipv6, port:c.port, username:c.username, password:c.password, isTurn:Boolean(c.turn), isStun:Boolean(c.stun) })) };
}
const protocol = () => new Api.PhoneCallProtocol({ libraryVersions:['13.0.0'], minLayer:65, maxLayer:92, udpP2p:true, udpReflector:true });
export function registerNativeCallRoutes(app: Express, deps: { client: () => TelegramClient | null; resolvePeer: (client: TelegramClient, id: string) => Promise<any> }) {
  const peer = (body: any) => {
    if (!/^\d+$/.test(String(body.callId || '')) || !/^-?\d+$/.test(String(body.accessHash || ''))) throw new Error('Invalid call identity');
    return new Api.InputPhoneCall({ id:helpers.returnBigInt(String(body.callId)), accessHash:helpers.returnBigInt(String(body.accessHash)) });
  };
  const bytes = (value: any, exact?: number) => {
    if (!Array.isArray(value) || !value.length || value.length > 1048576 || (exact && value.length !== exact) || !value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('Invalid call payload');
    return Buffer.from(value);
  };
  const post = (name: string, action: (client: TelegramClient, body: any) => Promise<any>) => app.post('/api/tg/calls/native/' + name, async (req,res) => {
    const client=deps.client(); if (!client?.connected) return res.status(401).json({error:'Not authenticated'});
    try { return res.json(await action(client,req.body || {})); } catch(error) { return res.status(400).json({error:(error as Error).message || 'Call request failed'}); }
  });
  post('dh', async client => {
    const result = await client.invoke(new Api.messages.GetDhConfig({version:0, randomLength:256}));
    if (!(result instanceof Api.messages.DhConfig)) throw new Error('Missing call encryption parameters');
    return {p:Array.from(result.p),g:result.g,random:Array.from(result.random)};
  });
  post('request', async (client,body) => {
    const user=utils.getInputUser(await deps.resolvePeer(client,String(body.chatId || '')));
    const result=await client.invoke(new Api.phone.RequestCall({userId:user, randomId:helpers.generateRandomBytes(4).readInt32LE(0), gAHash:bytes(body.gAHash,32), video:Boolean(body.video), protocol:protocol()}));
    return {call:serializeNativeCall(result.phoneCall)};
  });
  post('accept', async (client,body) => ({call:serializeNativeCall((await client.invoke(new Api.phone.AcceptCall({peer:peer(body),gB:bytes(body.gB,256),protocol:protocol()}))).phoneCall)}));
  post('confirm', async (client,body) => {
    if (!/^-?\d+$/.test(String(body.keyFingerprint || ''))) throw new Error('Invalid call fingerprint');
    return {call:serializeNativeCall((await client.invoke(new Api.phone.ConfirmCall({peer:peer(body),gA:bytes(body.gA,256),keyFingerprint:helpers.returnBigInt(String(body.keyFingerprint)),protocol:protocol()}))).phoneCall)};
  });
  post('signal', async (client,body) => ({ok:await client.invoke(new Api.phone.SendSignalingData({peer:peer(body),data:bytes(body.data)}))}));
  post('received', async (client,body) => ({ok:await client.invoke(new Api.phone.ReceivedCall({peer:peer(body)}))}));
}

