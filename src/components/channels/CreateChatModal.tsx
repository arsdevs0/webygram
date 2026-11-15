import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  AlertCircle,
  Loader2,
  Search,
  Plus,
  Users,
  Radio,
} from 'lucide-react';
import { TelegramChat } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { Avatar } from '../common/Avatar';

interface Props {
  isOpen: boolean;
  initialMode?: 'group' | 'channel';
  chats: TelegramChat[];
  onClose: () => void;
  onCreated: (chat: TelegramChat) => void;
}

export const CreateChatModal: React.FC<Props> = ({
  isOpen,
  initialMode = 'group',
  chats,
  onClose,
  onCreated,
}) => {
  const [mode, setMode] = useState<'group' | 'channel'>(initialMode);
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSupergroup, setIsSupergroup] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [showAddMembersPicker, setShowAddMembersPicker] = useState(false);
  const [memberFilter, setMemberFilter] = useState('');
  const [extraMemberHandle, setExtraMemberHandle] = useState('');

  // Channel username availability
  const [username, setUsername] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setTitle('');
      setAbout('');
      setAvatarPreview(null);
      setUsername('');
      setUsernameStatus(null);
      setSelectedMemberIds([]);
      setShowAddMembersPicker(false);
      setExtraMemberHandle('');
      setMemberFilter('');
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen || mode !== 'channel') return;
    const clean = username.replace(/^@/, '').trim();
    if (!clean) {
      setUsernameStatus(null);
      setCheckingUsername(false);
      return;
    }
    if (clean.length < 4) {
      setUsernameStatus({ available: false, reason: 'Minimum 4 characters required' });
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    const timer = window.setTimeout(() => {
      void telegramService
        .checkUsername('new', clean)
        .then((res) => setUsernameStatus(res))
        .catch(() => setUsernameStatus({ available: false, reason: 'Check failed' }))
        .finally(() => setCheckingUsername(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [username, mode, isOpen]);

  if (!isOpen) return null;

  const userContacts = chats.filter(
    (c) =>
      !c.isDeletedChat &&
      c.type === 'user' &&
      (!memberFilter.trim() ||
        c.title.toLowerCase().includes(memberFilter.toLowerCase()) ||
        c.username?.toLowerCase().includes(memberFilter.toLowerCase()))
  );

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setError(mode === 'group' ? 'Group Name is required.' : 'Channel Name is required.');
      return;
    }
    if (mode === 'channel' && username.trim() && usernameStatus && !usernameStatus.available) {
      setError(usernameStatus.reason || 'Choose an available public username.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let created: TelegramChat;
      if (mode === 'group') {
        const members = [...selectedMemberIds];
        if (extraMemberHandle.trim()) {
          members.push(extraMemberHandle.trim());
        }
        created = await telegramService.createGroup({
          title: title.trim(),
          about: about.trim(),
          supergroup: isSupergroup,
          members,
        });
      } else {
        created = await telegramService.createChannel({
          title: title.trim(),
          about: about.trim(),
          username: username.replace(/^@/, '').trim() || undefined,
        });
      }

      if (avatarPreview && created?.id) {
        await telegramService
          .editChat(created.id, {
            avatarDataUrl: avatarPreview,
          })
          .catch(() => {});
      }

      onCreated(created);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New group or channel" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-[3px]">
      <div className="w-full max-w-md rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-ink dark:text-ink">
        {/* Official Telegram Top Bar (Matches Screen 8: <- New Group | ✓) */}
        <div className="px-4 py-3.5 bg-surface dark:bg-surface border-b border-outline dark:border-outline flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted dark:text-ink hover:text-primary rounded-full cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-[17px] font-bold tracking-tight">
              {mode === 'group' ? 'New Group' : 'New Channel'}
            </h2>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="p-1.5 text-primary hover:bg-primary/15 rounded-full cursor-pointer disabled:opacity-50"
            title={mode === 'group' ? 'Create Group' : 'Create Channel'}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5.5 h-5.5 stroke-[2.4]" />
            )}
          </button>
        </div>

        {/* Mode Switcher Pill Strip (Group / Channel) */}
        <div className="grid grid-cols-2 bg-elevated dark:bg-canvas p-1 mx-4 mt-3 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('group');
              setError(null);
            }}
            className={`py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'group'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted dark:text-muted hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('channel');
              setError(null);
            }}
            className={`py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'channel'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted dark:text-muted hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>New Channel</span>
          </button>
        </div>

        {/* Form Body (Matches Screen 8 of reference image) */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto">
          {/* Top Camera Circle + Underline Group/Channel Name Input */}
          <div className="px-6 pt-5 pb-5 flex flex-col items-center border-b-8 border-outline dark:border-outline">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-95 overflow-hidden mb-4"
              title="Set Photo"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-7 h-7" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') setAvatarPreview(reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />

            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === 'group' ? 'Group Name' : 'Channel Name'}
              className="w-full max-w-xs pb-2 bg-transparent border-b-2 border-primary text-center text-[15px] font-medium text-ink dark:text-ink placeholder-muted dark:placeholder-[#7F91A4] focus:outline-none"
            />

            <input
              type="text"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Description (optional)"
              className="w-full max-w-xs mt-3 pb-1.5 bg-transparent border-b border-outline dark:border-outline text-center text-xs text-ink dark:text-ink placeholder-muted dark:placeholder-[#7F91A4] focus:outline-none focus:border-primary"
            />
          </div>

          {mode === 'channel' ? (
            <div className="p-5 space-y-3">
              <label className="text-xs font-semibold text-primary block">
                Public Link (optional — leave blank for private channel)
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline">
                <span className="text-xs font-mono text-muted dark:text-muted">t.me/</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="public_channel_handle"
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono focus:outline-none"
                />
                {checkingUsername && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
              </div>
              {usernameStatus && !checkingUsername && (
                <p
                  className={`text-[11px] flex items-center gap-1 ${
                    usernameStatus.available ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {usernameStatus.available ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>@{username.replace(/^@/, '').trim()} is available</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      <span>{usernameStatus.reason || 'Unavailable'}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="py-3">
              {/* Official Telegram Members (N) Section + (+) Add Members Row (Matches Screen 8) */}
              <div className="px-5 py-1.5 flex items-center justify-between">
                <span className="text-[13px] font-bold text-ink dark:text-ink">
                  Members ({selectedMemberIds.length + (extraMemberHandle.trim() ? 1 : 0)})
                </span>
                <button
                  type="button"
                  onClick={() => setIsSupergroup(!isSupergroup)}
                  className="text-[11px] font-medium text-primary cursor-pointer"
                >
                  {isSupergroup ? 'Supergroup ✓' : 'Basic Group'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowAddMembersPicker((prev) => !prev)}
                className="w-full px-5 py-3 flex items-center gap-3.5 hover:bg-hover dark:hover:bg-hover transition-colors cursor-pointer text-left border-b border-outline dark:border-white/[0.06]"
              >
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-xs shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[15px] font-medium text-primary">Add Members</span>
              </button>

              {(showAddMembersPicker || selectedMemberIds.length > 0 || userContacts.length > 0) && (
                <div className="px-5 pt-3 space-y-2.5">
                  <input
                    type="text"
                    value={extraMemberHandle}
                    onChange={(e) => setExtraMemberHandle(e.target.value)}
                    placeholder="Invite by @username (optional)"
                    className="w-full px-3 py-2 rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
                  />

                  {chats.some((c) => c.type === 'user') && (
                    <div className="rounded-xl bg-surface-low dark:bg-canvas border border-outline dark:border-outline overflow-hidden">
                      <div className="px-3 py-2 border-b border-outline dark:border-white/[0.06] flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-muted" />
                        <input
                          type="text"
                          value={memberFilter}
                          onChange={(e) => setMemberFilter(e.target.value)}
                          placeholder="Search contacts..."
                          className="flex-1 bg-transparent text-xs focus:outline-none"
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto divide-y divide-outline dark:divide-white/[0.05]">
                        {userContacts.slice(0, 35).map((u) => {
                          const checked = selectedMemberIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleMember(u.id)}
                              className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-hover dark:hover:bg-hover cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar src={u.avatarUrl} title={u.title} id={u.id} size="xs" />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{u.title}</p>
                                  {u.username && (
                                    <p className="text-[10.5px] text-muted font-mono truncate">
                                      @{u.username}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center border shrink-0 ${
                                  checked
                                    ? 'bg-primary border-primary text-white'
                                    : 'border-outline dark:border-outline'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mx-5 my-3 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
