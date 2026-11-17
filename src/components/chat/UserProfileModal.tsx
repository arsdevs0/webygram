import { Avatar } from '../common/Avatar';
import { SharedMediaTabs } from './SharedMediaTabs';
import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Video,
  AtSign,
  Info,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  Bot,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Mic,
  Copy,
  Check,
  Play,
  Download,
  Loader2,
  Users,
} from 'lucide-react';
import { UserProfileInfo, TelegramMessage, MediaAttachment } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';

interface UserProfileModalProps {
  isOpen: boolean;
  userId: string | null;
  contextChatId?: string | null;
  fallbackName?: string;
  onClose: () => void;
  onOpenDirectChat: (user: UserProfileInfo) => void;
  onStartVoiceCall?: (user: UserProfileInfo) => void;
  onStartVideoCall?: (user: UserProfileInfo) => void;
  onOpenMedia: (media: MediaAttachment, msgId: string) => void;
  onNotify?: (msg: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  userId,
  contextChatId,
  fallbackName,
  onClose,
  onOpenDirectChat,
  onStartVoiceCall,
  onStartVideoCall,
  onOpenMedia,
  onNotify,
}) => {
  const [profile, setProfile] = useState<UserProfileInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'voice'>('media');
  const [sharedItems, setSharedItems] = useState<TelegramMessage[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);

  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null);
      setError(null);
      setSharedItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    telegramService
      .getUserProfile(userId, contextChatId || undefined, fallbackName)
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Could not load user profile');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, contextChatId, fallbackName]);


  if (!isOpen || !userId) return null;

  const copyValue = (val: string, label: string) => {
    void navigator.clipboard.writeText(val);
    setCopiedField(label);
    onNotify?.(`${label} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleToggleBlock = async () => {
    if (!profile || isTogglingBlock) return;
    setIsTogglingBlock(true);
    try {
      const nextBlocked = !profile.isBlocked;
      await telegramService.blockUser(profile.id, nextBlocked);
      setProfile({ ...profile, isBlocked: nextBlocked });
      onNotify?.(nextBlocked ? `Blocked ${profile.title}` : `Unblocked ${profile.title}`);
    } catch (e: unknown) {
      onNotify?.((e as Error)?.message || 'Failed to update block status');
    } finally {
      setIsTogglingBlock(false);
    }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Profile" className="tg-mobile-panel fixed inset-0 z-[95] bg-black/65 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full h-[100dvh] sm:h-auto sm:max-h-[88vh] sm:max-w-[420px] bg-surface dark:bg-surface sm:rounded-2xl border-0 sm:border border-outline dark:border-outline shadow-2xl flex flex-col overflow-hidden text-ink dark:text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface dark:bg-surface border-b border-outline dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-1 rounded-full text-muted dark:text-muted hover:text-ink dark:hover:text-white hover:bg-hover dark:hover:bg-hover transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
            <span className="font-semibold text-[16px]">User Info</span>
          </div>
          {profile && (
            <button
              type="button"
              onClick={() => {
                onOpenDirectChat(profile);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <MessageSquare size={14} />
              <span>Message</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-outline dark:divide-outline bg-surface-low dark:bg-canvas">
          {isLoading ? (
            <div className="p-10 flex flex-col items-center justify-center gap-3 bg-surface dark:bg-surface">
              <Loader2 size={28} className="animate-spin text-primary" />
              <span className="text-xs text-muted dark:text-muted">Loading Telegram profile...</span>
            </div>
          ) : error || !profile ? (
            <div className="p-8 text-center bg-surface dark:bg-surface">
              <p className="text-sm text-rose-500 dark:text-red-400 mb-3">{error || 'User profile unavailable'}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-elevated dark:bg-white/10 text-xs font-medium hover:bg-hover dark:hover:bg-hover cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Hero Card */}
              <div className="p-5 bg-surface dark:bg-surface flex flex-col items-center text-center relative">
                <button type="button" aria-label="Open profile photo" className="mb-3" onClick={()=>onOpenMedia({type:'photo',url:profile.avatarUrl || '/api/tg/avatar/'+encodeURIComponent(profile.id),fileName:profile.title+' profile photo'},'avatar:'+profile.id)}><Avatar src={profile.avatarUrl} title={profile.title} id={profile.id} size="xl" /></button>

                <div className="flex items-center justify-center gap-1.5 max-w-full px-2">
                  <h2 className="text-[19px] font-bold truncate">{profile.title}</h2>
                  {profile.isVerified && (
                    <CheckCircle2 size={17} className="text-primary fill-primary/20 shrink-0" />
                  )}
                  {profile.isPremium && (
                    <Sparkles size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                  )}
                  {profile.isBot && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold">
                      <Bot size={11} /> BOT
                    </span>
                  )}
                </div>

                <p
                  className={`text-[13px] mt-0.5 ${
                    profile.status === 'online'
                      ? 'text-primary font-medium'
                      : 'text-muted dark:text-muted'
                  }`}
                >
                  {profile.status}
                </p>

                {/* Primary Action Buttons */}
                <div className="grid grid-cols-4 gap-2 w-full mt-4 pt-3 border-t border-outline dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDirectChat(profile);
                      onClose();
                    }}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-primary transition-colors cursor-pointer"
                  >
                    <MessageSquare size={17} />
                    <span className="text-[10.5px] font-medium">Message</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onStartVoiceCall) {
                        onStartVoiceCall(profile);
                        onClose();
                      } else {
                        onNotify?.('Voice calls available in direct chat header');
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-primary transition-colors cursor-pointer"
                  >
                    <Phone size={17} />
                    <span className="text-[10.5px] font-medium">Call</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onStartVideoCall) {
                        onStartVideoCall(profile);
                        onClose();
                      } else if (onStartVoiceCall) {
                        onStartVoiceCall(profile);
                        onClose();
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-primary transition-colors cursor-pointer"
                  >
                    <Video size={17} />
                    <span className="text-[10.5px] font-medium">Video</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={isTogglingBlock}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover transition-colors cursor-pointer ${
                      profile.isBlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-red-400'
                    }`}
                  >
                    <ShieldAlert size={17} />
                    <span className="text-[10.5px] font-medium">
                      {profile.isBlocked ? 'Unblock' : 'Block'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Bio / Username / Phone Details */}
              <div className="bg-surface dark:bg-surface p-4 space-y-3.5 mt-2">
                {profile.about && (
                  <div className="flex items-start gap-3.5">
                    <Info size={19} className="text-muted dark:text-muted shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] whitespace-pre-wrap break-words leading-snug">
                        {profile.about}
                      </p>
                      <span className="text-[11px] text-muted dark:text-muted">Bio</span>
                    </div>
                  </div>
                )}

                {profile.username && (
                  <div
                    onClick={() => copyValue(`@${profile.username}`, 'Username')}
                    className="flex items-center justify-between gap-3 cursor-pointer hover:bg-hover dark:hover:bg-white/[0.03] -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <AtSign size={19} className="text-muted dark:text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[14px] text-primary font-medium truncate">
                          @{profile.username}
                        </p>
                        <span className="text-[11px] text-muted dark:text-muted">Username (tap to copy)</span>
                      </div>
                    </div>
                    {copiedField === 'Username' ? (
                      <Check size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Copy size={15} className="text-muted dark:text-muted shrink-0" />
                    )}
                  </div>
                )}

                {profile.phone && (
                  <div
                    onClick={() => copyValue(`+${profile.phone}`, 'Phone')}
                    className="flex items-center justify-between gap-3 cursor-pointer hover:bg-hover dark:hover:bg-white/[0.03] -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Phone size={19} className="text-muted dark:text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium truncate">
                          +{profile.phone}
                        </p>
                        <span className="text-[11px] text-muted dark:text-muted">Phone</span>
                      </div>
                    </div>
                    {copiedField === 'Phone' ? (
                      <Check size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Copy size={15} className="text-muted dark:text-muted shrink-0" />
                    )}
                  </div>
                )}

                {typeof profile.commonChatsCount === 'number' && profile.commonChatsCount > 0 && (
                  <div className="flex items-center gap-3.5 pt-1">
                    <Users size={19} className="text-muted dark:text-muted shrink-0" />
                    <div>
                      <p className="text-[14px] font-medium">
                        {profile.commonChatsCount} {profile.commonChatsCount === 1 ? 'group' : 'groups'} in common
                      </p>
                      <span className="text-[11px] text-muted dark:text-muted">Shared Groups</span>
                    </div>
                  </div>
                )}
              </div>

              <SharedMediaTabs key={userId} chatId={userId} messages={telegramService.getMessages(userId)} onOpenMedia={onOpenMedia} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
