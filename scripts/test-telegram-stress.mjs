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
   if(url.pathname.endsWith('/status'))response={isConnected:true,user:{id:'me',firstName:'Tester',status:'online'},dcId:2};
   if(url.pathname.endsWith('/calls/group/info')) response=body.chatId==='bob'?{hasActiveCall:true,title:'Community voice chat',participantsCount:2,participants:[{id:'alice',name:'Alice',muted:false}]}:{hasActiveCall:false,participants:[]};
   if(url.pathname.endsWith('/media')){
     if(sharedError){await route.fulfill({status:500,json:{error:'Media temporarily unavailable'}});return;}
     const filter=url.searchParams.get('filter'),offset=url.searchParams.get('offsetId');
     response={items:filter==='media'?offset?mediaItems.slice(60):mediaItems.slice(0,60):filter==='links'?[{...mediaItems[0],id:'5001',text:'https://example.com/shared-link',media:undefined}]:filter==='files'?[{...mediaItems[0],id:'5002',media:{type:'file',url:'/api/tg/media/shared/document',fileName:'Shared document.pdf',mimeType:'application/pdf'}}]:filter==='voice'?[{...mediaItems[0],id:'5003',media:{type:'voice',url:'/api/tg/media/shared/voice',duration:12}}]:[],hasMore:filter==='media'&&!offset,nextOffsetId:3001};
   }
   if(url.pathname.includes('/forward-batch')){forwardRequests.push(body);response={ok:true,targets:body.toChatIds.map(chatId=>({chatId,complete:true,deliveredMessageIds:body.messageIds}))};}
   await route.fulfill({json:response});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 await page.getByRole('button',{name:'Open archived chats',exact:true}).waitFor();
 await page.waitForTimeout(500);assert.ok(avatarRequests.size<30,'Offscreen avatar requests were not deferred: '+avatarRequests.size);
 const list=page.locator('.tg-dialog-list').first();
 assert.equal(await list.evaluate(el=>getComputedStyle(el).overflowY),'auto');
 await list.hover();await page.mouse.wheel(0,900);await page.waitForTimeout(400);assert.ok(await list.evaluate(el=>el.scrollTop)>200,'Chat list does not scroll down');
 const cdp=await context.newCDPSession(page);
 const rect=await list.boundingBox();let y=Math.min(rect.y+rect.height-30,700);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y}]});
 for(let index=1;index<=10;index++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:y-index*35}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);
 assert.ok(await list.evaluate(el=>el.scrollTop)>500,'Touch scrolling did not move the list');
 await list.evaluate(el=>el.scrollTop=el.scrollHeight);await page.getByText('Contact 119',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Open archived chats'}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}),true);
 await page.getByRole('button',{name:'Open archived chats'}).click();await page.getByRole('heading',{name:'Archived Chats',exact:true}).waitFor();
 await page.locator('.tg-dialog-list').evaluate(el=>el.scrollTop=el.scrollHeight);await page.getByText('Contact 159',{exact:true}).waitFor();
 await page.keyboard.press('Escape');await list.evaluate(el=>el.scrollTop=0);
 await page.getByRole('button',{name:'New message',exact:true}).click();const compose=page.getByRole('dialog',{name:'New message'});await compose.waitFor();
 await compose.getByRole('button',{name:'Message Alice',exact:true}).waitFor();
 for(const size of [{width:320,height:568},{width:844,height:390}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await compose.evaluate(el=>el.getBoundingClientRect().height<=innerHeight),true);}await page.setViewportSize({width:390,height:844});
 assert.equal(await compose.getByPlaceholder(/t.me/).count(),0);
 await compose.getByRole('searchbox',{name:'Search contacts or username'}).fill('Contact 119');await compose.getByRole('button',{name:'Message Contact 119'}).waitFor();
 await page.keyboard.press('Escape');contactError=true;await page.getByRole('button',{name:'New message',exact:true}).click();await compose.getByRole('alert').waitFor();await compose.getByRole('button',{name:'Message Alice',exact:true}).waitFor();await page.keyboard.press('Escape');contactError=false;
 await page.getByText('Bob group',{exact:true}).first().click();const timeline=page.getByRole('region',{name:'Messages',exact:true});await page.locator('#msg-1204').waitFor();
 await page.waitForTimeout(350);assert.ok(await timeline.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)<4,'New group did not open at latest');
 await page.getByRole('button',{name:'View group voice chat'}).waitFor();await page.getByRole('button',{name:'View group voice chat'}).click();await page.getByRole('dialog',{name:'Group voice chat',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('group',{name:'Album of 3 items'}).waitFor();assert.equal(await page.getByRole('group',{name:'Album of 3 items'}).getByRole('button').count(),3);
 await page.getByRole('group',{name:'Album of 3 items'}).getByRole('button').first().click();await page.getByRole('button',{name:'Close media viewer',exact:true}).waitFor();await page.getByRole('button',{name:'Next media',exact:true}).click();await page.getByRole('button',{name:'Previous media',exact:true}).click();await page.screenshot({path:'.local/telegram-album-viewer-mobile.png',fullPage:true});await page.keyboard.press('Escape');
 await timeline.evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:'Scroll to latest messages'}).waitFor();await page.getByRole('button',{name:'Scroll to latest messages'}).click();
 await page.waitForTimeout(850);assert.ok(await timeline.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)<4,'Group arrow failed to reach latest');
 await page.locator('#msg-1201').getByTitle('More',{exact:true}).click();await page.getByRole('button',{name:'Forward to Chat...'}).click();
 const forward=page.getByRole('dialog',{name:'Forward messages'});await forward.getByRole('button',{name:/Saved Messages/}).click();await forward.getByRole('button',{name:'Next',exact:true}).click();await forward.getByRole('button',{name:'Send',exact:true}).click();await forward.waitFor({state:'hidden'});assert.deepEqual(forwardRequests[0].messageIds,[1201,1202,1203]);
 await page.getByRole('group',{name:'Album of 3 items'}).getByRole('button').first().click();await page.getByRole('button',{name:'Forward',exact:true}).click();await forward.waitFor();await forward.getByRole('button',{name:/Saved Messages/}).click();await forward.getByRole('button',{name:'Next',exact:true}).click();await forward.getByRole('group',{name:'Album preview'}).waitFor();await forward.getByRole('button',{name:'Send',exact:true}).click();await forward.waitFor({state:'hidden'});assert.deepEqual(forwardRequests.at(-1).messageIds,[1201,1202,1203]);
 await page.locator('.tg-chat-header').getByText('Bob group',{exact:true}).click();const shared=page.getByRole('region',{name:'Shared media',exact:true});await shared.waitFor();
 await shared.getByRole('tab',{name:'Files',exact:true}).click();await shared.getByRole('button',{name:'Open Shared document.pdf'}).click();await page.getByRole('link',{name:'Open document',exact:true}).waitFor();await page.keyboard.press('Escape');
 await shared.getByRole('tab',{name:'Voice',exact:true}).click();await shared.locator('audio[controls]').waitFor();await shared.locator('audio[controls]').evaluate(el=>el.play());await page.waitForTimeout(180);assert.ok(await shared.locator('audio[controls]').evaluate(el=>el.currentTime)>0,'Shared voice must actually play');await shared.getByRole('button',{name:'Open voice message',exact:true}).click();await page.locator('.tg-viewer-document audio').waitFor();await page.keyboard.press('Escape');
 await shared.getByRole('tab',{name:'Links',exact:true}).click();await shared.getByRole('link',{name:'https://example.com/shared-link',exact:true}).waitFor();
 await shared.getByRole('tab',{name:'Media',exact:true}).click();await shared.getByRole('button',{name:'Load more',exact:true}).click();await page.waitForTimeout(200);assert.ok(await shared.locator('.tg-shared-tile').count()>=65,'Profile media pagination lost items');
 await page.waitForTimeout(400);await shared.scrollIntoViewIfNeeded();await page.screenshot({path:'.local/telegram-profile-media-mobile.png',fullPage:true});
 sharedError=true;await shared.getByRole('tab',{name:'Music',exact:true}).click();await shared.getByRole('alert').waitFor();sharedError=false;await shared.getByRole('button',{name:'Retry',exact:true}).click();await shared.getByText('No shared music yet.',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Back to chats',exact:true}).click();await list.evaluate(el=>el.scrollTop=0);await page.getByText('Read only',{exact:true}).first().click();await timeline.waitFor();await timeline.evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:'Scroll to latest messages'}).click();await page.waitForTimeout(850);assert.ok(await timeline.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)<4,'Channel arrow failed');
 await page.getByRole('button',{name:'Back to chats',exact:true}).click();
 for(let i=0;i<3;i++){await page.evaluate(()=>history.back());await page.waitForTimeout(900);assert.equal(page.url(),url,'Slow repeated Back left app');}
 await page.setViewportSize({width:1280,height:1200});await list.evaluate(el=>el.scrollTop=el.scrollHeight);await page.getByText('Palette controls',{exact:true}).first().click();await page.locator('#msg-205').waitFor();
 await page.getByRole('button',{name:'New message',exact:true}).click();await compose.waitFor();
 const palettes=await page.evaluate(async()=>{const {COLOR_PALETTES}=await import('/src/services/modSettingsStore.ts');return COLOR_PALETTES.map(p=>p.id);});
 const contrastFailures=[];let cases=0;
 for(const palette of palettes)for(const mode of palette.startsWith('flow-')||palette==='night-blue'?['light','dark']:['native']){
   await page.evaluate(async({palette,mode})=>{const {modSettingsStore}=await import('/src/services/modSettingsStore.ts');modSettingsStore.updateSetting('colorPalette',palette);if(mode!=='native')modSettingsStore.updateSetting('themeMode',mode);modSettingsStore.updateSetting('accentColor','theme');},{palette,mode});await page.waitForTimeout(40);
   const failures=await page.evaluate(()=>{
     const parse=value=>{const nums=value.match(/[\d.]+/g)?.map(Number)||[];return nums.length>=3?[nums[0],nums[1],nums[2],nums[3]??1]:[0,0,0,0];};
     const blend=(color,bg)=>color.slice(0,3).map((v,i)=>v*color[3]+bg[i]*(1-color[3]));
     const luminance=rgb=>{const a=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
     const results=[];
     for(const root of document.querySelectorAll('#msg-201,#msg-202,#msg-203,#msg-204,#msg-205,.tg-compose-surface,.tg-message-date,.tg-next-bottom-nav'))for(const el of [root,...root.querySelectorAll('*')]){
       if(![...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim()))continue;
       const rect=el.getBoundingClientRect();if(rect.width===0||rect.height===0)continue;
       let chain=[],parent=el;while(parent){chain.unshift(parent);parent=parent.parentElement;}
       let bg=[255,255,255],opacity=1;for(const item of chain){const style=getComputedStyle(item);bg=blend(parse(style.backgroundColor),bg);opacity*=Number(style.opacity);}
       if(opacity<.9)continue;
       const style=getComputedStyle(el),fg=blend(parse(style.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
       if(ratio<4.45)results.push({text:el.textContent.trim().slice(0,60),class:el.className,color:style.color,bg,ratio:Number(ratio.toFixed(2))});
     }
     return results.slice(0,20);
   });cases++;if(failures.length)contrastFailures.push({palette,mode,failures});
 }
 fs.writeFileSync('.local/telegram-contrast-results.json',JSON.stringify({cases,contrastFailures},null,2));
 assert.deepEqual(contrastFailures,[],'Rendered palette contrast failed; see .local/telegram-contrast-results.json');
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Back to chats',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Mobile navigation'});await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Notifications and Sounds',exact:true}).click();
 const notifications=page.getByRole('switch',{name:'Message notifications',exact:true}),sounds=page.getByRole('switch',{name:'App sounds',exact:true});await sounds.click();await notifications.click();assert.equal(await sounds.getAttribute('aria-checked'),'false');assert.equal(await notifications.getAttribute('aria-checked'),'false');
 const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('webygram_notification_preferences_v1')));assert.deepEqual(persisted,{notificationsEnabled:false,soundsEnabled:false});
 const exitPage=await context.newPage();const previous='data:text/html,Previous site';await exitPage.goto(previous);await exitPage.goto(url);await exitPage.getByRole('button',{name:'New message',exact:true}).waitFor();await exitPage.evaluate(()=>history.back());await exitPage.waitForTimeout(80);assert.equal(exitPage.url(),url);await exitPage.evaluate(()=>history.back());await exitPage.waitForTimeout(120);assert.equal(exitPage.url(),url,'Rapid double Back exited app');for(let i=0;i<8;i++){await exitPage.evaluate(()=>history.back());await exitPage.waitForTimeout(30);}assert.equal(exitPage.url(),url,'Repeated rapid Back exited app');await exitPage.close();
 assert.deepEqual(errors,[]);fs.writeFileSync('.local/telegram-stress-results.json',JSON.stringify({passed:true,cases,avatarRequests:avatarRequests.size,mediaRequests:mediaRequests.size,checks:['160 chats with wheel/touch scrolling','sticky archive despite old hidden preference','compose contact search and error fallback','200 mixed-height group/channel messages','fixed latest arrow','active group VC','album rendering and whole-album forwarding','profile photo/file/audio/link opening and pagination','slow repeated root Back remains in app',cases+' actual rendered palette/mode checks','persisted notification/sound switches']},null,2));console.log('Stress UI checks passed',JSON.stringify({cases,avatars:avatarRequests.size,media:mediaRequests.size}));
}catch(error){console.error(error);console.error('Page errors:',errors);process.exitCode=1;}finally{await browser.close();await server.close();}
