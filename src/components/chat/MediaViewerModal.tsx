import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Clock,
  Download,
  Shield,
  Flame,
  Save,
  Pause,
  Play,
  Check,
  Unlock,
  Eye,
  Forward,
  RotateCw,
  ImageOff,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Loader2,
} from 'lucide-react';
import { MediaAttachment } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { soundEffects } from '../../services/soundEffects';
import { useEscapeDismiss } from '../common/useEscapeDismiss';

interface Props {
  media: MediaAttachment | null;
  chatId: string;
  chatTitle?: string;
  messageId: string;
  isProtected?: boolean;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<Props> = ({
  media,
  chatId,
  chatTitle = 'Chat',
  messageId,
  isProtected = false,
  onClose,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isTimerFrozen, setIsTimerFrozen] = useState(false);
  const [hasExpired, setHasExpired] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [savingVault, setSavingVault] = useState(false);
  const [seenSent, setSeenSent] = useState(false);
  const [sendingSeen, setSendingSeen] = useState(false);
  const [forwardedOk, setForwardedOk] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(Boolean(media?.isAnimated));

  const ayuSettings = ayuGramEngine.getSettings();
  const allowBypass = ayuSettings.bypassContentRestrictions;
  const preventTTL = ayuSettings.preventTTLExpiration;

  const expiryHandledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEscapeDismiss(Boolean(media), onClose);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    setIsVideoMuted(Boolean(media?.isAnimated));
    if (!media || media.type !== 'video') return;
    const vid = videoRef.current;
    if (!vid) return;
    vid.volume = 1;
    vid.muted = Boolean(media.isAnimated);
    vid.play().catch(() => {
      if (vid && !media.isAnimated) {
        vid.muted = true;
        setIsVideoMuted(true);
        void vid.play().catch(() => {});
      }
    });
  }, [media?.type, media?.url, media?.isAnimated, messageId, retryNonce]);

  useEffect(() => {
    setHasExpired(Boolean(media?.isExpired));
    setIsTimerFrozen(false);
    setSavedSuccess(false);
    expiryHandledRef.current = false;
    setSecondsRemaining(media?.isDisappearing && !media.isExpired ? media.expireSeconds || 5 : null);
    setSeenSent(Boolean(media?.viewed));
    setForwardedOk(false);
    setMediaError(false);
    setMediaLoaded(false);
    setZoomed(false);
    setActionNotice(null);
    setRetryNonce(0);
  }, [chatId, messageId, media?.url, media?.isExpired, media?.isDisappearing, media?.expireSeconds]);

  useEffect(() => {
    if (media?.isDisappearing && !media.isExpired) {
      telegramService.markMediaAsViewed(chatId, messageId);
    }
  }, [chatId, messageId, media?.isDisappearing, media?.isExpired]);

  useEffect(() => {
    if (isTimerFrozen || secondsRemaining === null || secondsRemaining === 0) return;
    const timer = window.setTimeout(() => setSecondsRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [isTimerFrozen, secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining !== 0 || expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    if (preventTTL) {
      setActionNotice('Saving expiring media to your vault…');
      void telegramService.saveMediaToVault(chatId, messageId, chatTitle).then(saved => {
        setSavedSuccess(saved);
        setActionNotice(saved ? 'Preserved in your vault.' : 'Could not preserve this media. Try Save again.');
      });
    } else {
      setHasExpired(true);
      telegramService.markMediaExpired(chatId, messageId);
    }
  }, [secondsRemaining, preventTTL, chatId, messageId, chatTitle]);

  if (!media) return null;

  const handleDownload = () => {
    if (isProtected && !allowBypass) return;
    const started = ayuGramEngine.downloadMedia(media, media.fileName);
    setActionNotice(started ? 'Download started. Check your browser downloads.' : 'Could not start download. Please try again.');
  };

  const handleSaveToVault = async () => {
    setSavingVault(true);
    const saved = await telegramService.saveMediaToVault(chatId, messageId, chatTitle);
    setSavingVault(false);
    setSavedSuccess(saved);
    if (saved) ayuGramEngine.downloadMedia(media, media.fileName);
    setActionNotice(saved ? 'Saved to your vault. Device download started.' : 'Could not save to vault. Please try again.');
  };

  const handleMarkAsSeen = async () => {
    setSendingSeen(true);
    const ok = await telegramService.markMessageAsSeenToSender(chatId, messageId);
    setSendingSeen(false);
    if (ok) {
      setSeenSent(true);
    }
  };

  const handleForwardBypass = async () => {
    const dest = telegramService.getTargetGroup() ? 'target' : 'me';
    const res = await telegramService.forwardMessage(
      chatId,
      messageId,
      dest,
      ayuSettings.hideForwardTag
    );
    if (res.ok) {
      setForwardedOk(true);
      setTimeout(() => setForwardedOk(false), 2500);
    } else {
      setActionNotice(res.error || 'Could not forward this media. Please try again.');
    }
  };

  const handleToggleFreeze = () => {
    if (isTimerFrozen) {
      setIsTimerFrozen(false);
    } else {
      setIsTimerFrozen(true);
      soundEffects.playPop();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={media.fileName || 'Media viewer'}
      className="tg-media-viewer fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 no-select"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onContextMenu={(e) => !allowBypass && isProtected && e.preventDefault()}
    >
      <div className="tg-media-shell relative w-full max-w-4xl max-h-[94dvh] flex flex-col items-center">
        {/* Top Control Bar */}
        <div className="tg-media-toolbar w-full flex flex-wrap items-center justify-between py-2.5 px-4 text-ink dark:text-ink z-10 bg-surface dark:bg-surface rounded-2xl mb-2.5 border border-outline dark:border-outline gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {media.isDisappearing ? (
              <div className="flex items-center gap-2 text-primary font-semibold text-xs truncate">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="truncate tabular-nums">
                  {isTimerFrozen
                    ? 'Timer Paused'
                    : secondsRemaining === 0 && preventTTL
                    ? savedSuccess ? 'Preserved in Vault' : 'Timer ended'
                    : `Disappearing ${media.type === 'video' ? 'Video' : 'Photo'}: ${secondsRemaining ?? media.expireSeconds}s`}
                </span>
              </div>
            ) : isProtected ? (
              <div className="flex items-center gap-2 text-primary font-semibold text-xs truncate">
                <Shield className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {allowBypass ? 'Protected Chat (Save & Forward Bypass)' : 'Protected Chat'}
                </span>
              </div>
            ) : (
              <span className="text-xs font-medium truncate">
                {media.fileName || (media.type === 'video' ? 'Video Preview' : 'Photo Preview')}
              </span>
            )}
          </div>

          <div className="tg-media-actions flex flex-wrap items-center gap-1.5 shrink-0">
            {media.type === 'photo' && !mediaError && (
              <button type="button" onClick={() => setZoomed(value => !value)} aria-label={zoomed ? 'Fit photo to screen' : 'Zoom photo'}
                className="p-2 rounded-xl hover:bg-hover/70 dark:hover:bg-hover">
                {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              </button>
            )}
            {media.isDisappearing && (
              <button
                type="button"
                onClick={handleMarkAsSeen}
                disabled={sendingSeen || seenSent}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                  seenSent
                    ? 'bg-emerald-600/15 border-emerald-500/40 text-emerald-500'
                    : 'bg-elevated dark:bg-elevated border-outline dark:border-outline hover:border-primary'
                }`}
                title="Send real Telegram Seen receipt to the sender"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {sendingSeen ? 'Sending...' : seenSent ? 'Marked Seen ✓' : 'Mark Seen to Sender'}
                </span>
              </button>
            )}

            {(!isProtected || allowBypass) && (
              <button
                type="button"
                onClick={handleForwardBypass}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold cursor-pointer whitespace-nowrap"
                title={
                  telegramService.getTargetGroup()
                    ? `Forward to ${telegramService.getTargetGroup()?.title}`
                    : 'Forward to Saved Messages'
                }
              >
                <Forward className="w-3.5 h-3.5 text-primary" />
                <span>{forwardedOk ? 'Forwarded ✓' : 'Forward'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveToVault}
              disabled={savingVault}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title="Save Photo or Video to Saved Messages Vault and Device"
            >
              {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedSuccess ? 'Saved' : savingVault ? 'Saving...' : 'Save'}</span>
            </button>

            {media.isDisappearing && !hasExpired && (
              <button
                type="button"
                onClick={handleToggleFreeze}
                aria-label={isTimerFrozen ? 'Resume timer' : 'Pause timer'}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
                  isTimerFrozen
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 text-amber-700 dark:text-amber-300'
                    : 'bg-elevated dark:bg-elevated border-outline dark:border-outline'
                }`}
              >
                {isTimerFrozen ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                <span className="hidden sm:inline">{isTimerFrozen ? 'Resume' : 'Pause'}</span>
              </button>
            )}

            {(!isProtected || allowBypass) && (
              <button
                type="button"
                onClick={handleDownload}
                className="p-2 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-xl hover:bg-hover/70 dark:hover:bg-hover transition-colors cursor-pointer"
                title={isProtected ? 'Download (Protection Bypassed)' : 'Download Media'}
              >
                {allowBypass && isProtected ? <Unlock className="w-4 h-4 text-primary" /> : <Download className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted hover:text-ink dark:text-muted dark:hover:text-white rounded-xl hover:bg-hover/70 dark:hover:bg-hover transition-colors cursor-pointer"
              title="Close"
              aria-label="Close media viewer"
              ref={closeButtonRef}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {actionNotice && <p role="status" className="mb-2 text-sm text-white text-center">{actionNotice}</p>}
        {/* Media Viewport */}
        <div className={`tg-media-stage relative flex-1 flex items-center justify-center w-full min-h-40 max-h-[76dvh] rounded-2xl border border-[#1E2E4E] bg-black ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}>
          {!mediaLoaded && !mediaError && !hasExpired && <div role="status" aria-label="Loading media" className="absolute inset-0 flex items-center justify-center pointer-events-none"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}
          {hasExpired && !preventTTL ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted space-y-3">
              <div className="p-4 rounded-full bg-rose-950/60 text-rose-400 border border-rose-800">
                <Flame className="w-10 h-10" />
              </div>
              <h4 className="text-base font-bold text-white">Media Expired</h4>
              <p className="text-xs text-muted max-w-xs">
                Enable Prevent TTL Expiration in Mod Settings to preserve expiring photos and videos automatically.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <div className={`relative flex w-full h-full ${zoomed ? 'items-start justify-start' : 'items-center justify-center'}`}>
              {mediaError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted space-y-3">
                  <ImageOff className="w-8 h-8 text-muted" />
                  <p className="text-xs text-muted">
                    {media.type === 'video' ? 'Video failed to stream' : 'Photo failed to load'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaError(false);
                      setMediaLoaded(false);
                      setRetryNonce((n) => n + 1);
                    }}
                    className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              ) : media.type === 'video' ? (
                <div className="relative flex items-center justify-center max-h-[74vh] max-w-full">
                  <video
                    ref={videoRef}
                    src={
                      retryNonce > 0
                        ? `${media.url}${media.url.includes('?') ? '&' : '?'}r=${retryNonce}`
                        : media.url
                    }
                    poster={media.thumbnailUrl}
                    controls
                    loop={Boolean(media.isAnimated)}
                    muted={isVideoMuted}
                    playsInline
                    preload="auto"
                    onVolumeChange={() => {
                      if (videoRef.current) setIsVideoMuted(videoRef.current.muted);
                    }}
                    onError={() => setMediaError(true)}
                    onLoadedData={() => setMediaLoaded(true)}
                    className="max-h-[74vh] max-w-full rounded-xl"
                  />
                  {!media.isAnimated && isVideoMuted && (
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = false;
                          videoRef.current.volume = 1;
                          void videoRef.current.play().catch(() => {});
                          setIsVideoMuted(false);
                        }
                      }}
                      className="absolute bottom-14 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black border border-white/25 text-white text-xs font-semibold shadow-lg cursor-pointer"
                    >
                      <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tap for Sound</span>
                    </button>
                  )}
                  {!media.isAnimated && !isVideoMuted && (
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = true;
                          setIsVideoMuted(true);
                        }
                      }}
                      className="absolute top-4 left-4 p-2 rounded-full bg-black/65 hover:bg-black/85 border border-white/15 text-white/90 cursor-pointer"
                      title="Mute Video"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <img
                  src={
                    retryNonce > 0
                      ? `${media.url}${media.url.includes('?') ? '&' : '?'}r=${retryNonce}`
                      : media.url
                  }
                  alt={media.fileName || 'Telegram Media'}
                  onError={() => setMediaError(true)}
                  onLoad={() => setMediaLoaded(true)}
                  onDoubleClick={() => setZoomed(value => !value)}
                  className={zoomed ? 'max-w-none max-h-none shrink-0 self-start cursor-zoom-out select-none' : 'max-h-[74dvh] max-w-full object-contain rounded-xl select-none cursor-zoom-in'}
                  draggable={false}
                />
              )}

              {media.isDisappearing && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 border border-white/20 text-white font-mono text-xs font-semibold tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>{isTimerFrozen ? 'PAUSED' : `${secondsRemaining}s`}</span>
                </div>
              )}

              {isProtected && allowBypass && (
                <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 border border-white/20 text-[#3EA0FF] text-xs font-medium">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Protection Bypassed</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
