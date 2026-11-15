import React from 'react';
import {
  MessageSquare,
  User,
  Users,
  Radio,
  Bot,
  Bell,
  Sliders,
  Settings,
  Sparkles,
  FolderPlus,
  Mic,
  Palette,
} from 'lucide-react';
import { ChatFolder, TelegramUser } from '../../types/telegram';
import { modSettingsStore } from '../../services/modSettingsStore';

interface Props {
  folders: ChatFolder[];
  activeFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onOpenAddFolder: () => void;
  onOpenVoiceStudio: () => void;
  onOpenModSettings: () => void;
  onOpenSettings: () => void;
  currentUser: TelegramUser;
  voiceChangerEnabled: boolean;
}

export const SidebarNav: React.FC<Props> = ({
  folders,
  activeFolderId,
  onSelectFolder,
  onOpenAddFolder,
  onOpenVoiceStudio,
  onOpenModSettings,
  onOpenSettings,
  currentUser,
  voiceChangerEnabled,
}) => {
  const modSettings = modSettingsStore.getSettings();

  const getFolderIcon = (iconName: string) => {
    switch (iconName) {
      case 'User': return <User className="w-5 h-5" />;
      case 'Users': return <Users className="w-5 h-5" />;
      case 'Radio': return <Radio className="w-5 h-5" />;
      case 'Bot': return <Bot className="w-5 h-5" />;
      case 'Bell': return <Bell className="w-5 h-5" />;
      default: return <MessageSquare className="w-5 h-5" />;
    }
  };

  return (
    <aside className="w-16 sm:w-18 bg-surface border-r border-outline/80 flex flex-col items-center py-3 select-none z-30 shrink-0">
      {/* TG Plus Brand Icon */}
      <div className="mb-4">
        <button
          onClick={onOpenModSettings}
          className="relative w-10 h-10 rounded-2xl bg-elevated flex items-center justify-center text-white font-extrabold text-sm shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform"
          title="TG Plus Client Mods"
        >
          <span>TG+</span>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-violet-400 animate-ping" />
        </button>
      </div>

      {/* Chat Folders Icons */}
      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto no-scrollbar py-1">
        {folders.map((folder) => {
          const isActive = activeFolderId === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={`relative p-2.5 rounded-2xl transition-all duration-200 group flex items-center justify-center ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-muted hover:text-muted hover:bg-hover'
              }`}
              title={folder.name}
            >
              {getFolderIcon(folder.iconName)}
              {/* Tooltip on hover */}
              <span className="hidden md:block absolute left-full ml-3 px-2.5 py-1 bg-surface text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-outline">
                {folder.name}
              </span>
            </button>
          );
        })}

        {/* Add Folder button */}
        <button
          onClick={onOpenAddFolder}
          className="p-2.5 text-muted hover:text-blue-400 rounded-2xl hover:bg-hover transition-colors"
          title="Create New Chat Folder"
        >
          <FolderPlus className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Shortcuts */}
      <div className="flex flex-col items-center gap-2.5 pt-2 border-t border-outline/80 w-full px-2">
        {/* Voice Changer Studio Shortcut */}
        <button
          onClick={onOpenVoiceStudio}
          className={`relative p-2.5 rounded-2xl transition-all group ${
            voiceChangerEnabled
              ? 'bg-elevated text-white shadow-lg shadow-violet-500/30'
              : 'text-muted hover:text-blue-400 hover:bg-hover'
          }`}
          title="Open Voice Changer Audio Studio"
        >
          <Mic className="w-5 h-5" />
          {voiceChangerEnabled && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        {/* Mod Features & Appearance Customizer */}
        <button
          onClick={onOpenModSettings}
          className="p-2.5 text-muted hover:text-violet-400 rounded-2xl hover:bg-hover transition-colors"
          title="TG Plus Mod Features & Themes"
        >
          <Palette className="w-5 h-5" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-2.5 text-muted hover:text-muted rounded-2xl hover:bg-hover transition-colors"
          title="Telegram Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* User Profile Avatar */}
        <button
          onClick={onOpenSettings}
          className="mt-1 relative group rounded-full"
          title="My Profile & Sessions"
        >
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.firstName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-outline/80 group-hover:border-blue-500 transition-colors"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
              {currentUser.firstName.slice(0, 1)}
            </div>
          )}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-outline" />
        </button>
      </div>
    </aside>
  );
};
