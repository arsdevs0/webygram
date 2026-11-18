import React, { useState, useEffect } from 'react';
import {
  Palette,
  Shield,
  Sliders,
  Sparkles,
  RotateCcw,
  X,
  Check,
  CheckCheck,
  Clock,
  Layers,
  Zap,
  Smile,
  MessageSquare,
  Image as ImageIcon,
} from 'lucide-react';
import {
  modSettingsStore,
  COLOR_PALETTES,
  ACCENT_COLORS,
} from '../../services/modSettingsStore';
import {
  ModSettings,
  BubbleRadius,
  BubbleStyle,
  FontSizeScale,
  StickerSizeScale,
  ChatWallpaper,
  AccentColor,
} from '../../types/modSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

const WALLPAPER_OPTIONS: Array<{ id: ChatWallpaper; label: string; desc: string; previewClass: string }> = [
  {
    id: 'pattern-tg',
    label: 'Telegram Doodles',
    desc: 'Official vector doodle pattern',
    previewClass: 'chat-pattern-tg',
  },
  {
    id: 'starry-night',
    label: 'Starry Cosmos',
    desc: 'Deep space nebula & starlight',
    previewClass: 'chat-wallpaper-starry',
  },
  {
    id: 'aurora-mesh',
    label: 'Northern Aurora',
    desc: 'Atmospheric cyan & emerald glow',
    previewClass: 'chat-wallpaper-aurora',
  },
  {
    id: 'pattern-grid',
    label: 'Cyber Matrix Grid',
    desc: 'Precision technical blueprint',
    previewClass: 'chat-pattern-grid',
  },
  {
    id: 'minimal-dots',
    label: 'Architectural Dots',
    desc: 'Subtle dot matrix canvas',
    previewClass: 'chat-wallpaper-dots',
  },
  {
    id: 'plain',
    label: 'Pure Solid Canvas',
    desc: 'Zero-distraction solid surface',
    previewClass: 'chat-wallpaper-plain',
  },
];

export const ModSettingsView: React.FC<Props> = ({ isOpen, onClose, onNotify }) => {
  const [settings, setSettings] = useState<ModSettings>(modSettingsStore.getSettings());
  const [activeTab, setActiveTab] = useState<'palettes' | 'chat' | 'extra'>('palettes');
  const [themeQuery, setThemeQuery] = useState('');
  const [styleResetDone, setStyleResetDone] = useState(false);

  const handleResetStyle = () => {
    modSettingsStore.resetStyleDefaults();
    setStyleResetDone(true);
    onNotify?.('Appearance & style reset to default');
    setTimeout(() => setStyleResetDone(false), 2000);
  };

  const handleResetAllMods = () => {
    modSettingsStore.resetDefaults();
    setStyleResetDone(true);
    onNotify?.('All appearance & extra mod settings reset');
    setTimeout(() => setStyleResetDone(false), 2000);
  };

  useEffect(() => {
    const unsub = modSettingsStore.subscribe((s) => setSettings(s));
    return unsub;
  }, []);

  if (!isOpen) return null;

  const activePalette = modSettingsStore.getActivePaletteTokens();
  const activeAccentHex = modSettingsStore.getActiveAccentHex();

  const toggleSetting = (key: keyof ModSettings) => {
    const current = settings[key];
    if (typeof current === 'boolean') {
      modSettingsStore.updateSetting(key, !current as never);
    }
  };

  const getPreviewWallpaperClass = () => {
    const found = WALLPAPER_OPTIONS.find((w) => w.id === settings.chatWallpaper);
    return found ? found.previewClass : 'chat-pattern-tg';
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Appearance and Mods" className="tg-mobile-panel fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-surface dark:bg-surface border border-outline dark:border-outline rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-ink dark:text-ink"
      >
        {/* Header */}
        <div className="tg-appearance-header flex items-center justify-between gap-2 px-4 py-3.5 border-b border-outline dark:border-outline bg-surface-low dark:bg-surface">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: activeAccentHex, color: 'var(--tg-on-primary)' }}
            >
              <Palette className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Appearance &amp; Mods</h2>
              <p className="text-[11px] text-muted dark:text-muted">
                Light, dark and extra features
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleResetStyle}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                styleResetDone
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                  : 'border-outline dark:border-outline text-muted dark:text-ink hover:text-rose-400 hover:border-rose-400/40 hover:bg-hover/60 dark:hover:bg-hover'
              }`}
              title="Reset Palette, Accent, Wallpaper & Bubbles to Default"
            >
              {styleResetDone ? <Check className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>{styleResetDone ? 'Style Reset ✓' : 'Reset Style'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close appearance"
              className="p-1.5 text-muted hover:text-ink dark:hover:text-white rounded-xl hover:bg-hover/60 dark:hover:bg-hover transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        <div className={`tg-theme-preview px-4 py-3 ${getPreviewWallpaperClass()}`} aria-label="Theme preview">
          <div className="tg-bubble-in rounded-2xl rounded-bl-sm px-3 py-2 w-fit max-w-[85%] text-sm text-ink">Telegram incoming message<span className="text-[11px] text-muted ml-3">9:41</span></div>
          <div className="tg-bubble-out rounded-2xl rounded-br-sm px-3 py-2 w-fit max-w-[85%] text-sm text-ink ml-auto mt-2 flex items-center gap-3">{activePalette.name}<CheckCheck className="w-4 h-4" /></div>
        </div>

        {/* Navigation Tabs */}
        <div className="tg-dialog-tabs px-4 py-2 border-b border-outline dark:border-outline flex items-center gap-2 bg-surface-low/70 dark:bg-surface">
          {[
            { id: 'palettes', label: 'Themes', icon: Palette },
            { id: 'chat', label: 'Chat style', icon: Layers },
            { id: 'extra', label: 'Extras', icon: Zap },
          ].map((t) => {
            const Icon = t.icon;
            const isSel = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                aria-pressed={isSel}
                className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isSel
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted dark:text-muted hover:text-ink dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'palettes' && <div className="space-y-4">
            <h3 className="font-semibold">Telegram appearance</h3>
            <div className="tg-segmented tg-theme-modes" role="group" aria-label="Theme mode">
              {(['light', 'dark'] as const).map(mode => <button key={mode} type="button" aria-pressed={settings.themeMode === mode} onClick={() => modSettingsStore.updateSetting('themeMode', mode)}>{mode === 'light' ? 'Light' : 'Dark'}</button>)}
            </div>
            <p className="text-sm text-muted">The same Telegram layout in both modes.</p>
          </div>}

          {activeTab === 'chat' && (
            <>
              {/* One Telegram navigation, wallpaper and bubble design in both modes. */}
              {/* Font Size & Sticker Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted dark:text-muted block mb-2">
                    Message Text Size
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['compact', 'normal', 'large'] as FontSizeScale[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => modSettingsStore.updateSetting('fontSize', sz)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-semibold capitalize border transition-all cursor-pointer ${
                          settings.fontSize === sz
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface-low dark:bg-elevated border-outline dark:border-outline text-muted dark:text-muted'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted dark:text-muted block mb-2">
                    Sticker Display Size
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['small', 'medium', 'large'] as StickerSizeScale[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => modSettingsStore.updateSetting('stickerSize', sz)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-semibold capitalize border transition-all cursor-pointer ${
                          (settings.stickerSize || 'medium') === sz
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface-low dark:bg-elevated border-outline dark:border-outline text-muted dark:text-muted'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'extra' && (
            <>
              {/* Quick Reaction & Default Timer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-surface-low dark:bg-elevated/70 border border-outline dark:border-outline space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Smile className="w-4 h-4 text-primary" />
                    <span>Double-Tap Quick Reaction</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['❤️', '👍', '🔥', '😂', '👏', '🎉', '⚡', '💯'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => modSettingsStore.updateSetting('doubleTapReaction', emoji)}
                        className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-transform cursor-pointer ${
                          settings.doubleTapReaction === emoji
                            ? 'bg-primary/20 border border-primary scale-110'
                            : 'bg-surface dark:bg-surface hover:scale-105'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-surface-low dark:bg-elevated/70 border border-outline dark:border-outline space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Clock className="w-4 h-4 text-rose-400" />
                    <span>Default Self-Destruct Timer</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[0, 5, 10, 30, 60].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => modSettingsStore.updateSetting('defaultDisappearingTimer', sec)}
                        className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                          settings.defaultDisappearingTimer === sec
                            ? 'bg-rose-500 text-white'
                            : 'bg-surface dark:bg-surface text-muted'
                        }`}
                      >
                        {sec === 0 ? 'Off' : `${sec}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Extra Mod Switches */}
              <div className="space-y-2">
                {[
                  {
                    key: 'sendWithEnter',
                    label: 'Send Message with Enter Key',
                    desc: 'Press Enter to send immediately (Shift+Enter for new line)',
                  },
                  {
                    key: 'autoPlayGifs',
                    label: 'Auto-Play Animated GIFs & Video Stickers',
                    desc: 'Automatically loop GIFs and WebM stickers inside chat stream',
                  },
                  {
                    key: 'showVoiceFloatingButton',
                    label: 'Floating Voice Changer DSP Pill',
                    desc: 'Draggable quick-access voice pitch & formant widget on screen',
                  },
                  {
                    key: 'highQualityVoiceNotes',
                    label: 'Studio Bitrate Voice Note Recording (Opus 48kHz)',
                    desc: 'Capture crystal-clear voice notes with zero compression artifacts',
                  },
                  {
                    key: 'hideTypingIndicator',
                    label: 'Stealth Typing Mode',
                    desc: 'Never broadcast "typing..." or "recording voice..." to others',
                  },
                  {
                    key: 'disableReadReceipts',
                    label: 'Stealth Read Receipts (Manual Seen Control)',
                    desc: 'Keep incoming messages unread to sender until you tap Mark as Seen',
                  },
                ].map((item) => {
                  const isChecked = Boolean(settings[item.key as keyof ModSettings]);
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleSetting(item.key as keyof ModSettings)}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-low dark:bg-elevated/60 border border-outline dark:border-outline cursor-pointer hover:border-primary/40 transition-colors"
                    >
                      <div className="pr-3">
                        <div className="text-xs font-semibold">{item.label}</div>
                        <div className="text-[11px] text-muted dark:text-muted">{item.desc}</div>
                      </div>
                      <div
                        className={`w-10 h-5.5 rounded-full transition-colors p-0.5 shrink-0 ${
                          isChecked ? 'bg-primary' : 'bg-surface dark:bg-surface'
                        }`}
                      >
                        <div
                          className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform ${
                            isChecked ? 'translate-x-4.5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-outline dark:border-outline bg-surface-low dark:bg-surface flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetStyle}
              className="px-3 py-1.5 rounded-xl bg-surface dark:bg-elevated border border-outline dark:border-outline hover:border-rose-400/50 text-xs font-semibold text-ink dark:text-ink hover:text-rose-400 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Style to Default</span>
            </button>
            <button
              type="button"
              onClick={handleResetAllMods}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-muted dark:text-muted hover:text-rose-400 cursor-pointer transition-colors"
            >
              Reset All Mods
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-primary px-4 py-1.5 rounded-full text-sm font-medium text-on-primary cursor-pointer transition-colors"
            style={{ backgroundColor: activeAccentHex, color: 'var(--tg-on-primary)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
