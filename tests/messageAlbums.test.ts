import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTimelineMessages, albumForwardSelection } from '../src/utils/messageAlbums.ts';
import type { TelegramMessage } from '../src/types/telegram.ts';
const message = (id: string, extra = {}): TelegramMessage => ({ id, chatId: 'group', senderId: 'alice', senderName: 'Alice', timestamp: 100, text: '', isOutgoing: false, isRead: true, media: { type: 'photo', url: '/photo' }, ...extra });
test('contiguous album photos/videos stay together without combining other senders or chats', () => {
 const list = [message('1', {groupedId:'42'}), message('2', {groupedId:'42',media:{type:'video',url:'/video'}}), message('3'), message('4',{groupedId:'42',senderId:'bob'})];
 assert.deepEqual(groupTimelineMessages(list).map(group=>group.map(item=>item.id)), [['1','2'],['3'],['4']]);
});
test('album forwarding includes the whole album and retains source order', () => {
 const list=[message('1',{groupedId:'42'}),message('2',{groupedId:'42'}),message('3',{groupedId:'43'}),message('4',{groupedId:'42',isDeletedBySender:true})];
 assert.deepEqual(albumForwardSelection(list,list[1]).map(item=>item.id),['1','2']);
});
test('expiring media cannot be merged into an ordinary album', () => {
 const list=[message('1',{groupedId:'42',media:{type:'photo',url:'/photo',isDisappearing:true}}),message('2',{groupedId:'42'})];
 assert.equal(groupTimelineMessages(list).length,2);
});
