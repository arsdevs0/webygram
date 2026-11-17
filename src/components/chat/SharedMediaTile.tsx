import React, { useEffect, useRef, useState } from 'react';
import { Play, ImageOff } from 'lucide-react';
import { useNearViewport } from '../common/useNearViewport';
import { mediaRetrySource } from '../../utils/mediaRetrySource';
import type { TelegramMessage } from '../../types/telegram';
export function SharedMediaTile({ message, onOpen, anchor = false }: { message: TelegramMessage; onOpen: () => void; anchor?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const near = useNearViewport(ref);
  const [failed, setFailed] = useState(false);

  const media = message.media!;
  const video = media.type === 'video' || media.type === 'gif';
  const source = media.thumbnailUrl || (video ? media.inlineThumb : media.url);
  useEffect(() => setFailed(false), [source]);
  return <button ref={ref} type="button" id={anchor ? 'msg-' + message.id : undefined} onClick={onOpen} aria-label={'Open ' + (media.fileName || (video ? 'video' : 'photo'))} className="tg-shared-tile">
    {media.inlineThumb && <img src={media.inlineThumb} alt="" aria-hidden="true" />}
    {near && source && !failed && <img src={mediaRetrySource(source, 0)} alt={media.fileName || (video ? 'Video' : 'Photo')} decoding="async" onError={() => setFailed(true)} />}
    {failed && <span className="tg-tile-fallback"><ImageOff /><span>Open media</span></span>}
    {video && <span className="tg-tile-duration"><Play />{media.duration ? Math.floor(media.duration / 60) + ':' + String(Math.floor(media.duration % 60)).padStart(2, '0') : media.type === 'gif' ? 'GIF' : 'Video'}</span>}
  </button>;
}
