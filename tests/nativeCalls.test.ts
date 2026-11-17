import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { registerNativeCallRoutes } from '../src/server/nativeCalls.ts';
import { registerContactRoutes } from '../src/server/contacts.ts';
import { Api, helpers } from 'telegram';
const bundle=await build({entryPoints:['src/vendor/telegram-calls/api/gramjs/methods/phoneCallState.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const {PhoneCallState}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const prime=Buffer.from('c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b','hex');
const dh=()=>({p:Array.from(prime),g:3,random:Array.from(crypto.getRandomValues(new Uint8Array(256)))});
const emojis={emojiData:new Uint16Array([65,66,67]),emojiOffsets:[0,1,2,3]};
async function pair(sctp=false){
  const a=new PhoneCallState(true,sctp),b=new PhoneCallState(false,sctp);
  const hash=await a.requestCall(dh());const gB=b.acceptCall({...dh(),gAHash:hash});
  const resultA=await a.confirmCall({gAOrB:gB,...emojis});
  const resultB=await b.confirmCall({gAOrB:resultA.gA,expectedKeyFingerprint:resultA.keyFingerprint,...emojis});
  assert.equal(resultA.keyFingerprint,resultB.keyFingerprint);assert.equal(resultA.emojis,resultB.emojis);
  return {a,b};
}
test('native call peers derive matching keys; authenticated packets reject tampering and replay',async()=>{
  const {a,b}=await pair();
  const body={'@type':'InitialSetup',ufrag:'fixture',pwd:'fixture'};
  const packet=await a.encode(body);assert.deepEqual(await b.decode(packet),body);
  assert.equal(await b.decode(packet),undefined);
  const next=await a.encode({'@type':'MediaState',muted:true});
  const corrupted=[...next];corrupted[corrupted.length-1]^=1;
  assert.equal(await b.decode(corrupted),undefined);assert.deepEqual(await b.decode(next),{'@type':'MediaState',muted:true});
  assert.throws(()=>b.verifyKeyFingerprint({expectedKeyFingerprint:'1'}),/mismatch/);
});
test('native call encryption rejects unsafe DH and substituted incoming commitments',async()=>{
  const a=new PhoneCallState(true,false);await assert.rejects(a.requestCall({...dh(),p:Array(256).fill(1)}),/Invalid DH/);
  const gHash=await a.requestCall(dh());const b=new PhoneCallState(false,false);
  assert.throws(()=>b.acceptCall({...dh(),gAHash:[1]}),/hash/);
  const gB=b.acceptCall({...dh(),gAHash:gHash});const result=await a.confirmCall({gAOrB:gB,...emojis});
  const substituted=[...result.gA];substituted[0]^=1;
  await assert.rejects(b.confirmCall({gAOrB:substituted,expectedKeyFingerprint:result.keyFingerprint,...emojis}),/hash mismatch/);
  await assert.rejects(a.confirmCall({gAOrB:gB,...emojis}),/already started/);
});
test('native encrypted SCTP signaling establishes and delivers application data',async()=>{
  const {a,b}=await pair(true);
  let toB=[await a.encode({'@type':'MediaState',muted:false})].filter(Boolean),toA:any[]=[];
  let decoded:any;
  for(let i=0;i<20 && !decoded;i++){
    for(const packet of toB){decoded=await b.decode(packet)||decoded;}
    toB=[];toA.push(...b.drainSignalingData());
    for(const packet of toA)await a.decode(packet);
    toA=[];toB.push(...a.drainSignalingData());
  }
  assert.deepEqual(decoded,{'@type':'MediaState',muted:false});
});
function routes(){const map=new Map<string,any>();return {map,app:{get:(path:string,handler:any)=>map.set(path,handler),post:(path:string,handler:any)=>map.set(path,handler)} as any};}
async function invoke(handler:any,body:any={}){let status=200,data:any;await handler({body},{status:(value:number)=>{status=value;return {json:(value:any)=>data=value};},json:(value:any)=>data=value});return {status,data};}
test('contacts are authenticated, filtered to real contacts and cached with real names',async()=>{
  const {map,app}=routes(),cache=new Map();
  const users=[new Api.User({id:helpers.returnBigInt('1'),firstName:'Alice'}),new Api.User({id:helpers.returnBigInt('2'),firstName:'Self',self:true}),new Api.User({id:helpers.returnBigInt('3'),firstName:'Deleted',deleted:true}),new Api.User({id:helpers.returnBigInt('4'),firstName:'Not a contact'})];
  let client:any=null;registerContactRoutes(app,{client:()=>client,cache});
  assert.equal((await invoke(map.get('/api/tg/contacts'))).status,401);
  client={connected:true,invoke:async(request:any)=>{assert.ok(request instanceof Api.contacts.GetContacts);assert.equal(request.hash.toString(),'0');return new Api.contacts.Contacts({savedCount:3,contacts:[1,2,3].map(id=>new Api.Contact({userId:helpers.returnBigInt(String(id)),mutual:false})),users});}};
  const result=await invoke(map.get('/api/tg/contacts'));assert.equal(result.status,200);assert.deepEqual(result.data.contacts.map((c:any)=>c.title),['Alice']);assert.equal(cache.get('1'),users[0]);assert.equal(cache.size,1);
});
test('native call RPC requires authentication and validates key payloads before invoking Telegram',async()=>{
  const {map,app}=routes();let count=0,client:any=null;registerNativeCallRoutes(app,{client:()=>client,resolvePeer:async()=>{count++;}});
  assert.equal((await invoke(map.get('/api/tg/calls/native/confirm'))).status,401);
  client={connected:true,invoke:async()=>count++};
  assert.equal((await invoke(map.get('/api/tg/calls/native/confirm'),{callId:'bad',accessHash:'1',keyFingerprint:'1',gA:Array(256).fill(0)})).status,400);
  assert.equal((await invoke(map.get('/api/tg/calls/native/signal'),{callId:'1',accessHash:'2',data:[-1]})).status,400);
  assert.equal(count,0);
});

