import test from 'node:test';
import assert from 'node:assert/strict';
import {Api,helpers} from 'telegram';
import {registerProfileActions} from '../src/server/profileActions.ts';
function harness(connected=true){
 const routes=new Map<string,any>(),requests:any[]=[],cache=new Map<string,any>();let resolves=0;
 const long=helpers.generateRandomLong(true).multiply(0);
 const chat=new Api.Chat({id:long.add(777),title:'Shared community',participantsCount:12,photo:new Api.ChatPhotoEmpty(),date:0,version:1});
 const client:any={connected,invoke:async(request:any)=>{requests.push(request);return request instanceof Api.messages.GetCommonChats?{chats:[chat]}:{ok:true};}};
 registerProfileActions({get:(p:string,h:any)=>routes.set('GET '+p,h),post:(p:string,h:any)=>routes.set('POST '+p,h)} as any,{client:()=>client,cache,resolveUser:async()=>{resolves++;return new Api.InputPeerUser({userId:long.add(42),accessHash:long.add(123)});}});
 const call=async(method:string,body:any={},query:any={})=>{let code=200,data:any;await routes.get(method+' /api/tg/users/:userId/'+(method==='GET'?'groups':'contact'))({params:{userId:'42'},body,query},{status:(next:number)=>{code=next;return {json:(value:any)=>data=value};},json:(value:any)=>data=value});return {code,data};};
 return {call,requests,cache,resolves:()=>resolves};
}
test('profile groups reject unauthenticated requests and invalid cursors before RPC',async()=>{
 const h=harness(false);assert.equal((await h.call('GET')).code,401);assert.equal(h.resolves(),0);
 const active=harness();assert.equal((await active.call('GET',{}, {offset:'oops'})).code,400);assert.equal(active.resolves(),0);
});
test('common groups cache navigable chats and preserve long Telegram cursors',async()=>{
 const h=harness(),res=await h.call('GET',{}, {offset:'9007199254740993'});
 assert.equal(res.code,200);assert.equal(res.data.chats[0].id,'777');assert.equal(res.data.nextOffset,'777');assert.equal(res.data.hasMore,false);assert.ok(h.cache.has('777'));assert.equal(h.requests[0].maxId.toString(),'9007199254740993');assert.equal(h.requests[0].userId.userId.toString(),'42');
});
test('Add Contact validates names and keeps phone privacy exception off',async()=>{
 const h=harness();assert.equal((await h.call('POST',{})).code,400);assert.equal(h.requests.length,0);
 assert.equal((await h.call('POST',{firstName:'Alice',lastName:'Friend'})).code,200);assert.ok(h.requests[0] instanceof Api.contacts.AddContact);assert.equal(h.requests[0].phone,'');assert.equal(h.requests[0].addPhonePrivacyException,false);assert.equal((await harness(false).call('POST',{firstName:'Alice'})).code,401);
});
