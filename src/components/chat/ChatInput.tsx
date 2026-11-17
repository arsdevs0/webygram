import { useEscapeDismiss } from '../common/useEscapeDismiss';
import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  Smile,
  Paperclip,
  Clock,
  X,
  EyeOff,
  Bold,
  Italic,
  Code,
  Quote,
  Eye,
  Link2,
  Type,
  BarChart2,
  CalendarClock,
  Search,
  Loader2,
  Slash,
  Lock,
  Bell,
  BellOff,
  AlertCircle,
  Delete,
  Keyboard,
  Image as ImageIcon,
} from 'lucide-react';
import { voiceChanger, BUILTIN_VOICE_PRESETS } from '../../services/voiceChangerEngine';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { modSettingsStore } from '../../services/modSettingsStore';
import { telegramService } from '../../services/telegramService';
import { VoiceChangerState } from '../../types/voiceChanger';
import {
  TelegramMessage,
  BotCommandItem,
  StickerSetSummary,
  GifItem,
} from '../../types/telegram';
import { AyuGramSettings } from '../../types/ayugram';

interface Props {
  chatId: string;
  isChannel?: boolean;
  canPostMessages?: boolean;
  canSendMedia?: boolean;
  sendRestrictionReason?: string;
  sendErrorReason?: string | null;
  onDismissSendError?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isProtected?: boolean;
  isBotChat?: boolean;
  botCommands?: BotCommandItem[];
  draftText?: string;
  topMsgId?: number;
  prefillText?: string;
  onConsumePrefill?: () => void;
  replyingTo: TelegramMessage | null;
  editingMessage: TelegramMessage | null;
  onSendMessage: (
    text: string,
    voiceMedia?: { fileDataUrl: string; fileName: string; duration: number; presetUsed?: string },
    attachmentMedia?: { fileDataUrl: string; fileName: string; mediaType: 'photo' | 'video' | 'file' },
    scheduleDate?: number
  ) => Promise<boolean | void> | void;
  onSaveEdit: (newText: string) => Promise<boolean> | boolean;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onOpenDisappearingModal: () => void;
  onOpenPollModal?: () => void;
  onNotify?: (msg: string) => void;
}

const EMOJI_CATEGORIES: Array<{ id: string; label: string; icon: string; emojis: string[] }> = [
  {
    id: 'recent',
    label: 'Frequently Used',
    icon: '🔥',
    emojis: [
      '😂', '❤️', '🔥', '👍', '😭', '🙏', '😍', '🥰',
      '🤣', '😊', '✨', '🎉', '👏', '👀', '💯', '🤝',
      '😎', '🤔', '🥳', '🤯', '🚀', '💬', '✅', '⚡',
    ],
  },
  {
    id: 'smileys',
    label: 'Smileys & People',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
      '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
      '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳',
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
      '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤',
      '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱',
      '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫',
      '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😴',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures & Hands',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
      '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜',
      '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪',
      '🫡', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜',
      '🖤', '🤍', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗',
    ],
  },
  {
    id: 'objects',
    label: 'Celebration & Objects',
    icon: '🎉',
    emojis: [
      '🔥', '✨', '🌟', '💫', '💥', '💢', '💦', '💨',
      '🎉', '🎊', '🎈', '🎂', '🎁', '🏆', '🥇', '🥈',
      '🥉', '⚽', '🏀', '🎮', '🎲', '🎯', '🎵', '🎶',
      '🚀', '💎', '👑', '💰', '💸', '📱', '💻', '⌚',
    ],
  },
];

const GIF_QUICK_TOPICS = ['Trending', 'Funny', 'Love', 'Cat', 'Reaction', 'Applause', 'Yes', 'Party'];

export const ChatInput: React.FC<Props> = ({
  chatId,
  isChannel = false,
  canPostMessages = true,
  canSendMedia = true,
  sendRestrictionReason,
  sendErrorReason,
  onDismissSendError,
  isMuted = false,
  onToggleMute,
  isBotChat = false,
  botCommands = [],
  draftText = '',
  topMsgId,
  prefillText,
  onConsumePrefill,
  replyingTo,
  editingMessage,
  onSendMessage,
  onSaveEdit,
  onCancelReply,
  onCancelEdit,
  onOpenDisappearingModal,
  onOpenPollModal,
  onNotify,
}) => {
  const [text, setText] = useState('');
  const [localSendError, setLocalSendError] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showExpressionDrawer, setShowExpressionDrawer] = useState(false);
  const [expressionTab, setExpressionTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');
  const [emojiCategory, setEmojiCategory] = useState<string>('recent');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // Stickers & GIFs
  const [stickerSets, setStickerSets] = useState<StickerSetSummary[]>([]);
  const [activeStickerSetId, setActiveStickerSetId] = useState<string>('');
  const [loadingStickers, setLoadingStickers] = useState(false);
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [gifQuery, setGifQuery] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);

  const [voiceState, setVoiceState] = useState<VoiceChangerState>(voiceChanger.getState());
  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const draftTimerRef = useRef<number | null>(null);
  const lastLoadedChatIdRef = useRef<string>('');
  const pendingDraftRef = useRef<{ chatId: string; text: string; replyToId?: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unsubVoice = voiceChanger.subscribe((s) => setVoiceState(s));
    const unsubAyu = ayuGramEngine.subscribe(setAyuSettings);
    return () => {
      mountedRef.current = false;
      unsubVoice();
      unsubAyu();
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorder.stream.getTracks().forEach(track => track.stop());
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      if (pendingDraftRef.current) {
        void telegramService.saveDraft(pendingDraftRef.current.chatId, pendingDraftRef.current.text, pendingDraftRef.current.replyToId);
      }
    };
  }, []);

  useEffect(() => {
    if (!showAttachMenu && !showSchedulePopover && !showExpressionDrawer) return;
    const handleOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setShowAttachMenu(false);
        setShowSchedulePopover(false);
        setShowExpressionDrawer(false);
      }
    };
    const handleEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setShowExpressionDrawer(false);
        setShowAttachMenu(false);
        setShowSchedulePopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showAttachMenu, showSchedulePopover, showExpressionDrawer]);

  useEscapeDismiss(showAttachMenu || showSchedulePopover || showExpressionDrawer || showFormatToolbar, () => {
    setShowExpressionDrawer(false); setShowAttachMenu(false); setShowSchedulePopover(false); setShowFormatToolbar(false);
  });
  useEffect(() => () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const draft = pendingDraftRef.current;
    if (draft) { pendingDraftRef.current = null; void telegramService.saveDraft(draft.chatId, draft.text, draft.replyToId); }
  }, [chatId]);
  useEffect(() => { setShowExpressionDrawer(false); setShowAttachMenu(false); setShowSchedulePopover(false); setShowFormatToolbar(false); }, [chatId]);

  const wasEditingRef = useRef<boolean>(false);

  // Load draft when switching chat or exiting edit mode
  useEffect(() => {
    if (editingMessage) {
      wasEditingRef.current = true;
      setText(editingMessage.text);
      return;
    }
    if (wasEditingRef.current) {
      wasEditingRef.current = false;
      setText(draftText || '');
      setLocalSendError(null);
      return;
    }
    if (lastLoadedChatIdRef.current !== chatId) {
      lastLoadedChatIdRef.current = chatId;
      setText(draftText || '');
      setLocalSendError(null);
    }
  }, [chatId, editingMessage, draftText]);

  // Auto-resize textarea height like native Telegram composer
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(112, Math.max(24, el.scrollHeight))}px`;
  }, [text]);

  // Consume inline prefill text (e.g. switchInline from bot button)
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
      onConsumePrefill?.();
      textareaRef.current?.focus();
    }
  }, [prefillText, onConsumePrefill]);

  // Preload Stickers & GIFs when drawer opens or tab changes
  useEffect(() => {
    if (!showExpressionDrawer) return;
    if (expressionTab === 'stickers' && stickerSets.length === 0 && !loadingStickers) {
      setLoadingStickers(true);
      void telegramService
        .getStickerSets()
        .then((sets) => {
          setStickerSets(sets);
          if (sets.length > 0 && !activeStickerSetId) {
            setActiveStickerSetId(sets[0].id);
          }
        })
        .finally(() => setLoadingStickers(false));
    }
  }, [showExpressionDrawer, expressionTab]);

  useEffect(() => {
    if (!showExpressionDrawer || expressionTab !== 'gifs') return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoadingGifs(true);
      void telegramService
        .getGifs(gifQuery.trim() || undefined)
        .then(result => { if (!cancelled) setGifs(result); })
        .catch(() => { if (!cancelled) setGifs([]); })
        .finally(() => { if (!cancelled) setLoadingGifs(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [gifQuery, showExpressionDrawer, expressionTab]);

  const handleTextChange = (nextVal: string) => {
    setText(nextVal);
    if (!editingMessage && chatId) {
      pendingDraftRef.current = { chatId, text: nextVal, replyToId: replyingTo?.id };
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = window.setTimeout(() => {
        void telegramService.saveDraft(chatId, nextVal, replyingTo?.id);
        pendingDraftRef.current = null;
      }, 650);
    }
  };

  const applyFormatWrapper = (prefix: string, suffix: string = prefix) => {
    const el = textareaRef.current;
    if (!el) {
      handleTextChange(`${text}${prefix}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || 'text';
    const next = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    handleTextChange(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const sendWithEnter = modSettingsStore.getSettings().sendWithEnter ?? true;
    if (e.key === 'Enter' && !e.shiftKey && sendWithEnter) {
      e.preventDefault();
      void handleSend();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  const sendingRef = useRef(false);
  const handleSend = async (scheduledUnix?: number) => {
    if (sendingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!canPostMessages) {
      setLocalSendError(
        sendRestrictionReason ||
          (isChannel
            ? 'Only channel administrators can post messages in this channel.'
            : 'Sending messages is restricted in this group.')
      );
      return;
    }
    setLocalSendError(null);
    onDismissSendError?.();
    if (editingMessage) {
      sendingRef.current = true;
      try { await onSaveEdit(trimmed); }
      catch (error) { setLocalSendError((error as Error).message || 'Could not edit message.'); }
      finally { sendingRef.current = false; }
      return;
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    pendingDraftRef.current = null;
    sendingRef.current = true;
    setText('');
    setShowAttachMenu(false);
    setShowSchedulePopover(false);
    try {
      const ok = await onSendMessage(trimmed, undefined, undefined, scheduledUnix);
      if (ok === false) {
        setText(current => current || trimmed);
      }
    } catch (err: unknown) {
      setText(current => current || trimmed);
      setLocalSendError((err as Error)?.message || 'Failed to send message in this chat.');
    } finally {
      sendingRef.current = false;
    }
  };

  const handleSendStickerOrGif = async (docId: string) => {
    if (!canSendMedia) {
      setLocalSendError(
        sendRestrictionReason || 'Sending stickers, GIFs, and media is restricted in this group.'
      );
      return;
    }
    try {
      setLocalSendError(null);
      await telegramService.sendStickerOrGif(chatId, docId, {
        replyToId: replyingTo?.id,
        topMsgId,
      });
      if (replyingTo) onCancelReply();
    } catch (err) {
      const msg = (err as Error).message || 'Could not send sticker or GIF';
      setLocalSendError(msg);
      onNotify?.(msg);
    }
  };

  const handleStartVoiceRecording = async () => {
    try {
      const ok = await voiceChanger.ensureReadyForCapture();
      if (!mountedRef.current) return;
      const stream = voiceState.enabled
        ? voiceChanger.getProcessedOutputStream() || voiceChanger.micStream
        : voiceChanger.micStream || voiceChanger.getProcessedOutputStream();
      if (!ok || !stream || stream.getAudioTracks().length === 0) {
        onNotify?.(voiceChanger.getLastError() || 'Microphone unavailable. Check browser permissions.');
        return;
      }

      recordedChunksRef.current = [];
      const preferredTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const chosenMime =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredTypes.find((t) => MediaRecorder.isTypeSupported(t))
          : undefined;

      // The engine owns the original stream; stopping a chat recorder must not end a live call.
      const captureStream = stream.clone();
      const recorder = chosenMime
        ? new MediaRecorder(captureStream, { mimeType: chosenMime })
        : new MediaRecorder(captureStream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recordingStartTimeRef.current = Date.now();

      recorder.onstop = () => {
        captureStream.getTracks().forEach(track => track.stop());
        const elapsedSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartTimeRef.current) / 1000)
        );
        const blobType = chosenMime || recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (!blob || blob.size < 64) {
          const msg = 'Voice recording was too short or empty — hold slightly longer to send.';
          setLocalSendError(msg);
          onNotify?.(msg);
          return;
        }
        const ext = blobType.includes('mp4') ? 'm4a' : blobType.includes('webm') ? 'webm' : 'ogg';
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const activePreset = voiceState.enabled
              ? BUILTIN_VOICE_PRESETS[voiceState.selectedPresetId as keyof typeof BUILTIN_VOICE_PRESETS]?.name || 'Custom'
              : undefined;
            void Promise.resolve(
              onSendMessage('', {
                fileDataUrl: reader.result,
                fileName: `voice_${Date.now()}.${ext}`,
                duration: elapsedSeconds,
                presetUsed: activePreset,
              })
            ).catch((err: unknown) => {
              setLocalSendError((err as Error)?.message || 'Failed to send voice note.');
            });
          }
        };
        reader.onerror = () => {
          setLocalSendError('Failed to process recorded audio.');
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(
          Math.max(0, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
        );
      }, 500);
    } catch (err) {
      setIsRecordingVoice(false);
      onNotify?.((err as Error).message || 'Could not start voice recording.');
    }
  };

  const handleStopAndSendVoice = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.requestData?.();
      } catch {
        // ignore if unsupported
      }
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleCancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!canSendMedia) {
      setLocalSendError(
        sendRestrictionReason || 'Sending photos, videos, and files is restricted by group administrators.'
      );
      setShowAttachMenu(false);
      e.target.value = '';
      return;
    }

    if (file.size > 42 * 1024 * 1024) {
      const msg = 'File is too large for web upload (maximum 42 MB).';
      setLocalSendError(msg);
      onNotify?.(msg);
      setShowAttachMenu(false);
      e.target.value = '';
      return;
    }

    const mediaType: 'photo' | 'video' | 'file' = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('image/')
      ? 'photo'
      : 'file';

    setLocalSendError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void Promise.resolve(
          onSendMessage('', undefined, {
            fileDataUrl: reader.result,
            fileName: file.name,
            mediaType,
          })
        ).catch((err: unknown) => {
          setLocalSendError((err as Error)?.message || 'Failed to send attachment.');
        });
      }
    };
    reader.onerror = () => {
      setLocalSendError('Could not read the selected file.');
    };
    reader.readAsDataURL(file);
    setShowAttachMenu(false);
    e.target.value = '';
  };

  const activePresetName = voiceState.enabled
    ? BUILTIN_VOICE_PRESETS[voiceState.selectedPresetId as keyof typeof BUILTIN_VOICE_PRESETS]?.name || 'Custom'
    : null;

  const filteredBotCommands =
    botCommands.length > 0 && text.startsWith('/')
      ? botCommands.filter((c) =>
          c.command.toLowerCase().includes(text.slice(1).split(' ')[0].toLowerCase())
        )
      : [];

  const activeStickerSet =
    stickerSets.find((s) => s.id === activeStickerSetId) || stickerSets[0];

  const activeErrorBanner = sendErrorReason || localSendError;

  // Official Telegram Read-Only Broadcast Channel Bottom Mute/Unmute Bar
  if (!canPostMessages && isChannel) {
    return (
      <div className="border-t border-outline dark:border-white/[0.06] bg-surface dark:bg-surface shrink-0 select-none">
        <button
          type="button"
          onClick={() => onToggleMute?.()}
          className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-[15px] font-medium text-primary hover:bg-hover dark:hover:bg-white/[0.04] active:bg-hover dark:active:bg-white/[0.08] cursor-pointer transition-colors"
        >
          {isMuted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>
      </div>
    );
  }

  // Official Telegram Group Restricted Composer Bar
  if (!canPostMessages && !isChannel) {
    return (
      <div className="border-t border-outline dark:border-white/[0.06] bg-surface dark:bg-surface px-4 py-3 flex items-center justify-center gap-2 text-xs text-muted dark:text-muted shrink-0 select-none">
        <Lock className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />
        <span className="font-medium text-center">
          {sendRestrictionReason || 'Sending messages is not allowed in this group.'}
        </span>
      </div>
    );
  }

  const currentEmojiCategory =
    EMOJI_CATEGORIES.find((c) => c.id === emojiCategory) || EMOJI_CATEGORIES[0];

  return (
    <div
      ref={containerRef}
      className="tg-composer relative bg-surface dark:bg-surface border-t border-outline dark:border-outline text-ink dark:text-ink shrink-0 select-none"
    >
      {/* Exact Send Failure / Restriction Reason Alert Banner */}
      {activeErrorBanner && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-600 dark:text-rose-300 text-xs flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
            <span className="font-medium break-words">{activeErrorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalSendError(null);
              onDismissSendError?.();
            }}
            className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-500 dark:text-rose-300 shrink-0 cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bot Slash-Command Popup */}
      {filteredBotCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 max-h-48 overflow-y-auto rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-xl divide-y divide-outline dark:divide-white/[0.06] z-30">
          {filteredBotCommands.map((cmd) => (
            <button
              key={cmd.command}
              type="button"
              onClick={() => {
                handleTextChange(`/${cmd.command} `);
                textareaRef.current?.focus();
              }}
              className="w-full px-3.5 py-2 flex items-center justify-between gap-3 text-left text-xs hover:bg-hover dark:hover:bg-hover cursor-pointer"
            >
              <span className="font-mono font-semibold text-primary">/{cmd.command}</span>
              <span className="text-[11px] text-muted dark:text-muted truncate">
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Reply / Edit Context Strip (Matches Official Telegram Bar above Composer) */}
      {(replyingTo || editingMessage) && (
        <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-outline dark:border-white/[0.06] bg-surface-low/70 dark:bg-surface text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-0.5 h-7 bg-primary rounded-full shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-primary block text-[12px] truncate">
                {editingMessage ? 'Edit Message' : `Reply to ${replyingTo?.senderName || 'Message'}`}
              </span>
              <span className="text-muted dark:text-muted text-[12px] truncate block">
                {editingMessage
                  ? editingMessage.text
                  : replyingTo?.text || (replyingTo?.media ? `[${replyingTo.media.type}]` : 'Media')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="p-1.5 text-muted hover:text-ink dark:hover:text-white rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Rich Formatting Toolbar */}
      {showFormatToolbar && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-outline dark:border-white/[0.06] overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => applyFormatWrapper('**')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Bold className="w-3.5 h-3.5" />
            <span>Bold</span>
          </button>
          <button
            type="button"
            onClick={() => applyFormatWrapper('__')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs italic flex items-center gap-1 cursor-pointer"
          >
            <Italic className="w-3.5 h-3.5" />
            <span>Italic</span>
          </button>
          <button
            type="button"
            onClick={() => applyFormatWrapper('`')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs font-mono flex items-center gap-1 cursor-pointer"
          >
            <Code className="w-3.5 h-3.5" />
            <span>Code</span>
          </button>
          <button
            type="button"
            onClick={() => applyFormatWrapper('||')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs flex items-center gap-1 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-primary" />
            <span>Spoiler</span>
          </button>
          <button
            type="button"
            onClick={() => applyFormatWrapper('> ', '')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs flex items-center gap-1 cursor-pointer"
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Quote</span>
          </button>
          <button
            type="button"
            onClick={() => applyFormatWrapper('[', '](https://)')}
            className="px-2 py-1 rounded-lg hover:bg-hover/70 dark:hover:bg-hover text-xs flex items-center gap-1 cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 text-primary" />
            <span>Link</span>
          </button>
        </div>
      )}

      {/* Main Native Telegram Floating Pill Composer Row */}
      {isRecordingVoice ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 animate-tg-pop-in">
          <div className="flex-1 flex items-center gap-2.5 px-4 py-2 rounded-[24px] bg-elevated dark:bg-canvas border border-rose-500/35">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="text-sm font-mono font-semibold text-rose-500 tabular-nums shrink-0">
              {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
            </span>
            <div className="flex items-center gap-0.5 h-4 flex-1 max-w-[110px]" aria-hidden="true">
              {[45, 80, 60, 95, 50, 85, 40, 75, 90, 55, 70, 45].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
                  className="flex-1 rounded-full bg-rose-500/75 animate-pulse"
                />
              ))}
            </div>
            <span className="text-xs text-muted dark:text-muted truncate">
              Recording voice...
            </span>
            {voiceState.enabled && (
              <span className="ml-auto text-[11px] text-primary font-semibold shrink-0">{activePresetName}</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCancelVoiceRecording}
            className="px-3 py-2 text-xs font-semibold text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 rounded-full cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStopAndSendVoice}
            className="w-11 h-11 bg-primary hover:bg-primary-hover active:scale-95 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md shrink-0 transition-transform"
            title="Send Voice Message"
          >
            <Send className="w-4.5 h-4.5 translate-x-[0.5px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          {/* Official Telegram Rounded Pill Input Container */}
          <div className="flex-1 min-w-0 flex items-end gap-1 px-2.5 py-1 rounded-[24px] bg-elevated dark:bg-canvas border border-outline/80 dark:border-white/[0.07] focus-within:border-primary/60 focus-within:bg-elevated shadow-inner transition-colors">
            {/* Left Emoji / Sticker / GIF Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setShowExpressionDrawer((prev) => !prev);
                setShowAttachMenu(false);
                setShowSchedulePopover(false);
              }}
              className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${
                showExpressionDrawer
                  ? 'text-primary'
                  : 'text-muted dark:text-muted hover:text-primary'
              }`}
              title="Emoji, Stickers & GIFs"
            >
              {showExpressionDrawer ? (
                <Keyboard className="w-[22px] h-[22px]" />
              ) : (
                <Smile className="w-[22px] h-[22px]" />
              )}
            </button>

            {isBotChat && botCommands.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  handleTextChange('/');
                  textareaRef.current?.focus();
                }}
                className="p-1.5 text-primary hover:bg-primary/10 rounded-full cursor-pointer shrink-0"
                title="Bot Slash Commands"
              >
                <Slash className="w-4 h-4" />
              </button>
            )}

            {/* Native Telegram Borderless Auto-Growing Message Field */}
            <div className="flex-1 min-w-0 flex items-center py-1">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message"
                rows={1}
                style={{ outline: 'none', boxShadow: 'none' }}
                className="w-full max-h-28 px-1.5 text-[15px] leading-[21px] bg-transparent border-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:border-0 text-ink dark:text-ink placeholder-muted dark:placeholder-muted resize-none select-text"
              />
            </div>

            {/* 1-Tap Timed / Disappearing Media Button */}
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                setShowExpressionDrawer(false);
                onOpenDisappearingModal();
              }}
              className="p-1.5 text-muted dark:text-muted hover:text-amber-400 rounded-full transition-colors cursor-pointer shrink-0"
              title="Send Timed / Self-Destructing Photo or Video"
            >
              <Clock className="w-[20px] h-[20px]" />
            </button>

            {/* Schedule Message Button (when typing) */}
            {text.trim() && !editingMessage && (
              <div className="relative flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowSchedulePopover(!showSchedulePopover);
                    setShowAttachMenu(false);
                  }}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                    showSchedulePopover
                      ? 'text-primary'
                      : 'text-muted dark:text-muted hover:text-primary'
                  }`}
                  title="Schedule Message"
                >
                  <CalendarClock className="w-[20px] h-[20px]" />
                </button>

                {showSchedulePopover && (
                  <div className="absolute bottom-full right-0 mb-3 w-64 p-3 rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl z-40 space-y-2.5 text-xs">
                    <div className="font-semibold flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-primary" />
                      <span>Schedule Send</span>
                    </div>
                    <input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline text-xs"
                    />
                    <button
                      type="button"
                      disabled={!scheduleDateTime}
                      onClick={() => {
                        const ts = Math.floor(new Date(scheduleDateTime).getTime() / 1000);
                        if (!Number.isFinite(ts) || ts <= Math.floor(Date.now() / 1000)) {
                          onNotify?.('Pick a future date and time');
                          return;
                        }
                        void handleSend(ts);
                        onNotify?.('Message scheduled on Telegram');
                      }}
                      className="w-full py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold cursor-pointer"
                    >
                      Schedule Message
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Right Paperclip Attachment Button */}
            <div className="relative flex items-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(!showAttachMenu);
                  setShowSchedulePopover(false);
                }}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  showAttachMenu
                    ? 'text-primary'
                    : 'text-muted dark:text-muted hover:text-primary'
                }`}
                title="Attach Photo, Video, File, Poll, or Formatting"
              >
                <Paperclip className="w-[20px] h-[20px]" />
              </button>

              {showAttachMenu && (
                <div className="absolute bottom-full right-0 mb-3 w-60 bg-surface dark:bg-surface border border-outline dark:border-outline rounded-2xl shadow-2xl p-1.5 z-40">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-hover dark:hover:bg-hover rounded-xl font-medium text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block font-semibold text-ink dark:text-ink">Photo, Video or File</span>
                      <span className="text-[10.5px] text-muted dark:text-muted">Send media or document</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      onOpenDisappearingModal();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-hover dark:hover:bg-hover rounded-xl font-medium text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block font-semibold text-ink dark:text-ink">Self-Destructing Media</span>
                      <span className="text-[10.5px] text-muted dark:text-muted">Timed photo or video (1s–60s)</span>
                    </div>
                  </button>

                  {onOpenPollModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(false);
                        onOpenPollModal();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-hover dark:hover:bg-hover rounded-xl font-medium text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                        <BarChart2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="block font-semibold text-ink dark:text-ink">Poll or Quiz</span>
                        <span className="text-[10.5px] text-muted dark:text-muted">Create interactive poll</span>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowFormatToolbar(!showFormatToolbar);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-hover dark:hover:bg-hover rounded-xl font-medium text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                      <Type className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block font-semibold text-ink dark:text-ink">Text Formatting</span>
                      <span className="text-[10.5px] text-muted dark:text-muted">Bold, Spoiler, Code, Quote</span>
                    </div>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,*"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          </div>

          {/* Official Telegram Separate Circular Action Button (Send or Voice Mic) */}
          {text.trim() ? (
            <button
              type="button"
              onClick={() => void handleSend()}
              className="w-11 h-11 bg-primary hover:bg-primary-hover text-white rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95 shadow-md"
              title="Send Message"
            >
              <Send className="w-4.5 h-4.5 translate-x-[0.5px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartVoiceRecording}
              className="w-11 h-11 rounded-full bg-elevated dark:bg-canvas hover:bg-primary/15 text-muted dark:text-muted hover:text-primary border border-outline/80 dark:border-white/[0.07] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              title={voiceState.enabled ? `Record Voice (${activePresetName})` : 'Record Voice Message'}
            >
              <Mic className="w-[21px] h-[21px]" />
            </button>
          )}
        </div>
      )}

      {/* Official Telegram Docked Bottom Expression Tray (Emoji / Stickers / GIFs) */}
      {showExpressionDrawer && (
        <div className="h-[285px] w-full bg-surface-low dark:bg-surface border-t border-outline dark:border-outline flex flex-col animate-fade-in">
          {/* Tray Content Area */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {/* EMOJI TAB */}
            {expressionTab === 'emoji' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 sticky top-0 bg-surface-low/95 dark:bg-surface/95 backdrop-blur-xs py-1 z-10 border-b border-outline/70 dark:border-white/[0.05]">
                  {EMOJI_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setEmojiCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                        emojiCategory === cat.id
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted dark:text-muted hover:bg-hover/50 dark:hover:bg-hover'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="hidden sm:inline text-[11px]">{cat.label}</span>
                    </button>
                  ))}
                </div>

                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted px-1">
                  {currentEmojiCategory.label}
                </div>

                <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
                  {currentEmojiCategory.emojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}_${idx}`}
                      type="button"
                      onClick={() => handleTextChange(text + emoji)}
                      className="h-9 text-2xl flex items-center justify-center rounded-lg hover:bg-hover/70 dark:hover:bg-hover active:scale-115 transition-transform cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STICKERS TAB */}
            {expressionTab === 'stickers' && (
              <div className="space-y-2">
                {loadingStickers ? (
                  <div className="py-14 flex flex-col items-center justify-center gap-2 text-xs text-muted dark:text-muted">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span>Loading your Telegram sticker packs...</span>
                  </div>
                ) : stickerSets.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <p className="text-xs text-muted dark:text-muted">
                      No sticker packs found on this Telegram account yet.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Sticker Pack Strip */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1.5 sticky top-0 bg-surface-low/95 dark:bg-surface/95 backdrop-blur-xs z-10 border-b border-outline/70 dark:border-white/[0.06]">
                      {stickerSets.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActiveStickerSetId(s.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                            activeStickerSet?.id === s.id
                              ? 'bg-primary text-white'
                              : 'bg-elevated/70 dark:bg-elevated text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                          }`}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>

                    {/* Sticker Grid (Supports WebM Video Stickers & WebP Static Stickers) */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1">
                      {(activeStickerSet?.stickers || []).map((st) => (
                        <button
                          key={st.docId}
                          type="button"
                          onClick={() => void handleSendStickerOrGif(st.docId)}
                          className="aspect-square p-1.5 rounded-xl hover:bg-hover/60 dark:hover:bg-hover flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                          title="Send Sticker"
                        >
                          {st.isVideo || st.mimeType?.includes('webm') ? (
                            <video
                              src={st.url}
                              poster={st.thumbnailUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-contain pointer-events-none"
                            />
                          ) : (
                            <img
                              src={st.thumbnailUrl || st.url}
                              alt="Sticker"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (target.src !== window.location.origin + st.url) {
                                  target.src = st.url;
                                }
                              }}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* GIFS TAB */}
            {expressionTab === 'gifs' && (
              <div className="space-y-2">
                <div className="sticky top-0 bg-surface-low/95 dark:bg-surface/95 backdrop-blur-xs z-10 pb-1.5 space-y-1.5">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated/70 dark:bg-canvas border border-outline/60 dark:border-white/[0.07]">
                    <Search className="w-3.5 h-3.5 text-muted dark:text-muted shrink-0" />
                    <input
                      type="text"
                      value={gifQuery}
                      onChange={(e) => setGifQuery(e.target.value)}
                      placeholder="Search Telegram GIFs..."
                      className="flex-1 bg-transparent text-xs text-ink dark:text-ink placeholder-muted dark:placeholder-[#7F91A4] focus:outline-none"
                    />
                    {gifQuery && (
                      <button
                        type="button"
                        onClick={() => setGifQuery('')}
                        className="text-muted hover:text-ink dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Quick GIF Search Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {GIF_QUICK_TOPICS.map((topic) => {
                      const qVal = topic === 'Trending' ? '' : topic.toLowerCase();
                      const isActive = gifQuery.toLowerCase() === qVal;
                      return (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => setGifQuery(qVal)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-primary text-white'
                              : 'bg-elevated/70 dark:bg-elevated text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                          }`}
                        >
                          {topic}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loadingGifs ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted dark:text-muted">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span>Loading Telegram GIFs...</span>
                  </div>
                ) : gifs.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted dark:text-muted">
                    No GIFs found. Try another keyword above.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {gifs.map((g) => (
                      <button
                        key={g.docId}
                        type="button"
                        onClick={() => void handleSendStickerOrGif(g.docId)}
                        className="aspect-video rounded-lg overflow-hidden bg-elevated dark:bg-canvas relative group cursor-pointer hover:ring-2 hover:ring-primary"
                        title="Send GIF"
                      >
                        {g.mimeType?.includes('gif') ? (
                          <img
                            src={g.url}
                            alt="GIF"
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={g.url}
                            poster={g.thumbnailUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        )}
                        <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/60 text-[9px] font-bold text-white uppercase">
                          GIF
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Tab Bar (Emoji | Stickers | GIFs | Backspace) — Matches Native Telegram Bottom Tray */}
          <div className="h-10 px-3 bg-surface dark:bg-canvas border-t border-outline dark:border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(['emoji', 'stickers', 'gifs'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setExpressionTab(tab)}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold capitalize cursor-pointer transition-colors ${
                    expressionTab === tab
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                  }`}
                >
                  {tab === 'gifs' ? 'GIFs' : tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {(voiceState.enabled || (ayuSettings.ghostModeActive && !ayuSettings.sendTypingIndicators)) && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-muted">
                  <EyeOff className="w-3 h-3 text-primary" />
                  <span>Stealth</span>
                </span>
              )}
              {expressionTab === 'emoji' && (
                <button
                  type="button"
                  onClick={() => handleTextChange(Array.from(text).slice(0, -1).join(''))}
                  className="p-1.5 rounded-lg text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-white/[0.06] cursor-pointer"
                  title="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
