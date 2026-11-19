import type { MediaAttachment } from '../types/telegram';
export function mediaLabel(media?: Pick<MediaAttachment,'type'|'fileName'>) {
  if(!media)return 'Message';
  return ({photo:'Photo',video:'Video',voice:'Voice message',gif:'GIF',sticker:'Sticker',file:media.fileName || 'File'} as const)[media.type];
}
export function previewText(text?:string,media?:Pick<MediaAttachment,'type'|'fileName'>) {
  const value=text?.trim() || '';
  return value && !/^\[(photo|video|voice|file|document|sticker|gif|media)\]$/i.test(value) ? value : mediaLabel(media);
}
