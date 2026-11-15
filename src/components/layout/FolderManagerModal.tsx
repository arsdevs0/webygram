import React, { useState } from 'react';
import { X, Folder, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { ChatFolder, TelegramChat } from '../../types/telegram';
import { telegramService } from '../../services/telegramService';

interface Props {
  isOpen: boolean;
  folders: ChatFolder[];
  chats: TelegramChat[];
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const FolderManagerModal: React.FC<Props> = ({
  isOpen,
  folders,
  chats,
  onClose,
  onNotify,
}) => {
  const [name, setName] = useState('');
  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeNonContacts, setIncludeNonContacts] = useState(false);
  const [includeGroups, setIncludeGroups] = useState(false);
  const [includeBroadcasts, setIncludeBroadcasts] = useState(false);
  const [includeBots, setIncludeBots] = useState(false);
  const [excludeMuted, setExcludeMuted] = useState(false);
  const [excludeArchived, setExcludeArchived] = useState(true);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const customFolders = folders.filter((f) => f.isCloud || f.filter === 'custom');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await telegramService.saveCloudFolder({
        name: name.trim(),
        includeContacts,
        includeNonContacts,
        includeGroups,
        includeBroadcasts,
        includeBots,
        excludeMuted,
        excludeArchived,
        includeChatIds: Array.from(selectedChatIds),
      });
      setName('');
      setSelectedChatIds(new Set());
      onNotify?.('Telegram cloud folder saved');
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not save folder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Chat folders" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[86vh] rounded-2xl bg-surface dark:bg-surface border border-outline dark:border-outline shadow-2xl flex flex-col overflow-hidden text-ink dark:text-ink"
      >
        <div className="px-4 py-3 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Cloud Chat Folders</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Existing Cloud & Custom Folders */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-muted dark:text-muted">
              Active Custom &amp; Cloud Folders ({customFolders.length})
            </h4>
            {customFolders.length === 0 ? (
              <p className="text-[11px] text-muted dark:text-muted py-2">
                No custom cloud folders yet. Create one below to sync across all your Telegram devices.
              </p>
            ) : (
              <div className="divide-y divide-outline dark:divide-outline rounded-xl border border-outline dark:border-outline overflow-hidden">
                {customFolders.map((f) => (
                  <div
                    key={f.id}
                    className="px-3 py-2.5 bg-surface-low dark:bg-elevated flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{f.name}</p>
                      <p className="text-[10.5px] text-muted dark:text-muted truncate">
                        {[
                          f.includeContacts && 'Contacts',
                          f.includeNonContacts && 'Non-Contacts',
                          f.includeGroups && 'Groups',
                          f.includeBroadcasts && 'Channels',
                          f.includeBots && 'Bots',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Selected chats'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (f.isCloud && f.telegramFilterId) {
                          void telegramService.deleteCloudFolder(f.telegramFilterId);
                        } else {
                          telegramService.deleteFolder(f.id);
                        }
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer shrink-0"
                      title="Delete Folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create New Cloud Folder */}
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3 pt-2 border-t border-outline dark:border-outline">
            <h4 className="text-[11px] font-semibold text-primary">Create Cloud Folder</h4>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name (e.g. Work, News, VIP)"
              maxLength={12}
              className="w-full px-3 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline focus:outline-none focus:border-primary"
            />

            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Contacts', state: includeContacts, set: setIncludeContacts },
                { label: 'Non-Contacts', state: includeNonContacts, set: setIncludeNonContacts },
                { label: 'Groups', state: includeGroups, set: setIncludeGroups },
                { label: 'Channels', state: includeBroadcasts, set: setIncludeBroadcasts },
                { label: 'Bots', state: includeBots, set: setIncludeBots },
                { label: 'Hide Muted', state: excludeMuted, set: setExcludeMuted },
                { label: 'Hide Archived', state: excludeArchived, set: setExcludeArchived },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className="px-2.5 py-2 rounded-xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline flex items-center justify-between cursor-pointer"
                >
                  <span>{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={opt.state}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="accent-primary"
                  />
                </label>
              ))}
            </div>

            {chats.filter((c) => !c.isDeletedChat).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted dark:text-muted block">
                  Specific Chats (optional)
                </span>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-outline dark:border-outline divide-y divide-outline dark:divide-outline">
                  {chats
                    .filter((c) => !c.isDeletedChat)
                    .slice(0, 25)
                    .map((c) => {
                      const checked = selectedChatIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setSelectedChatIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-hover dark:hover:bg-hover cursor-pointer"
                        >
                          <span className="truncate">{c.title}</span>
                          {checked && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Sync Folder to Telegram</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
