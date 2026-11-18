import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const modulePath=process.env.PLAYWRIGHT_MODULE||process.argv[2];
const {chromium}=await import(pathToFileURL(modulePath).href);
fs.mkdirSync('.local',{recursive:true});process.env.VITE_DIRECT_TELEGRAM='false';
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const url='http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/telegramExperience.html?stress';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[],avatarRequests=new Set(),mediaRequests=new Set(),forwardRequests=[];
const image=fs.readFileSync('src/assets/images/tg_channel_art_1794504431466.jpg');
const avatarImage=fs.readFileSync('src/assets/images/tg_avatar_user_1794504430399.jpg');
const audio=Buffer.alloc(44+48000);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(48000,24);audio.writeUInt32LE(96000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(48000,40);for(let i=0;i<24000;i++)audio.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*180/48000)*3000),44+i*2);
let contactError=false,sharedError=false;
const mediaItems=Array.from({length:65},(_,index)=>({id:String(3000+index),chatId:'bob',senderId:'alice',senderName:'Alice',timestamp:Date.now()-index*1000,isOutgoing:false,text:'Photo '+index,media:{type:'photo',url:'/api/tg/media/shared/'+index,width:300,height:300}}));
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('tg_plus_mod_settings_v2',JSON.stringify({designVersion:4,navigationStyle:'telegram',colorPalette:'night-blue',themeMode:'light',showVoiceFloatingButton:false}));localStorage.setItem('webygram_hide_archived_bar','true');});
 await context.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());let body={};try{body=req.postDataJSON()||{};}catch{}
   if(url.pathname.includes('/avatar/')){avatarRequests.add(url.pathname);await new Promise(resolve=>setTimeout(resolve,120));await route.fulfill({contentType:'image/jpeg',body:avatarImage});return;}
   if(url.pathname.endsWith('/voice')){await route.fulfill({contentType:'audio/wav',body:audio});return;}
   if(url.pathname.includes('/media/')&&!url.pathname.endsWith('/media')){mediaRequests.add(url.pathname);await new Promise(resolve=>setTimeout(resolve,150));await route.fulfill({contentType:'image/jpeg',body:image});return;}
   if(url.pathname.endsWith('/contacts')){await route.fulfill({status:contactError?500:200,json:contactError?{error:'Contacts temporarily unavailable'}:{contacts:[{id:'alice',firstName:'Alice',title:'Alice',status:'online'}]}});return;}
   let response={};
   if(url.pathname.includes('/users/') && url.pathname.endsWith('/profile')) {const id=url.pathname.split('/')[4];response={profile:{id,title:id==='me'?'Tester':'Alice',firstName:id==='me'?'Tester':'Alice',username:id==='me'?'tester':'alice',status:'online',about:'Telegram mobile profile',avatarUrl:'/api/tg/avatar/'+id,commonChatsCount:id==='me'?0:2,isContact:false}};}
   if(url.pathname.endsWith('/groups'))response={chats:url.searchParams.get('offset')==='0'?[{id:'bob',title:'Bob group',type:'group',memberCount:12},{id:'team',title:'Design team',type:'group',memberCount:8}]:[{id:'third',title:'Third group',type:'group',memberCount:5}],hasMore:url.searchParams.get('offset')==='0',nextOffset:'77'};
   if(url.pathname.endsWith('/contact'))response={ok:true};

   if(url.pathname.endsWith('/status'))response={isConnected:true,user:{id:'me',firstName:'Tester',status:'online'},dcId:2};
   if(url.pathname.endsWith('/calls/group/info')) response=body.chatId==='bob'?{hasActiveCall:true,title:'Community voice chat',participantsCount:2,participants:[{id:'alice',name:'Alice',muted:false}]}:{hasActiveCall:false,participants:[]};
   if(url.pathname.endsWith('/media')){
     if(sharedError){await route.fulfill({status:500,json:{error:'Media temporarily unavailable'}});return;}
     const filter=url.searchParams.get('filter'),offset=url.searchParams.get('offsetId');
     response={items:filter==='media'?offset?mediaItems.slice(60):mediaItems.slice(0,60):filter==='links'?[{...mediaItems[0],id:'5001',text:'https://example.com/shared-link',media:undefined}]:filter==='gifs'?[{...mediaItems[0],id:'6001',media:{type:'gif',url:'/api/tg/media/shared/gif',width:300,height:300}}]:filter==='polls'?[{...mediaItems[0],id:'1205',text:'',media:undefined,poll:{id:'77',question:'Which release?',options:[{text:'Mobile',optionHex:'01',voters:3,chosen:false},{text:'Desktop',optionHex:'02',voters:1,chosen:false}],totalVoters:4}}]:filter==='files'?[{...mediaItems[0],id:'5002',media:{type:'file',url:'/api/tg/media/shared/document',fileName:'Shared document.pdf',mimeType:'application/pdf'}}]:filter==='voice'?[{...mediaItems[0],id:'5003',media:{type:'voice',url:'/api/tg/media/shared/voice',duration:12}}]:[],hasMore:filter==='media'&&!offset,nextOffsetId:3001};
   }
   if(url.pathname.includes('/forward-batch')){forwardRequests.push(body);response={ok:true,targets:body.toChatIds.map(chatId=>({chatId,complete:true,deliveredMessageIds:body.messageIds}))};}
   await route.fulfill({json:response});
 });

 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 const nav=page.getByRole('navigation',{name:'Mobile navigation'});await nav.waitFor();
 fs.mkdirSync('.local/reference',{recursive:true});
 const switchMode=async mode=>{await page.evaluate(async mode=>{const {modSettingsStore}=await import('/src/services/modSettingsStore.ts');modSettingsStore.updateSetting('themeMode',mode);},mode);await page.waitForTimeout(250);};
 const snap=async name=>{await page.waitForTimeout(250);await page.screenshot({path:'.local/reference/'+name+'.png',fullPage:true});};
 const back=async()=>{await page.evaluate(()=>history.back());await page.waitForTimeout(160);};
 for(const mode of ['light','dark']){
   await switchMode(mode);await nav.getByRole('button',{name:'Chats',exact:true}).click();await page.locator('.tg-dialog-list').first().evaluate(el=>el.scrollTop=0);await snap(mode+'-chats');
   const glass=await nav.evaluate(el=>getComputedStyle(el).backdropFilter);assert.ok(glass.includes('blur'),'Navigation glass effect missing');
   await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.tg-settings-identity').waitFor();await snap(mode+'-settings');
   await nav.getByRole('button',{name:'Contacts',exact:true}).click();if(await page.getByRole('button',{name:'Sort contacts by name'}).count())await page.getByRole('button',{name:'Sort contacts by name'}).click();await page.getByText('Sorted by name',{exact:false}).waitFor();await snap(mode+'-contacts');
   await nav.getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('region',{name:'Your profile'}).waitFor();await snap(mode+'-self-profile');
   await nav.getByRole('button',{name:'Chats',exact:true}).click();await page.locator('.tg-dialog-list').first().evaluate(el=>el.scrollTop=0);await page.getByText('Alice',{exact:true}).first().click();
   await page.getByRole('button',{name:'View profile of Alice'}).click();const profile=page.getByRole('dialog',{name:'Profile',exact:true});await profile.getByRole('region',{name:'Shared groups'}).waitFor();await profile.getByText('Design team',{exact:true}).waitFor();await snap(mode+'-person-profile');
   await profile.getByRole('button',{name:'Load more',exact:true}).click();await profile.getByText('Third group',{exact:true}).waitFor();
   await profile.getByRole('button',{name:'Add to contacts',exact:true}).click();await profile.getByRole('button',{name:'Add to contacts',exact:true}).waitFor({state:'hidden'});await back();
   await page.waitForTimeout(4000);assert.ok(await page.locator('.tg-chat-header').evaluate(el=>getComputedStyle(el.parentElement).backgroundImage.includes('telegram-doodles.svg')),'Chat wallpaper is missing');await snap(mode+'-chat');
   for(const size of [{width:320,height:568},{width:430,height:932},{width:844,height:390}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const composer=page.locator('.tg-composer');assert.ok(await composer.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1));assert.ok(await page.getByRole('button',{name:'View profile of Alice'}).isVisible());}
   await page.setViewportSize({width:390,height:844});await back();await page.locator('.tg-dialog-list').first().evaluate(el=>el.scrollTop=0);await page.getByText('Bob group',{exact:true}).first().click();await page.locator('#msg-1205').waitFor();await page.getByRole('button',{name:'View profile of Bob group'}).click();
   const group=page.locator('.tg-chat-profile-panel');await group.waitFor();await snap(mode+'-group-profile');
   await group.getByRole('button',{name:'Profile options',exact:true}).click();await page.getByRole('menu',{name:'Profile options'}).waitFor();await back();assert.ok(await group.isVisible());
   const shared=page.getByRole('region',{name:'Shared media',exact:true});assert.equal(await shared.locator('.tg-shared-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
   await shared.getByRole('tab',{name:'GIFs',exact:true}).click();await shared.getByRole('button',{name:/Open photo|Open video|Open gif|Open media|Open GIF/}).first().waitFor();
   await shared.getByRole('tab',{name:'Polls',exact:true}).click();await shared.getByRole('button',{name:'Open poll: Which release?',exact:true}).click();await group.waitFor({state:'hidden'});await page.locator('#msg-1205').waitFor();
   await back();await nav.waitFor();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('.local/reference-results.json',JSON.stringify({passed:true,themes:['light','dark'],viewports:[320,390,430,'844 landscape'],checks:['subtle glass','four-column media','personal shared-group pagination','Add Contact','poll opening in chat','GIF tabs','nested profile options Back','mobile composer bounds'],errors},null,2));console.log('Telegram reference checks passed.');
}catch(error){console.error(error);console.error('Page errors:',errors);process.exitCode=1;}finally{await browser.close();await server.close();}
