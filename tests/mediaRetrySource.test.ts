import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaRetrySource } from '../src/utils/mediaRetrySource.ts';
test('retries never corrupt embedded, blob or signed remote image URLs',()=>{
 for(const source of ['data:image/png;base64,aGVsbG8=','blob:https://example.com/123','https://cdn.example.com/photo?signature=abc'])assert.equal(mediaRetrySource(source,2),source);
});
test('own media retries preserve thumbnail and range query options',()=>{
 assert.equal(mediaRetrySource('/api/tg/media/1/2?thumb=1#preview',3),'/api/tg/media/1/2?thumb=1&r=3#preview');
});
