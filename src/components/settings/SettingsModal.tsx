import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowLeft,
  User,
  Mic,
  Shield,
  MessageSquare,
  Bell,
  Palette,
  LogOut,
  LogIn,
  Trash2,
  Lock,
  Smartphone,
  ShieldCheck,
  Check,
  Loader2,
  AlertCircle,
  Ban,
  FolderCog,
  KeyRound,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { telegramService } from '../../services/telegramService';
import { ayuGramEngine } from '../../services/ayuGramModEngine';
import { modSettingsStore } from '../../services/modSettingsStore';
import { passcodeService } from '../../services/passcodeService';
import {
  TelegramUser,
  ChatFolder,
  DeviceSessionItem,
  BlockedUserItem,
  PrivacySettingItem,
  PrivacyKeyName,
  PrivacyRuleLevel,
} from '../../types/telegram';
import { AyuGramSettings } from '../../types/ayugram';
import { Avatar } from '../common/Avatar';

export type SettingsCategory = 'general' | 'privacy' | 'devices' | 'chats' | 'notifications';
const CATEGORY_LABELS: Record<SettingsCategory, string> = { general: 'Account & Profile', privacy: 'Privacy and Security', devices: 'Devices', chats: 'Chat Folders', notifications: 'Notifications and Sounds' };

interface Props {
  initialCategory?: SettingsCategory;
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  currentUser: TelegramUser;
  folders: ChatFolder[];
  onOpenVoiceStudio: () => void;
  onOpenModSettings: () => void;
  onOpenAyuGramSettings?: () => void;
  onOpenDeletedLogs?: () => void;
  onOpenFolderManager?: () => void;
  onOpenLoginModal: () => void;
  onNotify?: (msg: string) => void;
}

const PRIVACY_LABELS: Record<PrivacyKeyName, { label: string; desc: string }> = {
  statusTimestamp: {
    label: 'Last Seen & Online',
    desc: 'Who can see when you were last active',
  },
  profilePhoto: {
    label: 'Profile Photos',
    desc: 'Who can see your profile pictures',
  },
  phoneNumber: {
    label: 'Phone Number',
    desc: 'Who can see your phone number',
  },
  phoneCall: {
    label: 'Voice Calls',
    desc: 'Who can call you on Telegram',
  },
  chatInvite: {
    label: 'Groups & Channels',
    desc: 'Who can add you to groups & channels',
  },
};

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  initialCategory = 'general',
  onClose,
  isConnected,
  currentUser,
  folders,
  onOpenVoiceStudio,
  onOpenModSettings,
  onOpenAyuGramSettings,
  onOpenDeletedLogs,
  onOpenFolderManager,
  onOpenLoginModal,
  onNotify,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'general' | 'privacy' | 'devices' | 'chats' | 'notifications'
  >(initialCategory);
  const [newFolderName, setNewFolderName] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [ayuSettings, setAyuSettings] = useState<AyuGramSettings>(ayuGramEngine.getSettings());
  const [firstName, setFirstName] = useState(currentUser.firstName || '');
  const [lastName, setLastName] = useState(currentUser.lastName || '');
  const [username, setUsername] = useState(currentUser.username || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Privacy & Blocked Users
  const [privacyItems, setPrivacyItems] = useState<PrivacySettingItem[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [savingPrivacyKey, setSavingPrivacyKey] = useState<PrivacyKeyName | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Passcode Lock
  const [hasPasscode, setHasPasscode] = useState(passcodeService.hasPasscode());
  const [autoLockMin, setAutoLockMin] = useState(passcodeService.getAutoLockMinutes());
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Active Devices / Sessions
  const [sessions, setSessions] = useState<DeviceSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [terminatingHash, setTerminatingHash] = useState<string | null>(null);

  useEffect(() => {
    const unsubAyu = ayuGramEngine.subscribe(setAyuSettings);
    const unsubPass = passcodeService.subscribe(() => {
      setHasPasscode(passcodeService.hasPasscode());
      setAutoLockMin(passcodeService.getAutoLockMinutes());
    });
    return () => {
      unsubAyu();
      unsubPass();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setFirstName(currentUser.firstName || '');
      setLastName(currentUser.lastName || '');
      setUsername(currentUser.username || '');
      setBio(currentUser.bio || '');
      setProfileMsg(null);
      setProfileError(null);
      setPinError(null);
      setHasPasscode(passcodeService.hasPasscode());
      setAutoLockMin(passcodeService.getAutoLockMinutes());
    }
  }, [isOpen, currentUser]);

  const loadPrivacyAndBlocked = async () => {
    if (!isConnected) return;
    setLoadingPrivacy(true);
    setLoadingBlocked(true);
    try {
      const [priv, blk] = await Promise.all([
        telegramService.getPrivacySettings(),
        telegramService.getBlockedUsers(),
      ]);
      setPrivacyItems(priv);
      setBlockedUsers(blk);
    } finally {
      setLoadingPrivacy(false);
      setLoadingBlocked(false);
    }
  };

  const loadSessions = async () => {
    if (!isConnected) return;
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const list = await telegramService.getDeviceSessions();
      setSessions(list);
    } catch (err) {
      setSessionsError((err as Error).message || 'Could not load active sessions');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !isConnected) return;
    if (activeCategory === 'privacy') {
      void loadPrivacyAndBlocked();
    } else if (activeCategory === 'devices') {
      void loadSessions();
    }
  }, [isOpen, isConnected, activeCategory]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    setProfileError(null);
    try {
      await telegramService.editProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bio: bio.trim(),
        username: username.replace(/^@/, '').trim(),
      });
      setProfileMsg('Profile updated on Telegram');
    } catch (err) {
      setProfileError((err as Error).message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePrivacyChange = async (key: PrivacyKeyName, level: PrivacyRuleLevel) => {
    setSavingPrivacyKey(key);
    try {
      await telegramService.updatePrivacySetting(key, level);
      setPrivacyItems((prev) =>
        prev.some((p) => p.key === key)
          ? prev.map((p) => (p.key === key ? { ...p, level } : p))
          : [...prev, { key, label: PRIVACY_LABELS[key].label, level }]
      );
      onNotify?.(`Updated ${PRIVACY_LABELS[key].label} privacy`);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not update privacy rule');
    } finally {
      setSavingPrivacyKey(null);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await telegramService.setUserBlocked(userId, false);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      onNotify?.('User unblocked');
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not unblock user');
    } finally {
      setUnblockingId(null);
    }
  };

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      await passcodeService.setPasscode(pinInput, autoLockMin);
      setPinInput('');
      onNotify?.('Passcode lock saved');
    } catch (err) {
      setPinError((err as Error).message || 'Invalid passcode');
    }
  };

  const handleTerminateSession = async (hash: string) => {
    setTerminatingHash(hash);
    try {
      await telegramService.terminateDeviceSession(hash);
      if (hash === 'all_other') {
        setSessions((prev) => prev.filter((s) => s.current));
        onNotify?.('Terminated all other active sessions');
      } else {
        setSessions((prev) => prev.filter((s) => s.hash !== hash));
        onNotify?.('Session terminated');
      }
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not terminate session');
    } finally {
      setTerminatingHash(null);
    }
  };

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    telegramService.addCustomFolder(newFolderName.trim());
    setNewFolderName('');
  };

  const handleLogout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 4000);
      return;
    }
    await telegramService.logout();
    setConfirmLogout(false);
    onClose();
    onOpenLoginModal();
  };

  const otherSessionsCount = sessions.filter((s) => !s.current).length;

  return (
    <div role="dialog" aria-modal="true" aria-label={CATEGORY_LABELS[activeCategory]} className="tg-fullscreen-dialog fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-[3px]">
      <div className="w-full max-w-4xl h-full sm:h-[85dvh] bg-surface dark:bg-surface border border-outline dark:border-outline rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-ink dark:text-ink">
        {/* Sidebar */}
        <div className="hidden md:flex w-full md:w-64 bg-surface-low dark:bg-canvas border-r border-outline dark:border-outline flex flex-col shrink-0">
          <div className="p-4 border-b border-outline dark:border-outline flex items-center justify-between">
            <h2 className="text-sm font-semibold">Settings</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to settings"
              className="md:hidden p-1 text-muted hover:text-ink cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => setActiveCategory('general')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                activeCategory === 'general'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted dark:text-muted hover:bg-white dark:hover:bg-hover'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Account &amp; Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('privacy')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                activeCategory === 'privacy'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted dark:text-muted hover:bg-white dark:hover:bg-hover'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privacy &amp; Security</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('devices')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                activeCategory === 'devices'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted dark:text-muted hover:bg-white dark:hover:bg-hover'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Devices &amp; Sessions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('chats')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                activeCategory === 'chats'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted dark:text-muted hover:bg-white dark:hover:bg-hover'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat Folders</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenVoiceStudio();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-muted dark:text-muted hover:bg-white dark:hover:bg-hover transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Mic className="w-4 h-4 text-primary" />
                <span>Voice Changer</span>
              </div>
            </button>

            {onOpenAyuGramSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAyuGramSettings();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-muted dark:text-muted hover:bg-white dark:hover:bg-hover transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>AyuGram &amp; Vault</span>
                </div>
              </button>
            )}

            {onOpenDeletedLogs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDeletedLogs();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-rose-500 hover:bg-white dark:hover:bg-hover transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>Deleted Messages Log</span>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveCategory('notifications')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                activeCategory === 'notifications'
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted dark:text-muted hover:bg-white dark:hover:bg-hover'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notifications</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenModSettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-muted dark:text-muted hover:bg-white dark:hover:bg-hover transition-colors text-left cursor-pointer"
            >
              <Palette className="w-4 h-4 text-primary" />
              <span>Appearance &amp; Theme</span>
            </button>

            <button
              type="button"
              onClick={() => {
                modSettingsStore.resetStyleDefaults();
                onNotify?.('Appearance & style reset to default');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-muted dark:text-muted hover:text-rose-500 hover:bg-white dark:hover:bg-hover transition-colors text-left cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-rose-400" />
              <span>Reset Style to Default</span>
            </button>
          </div>

          <div className="p-3 border-t border-outline dark:border-outline">
            {isConnected ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{confirmLogout ? 'Click again to log out' : 'Sign Out'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoginModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 rounded-xl transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Telegram</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Body */}
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden bg-surface dark:bg-surface">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 shrink-0 border-b border-outline dark:border-outline bg-surface-low dark:bg-canvas">
            <h3 className="order-2 md:order-none flex-1 text-base font-semibold">{CATEGORY_LABELS[activeCategory]}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to settings"
              className="order-1 md:order-none mr-3 md:mr-0 min-w-11 min-h-11 flex items-center justify-center text-muted hover:text-ink dark:hover:text-white rounded-lg cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5 md:hidden" /><X className="w-5 h-5 hidden md:block" />
            </button>
          </div>

          <div className="tg-settings-detail min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {activeCategory === 'general' && isConnected && <button type="button" className="md:hidden text-sm text-rose-500 p-2" onClick={() => void handleLogout()}>{confirmLogout ? 'Tap again to sign out' : 'Sign Out'}</button>}
            {activeCategory === 'general' && (
              <div className="space-y-5">
                {isConnected ? (
                  <>
                    <div className="p-5 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline flex items-center gap-4">
                      <Avatar
                        src={currentUser.avatarUrl}
                        title={`${currentUser.firstName || 'T'} ${currentUser.lastName || ''}`.trim()}
                        id={currentUser.id}
                        size="lg"
                      />

                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold truncate">
                          {currentUser.firstName} {currentUser.lastName || ''}
                        </h4>
                        {currentUser.username && (
                          <p className="text-xs text-primary font-mono">
                            {ayuSettings.streamerMode
                              ? ayuGramEngine.maskForStreamer(`@${currentUser.username}`, 'handle')
                              : `@${currentUser.username}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                      <h4 className="text-xs font-semibold text-muted dark:text-muted">
                        Account Details
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-surface dark:bg-surface rounded-xl border border-outline dark:border-outline">
                          <span className="text-muted block text-[11px]">Phone</span>
                          <span className="font-semibold font-mono">
                            {currentUser.phone
                              ? ayuSettings.streamerMode
                                ? ayuGramEngine.maskForStreamer(currentUser.phone, 'phone')
                                : currentUser.phone
                              : 'Hidden'}
                          </span>
                        </div>
                        <div className="p-3 bg-surface dark:bg-surface rounded-xl border border-outline dark:border-outline">
                          <span className="text-muted block text-[11px]">Connection</span>
                          <span className="font-semibold text-primary">MTProto Active</span>
                        </div>
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => void handleSaveProfile(e)}
                      className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3"
                    >
                      <h4 className="text-xs font-semibold text-muted dark:text-muted">
                        Edit Telegram Profile
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                          className="px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline focus:outline-none focus:border-primary"
                        />
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name (optional)"
                          className="px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs">
                        <span className="text-muted font-mono">@</span>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="username"
                          className="flex-1 bg-transparent font-mono focus:outline-none"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="About / Bio..."
                        className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary resize-none"
                      />
                      {profileMsg && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>{profileMsg}</span>
                        </p>
                      )}
                      {profileError && (
                        <p className="text-xs text-rose-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{profileError}</span>
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={savingProfile || !firstName.trim()}
                        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Save Profile</span>
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="p-6 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-center space-y-3">
                    <h4 className="text-sm font-semibold">No Telegram Account Connected</h4>
                    <p className="text-xs text-muted dark:text-muted">
                      Sign in with QR code, phone number, or StringSession to sync real conversations.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLoginModal();
                      }}
                      className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Connect Account
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeCategory === 'privacy' && (
              <div className="space-y-5">
                {/* Local Passcode Lock */}
                <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" />
                      <span>Local Passcode Lock</span>
                    </h4>
                    {hasPasscode && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            passcodeService.lockNow();
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Lock Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            passcodeService.removePasscode();
                            onNotify?.('Passcode lock removed');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-500 text-[11px] font-semibold cursor-pointer"
                        >
                          Disable
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-muted dark:text-muted">
                    {hasPasscode
                      ? 'Passcode lock is active on this browser. Enter a new code below to replace it.'
                      : 'Protect this app with a passcode and choose when it locks.'}
                  </p>

                  <form onSubmit={(e) => void handleSetPasscode(e)} className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder={hasPasscode ? 'New passcode (4+ chars)' : 'Set passcode (4+ chars)'}
                      className="flex-1 min-w-[160px] px-3 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs focus:outline-none focus:border-primary"
                    />
                    <select
                      value={autoLockMin}
                      onChange={(e) => {
                        const mins = Number(e.target.value);
                        setAutoLockMin(mins);
                        if (hasPasscode) passcodeService.setAutoLockMinutes(mins);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs cursor-pointer"
                      title="Auto-lock timeout"
                    >
                      <option value={0}>Auto-lock: Off</option>
                      <option value={1}>Auto-lock: 1 min</option>
                      <option value={5}>Auto-lock: 5 min</option>
                      <option value={15}>Auto-lock: 15 min</option>
                    </select>
                    <button
                      type="submit"
                      disabled={pinInput.trim().length < 4}
                      className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {hasPasscode ? 'Change PIN' : 'Enable Lock'}
                    </button>
                  </form>
                  {pinError && <p className="text-[11px] text-rose-500">{pinError}</p>}
                </div>

                {/* Telegram Cloud Privacy Rules */}
                {isConnected && (
                  <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span>Telegram Cloud Privacy Rules</span>
                      </h4>
                      {loadingPrivacy && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                    </div>

                    <div className="divide-y divide-outline dark:divide-outline">
                      {(Object.keys(PRIVACY_LABELS) as PrivacyKeyName[]).map((key) => {
                        const current = privacyItems.find((p) => p.key === key)?.level || 'everybody';
                        return (
                          <div key={key} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <span className="font-medium block">{PRIVACY_LABELS[key].label}</span>
                              <span className="text-[11px] text-muted dark:text-muted">
                                {PRIVACY_LABELS[key].desc}
                              </span>
                            </div>
                            <select
                              disabled={savingPrivacyKey === key || loadingPrivacy}
                              value={current}
                              onChange={(e) =>
                                void handlePrivacyChange(key, e.target.value as PrivacyRuleLevel)
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline text-xs font-medium cursor-pointer shrink-0"
                            >
                              <option value="everybody">Everybody</option>
                              <option value="contacts">My Contacts</option>
                              <option value="nobody">Nobody</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Blocked Users List */}
                {isConnected && (
                  <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold flex items-center gap-2">
                        <Ban className="w-4 h-4 text-rose-500" />
                        <span>Blocked Users ({blockedUsers.length})</span>
                      </h4>
                      {loadingBlocked && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                    </div>

                    {blockedUsers.length === 0 ? (
                      <p className="text-xs text-muted dark:text-muted">
                        {loadingBlocked ? 'Loading blocked users...' : 'No blocked users.'}
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-outline dark:divide-outline">
                        {blockedUsers.map((u) => (
                          <div key={u.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar src={u.avatarUrl} title={u.name} id={u.id} size="xs" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{u.name}</p>
                                {u.username && (
                                  <p className="text-[10.5px] text-muted font-mono truncate">
                                    @{u.username}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={unblockingId === u.id}
                              onClick={() => void handleUnblockUser(u.id)}
                              className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface border border-outline dark:border-outline text-[11px] font-semibold text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer shrink-0"
                            >
                              {unblockingId === u.id ? '...' : 'Unblock'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeCategory === 'devices' && (
              <div className="space-y-4">
                {!isConnected ? (
                  <div className="p-6 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline text-center text-xs text-muted dark:text-muted">
                    Connect your Telegram account to inspect active devices &amp; sessions.
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="text-xs font-semibold flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary" />
                        <span>Active Telegram Devices ({sessions.length})</span>
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadSessions()}
                          disabled={loadingSessions}
                          className="p-1.5 rounded-lg text-muted hover:text-primary cursor-pointer"
                          title="Refresh Sessions"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                        </button>
                        {otherSessionsCount > 0 && (
                          <button
                            type="button"
                            disabled={terminatingHash === 'all_other'}
                            onClick={() => void handleTerminateSession('all_other')}
                            className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            {terminatingHash === 'all_other'
                              ? 'Terminating...'
                              : 'Terminate All Other Sessions'}
                          </button>
                        )}
                      </div>
                    </div>

                    {sessionsError && (
                      <p className="text-xs text-rose-500">{sessionsError}</p>
                    )}

                    {loadingSessions && sessions.length === 0 ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>Loading active sessions...</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sessions.map((s) => (
                          <div
                            key={s.hash}
                            className="p-3 rounded-xl bg-surface dark:bg-surface border border-outline dark:border-outline flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold truncate">
                                  {s.appName} {s.appVersion}
                                </span>
                                {s.current && (
                                  <span className="text-[10.5px] font-semibold text-primary">
                                    · This device
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted dark:text-muted truncate">
                                {s.deviceModel} · {s.platform} {s.systemVersion}
                              </p>
                              <p className="text-[10.5px] text-muted truncate tabular-nums">
                                {[s.country, s.ip].filter(Boolean).join(' · ')}
                                {s.dateActive
                                  ? ` · Active ${new Date(s.dateActive * 1000).toLocaleDateString()}`
                                  : ''}
                              </p>
                            </div>
                            {!s.current && (
                              <button
                                type="button"
                                disabled={terminatingHash === s.hash}
                                onClick={() => void handleTerminateSession(s.hash)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-500 hover:bg-rose-500 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
                              >
                                {terminatingHash === s.hash ? '...' : 'Terminate'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeCategory === 'chats' && (
              <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold">Chat Folders</h4>
                  {isConnected && onOpenFolderManager && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenFolderManager();
                      }}
                      className="px-3 py-1 rounded-xl bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderCog className="w-3.5 h-3.5" />
                      <span>Cloud Folder Manager</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between p-2.5 bg-surface dark:bg-surface rounded-xl border border-outline dark:border-outline text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{folder.name}</span>
                        {folder.isCloud && (
                          <span className="text-[10px] font-semibold text-primary">Cloud</span>
                        )}
                      </div>
                      {folder.filter === 'custom' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (folder.isCloud && folder.telegramFilterId) {
                              void telegramService.deleteCloudFolder(folder.telegramFilterId);
                            } else {
                              telegramService.deleteFolder(folder.id);
                            }
                          }}
                          className="text-rose-500 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddFolder} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Quick local folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-surface dark:bg-surface border border-outline dark:border-outline rounded-xl focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}

            {activeCategory === 'notifications' && (
              <div className="p-4 rounded-2xl bg-surface-low dark:bg-elevated border border-outline dark:border-outline space-y-2">
                <h4 className="text-xs font-semibold">Audio Alerts</h4>
                <p className="text-xs text-muted dark:text-muted">
                  Subtle Web Audio chimes play when live Telegram messages arrive or reactions are added.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
