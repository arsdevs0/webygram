import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, RotateCw } from 'lucide-react';
import type { MediaAttachment } from '../../types/telegram';

/** Load a real preview in the timeline; the viewer fetches the original on demand. */
export function ChatPhoto({ media, onOpen, children }: { media: MediaAttachment; onOpen: () => void; children?: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [retry, setRetry] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setLoaded(false); setFailed(false); setFull(false); setRetry(0);
    return () => clearTimeout(timer.current);
  }, [media.url, media.thumbnailUrl]);
  const retryPhoto = () => { clearTimeout(timer.current); setFailed(false); setLoaded(false); setRetry(n => n + 1); };
  useEffect(() => {
    if (!failed) return;
    window.addEventListener('online', retryPhoto);
    return () => window.removeEventListener('online', retryPhoto);
  }, [failed]);
  const source = !full && media.thumbnailUrl ? media.thumbnailUrl : media.url;
  const src = retry ? `${source}${source.includes('?') ? '&' : '?'}r=${retry}` : source;
  const ratio = media.width && media.height ? Math.max(.66, Math.min(2.4, media.width / media.height)) : 4 / 3;
  return <div className="relative overflow-hidden bg-elevated" style={{ width: Math.max(210, Math.min(340, 320 * ratio)), maxWidth: '100%', aspectRatio: ratio }}>
    {media.inlineThumb && !loaded && <img src={media.inlineThumb} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover blur-sm" />}
    <button type="button" onClick={onOpen} aria-label={`Open ${media.fileName || 'photo'}`} className="absolute inset-0 w-full h-full cursor-zoom-in">
      {!failed && <img key={src} src={src} alt={media.fileName || 'Photo'} loading="lazy" decoding="async" width={media.width} height={media.height}
        onLoad={() => { setLoaded(true); setFailed(false); }}
        onError={() => {
          if (!full && media.thumbnailUrl) { setFull(true); return; }
          if (!retry) { timer.current = setTimeout(retryPhoto, 1600); return; }
          setFailed(true);
        }} className={`h-full w-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`} draggable={false} />}
    </button>
    {!loaded && !failed && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="bg-surface/90 text-ink rounded-full p-3"><Loader2 className="w-5 h-5 animate-spin" /><span className="sr-only">Loading photo</span></span></div>}
    {failed && <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-surface/90 text-ink px-4"><ImageOff className="w-6 h-6 text-muted" /><span className="text-sm">Photo could not load</span><button type="button" onClick={retryPhoto} className="flex gap-2 items-center rounded-full bg-primary text-on-primary px-4 py-2 text-sm min-h-11"><RotateCw className="w-4 h-4" />Retry photo</button></div>}
    {children}
  </div>;
}
