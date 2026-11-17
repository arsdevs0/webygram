import { readableForeground } from '../../themes/themeTokens';
import { useNearViewport } from './useNearViewport';
import { mediaRetrySource } from '../../utils/mediaRetrySource';
import React, { useState, useEffect, useRef } from 'react';
import { Bookmark } from 'lucide-react';

interface AvatarProps {
  src?: string;
  title: string;
  id?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isSaved?: boolean;
  isOnline?: boolean;
  className?: string;
}

const AVATAR_PALETTE = [
  'bg-elevated',
  'bg-elevated',
  'bg-elevated',
  'bg-elevated',
  'bg-elevated',
  'bg-elevated',
  'bg-elevated',
];

function getPaletteClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getInitials(title: string): string {
  const clean = title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim();
  const source = clean || title.trim();
  if (!source) return 'T';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toUpperCase();
  }
  return Array.from(source)[0].toUpperCase();
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8.5 h-8.5 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-20 h-20 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = React.memo(
  ({ src, title, id = '', size = 'md', isSaved = false, isOnline = false, className = '' }) => {
    const [failed, setFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const retryTimerRef = useRef<number | null>(null);

    useEffect(() => {
      setFailed(false);
      setRetryNonce(0);
      return () => {
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };
    }, [src]);

    const elementRef=useRef<HTMLDivElement|null>(null);
    const avatarSource = src || (id && /^-?\d+$/.test(id) ? '/api/tg/avatar/' + encodeURIComponent(id) : undefined);
    const near=useNearViewport(elementRef,Boolean(avatarSource)&&!isSaved);
    const colors = ['#d8646d','#be6cbe','#7676d3','#4c8bcb','#47a5b8','#429d77','#bd813c'];
    let hash=0; for (const c of id || title) hash=(hash*31+c.charCodeAt(0))|0;
    const avatarColor=colors[Math.abs(hash)%colors.length];
    const sizeClass = SIZE_CLASSES[size];
    const paletteClass = getPaletteClass(id || title);
    const initials = getInitials(title);

    if (isSaved) {
      return (
        <div
          className={`relative shrink-0 rounded-full bg-primary text-white flex items-center justify-center ${sizeClass} ${className}`}
        >
          <Bookmark className={size === 'xs' ? 'w-3 h-3 fill-current' : 'w-5 h-5 fill-current'} />
        </div>
      );
    }

    const resolvedSrc =
      avatarSource && retryNonce > 0
        ? mediaRetrySource(avatarSource,retryNonce)
        : avatarSource;

    return (
      <div ref={elementRef} className={`relative shrink-0 ${sizeClass} ${className}`}>
        {/* Monogram underneath as seamless fallback */}
        <div
          style={{background:avatarColor,color:readableForeground(avatarColor)}} className={`w-full h-full rounded-full ${paletteClass} text-ink font-semibold flex items-center justify-center select-none border border-outline`}
        >
          <span>{initials}</span>
        </div>

        {near && resolvedSrc && !failed && (
          <img
            src={resolvedSrc}
            alt={title}
            loading="eager"
            decoding="async"
            onError={() => {
              setFailed(true);
              if (retryNonce < 1 && !retryTimerRef.current) {
                retryTimerRef.current = window.setTimeout(() => {
                  retryTimerRef.current = null;
                  setFailed(false);
                  setRetryNonce((n) => n + 1);
                }, 2200);
              }
            }}
            className="absolute inset-0 w-full h-full rounded-full object-cover border border-outline dark:border-outline"
          />
        )}

        {isOnline && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#22C55E] border-2 border-white dark:border-outline rounded-full z-10" />
        )}
      </div>
    );
  }
);
