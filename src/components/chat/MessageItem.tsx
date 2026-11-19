import { mediaSecondsRemaining, VIEW_ONCE_SECONDS } from '../../utils/mediaReceipt';
import { previewText } from '../../utils/messagePreview';
import { MessageStatus } from './MessageStatus';
import { ReportMessageModal } from './ReportMessageModal';
import { useNearViewport } from '../common/useNearViewport';
import { mediaRetrySource } from '../../utils/mediaRetrySource';
import { SharedMediaTile } from './SharedMediaTile';
import { readableText, readableAccent } from '../../themes/themeTokens';
import { ChatPhoto } from './ChatPhoto';
import { useEscapeDismiss } from '../common/useEscapeDismiss';
import { createPortal } from 'react-dom';
import React, { useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import {
  Check,
  CheckCheck,
  Play,
  Pause,
  Clock,
  Pin,
  Flame,
  Smile,
  Reply,
  MoreVertical,
  Trash2,
  Edit2,
  Eye,
  History,
  Languages,
  Forward,
  Filter,
  Download,
  FileText,
  Film,
  Save,
  Copy,
  RotateCw,
  ImageOff,
  Music,
  Link2,
  MessageSquareText,
  CheckSquare,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { TelegramMessage, MediaAttachment, InlineButton } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { modSettingsStore } from '../../services/modSettingsStore';
import { soundEffects } from '../../services/soundEffects';
import { Avatar } from '../common/Avatar';
import { FormattedText } from '../common/FormattedText';

const subscribeAyuSettings = (cb: () => void) => ayuGramEngine.subscribe(() => cb());
const getAyuSettingsSnapshot = () => ayuGramEngine.getSettings();
const subscribeModSettings = (cb: () => void) => modSettingsStore.subscribe(() => cb());
const getModSettingsSnapshot = () => modSettingsStore.getSettings();

interface Props {
  message: TelegramMessage;
  albumMessages?: TelegramMessage[];
  chatId: string;
  chatTitle?: string;
  isChannel?: boolean;
  isProtected?: boolean;
  highlightQuery?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelection?: (id: string) => void;
  onOpenForwardPicker?: (msgId: string) => void;
  onOpenComments?: (msg: TelegramMessage) => void;
  onBotSwitchInline?: (text: string) => void;
  onOpenMedia: (media: MediaAttachment, messageId: string) => void;
  onReply: (msg: TelegramMessage) => void;
  onEdit: (msg: TelegramMessage) => void;
  onOpenChatByLink?: (link: string) => void;
  onOpenUserProfile?: (userId: string, fallbackName?: string) => void;
  onJumpToMessage?: (msgId: string) => void;
  onNotify?: (msg: string) => void;
}

const SENDER_NAME_COLORS = [
  'text-[#EC5E95]',
  'text-[#53D769]',
  'text-[#64D2FF]',
  'text-[#FF9F0A]',
  'text-[#BF5AF2]',
  'text-primary',
  'text-[#FF6B6B]',
];

function getSenderNameColor(idOrName: string): string {
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = idOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_NAME_COLORS[Math.abs(hash) % SENDER_NAME_COLORS.length];
}

const QUICK_REACTION_EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '😮', '🤣', '😢'];

const ALL_TELEGRAM_REACTIONS = [
  '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
  '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
  '🙏', '👌', '🕊', '🤡', '🥱', '🥴', '😍', '🐳',
  '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆',
  '💔', '🤨', '😐', '🍓', '🍾', '💋', '😈', '😴',
  '😭', '🤓', '👻', '👀', '🎃', '🤝', '✍️', '🤗',
  '🫡', '💅', '🗿', '🆒', '💘', '🦄', '😘', '😎',
  '👾', '🤷‍♂️', '😡', '😮',
];

const formatCompactCount = (count?: number): string => {
  if (!count || count <= 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

export const MessageItem: React.FC<Props> = React.memo(({
  message,
  albumMessages,
  chatId,
  chatTitle = 'Chat',
  isChannel = false,
  isProtected = false,
  highlightQuery,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onStartSelection,
  onOpenForwardPicker,
  onOpenComments,
  onBotSwitchInline,
  onOpenMedia: openMedia,
  onReply,
  onEdit,
  onOpenChatByLink,
  onOpenUserProfile,
  onJumpToMessage,
  onNotify,
}) => {
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showAllReactions, setShowAllReactions] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [revealFiltered, setRevealFiltered] = useState(false);
  const [savingVault, setSavingVault] = useState(false);
  const [forwardingState, setForwardingState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [markedSeenSent, setMarkedSeenSent] = useState(Boolean(message.media?.viewed));
  const [markingSeenBusy, setMarkingSeenBusy] = useState(false);
  const [showTimerChoice, setShowTimerChoice] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const [fullImageLoaded, setFullImageLoaded] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [imageRetryNonce, setImageRetryNonce] = useState(0);
  const [videoRetryNonce, setVideoRetryNonce] = useState(0);
  const [votingBusy, setVotingBusy] = useState(false);
  const [botBtnBusy, setBotBtnBusy] = useState<string | null>(null);

  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [hasBurned, setHasBurned] = useState(message.media?.isExpired || false);
  const ayuSettings = useSyncExternalStore(subscribeAyuSettings, getAyuSettingsSnapshot);
  const modSettings = useSyncExternalStore(subscribeModSettings, getModSettingsSnapshot);

  useEscapeDismiss(showActionsMenu || showReactionPicker || showEditHistory, () => { setShowActionsMenu(false); setShowReactionPicker(false); setShowEditHistory(false); });
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionPosition, setActionPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!showActionsMenu) return;
    const position = () => {
      const anchor = bubbleRef.current?.getBoundingClientRect();
      const menu = actionMenuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const top = anchor.top + 24 + menu.height <= window.innerHeight - 12 ? anchor.top + 24 : anchor.bottom - menu.height;
      setActionPosition({ top: Math.max(12, Math.min(top, window.innerHeight - menu.height - 12)), left: Math.max(12, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 12)) });
    };
    position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [showActionsMenu]);
  const forwardBusyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const nearViewport = useNearViewport(bubbleRef, Boolean(message.media), false);
  useEffect(() => { for (const video of bubbleRef.current?.querySelectorAll('video[data-autoplay-preview]') || []) { if (nearViewport && modSettingsStore.getSettings().autoPlayGifs !== false) void (video as HTMLVideoElement).play().catch(() => {}); else (video as HTMLVideoElement).pause(); } }, [nearViewport]);
  const mediaTapTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const pressTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>{clearTimeout(mediaTapTimer.current);clearTimeout(pressTimer.current);},[]);
  const onOpenMedia=(media:MediaAttachment,id:string)=>{if(mediaTapTimer.current){clearTimeout(mediaTapTimer.current);mediaTapTimer.current=undefined;onStartSelection?.(message.id);return;}mediaTapTimer.current=setTimeout(()=>{mediaTapTimer.current=undefined;openMedia(media,id);},250);};
  const lastTapRef = useRef<number>(0);
  const gesture=useRef<{x:number;y:number;pointer:number}|null>(null);
  const suppressClick=useRef(false);
  const [swipeOffset,setSwipeOffset]=useState(0);
  const [reporting,setReporting]=useState(false);
  const [receiptNotice,setReceiptNotice]=useState('');
  const timerRef = useRef<number | null>(null);
  const imageAutoRetriedRef = useRef(false);
  const autoRetryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onOtherAudio = (ev: Event) => {
      const detailId = (ev as CustomEvent<string>).detail;
      if (detailId !== message.id && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlayingVoice(false);
      }
    };
    window.addEventListener('tgplus-audio-play', onOtherAudio);
    return () => window.removeEventListener('tgplus-audio-play', onOtherAudio);
  }, [message.id]);

  useEffect(() => {
    if (!showActionsMenu && !showReactionPicker) return;
    const handleOutside = (ev: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(ev.target as Node) && !actionMenuRef.current?.contains(ev.target as Node)) {
        setShowActionsMenu(false);
        setShowReactionPicker(false);
      }
    };
    const handleEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setShowActionsMenu(false);
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showActionsMenu, showReactionPicker]);

  useEffect(() => {
    setHasImageError(false);
    setFullImageLoaded(false);
    setHasVideoError(false);
    setImageRetryNonce(0);
    setVideoRetryNonce(0);
    imageAutoRetriedRef.current = false;
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    return () => {
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
  }, [message.media?.url, message.id]);

  const handlePhotoLoadError = () => {
    if (!imageAutoRetriedRef.current) {
      imageAutoRetriedRef.current = true;
      autoRetryTimerRef.current = window.setTimeout(() => {
        setImageRetryNonce((n) => n + 1);
      }, 1500);
      return;
    }
    setHasImageError(true);
  };

  const isFilteredOut = !revealFiltered && ayuGramEngine.isMessageFiltered(message.text);
  const isOut = message.isOutgoing;

  const handleBubbleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(message.id);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      clearTimeout(mediaTapTimer.current);mediaTapTimer.current=undefined;onStartSelection?.(message.id);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handlePollVote = async (optionHex: string) => {
    if (!message.poll || message.poll.closed || votingBusy) return;
    setVotingBusy(true);
    try {
      const currentChosen = message.poll.options
        .filter((o) => o.chosen)
        .map((o) => o.optionHex);
      let nextHexes: string[];
      if (message.poll.multipleChoice) {
        nextHexes = currentChosen.includes(optionHex)
          ? currentChosen.filter((h) => h !== optionHex)
          : [...currentChosen, optionHex];
      } else {
        nextHexes = [optionHex];
      }
      await telegramService.votePoll(chatId, message.id, nextHexes);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not submit vote');
    } finally {
      setVotingBusy(false);
    }
  };

  const handleInlineButtonClick = async (btn: InlineButton) => {
    if (btn.switchInline !== undefined) {
      onBotSwitchInline?.(btn.switchInline);
      return;
    }
    if (btn.callbackDataHex) {
      setBotBtnBusy(btn.callbackDataHex);
      try {
        const res = await telegramService.triggerBotCallback(
          chatId,
          message.id,
          btn.callbackDataHex
        );
        if (res.message) onNotify?.(res.message);
        else onNotify?.('Bot action triggered');
      } catch (err) {
        onNotify?.((err as Error).message || 'Bot action failed');
      } finally {
        setBotBtnBusy(null);
      }
    }
  };

  const handleToggleVoicePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlayingVoice) {
      audio.pause();
      setIsPlayingVoice(false);
    } else {
      window.dispatchEvent(new CustomEvent('tgplus-audio-play', { detail: message.id }));
      soundEffects.initCtx();
      audio.muted = false;
      audio.volume = 1.0;
      if (audio.readyState === 0) {
        audio.load();
      }
      audio
        .play()
        .then(() => setIsPlayingVoice(true))
        .catch((err) => {
          setIsPlayingVoice(false);
          onNotify?.(
            `Could not play audio (${(err as Error)?.message || 'format unsupported in browser'}).`
          );
        });
    }
  };

  const handleSeekVoiceWaveform = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (message.media?.duration || 10);
    audio.currentTime = ratio * total;
    setVoiceProgress(ratio * 100);
    if (!isPlayingVoice) {
      handleToggleVoicePlayback();
    }
  };

  const handleVoiceTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const total =
      Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
        ? audioRef.current.duration
        : message.media?.duration || 10;
    setVoiceProgress((current / total) * 100);
  };

  const handleVoiceEnded = () => {
    setIsPlayingVoice(false);
    setVoiceProgress(0);
  };

  const handleSaveToVault = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message.media) return;
    setSavingVault(true);
    await telegramService.saveMediaToVault(chatId, message.id, chatTitle);
    ayuGramEngine.downloadMedia(message.media, message.media.fileName);
    setSavingVault(false);
  };

  const handleForwardBypass = async (e: React.MouseEvent, destination: 'target' | 'me' = 'me') => {
    e.stopPropagation();
    if (forwardBusyRef.current) return;
    forwardBusyRef.current = true;
    setForwardingState('busy');
    const target =
      destination === 'target' && telegramService.getTargetGroup() ? 'target' : 'me';
    const result = await telegramService.forwardMessage(chatId, message.id, target, ayuSettings.hideForwardTag);
    forwardBusyRef.current = false;
    if (!result.ok) { setForwardingState('idle'); onNotify?.(result.error || 'Could not forward message.'); return; }
    onNotify?.('Forwarded to ' + (target === 'me' ? 'Saved Messages' : telegramService.getTargetGroup()?.title));
    setForwardingState('done');
    setTimeout(() => setForwardingState('idle'), 2000);
  };

  const handleMarkSeenToSender = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingSeenBusy(true);
    const ok = await telegramService.markMessageAsSeenToSender(chatId, message.id);
    if (ok) {
      setMarkedSeenSent(true);
      if (message.media?.isDisappearing) openMedia(telegramService.getMessages(chatId).find(item => item.id === message.id)?.media || message.media, message.id);
      onNotify?.('Marked as seen on Telegram ✓');
    } else {
      onNotify?.('Could not send seen receipt');
    }
    setMarkingSeenBusy(false);
  };

  const handleOpenSilentView = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!message.media) return;
    setShowTimerChoice(false);
    onOpenMedia(message.media, message.id);
  };

  useEffect(() => {
    setMarkedSeenSent(Boolean(message.media?.viewed));
    setHasBurned(Boolean(message.media?.isExpired));
    const tick = () => {
      const remaining = mediaSecondsRemaining(message.media);
      setCountdownRemaining(remaining);
      if (remaining === 0 && !ayuGramEngine.getSettings().preventTTLExpiration) {
        setHasBurned(true); telegramService.markMediaExpired(chatId, message.id);
      }
    };
    tick();
    if (!message.media?.expiresAt || message.media?.isExpired) return;
    const timer = window.setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [chatId, message.id, message.media?.expiresAt, message.media?.isExpired, message.media?.viewed]);

  const handleTimerMediaCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasBurned || message.media?.isExpired) return;
    handleOpenSilentView(e);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      ...(ayuSettings.showMessageSeconds ? { second: '2-digit' } : {}),
    });
  };

  const formatDuration = (secs?: number) => {
    const s = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  };

  const radiusClass =
    modSettings.bubbleRadius === 'subtle'
      ? 'rounded-lg'
      : modSettings.bubbleRadius === 'extra'
      ? 'rounded-3xl'
      : 'rounded-2xl';

  const stickerDimClass =
    modSettings.stickerSize === 'small'
      ? 'w-28 h-28'
      : modSettings.stickerSize === 'large'
      ? 'w-44 h-44'
      : 'w-36 h-36';

  const activePalette = modSettingsStore.getActivePaletteTokens();
  const isLightMintOut = Boolean(activePalette.isLight && modSettings.bubbleStyle !== 'ios');
  const isDarkOut = isOut && !isLightMintOut;

  const getBubbleSurfaceClasses = (outgoing: boolean) => {
    const style = modSettings.bubbleStyle || 'telegram';
    if (style === 'ios' && outgoing) return 'tg-message-bubble tg-bubble-ios bg-primary text-on-primary border border-transparent rounded-br-xs';
    const surface = outgoing ? 'tg-message-bubble tg-bubble-out rounded-br-xs' : 'tg-message-bubble tg-bubble-in rounded-bl-xs';
    if (style === 'minimal') return surface + ' tg-message-text border border-transparent shadow-none';
    if (style === 'glass') return surface + ' tg-message-text border opacity-95';
    return surface + ' tg-message-text border';
  };

  const fontSizeClass =
    modSettings.fontSize === 'compact'
      ? 'text-[12.5px]'
      : modSettings.fontSize === 'large'
      ? 'text-[15px]'
      : 'text-[16px]';

  if (isFilteredOut) {
    return (
      <div className="flex justify-center my-2 px-4">
        <button
          type="button"
          onClick={() => setRevealFiltered(true)}
          className="px-3 py-1 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline text-[11px] text-muted dark:text-muted flex items-center gap-1.5 cursor-pointer"
        >
          <Filter className="w-3 h-3 text-primary" />
          <span>Filtered message (Tap to view)</span>
        </button>
      </div>
    );
  }

  const isDeleted = Boolean(message.isDeletedBySender);
  const deletedSideLabel = isDeleted && ayuSettings.showDeletedBadge ? (
    <div
      className={`flex items-center gap-1 text-[10.5px] font-medium text-rose-500 dark:text-rose-400 tabular-nums shrink-0 self-end pb-1 select-none ${
        isOut ? 'mr-2' : 'ml-2'
      }`}
    >
      <Trash2 className="w-3 h-3 shrink-0" />
      <span>Deleted · {formatTime(message.deletedAt || message.timestamp)}</span>
    </div>
  ) : null;

  const isStickerOnly = message.media?.type === 'sticker' && !message.text;
  const isGroupChat = chatId.startsWith('-') && !isChannel;
  const canShowChannelComments = Boolean(isChannel && message.canComment && onOpenComments);
  const effectiveSenderId = message.senderId || (!isOut && !chatId.startsWith('-') ? chatId : '');
  const senderColorClass = getSenderNameColor(effectiveSenderId || message.senderName || 'user');

  return (
    <div
      id={`msg-${message.id}`}
      onClick={() => {
        if (selectionMode && onToggleSelect) onToggleSelect(message.id);
      }}
      className={`tg-message-row relative group flex flex-col mb-2 px-3 sm:px-4 ${
        isOut ? 'items-end' : 'items-start'
      } ${isDeleted ? 'opacity-70' : ''} ${
        selectionMode ? 'cursor-pointer' : ''
      } ${isSelected ? 'bg-primary/10 py-1 rounded-xl' : ''}`}
    >
      <div className={`flex items-end max-w-full gap-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 self-center cursor-pointer ${
              isSelected
                ? 'bg-primary border-primary text-white'
                : 'border-outline dark:border-outline bg-surface dark:bg-surface'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
        )}

        {/* Official Telegram Group Left-Side Circular Sender Avatar */}
        {!isOut && isGroupChat && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (effectiveSenderId && onOpenUserProfile) {
                onOpenUserProfile(effectiveSenderId, message.senderName);
              }
            }}
            className="shrink-0 self-end mb-0.5 rounded-full focus:outline-none hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
            title={message.senderName ? `View ${message.senderName}'s profile` : 'View profile'}
          >
            <Avatar
              src={message.senderAvatar}
              title={
                ayuSettings.streamerMode
                  ? ayuGramEngine.maskForStreamer(message.senderName || 'User', 'handle')
                  : message.senderName || 'User'
              }
              id={effectiveSenderId || message.senderName || 'user'}
              size="sm"
            />
          </button>
        )}

        {isOut && deletedSideLabel}

        {/* Message Bubble: Supports Color Palettes & Bubble Styles */}
        <div
          ref={bubbleRef}
          onClick={(e) => {
            if (selectionMode) {
              e.stopPropagation();
              onToggleSelect?.(message.id);
              return;
            }
            if (!suppressClick.current) handleBubbleClick();
          }}
          onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}
          onDoubleClick={e=>{e.preventDefault();if(!selectionMode)onStartSelection?.(message.id);}}
          onPointerDown={e=>{if(selectionMode || e.button!==0 || (e.target as HTMLElement).closest('input,textarea,audio,video,input,[data-message-controls]'))return;suppressClick.current=false;gesture.current={x:e.clientX,y:e.clientY,pointer:e.pointerId};if(e.pointerType==='touch')pressTimer.current=setTimeout(()=>{suppressClick.current=true;gesture.current=null;setShowActionsMenu(true);navigator.vibrate?.(8);},450);}}
          onPointerMove={e=>{const a=gesture.current;if(!a)return;const dx=e.clientX-a.x,dy=e.clientY-a.y;if(Math.abs(dx)>10 || Math.abs(dy)>10)clearTimeout(pressTimer.current);if(Math.abs(dy)>30 && Math.abs(dy)>Math.abs(dx)){gesture.current=null;setSwipeOffset(0);return;}if(dx<-12 && Math.abs(dx)>Math.abs(dy)*1.5){e.currentTarget.setPointerCapture(e.pointerId);setSwipeOffset(Math.max(-80,dx));}}}
          onPointerUp={e=>{clearTimeout(pressTimer.current);const a=gesture.current;gesture.current=null;if(a && e.clientX-a.x<-58 && Math.abs(e.clientY-a.y)<40){suppressClick.current=true;clearTimeout(mediaTapTimer.current);mediaTapTimer.current=undefined;onReply(message);navigator.vibrate?.(8);}setSwipeOffset(0);}}
          onPointerCancel={()=>{clearTimeout(pressTimer.current);gesture.current=null;setSwipeOffset(0);}}
          style={
            !isStickerOnly && (modSettings.bubbleStyle === 'telegram' || !modSettings.bubbleStyle)
              ? {
                  backgroundColor: isOut ? 'var(--tg-bubble-out, #2B5278)' : undefined,
                  transform:swipeOffset? 'translateX('+swipeOffset+'px)' : undefined,
                  touchAction:'pan-y',
                  '--message-ink':readableText(activePalette.text || '#ffffff',[isOut?activePalette.bubbleOut:activePalette.bubbleIn]),
                  '--message-muted':readableText(activePalette.muted || '#92a5b2',[isOut?activePalette.bubbleOut:activePalette.bubbleIn]),
                  '--message-accent':readableAccent(modSettingsStore.getActiveAccentHex(),isOut?activePalette.bubbleOut:activePalette.bubbleIn,readableText(activePalette.text || '#ffffff',[isOut?activePalette.bubbleOut:activePalette.bubbleIn])),
                } as React.CSSProperties
              : undefined
          }
          className={`relative ${
            isChannel ? 'max-w-[86vw] sm:max-w-[470px]' : 'max-w-[80vw] sm:max-w-[420px]'
          } select-text ${radiusClass} ${
            isStickerOnly
              ? 'bg-transparent border-transparent'
              : getBubbleSurfaceClasses(isOut)
          }`}
        >
          {/* Official Telegram Group Colored Sender Name inside top of bubble */}
          {!isOut && isGroupChat && message.senderName && !isStickerOnly && (
            <div className="px-3.5 pt-2 -mb-0.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (effectiveSenderId && onOpenUserProfile) {
                    onOpenUserProfile(effectiveSenderId, message.senderName);
                  }
                }}
                className={`text-[12.5px] font-semibold truncate hover:underline cursor-pointer text-left ${senderColorClass}`}
                style={{color:readableAccent(senderColorClass.match(/#[0-9A-Fa-f]{6}/)?.[0] || modSettingsStore.getActiveAccentHex(),activePalette.bubbleIn,activePalette.text || '#202124')}}
                title={`View ${message.senderName}'s profile`}
              >
                {ayuSettings.streamerMode
                  ? ayuGramEngine.maskForStreamer(message.senderName, 'handle')
                  : message.senderName}
              </button>
            </div>
          )}

          {/* Forwarded Header */}
          {message.forwardFrom && (
            <div
              className={`px-3.5 pt-2 text-[10.5px] font-medium flex items-center gap-1 ${
                isDarkOut ? 'text-primary' : isOut ? 'text-primary' : 'text-primary'
              }`}
            >
              <Forward className="w-3 h-3" />
              <span>
                Forwarded from {message.forwardFrom.name}
                {message.forwardFrom.channelTitle ? ` (${message.forwardFrom.channelTitle})` : ''}
              </span>
            </div>
          )}

          {/* Official Telegram Interactive Reply Quote Banner */}
          {message.replyTo && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onJumpToMessage?.(message.replyTo!.id);
              }}
              className={`mx-2.5 mt-2 mb-1 px-2.5 py-1.5 rounded-lg text-xs flex items-stretch gap-2 cursor-pointer transition-colors ${
                isDarkOut
                  ? 'bg-elevated hover:bg-hover text-ink'
                  : isOut
                  ? 'bg-primary/15 hover:bg-primary/22 text-muted'
                  : 'bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover'
              }`}
              title="Tap to jump to original message"
            >
              <span
                className={`w-1 rounded-full shrink-0 ${
                  isDarkOut ? 'bg-primary' : isOut ? 'bg-primary' : 'bg-primary'
                }`}
              />
              {message.replyTo.thumbnailUrl && <img src={message.replyTo.thumbnailUrl} className="tg-reply-thumb" alt="" loading="lazy"/>}
              <div className="min-w-0 flex-1">
                <span
                  className={`font-semibold block text-[11.5px] truncate ${
                    isDarkOut ? 'text-primary' : isOut ? 'text-primary' : 'text-primary'
                  }`}
                >
                  {message.replyTo.senderName || 'Message'}
                </span>
                <span
                  className={`line-clamp-1 text-[11.5px] flex items-center gap-1 ${
                    isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                  }`}
                >
                  {message.replyTo.mediaType && (
                    <span
                      className={`font-medium capitalize ${
                        isDarkOut ? 'text-primary' : isOut ? 'text-primary' : 'text-primary'
                      }`}
                    >
                      {message.replyTo.mediaType}
                      {message.replyTo.text && !message.replyTo.text.startsWith('[') ? ' · ' : ''}
                    </span>
                  )}
                  <span className="truncate">{previewText(message.replyTo.text,message.replyTo.mediaType ? {type:message.replyTo.mediaType as MediaAttachment['type']} : undefined)}</span>
                </span>
              </div>
            </div>
          )}

        {albumMessages && <div className="tg-message-album" role="group" aria-label={'Album of ' + albumMessages.length + ' items'}>{albumMessages.map((item, index) => <SharedMediaTile key={item.id} anchor={index > 0} message={item} onOpen={() => selectionMode ? onToggleSelect?.(message.id) : onOpenMedia(item.media!, item.id)} />)}</div>}
        {/* PHOTO (Regular & Disappearing) */}
        {!albumMessages && message.media && message.media.type === 'photo' && (
          <div className={`overflow-hidden ${radiusClass} relative`}>
            {hasBurned || message.media.isExpired ? (
              <div className="p-4 bg-elevated dark:bg-elevated text-center text-muted flex flex-col items-center justify-center gap-1.5 min-w-[220px] min-h-[120px]">
                <Flame className="w-5 h-5 text-rose-500" />
                <span className="text-xs font-semibold">Photo expired</span>
              </div>
            ) : message.media.isDisappearing ? (
              <div onClick={handleTimerMediaCardClick} className="relative cursor-pointer overflow-hidden bg-canvas">
                {hasImageError && !message.media.inlineThumb ? (
                  <div className="p-6 bg-surface text-muted flex flex-col items-center justify-center gap-2 min-w-[230px] min-h-[160px]">
                    <ImageOff className="w-5 h-5 text-muted" />
                    <span className="text-[11px]">Preview unavailable</span>
                  </div>
                ) : (
                  <div
                    style={
                      message.media.inlineThumb
                        ? {
                            backgroundImage: `url(${message.media.inlineThumb})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                    className="relative min-w-[230px] min-h-[175px]"
                  >
                    <img
                      src={
                        imageRetryNonce > 0
                          ? `${message.media.url}${message.media.url.includes('?') ? '&' : '?'}r=${imageRetryNonce}`
                          : message.media.url
                      }
                      alt="Disappearing media"
                      onError={handlePhotoLoadError}
                      className={`w-full max-h-64 object-cover transition-all duration-300 ${
                        countdownRemaining === null ? 'blur-lg scale-105 brightness-75' : 'blur-none scale-100'
                      }`}
                      draggable={false}
                    />
                  </div>
                )}

                {/* Official Telegram Frosted Flame / Timer Center Ring */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 p-3 gap-1.5 pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-black/65 backdrop-blur-md border border-white/25 text-white flex flex-col items-center justify-center shadow-lg">
                    <Flame className="w-4.5 h-4.5 text-amber-400 fill-amber-400/20" />
                    <span className="text-[10px] font-bold font-mono tabular-nums">
                      {countdownRemaining !== null ? `${countdownRemaining}s` : message.media.expireSeconds === VIEW_ONCE_SECONDS ? '1×' : `${message.media.expireSeconds || 5}s`}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-white bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/10">
                    {countdownRemaining !== null ? 'Viewing Timed Photo' : 'Tap to View Photo'}
                  </span>
                </div>

                {/* Sleek 1-Line Action Pill Bar */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="tg-timed-actions"
                >
                  <button
                    type="button"
                    onClick={handleOpenSilentView}
                    className="px-2.5 py-1 rounded-full bg-primary hover:bg-primary-hover text-white text-[10.5px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Ghost View
                  </button>
                  {!isOut && (
                    <button
                      type="button"
                      onClick={handleMarkSeenToSender}
                      disabled={markingSeenBusy || markedSeenSent}
                      className={`px-2.5 py-1 rounded-full text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        markedSeenSent
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/10 hover:bg-white/15 text-white'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{markingSeenBusy ? '...' : markedSeenSent ? 'Opened' : 'Mark seen'}</span>
                    </button>
                  )}
                  {ayuSettings.saveDisappearingMedia && (
                    <button
                      type="button"
                      onClick={handleSaveToVault}
                      disabled={savingVault}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white text-[10.5px] font-semibold cursor-pointer"
                    >
                      {savingVault ? '...' : message.isSavedFromTTL ? 'Vault ✓' : 'Save'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => void handleForwardBypass(e, telegramService.getTargetGroup() ? 'target' : 'me')}
                    className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/15 text-primary text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer"
                    title="Forward"
                  >
                    <Forward className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <ChatPhoto media={message.media} onOpen={() => onOpenMedia(message.media!, message.id)}>
                {!message.text && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/65 px-2 py-0.5 rounded-full text-[10px] text-white tabular-nums">
                    {message.views !== undefined && message.views > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Eye className="w-3 h-3 opacity-85" />
                        <span>{formatCompactCount(message.views)}</span>
                      </span>
                    )}
                    {message.postAuthor && (
                      <span className="truncate max-w-[90px] opacity-90">{message.postAuthor},</span>
                    )}
                    <span>{formatTime(message.timestamp)}</span>
                    {isOut && (
                      message.isPending ? (
                        <Clock className="w-3 h-3 opacity-80" />
                      ) : message.isRead ? (
                        <CheckCheck className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Check className="w-3.5 h-3.5 opacity-80" />
                      )
                    )}
                  </div>
                )}
              </ChatPhoto>
            )}
          </div>
        )}

        {/* VIDEO (Regular & Disappearing TTL Video) */}
        {!albumMessages && message.media && message.media.type === 'video' && (
          <div className={`overflow-hidden ${radiusClass} relative min-w-[240px]`}>
            {hasBurned || message.media.isExpired ? (
              <div className="p-4 bg-elevated dark:bg-elevated text-center text-muted flex flex-col items-center justify-center gap-1.5 min-h-[120px]">
                <Flame className="w-5 h-5 text-rose-500" />
                <span className="text-xs font-semibold">Video expired</span>
              </div>
            ) : message.media.isDisappearing ? (
              <div onClick={handleTimerMediaCardClick} className="relative cursor-pointer bg-canvas overflow-hidden">
                <video
                  src={message.media.url}
                  poster={message.media.inlineThumb || message.media.thumbnailUrl}
                  playsInline
                  muted
                  preload="none"
                  className={`w-full max-h-64 object-cover transition-all duration-300 ${
                    countdownRemaining === null ? 'blur-lg scale-105 brightness-75' : 'blur-none scale-100'
                  }`}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 p-3 gap-1.5 pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-black/65 backdrop-blur-md border border-white/25 text-white flex flex-col items-center justify-center shadow-lg">
                    <Flame className="w-4.5 h-4.5 text-amber-400 fill-amber-400/20" />
                    <span className="text-[10px] font-bold font-mono tabular-nums">
                      {countdownRemaining !== null ? `${countdownRemaining}s` : message.media.expireSeconds === VIEW_ONCE_SECONDS ? '1×' : `${message.media.expireSeconds || 5}s`}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-white bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/10">
                    {countdownRemaining !== null ? 'Playing Timed Video' : 'Tap to Play Video'}
                  </span>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="tg-timed-actions"
                >
                  <button
                    type="button"
                    onClick={handleOpenSilentView}
                    className="px-2.5 py-1 rounded-full bg-primary hover:bg-primary-hover text-white text-[10.5px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Ghost Play
                  </button>
                  {!isOut && (
                    <button
                      type="button"
                      onClick={handleMarkSeenToSender}
                      disabled={markingSeenBusy || markedSeenSent}
                      className={`px-2.5 py-1 rounded-full text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        markedSeenSent
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/10 hover:bg-white/15 text-white'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{markingSeenBusy ? '...' : markedSeenSent ? 'Opened' : 'Mark seen'}</span>
                    </button>
                  )}
                  {ayuSettings.saveDisappearingMedia && (
                    <button
                      type="button"
                      onClick={handleSaveToVault}
                      disabled={savingVault}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white text-[10.5px] font-semibold cursor-pointer"
                    >
                      {savingVault ? '...' : message.isSavedFromTTL ? 'Vault ✓' : 'Save'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => void handleForwardBypass(e, telegramService.getTargetGroup() ? 'target' : 'me')}
                    className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/15 text-primary text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer"
                    title="Forward"
                  >
                    <Forward className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : message.media.isAnimated ? (
              <div
                onClick={() => onOpenMedia(message.media!, message.id)}
                className="relative bg-black cursor-pointer"
              >
                <video
                  src={
                    mediaRetrySource(message.media.url, videoRetryNonce)
                  }
                  poster={message.media.inlineThumb || message.media.thumbnailUrl}
                  data-autoplay-preview="true" autoPlay={nearViewport && modSettings.autoPlayGifs !== false}
                  loop
                  muted
                  playsInline
                  preload="none"
                  onError={() => setHasVideoError(true)}
                  className="w-full max-h-72 object-contain"
                />
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/65 text-[10px] font-bold text-white uppercase tracking-wide">
                  GIF
                </span>
                {!message.text && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full text-[10px] text-white tabular-nums">
                    <span>{formatTime(message.timestamp)}</span>
                    {isOut && (
                      message.isPending ? (
                        <Clock className="w-3 h-3 opacity-80" />
                      ) : message.isRead ? (
                        <CheckCheck className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Check className="w-3.5 h-3.5 opacity-80" />
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={
                  message.media.inlineThumb
                    ? {
                        backgroundImage: `url(${message.media.inlineThumb})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
                className="relative bg-black"
              >
                {hasVideoError ? (
                  <div className="p-5 bg-surface text-muted flex flex-col items-center justify-center gap-2 min-h-[150px]">
                    <Film className="w-5 h-5 text-muted" />
                    <span className="text-xs">Video failed to stream</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHasVideoError(false);
                          setVideoRetryNonce((n) => n + 1);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenMedia(message.media!, message.id)}
                        className="px-2.5 py-1 rounded-lg bg-surface text-white text-[11px] font-medium cursor-pointer"
                      >
                        Open Viewer
                      </button>
                    </div>
                  </div>
                ) : (
                  <video
                    src={
                      videoRetryNonce > 0
                        ? `${message.media.url}${message.media.url.includes('?') ? '&' : '?'}r=${videoRetryNonce}`
                        : message.media.url
                    }
                    poster={
                      message.media.inlineThumb ||
                      message.media.thumbnailUrl ||
                      `${message.media.url}${message.media.url.includes('?') ? '&' : '?'}thumb=1`
                    }
                    controls
                    playsInline
                    preload="none"
                    onPlay={(e) => {
                      e.currentTarget.muted = false;
                      e.currentTarget.volume = 1;
                    }}
                    onError={() => setHasVideoError(true)}
                    className="w-full max-h-72 object-contain"
                  />
                )}
                <div className="flex items-center justify-between px-3 py-1.5 bg-elevated dark:bg-elevated text-[11px] text-muted dark:text-muted border-t border-outline dark:border-outline gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenMedia(message.media!, message.id)}
                    className="flex items-center gap-1 font-medium hover:text-primary cursor-pointer min-w-0"
                  >
                    <Film className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[115px]">
                      {message.media.fileName || `Video ${formatDuration(message.media.duration)}`}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => void handleForwardBypass(e, telegramService.getTargetGroup() ? 'target' : 'me')}
                      className="flex items-center gap-1 text-primary font-semibold cursor-pointer"
                      title="Forward video (works even if restricted)"
                    >
                      <Forward className="w-3 h-3" />
                      <span>{forwardingState === 'done' ? 'Forwarded' : 'Forward'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToVault}
                      className="flex items-center gap-1 text-primary font-semibold cursor-pointer"
                      title="Save video to Vault"
                    >
                      <Save className="w-3 h-3" />
                      <span>{message.isSavedFromTTL ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VOICE NOTE */}
        {message.media && message.media.type === 'voice' && (
          <div className="px-3.5 py-2.5 flex items-center gap-3 min-w-[225px]">
            <button
              type="button"
              onClick={handleToggleVoicePlayback}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                isDarkOut
                  ? 'bg-primary text-on-primary hover:bg-primary-hover'
                  : isOut
                  ? 'bg-primary hover:bg-primary text-white'
                  : 'bg-primary hover:bg-primary-hover text-white'
              }`}
              title={isPlayingVoice ? 'Pause Voice Note' : 'Play Voice Note'}
            >
              {isPlayingVoice ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <div className="flex-1">
              <div
                onClick={handleSeekVoiceWaveform}
                className="relative w-full h-5 flex items-center gap-[2px] cursor-pointer"
                title="Tap waveform to seek"
              >
                {(message.media.waveform && message.media.waveform.length > 0
                  ? message.media.waveform
                  : [38, 65, 32, 85, 92, 58, 44, 76, 88, 52, 68, 82, 42, 62, 84, 36, 74, 90, 48, 60, 72, 44, 78, 56]
                ).map((val, idx, arr) => {
                  const isPlayed = (idx / arr.length) * 100 <= voiceProgress;
                  return (
                    <span
                      key={idx}
                      style={{ height: `${Math.max(16, Math.min(100, val))}%` }}
                      className={`flex-1 rounded-full transition-colors ${
                        isDarkOut
                          ? isPlayed
                            ? 'bg-[var(--tg-message-link)]'
                            : 'bg-[var(--tg-message-link)] opacity-50'
                          : isOut
                          ? isPlayed
                            ? 'bg-primary'
                            : 'bg-primary/35'
                          : isPlayed
                          ? 'bg-primary'
                          : 'bg-surface dark:bg-elevated'
                      }`}
                    />
                  );
                })}
              </div>

              <div
                className={`flex items-center justify-between text-[10.5px] mt-1 tabular-nums ${
                  isDarkOut
                    ? 'tg-message-muted'
                    : isOut
                    ? 'text-muted'
                    : 'text-muted dark:text-muted'
                }`}
              >
                <span className="font-mono">{formatDuration(message.media.duration)}</span>
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <span>{formatTime(message.timestamp)}</span>
                  {isOut && (
                    message.isPending ? (
                      <Clock className="w-3 h-3 opacity-80" />
                    ) : message.isRead ? (
                      <CheckCheck className={`w-3.5 h-3.5 ${isDarkOut ? 'text-primary' : 'text-primary'}`} />
                    ) : (
                      <Check className={`w-3.5 h-3.5 opacity-80 ${!isDarkOut ? 'text-primary' : ''}`} />
                    )
                  )}
                </span>
              </div>
            </div>

            <audio
              ref={audioRef}
              src={message.media.url}
              preload="none"
              onTimeUpdate={handleVoiceTimeUpdate}
              onEnded={handleVoiceEnded}
              onError={() => {
                setIsPlayingVoice(false);
              }}
              className="hidden"
            />
          </div>
        )}

        {/* FILE (including inline Audio/MP3 player) */}
        {message.media && message.media.type === 'file' && (() => {
          const isAudioFile =
            Boolean(message.media.mimeType?.startsWith('audio/')) ||
            /\.(mp3|m4a|wav|flac|aac|ogg|opus|webm)$/i.test(message.media.fileName || '');
          return (
            <div className="px-3.5 py-2.5 space-y-2 min-w-[220px]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isDarkOut
                        ? 'bg-primary-container text-on-container'
                        : isOut
                        ? 'bg-primary/20 text-primary'
                        : 'bg-primary/15 text-primary'
                    }`}
                  >
                    {isAudioFile ? <Music className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold block truncate max-w-[180px]">
                      {message.media.fileName || 'Document'}
                    </span>
                    <span
                      className={`text-[10px] ${
                        isDarkOut
                          ? 'tg-message-muted'
                          : isOut
                          ? 'text-muted'
                          : 'text-muted dark:text-muted'
                      }`}
                    >
                      {message.media.fileSize || (isAudioFile ? 'Audio' : 'File')}
                      {message.media.duration ? ` • ${formatDuration(message.media.duration)}` : ''}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ayuGramEngine.downloadMedia(message.media!);
                  }}
                  className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
                    isDarkOut
                      ? 'tg-message-text hover:bg-primary/15'
                      : isOut
                      ? 'text-primary hover:bg-primary/15'
                      : 'text-primary hover:bg-hover dark:hover:bg-hover'
                  }`}
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
              {isAudioFile && (
                <audio
                  controls
                  preload="none"
                  src={message.media.url}
                  onPlay={(e) => {
                    e.currentTarget.muted = false;
                    e.currentTarget.volume = 1;
                    window.dispatchEvent(new CustomEvent('tgplus-audio-play', { detail: message.id }));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-9 rounded-lg"
                />
              )}
            </div>
          );
        })()}

        {/* STICKER */}
        {message.media && message.media.type === 'sticker' && (
          <div className="p-1 relative">
            {message.media.mimeType?.includes('webm') ? (
              <video
                src={message.media.url}
                poster={message.media.inlineThumb || message.media.thumbnailUrl}
                autoPlay
                loop
                muted
                playsInline
                className={`${stickerDimClass} object-contain rounded-lg`}
              />
            ) : (
              <img
                src={
                  message.media.mimeType?.includes('tgsticker')
                    ? message.media.inlineThumb || message.media.thumbnailUrl || message.media.url
                    : message.media.url
                }
                alt="Sticker"
                loading="lazy"
                decoding="async"
                className={`${stickerDimClass} object-contain`}
                draggable={false}
              />
            )}
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 text-[10px] text-white tabular-nums float-right">
              <span>{formatTime(message.timestamp)}</span>
              {isOut && (
                message.isPending ? (
                  <Clock className="w-3 h-3 opacity-80" />
                ) : message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Check className="w-3.5 h-3.5 opacity-80" />
                )
              )}
            </div>
          </div>
        )}

        {/* GIF */}
        {!albumMessages && message.media && message.media.type === 'gif' && (
          <div
            onClick={() => onOpenMedia(message.media!, message.id)}
            className={`overflow-hidden ${radiusClass} relative bg-black cursor-pointer`}
          >
            {message.media.mimeType === 'image/gif' ? (
              <img
                src={message.media.url}
                alt="GIF"
                loading="lazy"
                decoding="async"
                className="w-full max-h-72 object-contain"
              />
            ) : (
              <video
                src={message.media.url}
                poster={message.media.inlineThumb || message.media.thumbnailUrl}
                data-autoplay-preview="true" autoPlay={nearViewport && modSettings.autoPlayGifs !== false}
                loop
                muted
                playsInline
                preload="none"
                className="w-full max-h-72 object-contain"
              />
            )}
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/65 text-[10px] font-bold text-white uppercase tracking-wide">
              GIF
            </span>
            {!message.text && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full text-[10px] text-white tabular-nums">
                <span>{formatTime(message.timestamp)}</span>
                {isOut && (
                  message.isPending ? (
                    <Clock className="w-3 h-3 opacity-80" />
                  ) : message.isRead ? (
                    <CheckCheck className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Check className="w-3.5 h-3.5 opacity-80" />
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* INTERACTIVE POLL / QUIZ */}
        {message.poll && (() => {
          const poll = message.poll;
          const hasVoted = poll.options.some((o) => o.chosen);
          const showResults = hasVoted || Boolean(poll.closed);
          return (
            <div className="px-3.5 py-3 min-w-[240px] max-w-[340px] space-y-2.5">
              <div className="space-y-0.5">
                <div
                  className={`text-[10.5px] font-semibold uppercase tracking-wide flex items-center gap-1 ${
                    isDarkOut ? 'text-muted' : isOut ? 'text-primary' : 'text-primary'
                  }`}
                >
                  {poll.quiz ? <HelpCircle className="w-3 h-3" /> : null}
                  <span>
                    {poll.quiz ? 'Quiz' : 'Poll'}
                    {poll.publicVoters ? '' : ' · Anonymous'}
                    {poll.closed ? ' · Closed' : ''}
                  </span>
                </div>
                <div className="text-[13.5px] font-semibold leading-snug">{poll.question}</div>
              </div>

              <div className="space-y-1.5">
                {poll.options.map((opt) => {
                  const pct =
                    poll.totalVoters > 0
                      ? Math.round((opt.voters / poll.totalVoters) * 100)
                      : 0;
                  return (
                    <button
                      key={opt.optionHex}
                      type="button"
                      disabled={votingBusy || Boolean(poll.closed)}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handlePollVote(opt.optionHex);
                      }}
                      className={`relative w-full text-left px-2.5 py-2 rounded-xl border overflow-hidden cursor-pointer transition-colors ${
                        opt.chosen
                          ? isDarkOut
                            ? 'border-white bg-white/20'
                            : isOut
                            ? 'border-outline bg-primary/20'
                            : 'border-primary bg-primary/10'
                          : isDarkOut
                          ? 'border-white/25 bg-white/10 hover:bg-white/15'
                          : isOut
                          ? 'border-outline/35 bg-black/[0.03] hover:bg-black/[0.06]'
                          : 'border-outline dark:border-outline bg-surface-low dark:bg-elevated hover:border-primary/60'
                      }`}
                    >
                      {showResults && (
                        <div
                          className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                            opt.correct
                              ? 'bg-emerald-500/25'
                              : isDarkOut
                              ? 'bg-white/20'
                              : isOut
                              ? 'bg-primary/25'
                              : 'bg-primary/15'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <div className="relative flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          {opt.chosen && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{opt.text}</span>
                        </span>
                        {showResults && (
                          <span className="font-mono text-[11px] font-semibold tabular-nums shrink-0">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {poll.quiz && hasVoted && poll.solution && (
                <div
                  className={`p-2 rounded-lg text-[11px] leading-snug ${
                    isDarkOut
                      ? 'bg-black/20 text-white'
                      : 'bg-elevated dark:bg-elevated text-ink dark:text-muted'
                  }`}
                >
                  {poll.solution}
                </div>
              )}

              <div
                className={`text-[10.5px] tabular-nums ${
                  isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                }`}
              >
                {poll.totalVoters} {poll.totalVoters === 1 ? 'vote' : 'votes'}
              </div>
            </div>
          );
        })()}

        {/* Text Body */}
        {message.text && !(message.media?.isDisappearing && (message.media?.type === 'photo' || message.media?.type === 'video')) && (
          <div className={`px-3.5 py-2 whitespace-pre-wrap break-words leading-relaxed ${fontSizeClass}`}>
            <FormattedText
              text={message.text}
              entities={message.entities}
              isOutgoing={isOut}
              isDarkBubble={isDarkOut}
              onOpenChatByLink={onOpenChatByLink}
              onNotify={onNotify}
              highlightQuery={highlightQuery}
            />
          </div>
        )}

        {albumMessages?.slice(1).filter(item => item.text).map(item => <div key={'caption-' + item.id} className={`px-3.5 py-2 whitespace-pre-wrap break-words leading-relaxed ${fontSizeClass}`}><FormattedText text={item.text!} entities={item.entities} isOutgoing={isOut} isDarkBubble={isDarkOut} onOpenChatByLink={onOpenChatByLink} onNotify={onNotify} /></div>)}

        {/* Bot Inline Keyboard Buttons */}
        {message.replyMarkup && message.replyMarkup.length > 0 && (
          <div className="px-2.5 pb-2 space-y-1">
            {message.replyMarkup.map((row, rIdx) => (
              <div key={rIdx} className="flex items-center gap-1">
                {row.map((btn, bIdx) =>
                  btn.url ? (
                    <a
                      key={bIdx}
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        isDarkOut
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : isOut
                          ? 'bg-primary/15 hover:bg-primary/25 text-muted'
                          : 'bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-primary'
                      }`}
                    >
                      <span className="truncate">{btn.text}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                    </a>
                  ) : (
                    <button
                      key={bIdx}
                      type="button"
                      disabled={botBtnBusy === btn.callbackDataHex}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleInlineButtonClick(btn);
                      }}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        isDarkOut
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : isOut
                          ? 'bg-primary/15 hover:bg-primary/25 text-muted'
                          : 'bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-primary'
                      }`}
                    >
                      <span className="truncate">{btn.text}</span>
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {/* Channel Post Discussion / Comments Button (STRICTLY only on broadcast channels with comments enabled) */}
        {canShowChannelComments && !isStickerOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments?.(message);
            }}
            className={`w-full px-3.5 py-2 border-t flex items-center justify-between text-[11.5px] font-medium cursor-pointer transition-colors ${
              isDarkOut
                ? 'border-white/20 tg-message-text hover:bg-white/10'
                : isOut
                ? 'border-outline text-primary hover:bg-primary/10'
                : 'border-outline dark:border-outline text-primary hover:bg-hover dark:hover:bg-hover'
            }`}
          >
            <span className="flex items-center gap-1.5 tabular-nums">
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>
                {message.repliesCount && message.repliesCount > 0
                  ? `${message.repliesCount} ${message.repliesCount === 1 ? 'Comment' : 'Comments'}`
                  : 'Leave a comment'}
              </span>
            </span>
            <span>›</span>
          </button>
        )}

        {/* Translation */}
        {translatedText && (
          <div className="mx-3 mb-2 p-2 rounded-xl bg-elevated dark:bg-elevated text-ink dark:text-ink border border-outline dark:border-outline text-xs">
            <div className="flex items-center justify-between text-[10px] font-semibold text-primary mb-0.5">
              <span>Translated</span>
              <button type="button" onClick={() => setTranslatedText(null)} className="underline cursor-pointer">
                Hide
              </button>
            </div>
            <p className="text-[12px] leading-snug">{translatedText}</p>
          </div>
        )}

        {/* Edit History */}
        {showEditHistory && message.editHistory && message.editHistory.length > 0 && (
          <div className="mx-3 mb-2 p-2.5 rounded-xl bg-elevated dark:bg-elevated text-ink dark:text-ink border border-outline dark:border-outline text-[11px] space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-primary text-[10px]">
              <span>Edit History ({message.editHistory.length})</span>
              <button type="button" onClick={() => setShowEditHistory(false)} className="underline cursor-pointer">
                Close
              </button>
            </div>
            {message.editHistory.map((rev, idx) => (
              <div key={idx} className="border-t border-outline dark:border-outline pt-1">
                <div className="text-[10px] text-muted tabular-nums">{formatTime(rev.timestamp)}</div>
                <div>
                  <FormattedText
                    text={rev.text}
                    isOutgoing={false}
                    onOpenChatByLink={onOpenChatByLink}
                    onNotify={onNotify}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp, Views, Forwards, Signature & Receipts Footer */}
        {(!message.media ||
          message.media.type === 'file' ||
          ((message.media.type === 'photo' || message.media.type === 'video') &&
            (Boolean(message.text) || hasImageError || hasVideoError || Boolean(message.views)))) && (
          <div className="flex items-center justify-end gap-1.5 px-3 pb-1.5 -mt-0.5 select-none flex-wrap">
            {message.views !== undefined && message.views > 0 && (
              <span
                className={`text-[10px] flex items-center gap-0.5 tabular-nums ${
                  isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                }`}
                title={`${message.views.toLocaleString()} views`}
              >
                <Eye className="w-2.5 h-2.5" />
                <span>{formatCompactCount(message.views)}</span>
              </span>
            )}

            {message.forwards !== undefined && message.forwards > 0 && (
              <span
                className={`text-[10px] flex items-center gap-0.5 tabular-nums ${
                  isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                }`}
                title={`Forwarded ${message.forwards.toLocaleString()} times`}
              >
                <Forward className="w-2.5 h-2.5" />
                <span>{formatCompactCount(message.forwards)}</span>
              </span>
            )}

            {message.postAuthor && (
              <span
                className={`text-[10px] truncate max-w-[110px] ${
                  isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                }`}
              >
                {message.postAuthor},
              </span>
            )}

            {message.isPinned && (
              <Pin className={`w-2.5 h-2.5 ${isDarkOut ? 'text-muted' : isOut ? 'text-primary' : 'text-primary'}`} />
            )}

            {message.isEdited && ayuSettings.showEditedBadge && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (message.editHistory?.length) setShowEditHistory(!showEditHistory);
                }}
                className={`text-[10px] flex items-center gap-0.5 ${
                  isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
                } ${message.editHistory?.length ? 'underline cursor-pointer' : ''}`}
              >
                {message.editHistory?.length ? <History className="w-2.5 h-2.5" /> : null}
                <span>edited</span>
              </button>
            )}

            <span
              className={`text-[10px] tabular-nums ${
                isDarkOut ? 'text-muted' : isOut ? 'text-muted' : 'text-muted dark:text-muted'
              }`}
            >
              {formatTime(message.timestamp)}
            </span>

            {isOut && (
              <span className={isDarkOut ? 'text-muted' : 'text-primary'}>
                <MessageStatus pending={message.isPending} read={message.isRead} viewed={message.media?.viewed}/>
              </span>
            )}
          </div>
        )}

        {swipeOffset < -25 && <span className="tg-swipe-reply" aria-hidden="true"><Reply size={20}/></span>}
        {/* Hover Actions */}
        <div
          data-message-controls="true" className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-0.5 bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-full px-1.5 py-0.5 shadow-sm ${
            isOut ? 'right-2' : 'left-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setShowReactionPicker(!showReactionPicker);
              setShowAllReactions(false);
            }}
            className="text-muted hover:text-primary p-1 rounded-full cursor-pointer"
            title="React"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            className="text-muted hover:text-primary p-1 rounded-full cursor-pointer"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          {canShowChannelComments && (
            <button
              type="button"
              onClick={() => onOpenComments?.(message)}
              className="text-muted hover:text-primary p-1 rounded-full cursor-pointer"
              title="Channel Comments"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
            </button>
          )}
          {ayuSettings.localTranslateEnabled && message.text && (
            <button
              type="button"
              onClick={() =>
                setTranslatedText(translatedText ? null : ayuGramEngine.translateMessageText(message.text))
              }
              className="text-muted hover:text-primary p-1 rounded-full cursor-pointer"
              title="Translate"
            >
              <Languages className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowActionsMenu(!showActionsMenu)}
            className="text-muted hover:text-primary p-1 rounded-full cursor-pointer"
            title="More"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Official Telegram Reaction Picker (Quick Bar + Expandable Full Grid) */}
        {showReactionPicker && (
          <div
            className={`absolute z-30 bg-surface dark:bg-elevated border border-outline dark:border-outline shadow-xl ${
              showAllReactions
                ? 'top-[-185px] left-0 w-64 rounded-2xl p-2'
                : 'top-[-44px] left-2 rounded-full px-2 py-1 flex items-center gap-1'
            }`}
          >
            {!showAllReactions ? (
              <>
                {QUICK_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      void telegramService.toggleReaction(chatId, message.id, emoji);
                      setShowReactionPicker(false);
                    }}
                    className="hover:scale-125 transition-transform text-base p-1 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllReactions(true);
                  }}
                  className="w-6 h-6 rounded-full bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-muted dark:text-muted text-xs font-bold flex items-center justify-center cursor-pointer"
                  title="All Telegram Reactions"
                >
                  +
                </button>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-outline dark:border-outline text-[10px] font-semibold text-muted dark:text-muted">
                  <span>All Reactions ({ALL_TELEGRAM_REACTIONS.length})</span>
                  <button
                    type="button"
                    onClick={() => setShowAllReactions(false)}
                    className="text-primary cursor-pointer"
                  >
                    Compact
                  </button>
                </div>
                <div className="grid grid-cols-8 gap-1 max-h-36 overflow-y-auto pr-0.5">
                  {ALL_TELEGRAM_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        void telegramService.toggleReaction(chatId, message.id, emoji);
                        setShowReactionPicker(false);
                        setShowAllReactions(false);
                      }}
                      className="hover:scale-125 hover:bg-hover dark:hover:bg-hover rounded-lg transition-transform text-base p-1 flex items-center justify-center cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {reporting && <ReportMessageModal chatId={chatId} messageId={message.id} onClose={()=>setReporting(false)} onNotify={onNotify}/>}
        {/* Actions Menu */}
        {showActionsMenu && createPortal(
          <div ref={actionMenuRef} aria-label="Message actions" style={actionPosition} onClick={e => e.stopPropagation()} className="tg-message-actions fixed z-[80] w-56 max-h-[calc(100dvh-24px)] overflow-y-auto bg-surface dark:bg-elevated border border-outline dark:border-outline rounded-xl shadow-lg py-1 text-sm text-ink dark:text-ink">
            {!isOut && effectiveSenderId && onOpenUserProfile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenUserProfile(effectiveSenderId, message.senderName);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer text-primary font-medium"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="truncate">View {message.senderName || 'Sender'} Profile</span>
              </button>
            )}
            <button type="button" onClick={()=>{setShowActionsMenu(false);onReply(message);}} className="tg-action-row"><Reply size={17}/>Reply</button>
            {!isOut && <button type="button" onClick={()=>{setShowActionsMenu(false);setReporting(true);}} className="tg-action-row">Report message</button>}
            {isOut && !message.isPending && <button type="button" className="tg-action-row" onClick={async()=>{try{const data=await telegramService.getMessageReceipt(chatId,message.id);setReceiptNotice(data.readAt ? 'Read '+new Date(data.readAt*1000).toLocaleString() : data.note || 'Sent to Telegram');}catch(error){setReceiptNotice((error as Error).message);}}}>Message info</button>}
            {receiptNotice && <p role="status" className="px-3 py-2 text-xs text-muted">{receiptNotice}</p>}
            {!isOut && (
              <button
                type="button"
                onClick={(e) => {
                  void handleMarkSeenToSender(e);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{markedSeenSent ? 'Marked as Seen ✓' : 'Mark as Seen'}</span>
              </button>
            )}
            {canShowChannelComments && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments?.(message);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <MessageSquareText className="w-3.5 h-3.5 text-primary" />
                <span>
                  {message.repliesCount && message.repliesCount > 0
                    ? `View Comments (${message.repliesCount})`
                    : 'Leave a comment'}
                </span>
              </button>
            )}
            {message.text && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation(); setShowActionsMenu(false);
                  try { await navigator.clipboard.writeText(message.text); onNotify?.('Message text copied'); }
                  catch { onNotify?.('Could not copy text. Check clipboard permission.'); }
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>Copy Text</span>
              </button>
            )}

            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                setShowActionsMenu(false);
                try {
                  const link = await telegramService.getMessageLink(chatId, message.id);
                  await navigator.clipboard.writeText(link);
                  onNotify?.(`Copied link: ${link}`);
                } catch (err) {
                  onNotify?.((err as Error).message || 'Message link only available in groups & channels');
                }
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <span>Copy Message Link</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void telegramService.togglePinMessage(chatId, message.id);
                setShowActionsMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5 text-primary" />
              <span>{message.isPinned ? 'Unpin' : 'Pin Message'}</span>
            </button>

            {isOut && (
              <button
                type="button"
                onClick={() => {
                  onEdit(message);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-primary" />
                <span>Edit</span>
              </button>
            )}

            {message.media && (
              <button
                type="button"
                onClick={(e) => {
                  void handleSaveToVault(e);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-primary" />
                <span>Save {message.media.type} to Vault</span>
              </button>
            )}

              <button
                type="button"
                onClick={() => {
                  onStartSelection?.(message.id);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
                <span>Select Messages</span>
              </button>

            {(!isProtected || ayuSettings.bypassContentRestrictions) && (
              <>
                {onOpenForwardPicker && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenForwardPicker(message.id);
                      setShowActionsMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
                  >
                    <Forward className="w-3.5 h-3.5 text-primary" />
                    <span>Forward to Chat...</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    void handleForwardBypass(e, 'me');
                    setShowActionsMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
                >
                  <Forward className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {isProtected
                      ? 'Forward Bypass -> Saved'
                      : ayuSettings.hideForwardTag
                      ? 'Forward without tag'
                      : 'Forward to Saved'}
                  </span>
                </button>

                {telegramService.getTargetGroup() && (
                  <button
                    type="button"
                    onClick={(e) => {
                      void handleForwardBypass(e, 'target');
                      setShowActionsMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
                  >
                    <Forward className="w-3.5 h-3.5 text-primary" />
                    <span className="truncate">
                      Forward -&gt; {telegramService.getTargetGroup()?.title}
                    </span>
                  </button>
                )}
              </>
            )}

            {message.editHistory && message.editHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowEditHistory(!showEditHistory);
                  setShowActionsMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-hover dark:hover:bg-hover flex items-center gap-2 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-primary" />
                <span>Edit History ({message.editHistory.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                setShowActionsMenu(false);
                try { await telegramService.deleteMessage(chatId, message.id, true); }
                catch (error) { onNotify?.((error as Error).message || 'Could not delete message.'); }
              }}
              className="w-full px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Message</span>
            </button>
          </div>, document.body
        )}
        </div>

        {/* Channel Post Quick Forward Circle Button (Matches Official Telegram Channel UI) */}
        {isChannel && !isOut && onOpenForwardPicker && (!isProtected || ayuSettings.bypassContentRestrictions) && !message.isPending && !message.isDeletedBySender && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenForwardPicker(message.id);
            }}
            className="w-8 h-8 rounded-full bg-white/95 dark:bg-elevated/90 hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-muted dark:text-ink/80 hover:text-ink dark:hover:text-white flex items-center justify-center shrink-0 self-end mb-0.5 shadow-sm cursor-pointer transition-colors"
            title="Forward Post"
          >
            <Forward className="w-4 h-4" />
          </button>
        )}

        {!isOut && deletedSideLabel}
      </div>

      {/* Reactions */}
      {message.reactions && message.reactions.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1 ml-1 flex-wrap">
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => void telegramService.toggleReaction(chatId, message.id, r.emoji)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer tabular-nums ${
                r.hasReacted
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-surface dark:bg-elevated border-outline dark:border-outline text-muted'
              }`}
            >
              <span>{r.emoji}</span>
              <span className="font-mono text-[10px] font-semibold">{r.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
