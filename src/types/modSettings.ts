export type ThemeMode = 'dark' | 'amoled' | 'light';

export type ColorPalette =
  | `flow-${string}`
  | 'night-blue'
  | 'amoled-black'
  | 'emerald-forest'
  | 'royal-amethyst'
  | 'sunset-rose'
  | 'cyber-gold'
  | 'oceanic-teal'
  | 'daylight-classic';

export type AccentColor =
  | 'theme'
  | 'telegram-blue'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'cyan'
  | 'pink';

export type BubbleRadius = 'subtle' | 'rounded' | 'extra';
export type BubbleStyle = 'telegram' | 'ios' | 'glass' | 'minimal';
export type FontSizeScale = 'compact' | 'normal' | 'large';
export type StickerSizeScale = 'small' | 'medium' | 'large';

export type ChatWallpaper =
  | 'pattern-tg'
  | 'starry-night'
  | 'aurora-mesh'
  | 'pattern-grid'
  | 'minimal-dots'
  | 'plain';

export interface ModSettings {
  themeMode: ThemeMode;
  colorPalette: ColorPalette;
  accentColor: AccentColor;
  bubbleRadius: BubbleRadius;
  bubbleStyle: BubbleStyle;
  fontSize: FontSizeScale;
  stickerSize: StickerSizeScale;
  chatWallpaper: ChatWallpaper;

  // Privacy & Stealth
  hideTypingIndicator: boolean;
  hideOnlineStatus: boolean;
  disableReadReceipts: boolean;
  localSecretPasscodeEnabled: boolean;

  // Media & Auto-Download
  autoDownloadMedia: boolean;
  highQualityVoiceNotes: boolean;
  defaultDisappearingTimer: number; // 0 = off, 5, 10, 30, 60
  autoPlayGifs: boolean;

  // Interface & Extra Mods
  showVoiceFloatingButton: boolean;
  enableSmoothAnimations: boolean;
  doubleTapReaction: string;
  sendWithEnter: boolean;
  showFolderUnreadCounters: boolean;
  compactSidebarMode: boolean;
  navigationStyle: 'auto' | 'flow' | 'telegram';
}
