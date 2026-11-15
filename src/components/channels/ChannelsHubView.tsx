import React, { useState, useEffect } from 'react';
import {
  Radio,
  Users,
  Plus,
  Search,
  Link2,
  CheckCircle2,
  Shield,
  Crown,
  Settings,
  ArrowLeft,
  Globe,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { TelegramChat, GlobalSearchResult } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';
import { Avatar } from '../common/Avatar';

interface Props {
  chats: TelegramChat[];
  isConnected: boolean;
  onSelectChat: (chatId: string, openInfo?: boolean) => void;
  onOpenChatByLink: (link: string) => Promise<void>;
  onOpenCreateModal: (mode: 'group' | 'channel') => void;
  onOpenLoginModal: () => void;
  onBackMobile?: () => void;
}

export const ChannelsHubView: React.FC<Props> = ({
  chats,
  isConnected,
  onSelectChat,
  onOpenChatByLink,
  onOpenCreateModal,
  onOpenLoginModal,
  onBackMobile,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'admin' | 'channels' | 'groups'>('all');
  const [query, setQuery] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [joiningLink, setJoiningLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const [searchingGlobal, setSearchingGlobal] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isConnected || trimmed.length < 2) {
      setGlobalResults([]);
      setSearchingGlobal(false);
      return;
    }
    let cancelled = false;
    setSearchingGlobal(true);
    setGlobalResults([]);
    const timer = window.setTimeout(() => {
      void telegramService
        .searchGlobal(trimmed)
        .then((res) => { if (!cancelled) setGlobalResults(res.filter((r) => r.type === 'channel' || r.type === 'group')); })
        .catch(() => { if (!cancelled) setGlobalResults([]); })
        .finally(() => { if (!cancelled) setSearchingGlobal(false); });
    }, 320);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, isConnected]);

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-canvas dark:bg-canvas">
        <Radio className="w-10 h-10 text-primary" />
        <div className="space-y-1 max-w-sm">
          <h2 className="text-base font-bold">Channels &amp; Groups Manager</h2>
          <p className="text-xs text-muted dark:text-muted">
            Sign in to create groups &amp; channels, manage member permissions, and search Telegram globally.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenLoginModal}
          className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer"
        >
          Sign In to Continue
        </button>
      </div>
    );
  }

  const allGroupsAndChannels = chats.filter(
    (c) => !c.isDeletedChat && (c.type === 'channel' || c.type === 'group')
  );

  const matchesQuery = (c: TelegramChat) =>
    !query.trim() ||
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.username?.toLowerCase().includes(query.toLowerCase());

  const adminOwned = allGroupsAndChannels.filter(
    (c) => (c.isCreator || c.isAdmin) && matchesQuery(c)
  );
  const subscribedOther = allGroupsAndChannels.filter(
    (c) => !c.isCreator && !c.isAdmin && matchesQuery(c)
  );

  const visibleAdmin =
    filterTab === 'channels'
      ? adminOwned.filter((c) => c.type === 'channel')
      : filterTab === 'groups'
      ? adminOwned.filter((c) => c.type === 'group')
      : adminOwned;

  const visibleOther =
    filterTab === 'admin'
      ? []
      : filterTab === 'channels'
      ? subscribedOther.filter((c) => c.type === 'channel')
      : filterTab === 'groups'
      ? subscribedOther.filter((c) => c.type === 'group')
      : subscribedOther;

  const localIds = new Set(chats.map((c) => c.id));
  const externalGlobal = globalResults.filter((r) => !localIds.has(r.id));

  const handleJoinLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    setJoiningLink(true);
    setLinkError(null);
    try {
      await onOpenChatByLink(linkInput.trim());
      setLinkInput('');
    } catch (err) {
      setLinkError((err as Error).message || 'Could not resolve link');
    } finally {
      setJoiningLink(false);
    }
  };

  const renderChatRow = (chat: TelegramChat) => (
    <div
      key={chat.id}
      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-hover dark:hover:bg-hover transition-colors"
    >
      <button
        type="button"
        onClick={() => onSelectChat(chat.id, false)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
      >
        <Avatar src={chat.avatarUrl} title={chat.title} id={chat.id} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{chat.title}</span>
            {chat.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
            {chat.isProtected && <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            {chat.isCreator && <Crown className="w-3.5 h-3.5 text-primary shrink-0" />}
          </div>
          <p className="text-xs text-muted dark:text-muted truncate tabular-nums">
            {chat.type === 'channel' ? 'Channel' : 'Group'}
            {chat.username ? ` · @${chat.username}` : ''}
            {chat.memberCount ? ` · ${chat.memberCount.toLocaleString()} members` : ''}
            {chat.isCreator ? ' · Owner' : chat.isAdmin ? ' · Admin' : ''}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        {(chat.isCreator || chat.isAdmin || chat.type === 'group' || chat.type === 'channel') && (
          <button
            type="button"
            onClick={() => onSelectChat(chat.id, true)}
            className="px-2.5 py-1.5 rounded-lg bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover text-xs font-medium flex items-center gap-1 cursor-pointer"
            title="Edit Info, Invite Link & Members"
          >
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{chat.isCreator || chat.isAdmin ? 'Manage' : 'Info'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelectChat(chat.id, false)}
          className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer"
        >
          Open
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-canvas dark:bg-canvas text-ink dark:text-ink overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-outline dark:border-outline bg-surface dark:bg-surface flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              className="p-1.5 lg:hidden text-muted hover:text-ink dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold">Channels &amp; Groups</h1>
            <p className="text-xs text-muted dark:text-muted tabular-nums">
              {adminOwned.length} managed · {allGroupsAndChannels.length} total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCreateModal('group')}
            className="px-3 py-1.5 rounded-xl bg-elevated dark:bg-elevated hover:bg-hover dark:hover:bg-hover border border-outline dark:border-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCreateModal('channel')}
            className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Channel</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Search + Join by Link + Filter Tabs */}
      <div className="px-4 sm:px-6 py-3 border-b border-outline dark:border-outline bg-surface dark:bg-surface space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter yours or search global @channels..."
              className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
            />
            {searchingGlobal && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          </div>

          <form onSubmit={(e) => void handleJoinLink(e)} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline">
              <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Open or join https://t.me/+invite or @username"
                className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={joiningLink || !linkInput.trim()}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              {joiningLink ? 'Joining...' : 'Join / Open'}
            </button>
          </form>
        </div>
        {linkError && <p className="text-xs text-rose-500">{linkError}</p>}

        <div className="flex items-center gap-4 border-t border-outline dark:border-outline pt-2 text-xs">
          {(
            [
              ['all', 'All'],
              ['admin', 'Your Channels & Admin'],
              ['channels', 'Channels'],
              ['groups', 'Groups'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilterTab(id)}
              className={`pb-1.5 border-b-2 font-medium cursor-pointer transition-colors ${
                filterTab === id
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted dark:text-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Section 1: Your Channels & Admin Groups */}
        {visibleAdmin.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted dark:text-muted px-1">
              Your Channels &amp; Admin Groups · {visibleAdmin.length}
            </h2>
            <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
              {visibleAdmin.map(renderChatRow)}
            </div>
          </section>
        )}

        {/* Section 2: Subscribed Channels & Groups */}
        {visibleOther.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted dark:text-muted px-1">
              Subscribed Channels &amp; Groups · {visibleOther.length}
            </h2>
            <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
              {visibleOther.map(renderChatRow)}
            </div>
          </section>
        )}

        {/* Section 3: Global Telegram Search Results */}
        {externalGlobal.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted dark:text-muted px-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>Global Telegram Directory · {externalGlobal.length}</span>
            </h2>
            <div className="rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline divide-y divide-outline dark:divide-outline overflow-hidden">
              {externalGlobal.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-hover dark:hover:bg-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={item.avatarUrl} title={item.title} id={item.id} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{item.title}</span>
                        {item.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <p className="text-xs text-muted dark:text-muted truncate tabular-nums">
                        {item.type}
                        {item.username ? ` · @${item.username}` : ''}
                        {item.memberCount ? ` · ${item.memberCount.toLocaleString()} members` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onOpenChatByLink(item.username ? `@${item.username}` : item.id)}
                    className="px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {visibleAdmin.length === 0 && visibleOther.length === 0 && externalGlobal.length === 0 && (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm font-medium text-muted dark:text-muted">
              No matching channels or groups
            </p>
            <p className="text-xs text-muted dark:text-muted">
              Create your own group or channel above, or paste a t.me invite link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
