import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const modulePath=process.env.PLAYWRIGHT_MODULE || process.argv[2];
if(!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs path.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const rate=48000,length=rate*10,wav=Buffer.alloc(44+length*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
for(let i=0;i<length;i++){
  let value=0;for(let harmonic=1;harmonic<=40;harmonic++){const hz=130*harmonic;const envelope=.25+3*Math.exp(-Math.pow((hz-650)/160,2))+2*Math.exp(-Math.pow((hz-1700)/250,2));value+=Math.sin(2*Math.PI*hz*i/rate)*envelope/harmonic;}
  wav.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(value*3600))),44+i*2);
}
fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/voice-fixture.wav',wav);
process.env.VITE_DIRECT_TELEGRAM='false';
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('.local/voice-fixture.wav'),'--autoplay-policy=no-user-gesture-required']});
const errors=[],voices=[],packets=[];
let a,b,call,callSequence=99;
const prime=Buffer.from('c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b','hex');
const emit=async(page,event)=>{if(page && !page.isClosed())await page.evaluate(async event=>{const {telegramService}=await import('/src/services/telegramService.ts');telegramService.callListeners.forEach(cb=>cb(event));},event);};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['microphone','camera']});
 await context.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),source=req.frame().page(); if (!url.pathname.startsWith('/api/')) { await route.continue(); return; } let body={};try{body=req.postDataJSON()||{};}catch{}
   let response={},event,target;
   if(url.pathname.endsWith('/native/dh'))response={p:Array.from(prime),g:3,random:Array.from(crypto.getRandomValues(new Uint8Array(256)))};
   else if(url.pathname.endsWith('/native/request')){call={id:String(++callSequence),accessHash:'200',state:'PhoneCallWaiting',gAHash:body.gAHash};response={call};}
   else if(url.pathname.endsWith('/native/accept')){call={...call,gB:body.gB};response={call};event={type:'PHONE_CALL_UPDATE',callId:call.id,nativeCall:{...call,state:'PhoneCallAccepted'}};target=a;}
   else if(url.pathname.endsWith('/native/confirm')){call={...call,gAOrB:body.gA,keyFingerprint:body.keyFingerprint,p2pAllowed:true,shouldUseSctp:true,state:'PhoneCall',connections:[{ip:'127.0.0.1',ipv6:'',port:9,isStun:true,username:'',password:''}]};response={call};event={type:'PHONE_CALL_UPDATE',callId:call.id,nativeCall:call};target=b;}
   else if(url.pathname.endsWith('/native/signal')){packets.push(body.data.length);response={ok:true};event={type:'PHONE_CALL_SIGNAL',callId:call.id,dataBase64:Buffer.from(body.data).toString('base64')};target=source===a?b:a;}
   else if(url.pathname.includes('/messages/send')){voices.push(body);response=voices.length===1?{error:'Voice send rejected for test'}:{ok:true,message:{id:'voice-sent',chatId:'alice',text:'',media:{type:'voice',duration:body.duration,url:body.fileDataUrl}}};}
   else if(url.pathname.endsWith('/calls/discard')){response={ok:true};target=source===a?b:a;event={type:'PHONE_CALL_UPDATE',callId:call.id,nativeCall:{id:call.id,state:'PhoneCallDiscarded'}};}
   await route.fulfill({status:url.pathname.includes('/messages/send')&&voices.length===1?400:200,json:response});
   if(event)setTimeout(()=>void emit(target,event).catch(err=>errors.push(err.message)),10);
 });
 await context.addInitScript(() => {
 // Both fake microphones play the same vowel. Disable AEC/denoising only in this
 // synthetic fixture so it cannot cancel the identical receiver signal.
 const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=constraints=>capture({...constraints,audio:constraints.audio ? {...(typeof constraints.audio==='object' ? constraints.audio : {}),echoCancellation:false,noiseSuppression:false} : false});
 const original = RTCPeerConnection.prototype.setLocalDescription;
 RTCPeerConnection.prototype.setLocalDescription = async function(description) {
   try { return await original.call(this, description); }
   catch(error) { window.__sdpFailure={error:error.message, requested:description, local:this.localDescription,remote:this.remoteDescription,transceivers:this.getTransceivers().map(t=>({mid:t.mid,direction:t.direction,current:t.currentDirection,track:t.sender.track?.id}))}; throw error; }
 };
});
a=await context.newPage();b=await context.newPage();for(const page of [a,b]){page.on('pageerror',err=>errors.push(err.message));await page.goto(origin+'/tests/ui/telegramExperience.html');}
 await a.evaluate(async()=>{const {NativeTelegramCall}=await import('/src/services/nativeTelegramCall.ts');window.__statuses=[];window.__call=new NativeTelegramCall('peer',false,undefined,(status,error)=>window.__statuses.push({status,error}),()=>{},emoji=>window.__emojis=emoji);void window.__call.start();});
 await a.waitForFunction(()=>window.__statuses.some(e=>e.status==='ringing'));
 await b.evaluate(async initial=>{const {NativeTelegramCall}=await import('/src/services/nativeTelegramCall.ts');window.__statuses=[];window.__call=new NativeTelegramCall('peer',false,{...initial,state:'PhoneCallRequested'},(status,error)=>window.__statuses.push({status,error}),()=>{},emoji=>window.__emojis=emoji);void window.__call.start();},call);
 await a.waitForFunction(()=>window.__statuses.some(e=>e.status==='connected'),null,{timeout:35000});
 await b.waitForFunction(()=>window.__statuses.some(e=>e.status==='connected'),null,{timeout:35000});
 assert.equal(await a.evaluate(()=>window.__emojis),await b.evaluate(()=>window.__emojis));
 await a.evaluate(()=>window.__call.setSpeaker(false));await b.evaluate(()=>window.__call.setSpeaker(false));
 const sample=async page=>page.evaluate(async()=>{
   const stream=window.__call.getStreams().audio;if(!stream)throw Error('No remote audio stream');
   const context=new AudioContext();await context.resume();const analyser=context.createAnalyser();analyser.fftSize=8192;context.createMediaStreamSource(stream).connect(analyser);
   await new Promise(resolve=>setTimeout(resolve,350));const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);
   let energy=0;for(const value of samples)energy+=value*value;
   let best=0,peak=0;for(let hz=85;hz<=300;hz++){let real=0,imaginary=0;for(let i=0;i<samples.length;i++){const angle=2*Math.PI*hz*i/context.sampleRate;real+=samples[i]*Math.cos(angle);imaginary+=samples[i]*Math.sin(angle);}const power=real*real+imaginary*imaginary;if(power>best){best=power;peak=hz;}}
   await context.close();return {rms:Math.sqrt(energy/samples.length),peak};
 });
 await a.waitForTimeout(1500);const dry=await sample(b);assert.ok(dry.rms>.005,'Remote dry microphone must be audible');assert.ok((await sample(a)).rms>.005,'Incoming peer microphone must also be audible');
 await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');voiceChanger.setPreset('natural_female');await voiceChanger.setEnabled(true);});
 await a.waitForTimeout(1800);const wet=await sample(b);assert.ok(wet.rms>.005,'Remote processed microphone must be audible '+JSON.stringify({dry,wet}));assert.ok(wet.peak>dry.peak+25,JSON.stringify({dry,wet}));
 const senderId=await a.evaluate(()=>window.__call.getStreams().ownAudio.getAudioTracks()[0].id);
 await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');voiceChanger.setPreset('natural_male');});
 await a.waitForTimeout(900);const male=await sample(b);assert.ok(male.peak<wet.peak-20,JSON.stringify({male,wet}));
 assert.equal(await a.evaluate(()=>window.__call.getStreams().ownAudio.getAudioTracks()[0].id),senderId,'Changing preset keeps same live RTP track');
 await a.evaluate(()=>window.__call.setMuted(true));await a.waitForTimeout(800);const quiet=await sample(b);assert.ok(quiet.rms<.001,'Mute must silence the outgoing RTP track');
 assert.equal(await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');return voiceChanger.micStream.getAudioTracks()[0].readyState;}),'live','Mute must not end the shared microphone');
 await a.evaluate(()=>window.__call.setMuted(false));await a.waitForTimeout(1000);assert.ok((await sample(b)).rms>.005,'Unmute restores remote audio');
 await a.evaluate(()=>window.__call.stop());await b.waitForFunction(()=>window.__statuses.some(e=>e.status==='ended'));
 // Start another call in the same pages to exercise teardown, reused DSP and media renegotiation.
 await a.evaluate(async()=>{const {NativeTelegramCall}=await import('/src/services/nativeTelegramCall.ts');window.__statuses=[];window.__call=new NativeTelegramCall('peer',false,undefined,(status,error)=>window.__statuses.push({status,error}),()=>{},()=>{});void window.__call.start();});
 await a.waitForFunction(()=>window.__statuses.some(e=>e.status==='ringing'));
 await b.evaluate(async initial=>{const {NativeTelegramCall}=await import('/src/services/nativeTelegramCall.ts');window.__statuses=[];window.__call=new NativeTelegramCall('peer',false,{...initial,state:'PhoneCallRequested'},(status,error)=>window.__statuses.push({status,error}),()=>{},()=>{});void window.__call.start();},call);
 await a.waitForFunction(()=>window.__statuses.some(e=>e.status==='connected'),null,{timeout:35000});await b.waitForFunction(()=>window.__statuses.some(e=>e.status==='connected'),null,{timeout:35000});
 await a.evaluate(()=>window.__call.setSpeaker(false));await b.evaluate(()=>window.__call.setSpeaker(false));
 await a.waitForTimeout(800);assert.ok((await sample(a)).rms>.005);assert.ok((await sample(b)).rms>.005);
 await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');voiceChanger.pitchWorkletNode.onprocessorerror();});
 await a.waitForTimeout(500);assert.ok((await sample(b)).rms>.005,'Processor failure must keep the original microphone audible');
 await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');await voiceChanger.setEnabled(true);if(!voiceChanger.getState().enabled || voiceChanger.getLastError()) throw Error('Could not restart voice effects');});
 await a.waitForTimeout(800);assert.ok((await sample(b)).rms>.005,'Restarting voice effects restores processed audio');
 assert.equal(await a.evaluate(()=>window.__call.setVideo(true)),true,'Video can be enabled during an audio call');
 await b.waitForFunction(()=>window.__call.getStreams()?.video?.getVideoTracks().some(track=>track.readyState==='live'),null,{timeout:10000});
 await a.waitForTimeout(1200);assert.ok((await sample(b)).rms>.005,'Video negotiation preserves outgoing voice');assert.ok((await sample(a)).rms>.005,'Video negotiation preserves incoming voice');
 assert.equal(await a.evaluate(()=>window.__call.setVideo(false)),false,'Video can be disabled');
 await a.evaluate(()=>window.__call.stop());await b.waitForFunction(()=>window.__statuses.some(e=>e.status==='ended'));
 await a.evaluate(async()=>{const {voiceChanger}=await import('/src/services/voiceChangerEngine.ts');await voiceChanger.audioContext.close();if(!await voiceChanger.ensureReadyForCapture()) throw Error('Closed audio context did not recover');const {telegramService}=await import('/src/services/telegramService.ts');telegramService.authSession=telegramService.getAuthSession();});
 await a.getByText('Alice',{exact:true}).first().click();await a.locator('#msg-1').waitFor();
 await a.getByRole('button',{name:/Record Voice/}).click();await a.waitForTimeout(1500);await a.getByTitle('Send Voice Message').click();
 await a.getByRole('button',{name:'Retry voice',exact:true}).waitFor(); await a.getByText("Voice send rejected for test",{exact:true}).first().waitFor(); assert.equal(voices.length,1);
 await a.getByRole('button',{name:'Retry voice',exact:true}).click();await a.waitForFunction(()=>!document.querySelector('.tg-voice-retry'));
 assert.equal(voices.length,2);assert.equal(voices[0].fileDataUrl,voices[1].fileDataUrl,'Retry keeps the same captured audio');
 const converted=await a.evaluate(async dataUrl=>{const {convertBrowserVoice}=await import('/src/browser/voice.ts');const blob=await(await fetch(dataUrl)).arrayBuffer();const result=await convertBrowserVoice(new Uint8Array(blob),'webm',2);return {head:Array.from(result.oggBuffer.subarray(0,4)),bytes:result.oggBuffer.length,duration:result.duration};},voices[0].fileDataUrl);
 assert.deepEqual(converted.head,[79,103,103,83]);assert.ok(converted.bytes>100);assert.ok(converted.duration>=1);
 await a.getByRole('button',{name:/Record Voice/}).click();await a.waitForTimeout(500);await a.getByRole('button',{name:'Cancel',exact:true}).click();await a.waitForTimeout(400);assert.equal(voices.length,2,'Cancel cannot send a voice note');
 assert.deepEqual(errors,[]);
 fs.writeFileSync('.local/telegram-audio-results.json',JSON.stringify({passed:true,dry,wet,male,quiet,converted,packets:packets.length,checks:['two-peer native DH and SCTP signaling','real WebRTC remote microphone audio','live female and male presets on same RTP track','mute/unmute without ending shared mic','matching verification emojis','repeated call after teardown','video toggle preserves bidirectional audio','processor failure falls back and restarts','closed audio context recovers','voice-note recording and retained retry','real browser OGG/Opus worker','cancel does not send']},null,2));
 console.log('Audio checks passed: native two-peer calls, live effects, mute, voice capture/retry/cancel and OGG/Opus.',JSON.stringify({dry,wet,male,quiet,converted,packets:packets.length}));
}catch(error){console.error(error);console.error('Page errors:',errors);console.error('Voice requests:',voices.length);if(a)console.error('Page text:',await a.locator('body').innerText().catch(()=>''));if(a)console.error('Peer A:',await a.evaluate(()=>({statuses:window.__statuses,sdpFailure:window.__sdpFailure})).catch(()=>[]));if(b)console.error('Peer B:',await b.evaluate(()=>({statuses:window.__statuses,sdpFailure:window.__sdpFailure})).catch(()=>[]));process.exitCode=1;}
finally{await browser.close();await server.close();}


