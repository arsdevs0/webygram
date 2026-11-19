import type { Express } from 'express';
import { Api, type TelegramClient } from 'telegram';
export function registerMessageActions(app:Express,deps:{client:()=>TelegramClient|null;resolvePeer:(client:TelegramClient,id:string)=>Promise<any>;messages:Map<string,Map<number,any>>}) {
  app.post('/api/tg/messages/report',async(req,res)=>{
    const client=deps.client();if(!client?.connected)return res.status(401).json({error:'Not authenticated'});
    const chatId=String(req.body.chatId || ''),messageId=Number(req.body.messageId),option=String(req.body.option || ''),comment=String(req.body.comment || '').trim();
    if(!chatId || !Number.isSafeInteger(messageId) || messageId<=0 || !/^(?:[0-9a-f]{2}){0,2048}$/i.test(option) || comment.length>1024)return res.status(400).json({error:'Invalid report'});
    try {
      const peer=await deps.resolvePeer(client,chatId);
      const result=await client.invoke(new Api.messages.Report({peer,id:[messageId],option:Buffer.from(option,'hex'),message:comment}));
      if(result instanceof Api.ReportResultChooseOption)return res.json({kind:'options',title:result.title,options:result.options.map(o=>({text:o.text,option:Buffer.from(o.option).toString('hex')}))});
      if(result instanceof Api.ReportResultAddComment)return res.json({kind:'comment',option:Buffer.from(result.option).toString('hex'),optional:result.optional});
      if(result instanceof Api.ReportResultReported)return res.json({kind:'reported'});
      return res.status(502).json({error:'Telegram did not confirm this report'});
    }catch(error){return res.status(400).json({error:(error as Error).message || 'Could not report message'});}
  });
  app.get('/api/tg/messages/:chatId/:messageId/receipt',async(req,res)=>{
    const client=deps.client();if(!client?.connected)return res.status(401).json({error:'Not authenticated'});
    const chatId=String(req.params.chatId),messageId=Number(req.params.messageId);
    if(!Number.isSafeInteger(messageId)||messageId<=0)return res.status(400).json({error:'Message is still sending'});
    try {
      const peer=await deps.resolvePeer(client,chatId);
      let msg=deps.messages.get(chatId)?.get(messageId);
      if(!msg){const raw=(await client.getMessages(peer,{ids:[messageId]}))[0];if(raw instanceof Api.Message)msg={isOutgoing:raw.out,isRead:false};}
      if(!msg?.isOutgoing)return res.status(400).json({error:'Read information is available for your sent messages'});
      const entity=await client.getEntity(peer);
      if(entity instanceof Api.User && !entity.self && !entity.bot){
        const result=await client.invoke(new Api.messages.GetOutboxReadDate({peer,msgId:messageId}));
        return res.json({readAt:result.date,read:true});
      }
      if(entity instanceof Api.Chat || (entity instanceof Api.Channel && entity.megagroup)) {
        const readers=await client.invoke(new Api.messages.GetMessageReadParticipants({peer,msgId:messageId}));
        return res.json({read:msg.isRead,readers:readers.map(r=>({userId:String(r.userId),readAt:r.date})),note:readers.length+' members have read this message'});
      }
      return res.json({read:msg.isRead,note:entity instanceof Api.Channel?'Channel posts show views on the message':'Saved in your Telegram cloud'});
    }catch(error){const reason=(error as Error).message || '';if(/PRIVACY|MESSAGE_TOO_OLD|MSG_ID_INVALID|CHAT_TOO_BIG|USER_NOT_PARTICIPANT/.test(reason))return res.json({note:'Telegram does not share read time for this message (privacy or message age).'});return res.status(400).json({error:reason || 'Read information unavailable'});}
  });
}
