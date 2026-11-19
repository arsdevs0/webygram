import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  CheckCircle2,
  Pin,
  CheckCheck,
  EyeOff,
  Search,
  X,
  CalendarClock,
  ChevronRight,
  Hash,
  Plus,
  Loader2,
} from 'lucide-react';
import { TelegramChat, TelegramMessage, ForumTopicItem } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { AyuGramSettings } from '../../types/ayugram';
import { Avatar } from '../common/Avatar';
import { useEscapeDismiss } from '../common/useEscapeDismiss';

interface Props {
  chat: TelegramChat;
  pinnedMessages?: TelegramMessage[];
  onJumpToMessage?: (msgId: string) => void;
  onOpenScheduled?: () => void;
  topics?: ForumTopicItem[];
  activeTopicId?: number | null;
  onSelectTopic?: (topicId: number | null) => void;
  onCreateTopic?: (title: string) => Promise<void>;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  matchCount?: number;
  onBackMobile: () => void;
  onToggleInfoPanel: () => void;
  onOpenVoiceStudio: () => void;
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;
  onOpenDisappearingModal?: () => void;
  onOpenUserProfile?: (userId: string) => void;
  voiceEnabled: boolean;
}

export const ChatHeader: React.FC<Props> = ({
  chat,
  pinnedMessages = [],
  onJumpToMessage,
  onOpenScheduled,
  topics = [],
  activeTopicId = null,
  onSelectTopic,
  onCreateTopic,
  searchQuery = '',
  onSearchChange,
  matchCount = 0,
  onBackMobile,
  onToggleInfoPanel,
  onOpenVoiceStudio,
  onStartVoiceCall,
  onStartVideoCall,
  onOpenUserProfile,
}) => {
  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const [showNewTopicInput, setShowNewTopicInput] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [showActions, setShowActions] = useState(false);
  useEscapeDismiss(showActions, () => setShowActions(false));

  useEffect(() => {
    const unsub = ayuGramEngine.subscribe(setAyuSettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsSearchOpen(false);
    setShowActions(false);
    setPinIndex(0);
    setShowNewTopicInput(false);
    setNewTopicTitle('');
  }, [chat.id]);

  useEffect(() => {
    if (pinIndex >= pinnedMessages.length && pinnedMessages.length > 0) {
      setPinIndex(0);
    }
  }, [pinnedMessages.length, pinIndex]);

  const typingText = telegramService.getTypingStatus(chat.id);
  const displayTitle =
    ayuSettings.streamerMode && chat.type === 'user'
      ? ayuGramEngine.maskForStreamer(chat.title, 'handle')
      : chat.title;

  const getSubtitle = () => {
    if (typingText) return typingText;
    if (chat.type === 'channel') {
      return chat.memberCount ? `${chat.memberCount.toLocaleString()} subscribers` : 'Channel';
    }
    if (chat.type === 'group') {
      return chat.memberCount ? `${chat.memberCount.toLocaleString()} members` : 'Group';
    }
    if (chat.type === 'saved') {
      return 'Saved Messages';
    }
    if (chat.type === 'bot') {
      return 'Bot';
    }
    return chat.status === 'online' ? 'online' : 'last seen recently';
  };

  const currentPin = pinnedMessages.length > 0 ? pinnedMessages[pinIndex % pinnedMessages.length] : undefined;

  const handleCycleAndJumpPin = () => {
    if (!currentPin) return;
    onJumpToMessage?.(currentPin.id);
    if (pinnedMessages.length > 1) {
      setPinIndex((prev) => (prev + 1) % pinnedMessages.length);
    }
  };

  const handleCreateTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !onCreateTopic || creatingTopic) return;
    setCreatingTopic(true);
    try {
      await onCreateTopic(newTopicTitle.trim());
      setNewTopicTitle('');
      setShowNewTopicInput(false);
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleHeaderProfileClick = () => {
    if ((chat.type === 'user' || chat.type === 'bot') && onOpenUserProfile) {
      onOpenUserProfile(chat.id);
    } else {
      onToggleInfoPanel();
    }
  };

  return (
    <div className="tg-chat-header border-b border-outline dark:border-outline bg-surface dark:bg-surface relative z-20 text-ink dark:text-ink shrink-0">
      <div className="tg-chat-topline">
        <div className="tg-chat-leading">
          <button
            type="button"
            onClick={onBackMobile}
            className="tg-chat-back lg:hidden"
            aria-label="Back to chats"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button type="button" onClick={handleHeaderProfileClick} className="tg-chat-identity" aria-label={'View profile of ' + displayTitle}>
          <div
            className="relative cursor-pointer flex items-center justify-center shrink-0"
          >
            <Avatar
              src={chat.avatarUrl}
              title={displayTitle}
              id={chat.id}
              size="sm"
              className="w-9.5 h-9.5"
              isSaved={chat.type === 'saved'}
              isOnline={chat.type === 'user' && chat.status === 'online'}
            />
          </div>

          <div className="text-left overflow-hidden min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold truncate">{displayTitle}</h2>
              {chat.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
              {ayuSettings.ghostModeActive && (
                <span title="Ghost Mode Active" className="inline-flex shrink-0">
                  <EyeOff className="w-3 h-3 text-primary" />
                </span>
              )}
            </div>
            <p
              className={`text-[11px] truncate tabular-nums ${
                typingText || chat.status === 'online'
                  ? 'text-primary font-medium'
                  : 'text-muted dark:text-muted'
              }`}
            >
              {getSubtitle()}
            </p>
          </div>
          </button>
        </div>

        <div className="tg-chat-actions">
          {chat.unreadCount > 0 && ayuSettings.ghostModeActive && !ayuSettings.sendReadReceipts && (
            <button
              type="button"
              onClick={() => void telegramService.markChatAsRead(chat.id, true)}
              className="hidden sm:flex px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[10.5px] font-semibold items-center gap-1 cursor-pointer whitespace-nowrap mr-1"
              title="Send Read Receipt Manually"
            >
              <CheckCheck className="w-3 h-3" />
              <span className="hidden sm:inline">Mark Read</span>
            </button>
          )}

          {onOpenScheduled && !chat.isDeletedChat && (
            <button
              type="button"
              onClick={onOpenScheduled}
              className="hidden sm:flex p-2 text-muted dark:text-muted hover:text-primary rounded-xl hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
              title="Scheduled Messages Queue"
            >
              <CalendarClock className="w-4.5 h-4.5" />
            </button>
          )}

          {onSearchChange && (
            <button
              type="button"
              onClick={() => {
                if (isSearchOpen) {
                  setIsSearchOpen(false);
                  onSearchChange('');
                } else {
                  setIsSearchOpen(true);
                }
              }}
              className={`hidden sm:flex p-2 rounded-xl cursor-pointer transition-colors ${
                isSearchOpen || searchQuery
                  ? 'text-primary bg-primary/15'
                  : 'text-muted dark:text-muted hover:text-primary hover:bg-hover dark:hover:bg-hover'
              }`}
              title="Search in conversation"
            >
              <Search className="w-4.5 h-4.5" />
            </button>
          )}

          {chat.type === 'user' && onStartVoiceCall && <button type="button" onClick={onStartVoiceCall} className="tg-icon-button" title="Voice Call" aria-label="Voice Call"><Phone size={22}/></button>}
          {chat.type === 'user' && onStartVideoCall && <button type="button" onClick={onStartVideoCall} className="tg-icon-button hidden sm:flex" title="Video Call"><Video size={22}/></button>}

          <button
            type="button"
            onClick={() => { if (window.innerWidth < 640) setShowActions(value => !value); else onToggleInfoPanel(); }}
            aria-label="Chat options"
            aria-expanded={showActions}
            className="p-2 text-muted dark:text-muted hover:text-primary rounded-xl hover:bg-hover dark:hover:bg-hover cursor-pointer transition-colors"
            title="Toggle Profile & Chat Info"
          >
            <MoreVertical className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {showActions && <>
        <button aria-label="Close chat options" className="fixed inset-0 z-20 cursor-default" onClick={() => setShowActions(false)} />
        <div role="menu" aria-label="Chat options" className="absolute right-2 top-14 z-30 w-60 rounded-2xl border border-outline dark:border-outline bg-surface dark:bg-elevated shadow-xl p-1.5 text-sm">
          {onSearchChange && <button role="menuitem" onClick={() => { setShowActions(false); setIsSearchOpen(true); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover">Search messages</button>}
          <button role="menuitem" onClick={() => { setShowActions(false); onToggleInfoPanel(); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover dark:hover:bg-hover">Chat info</button>
          {onOpenScheduled && <button role="menuitem" onClick={() => { setShowActions(false); onOpenScheduled(); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover dark:hover:bg-hover">Scheduled messages</button>}
          {chat.type === 'user' && onStartVideoCall && <button role="menuitem" onClick={() => { setShowActions(false); onStartVideoCall(); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover dark:hover:bg-hover">Video call</button>}
          <button role="menuitem" onClick={() => { setShowActions(false); onOpenVoiceStudio(); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover dark:hover:bg-hover">Voice changer</button>
          {chat.unreadCount > 0 && <button role="menuitem" onClick={() => { setShowActions(false); void telegramService.markChatAsRead(chat.id, true); }} className="w-full min-h-12 px-3 text-left rounded-xl hover:bg-hover dark:hover:bg-hover">Mark as read</button>}
        </div>
      </>}

      {/* In-Chat Search Bar */}
      {isSearchOpen && onSearchChange && (
        <div className="px-4 py-2 border-t border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-muted shrink-0" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages or links in this chat..."
            className="flex-1 bg-transparent text-xs focus:outline-none text-ink dark:text-ink placeholder:text-muted"
          />
          {searchQuery.trim() && (
            <span className="text-[11px] font-mono text-primary tabular-nums shrink-0">
              {matchCount} {matchCount === 1 ? 'match' : 'matches'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              setIsSearchOpen(false);
            }}
            className="p-1 text-muted hover:text-ink dark:hover:text-white cursor-pointer"
            title="Close Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Multi-Pin Cycling Banner */}
      {currentPin && (
        <div
          onClick={handleCycleAndJumpPin}
          className="flex items-center justify-between px-4 py-1.5 bg-surface-low dark:bg-canvas border-t border-outline dark:border-outline text-xs cursor-pointer hover:bg-hover dark:hover:bg-hover transition-colors gap-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="truncate flex-1">
              <span className="font-semibold text-primary mr-2 text-[11px] tabular-nums">
                {pinnedMessages.length > 1
                  ? `Pinned ${(pinIndex % pinnedMessages.length) + 1} of ${pinnedMessages.length}:`
                  : 'Pinned:'}
              </span>
              <span className="text-muted dark:text-muted text-[11px] truncate">
                {currentPin.text || '[Media]'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {pinnedMessages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCycleAndJumpPin();
                }}
                className="p-1 rounded text-muted hover:text-primary cursor-pointer"
                title="Next pinned message"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void telegramService.togglePinMessage(chat.id, currentPin.id);
              }}
              className="p-1 rounded text-muted hover:text-rose-500 cursor-pointer"
              title="Unpin message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Supergroup Forum Topics Strip */}
      {chat.isForum && onSelectTopic && (
        <div className="px-3 sm:px-4 py-1.5 border-t border-outline dark:border-outline bg-surface-low/70 dark:bg-canvas flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => onSelectTopic(null)}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTopicId === null
                ? 'bg-primary text-white font-semibold'
                : 'text-muted dark:text-muted hover:bg-hover/70 dark:hover:bg-hover'
            }`}
          >
            All Topics
          </button>

          {topics.map((topic) => {
            const isSel = activeTopicId === topic.id;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => onSelectTopic(topic.id)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors flex items-center gap-1 ${
                  isSel
                    ? 'bg-primary text-white font-semibold'
                    : 'text-muted dark:text-muted hover:bg-hover/70 dark:hover:bg-hover'
                }`}
              >
                <Hash className="w-3 h-3 opacity-80" />
                <span>{topic.title}</span>
                {(topic.unreadCount ?? 0) > 0 && (
                  <span
                    className={`text-[10px] font-semibold tabular-nums ${
                      isSel ? 'text-white/90' : 'text-primary'
                    }`}
                  >
                    · {topic.unreadCount}
                  </span>
                )}
              </button>
            );
          })}

          {onCreateTopic && !showNewTopicInput && (
            <button
              type="button"
              onClick={() => setShowNewTopicInput(true)}
              className="px-2 py-1 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/15 whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
              title="Create Forum Topic"
            >
              <Plus className="w-3 h-3" />
              <span>Topic</span>
            </button>
          )}

          {showNewTopicInput && (
            <form onSubmit={(e) => void handleCreateTopicSubmit(e)} className="flex items-center gap-1 shrink-0">
              <input
                type="text"
                autoFocus
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                placeholder="Topic title..."
                className="w-28 px-2 py-0.5 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={creatingTopic || !newTopicTitle.trim()}
                className="px-2 py-0.5 rounded-lg bg-primary text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {creatingTopic ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewTopicInput(false);
                  setNewTopicTitle('');
                }}
                className="p-0.5 text-muted hover:text-ink cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
