import type { Express } from 'express';
import { Api, helpers, type TelegramClient } from 'telegram';
import { getInputUser } from 'telegram/Utils.js';
export function registerProfileActions(app: Express, deps: { client: () => TelegramClient | null; cache: Map<string, any>; resolveUser: (client: TelegramClient, id: string) => Promise<any> }) {
  app.get('/api/tg/users/:userId/groups', async (req, res) => {
    const client = deps.client(); if (!client?.connected) return res.status(401).json({ error:'Not authenticated' });
    const id=String(req.params.userId || '').trim(), offset=String(req.query.offset || '0');
    if (!id || !/^\d{1,20}$/.test(offset)) return res.status(400).json({ error:'Invalid profile or group cursor' });
    try {
      const userId=getInputUser(await deps.resolveUser(client,id));
      const maxId=helpers.generateRandomLong(true).multiply(0).add(offset);
      const result=await client.invoke(new Api.messages.GetCommonChats({userId,maxId,limit:50}));
      const chats=(result.chats || []).filter((chat):chat is Api.Chat | Api.Channel => chat instanceof Api.Chat || chat instanceof Api.Channel).map(chat=>{
        const chatId=String(chat.id);deps.cache.set(chatId,chat);
        return {id:chatId,type:chat instanceof Api.Channel && chat.broadcast?'channel':'group',title:chat.title,
          avatarUrl:chat.photo instanceof Api.ChatPhoto?'/api/tg/avatar/'+encodeURIComponent(chatId):'',
          memberCount:chat instanceof Api.Chat?chat.participantsCount:chat.participantsCount,unreadCount:0,isMuted:false,isPinned:false};
      });
      const nextOffset=result.chats.length?String(result.chats[result.chats.length-1].id):offset;
      return res.json({chats,hasMore:result.chats.length===50 && nextOffset!==offset,nextOffset});
    } catch(error) { return res.status(400).json({error:(error as Error).message || 'Could not load shared groups'}); }
  });
  app.post('/api/tg/users/:userId/contact', async (req,res)=>{
    const client=deps.client();if(!client?.connected)return res.status(401).json({error:'Not authenticated'});
    const firstName=String(req.body.firstName || '').trim(),lastName=String(req.body.lastName || '').trim(),phone=String(req.body.phone || '').trim();
    if(!firstName || firstName.length>64 || lastName.length>64 || phone.length>32)return res.status(400).json({error:'Enter a valid contact name'});
    try {
      const id=getInputUser(await deps.resolveUser(client,String(req.params.userId)));
      await client.invoke(new Api.contacts.AddContact({id,firstName,lastName,phone,addPhonePrivacyException:false}));
      return res.json({ok:true});
    }catch(error){return res.status(400).json({error:(error as Error).message || 'Could not add contact'});}
  });
}
