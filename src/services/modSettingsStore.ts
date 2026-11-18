import { modernTelegramColors } from '../themes/modernTelegram';
import { ModSettings, ColorPalette, AccentColor } from '../types/modSettings';
import { readableAccent, readableForeground, readableText, mixColor } from '../themes/themeTokens';

const STORAGE_KEY = 'tg_plus_mod_settings_v2';

export interface PaletteThemeTokens {
  id: ColorPalette;
  name: string;
  subtitle: string;
  isLight?: boolean;
  bgMain: string;
  bgPanel: string;
  bgElevated: string;
  bubbleOut: string;
  bubbleOutBorder: string;
  bubbleIn: string;
  bubbleInBorder: string;
  border: string;
  previewSwatches: [string, string, string];
  text?: string;
  muted?: string;
  primary?: string;
  onPrimary?: string;
  error?: string;
}

export const COLOR_PALETTES: PaletteThemeTokens[] = [
  { id: 'night-blue', name: 'Telegram Dark', subtitle: 'Navy surfaces and blue accents', ...modernTelegramColors('dark') },
  { id: 'daylight-classic', name: 'Telegram Light', subtitle: 'White surfaces and green messages', ...modernTelegramColors('light') },
];

export const ACCENT_COLORS: Record<AccentColor, { name: string; hex: string; hover: string }> = {
  theme: { name: 'Match theme', hex: '#eeeeee', hover: '#cccccc' },
  'telegram-blue': { name: 'Telegram Blue', hex: '#2AABEE', hover: '#229ED9' },
  emerald: { name: 'Emerald Mint', hex: '#10B981', hover: '#059669' },
  violet: { name: 'Electric Violet', hex: '#8B5CF6', hover: '#7C3AED' },
  rose: { name: 'Crimson Rose', hex: '#F43F5E', hover: '#E11D48' },
  amber: { name: 'Cyber Amber', hex: '#F59E0B', hover: '#D97706' },
  cyan: { name: 'Aqua Cyan', hex: '#06B6D4', hover: '#0891B2' },
  pink: { name: 'Neon Pink', hex: '#EC4899', hover: '#DB2777' },
};

const DEFAULT_SETTINGS: ModSettings = {
  themeMode: 'dark',
  colorPalette: 'night-blue',
  accentColor: 'telegram-blue',
  bubbleRadius: 'rounded',
  bubbleStyle: 'telegram',
  fontSize: 'normal',
  stickerSize: 'medium',
  chatWallpaper: 'pattern-tg',

  hideTypingIndicator: false,
  hideOnlineStatus: false,
  disableReadReceipts: false,
  localSecretPasscodeEnabled: false,

  autoDownloadMedia: true,
  highQualityVoiceNotes: true,
  defaultDisappearingTimer: 0,
  autoPlayGifs: true,

  showVoiceFloatingButton: false,
  enableSmoothAnimations: true,
  doubleTapReaction: '❤️',
  sendWithEnter: true,
  showFolderUnreadCounters: true,
  compactSidebarMode: false,
  navigationStyle: 'telegram',
};

class ModSettingsStore {
  private settings: ModSettings;
  private listeners: Set<(s: ModSettings) => void> = new Set();

  constructor() {
    this.settings = this.loadFromStorage();
    this.applyDOMTheme();
  }

  private loadFromStorage(): ModSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const settings = { ...DEFAULT_SETTINGS, ...parsed };
      // Migrate only appearance; keep existing privacy, notifications and media preferences.
      Object.assign(settings, {
        themeMode: parsed.themeMode === 'light' ? 'light' : 'dark',
        colorPalette: parsed.themeMode === 'light' ? 'daylight-classic' : 'night-blue',
        accentColor: 'telegram-blue', chatWallpaper: 'pattern-tg',
        bubbleStyle: 'telegram', bubbleRadius: 'rounded', navigationStyle: 'telegram',
      });
      if (parsed.designVersion !== 4) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, designVersion: 4 }));
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.settings, designVersion: 4 }));
    } catch {
      // Ignore quota errors
    }
  }

  public getSettings(): ModSettings {
    return this.settings;
  }

  private paletteCache?:{key:string;tokens:PaletteThemeTokens};
  public getActivePaletteTokens():PaletteThemeTokens {
    const key=this.settings.colorPalette+':'+this.settings.themeMode;
    if(this.paletteCache?.key===key)return this.paletteCache.tokens;
    const base=COLOR_PALETTES.find(p=>p.id===this.settings.colorPalette)||COLOR_PALETTES[0];
    const tokens={...base,...modernTelegramColors(this.settings.themeMode)};
    this.paletteCache={key,tokens};return tokens;
  }

  public getActiveAccentHex(): string {
    if (this.settings.accentColor === 'telegram-blue' && ['night-blue', 'daylight-classic', 'amoled-black'].includes(this.settings.colorPalette)) return this.getActivePaletteTokens().primary!;
    if (this.settings.accentColor === 'theme') return this.getActivePaletteTokens().primary || '#2AABEE';
    return ACCENT_COLORS[this.settings.accentColor]?.hex || '#2AABEE';
  }

  public getAccentColorHex(): string {
    return this.getActiveAccentHex();
  }

  public updateSetting<K extends keyof ModSettings>(key: K, value: ModSettings[K]) {
    this.settings = { ...this.settings, [key]: value };
    if (key === 'colorPalette') this.settings.themeMode = value === 'daylight-classic' ? 'light' : 'dark';
    if (this.settings.themeMode !== 'light') this.settings.themeMode = 'dark';
    this.settings.colorPalette = this.settings.themeMode === 'light' ? 'daylight-classic' : 'night-blue';
    this.settings.accentColor = 'telegram-blue';
    this.settings.navigationStyle = 'telegram';
    this.settings.bubbleStyle = 'telegram';
    this.settings.bubbleRadius = 'rounded';
    this.settings.chatWallpaper = 'pattern-tg';
    this.saveToStorage();
    this.applyDOMTheme();
    this.notify();
  }

  public resetStyleDefaults() {
    this.settings = {
      ...this.settings,
      themeMode: DEFAULT_SETTINGS.themeMode,
      colorPalette: DEFAULT_SETTINGS.colorPalette,
      accentColor: DEFAULT_SETTINGS.accentColor,
      bubbleRadius: DEFAULT_SETTINGS.bubbleRadius,
      bubbleStyle: DEFAULT_SETTINGS.bubbleStyle,
      fontSize: DEFAULT_SETTINGS.fontSize,
      stickerSize: DEFAULT_SETTINGS.stickerSize,
      chatWallpaper: DEFAULT_SETTINGS.chatWallpaper,
      navigationStyle: DEFAULT_SETTINGS.navigationStyle,
    };
    this.saveToStorage();
    this.applyDOMTheme();
    this.notify();
  }

  public resetDefaults() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToStorage();
    this.applyDOMTheme();
    this.notify();
  }

  private applyDOMTheme() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const pal = this.getActivePaletteTokens();
    const primary = this.getActiveAccentHex();
    const onPrimary = readableForeground(primary);
    const surfaces=[pal.bgMain,pal.bgPanel,pal.bgElevated];
    const ink = readableText(pal.text || (pal.isLight ? '#202124' : '#F1F3F4'),surfaces);
    const muted = readableText(pal.muted || (pal.isLight ? '#595E65' : '#B3BAC3'),surfaces);

    if (pal.isLight) {
      root.classList.remove('dark', 'amoled');
    } else if (this.settings.themeMode === 'amoled' || pal.id === 'amoled-black') {
      root.classList.add('dark', 'amoled');
    } else {
      root.classList.add('dark');
      root.classList.remove('amoled');
    }

    root.setAttribute('data-palette', pal.id);
    const interfaceStyle = 'telegram';
    root.setAttribute('data-interface', interfaceStyle);
    root.setAttribute('data-layout', interfaceStyle === 'telegram' ? 'telegram-next' : 'flow');
    root.setAttribute('data-navigation', this.settings.navigationStyle === 'auto' ? interfaceStyle : this.settings.navigationStyle);
    root.setAttribute('data-accent', this.settings.accentColor);
    root.setAttribute('data-bubble-style', this.settings.bubbleStyle || 'telegram');

    root.style.setProperty('--tg-bg-main', pal.bgMain);
    root.style.setProperty('--tg-bg-panel', pal.bgPanel);
    root.style.setProperty('--tg-bg-elevated', pal.bgElevated);
    root.style.setProperty('--tg-bubble-out', pal.bubbleOut);
    root.style.setProperty('--tg-bubble-out-border', pal.bubbleOutBorder);
    root.style.setProperty('--tg-bubble-in', pal.bubbleIn);
    root.style.setProperty('--tg-bubble-in-border', pal.bubbleInBorder);
    root.style.setProperty('--tg-border', pal.border);
    root.style.setProperty('--tg-accent', primary);
    root.style.setProperty('--tg-accent-hover', mixColor(onPrimary, primary, .12));
    root.style.setProperty('--tg-on-primary', onPrimary);
    root.style.setProperty('--tg-primary-text', readableText(primary, surfaces));
    root.style.setProperty('--tg-text', ink);
    for(const [name,surface] of [['in',pal.bubbleIn],['out',this.settings.bubbleStyle==='ios'?primary:pal.bubbleOut]] as const){
      const text=readableText(name==='out' && !pal.isLight ? '#FFFFFF' : ink,[surface]);root.style.setProperty('--tg-message-'+name+'-text',text);
      root.style.setProperty('--tg-message-'+name+'-muted',readableText(name==='out' && !pal.isLight ? '#E1EBFF' : muted,[surface]));
      root.style.setProperty('--tg-message-'+name+'-link',readableAccent(primary,surface,text));
    }
    ['#1389ff','#eea229','#0bbd76','#ff536b','#7f6cff','#16adca'].forEach((tone,index)=>root.style.setProperty('--tg-tone-'+index,readableAccent(tone,pal.bgPanel,ink)));
    root.style.setProperty('--tg-muted', muted);
    root.style.setProperty('--tg-chat-wallpaper', pal.isLight ? 'linear-gradient(135deg,#D4DE93 0%,#83BC85 40%,#59A692 70%,#D7DCAA 100%)' : 'linear-gradient(155deg,#101B29,#0C1B23)');
    root.style.setProperty('--tg-error', pal.error || (pal.isLight ? '#B3261E' : '#FFB4AB'));
    root.style.setProperty('--tg-surface-low', mixColor(pal.bgMain, pal.bgPanel, .5));
    root.style.setProperty('--tg-hover', mixColor(ink, pal.bgPanel, .08));
    root.style.setProperty('--tg-primary-container', mixColor(primary, pal.bgPanel, .16));
    root.style.setProperty('--tg-on-container', readableAccent(primary, mixColor(primary, pal.bgPanel, .16), ink));
    root.style.setProperty('--tg-font-scale', this.settings.fontSize === 'large' ? '1.12' : this.settings.fontSize === 'compact' ? '.94' : '1');
    root.setAttribute('data-motion', this.settings.enableSmoothAnimations ? 'full' : 'reduced');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', pal.bgMain);
  }

  public subscribe(listener: (s: ModSettings) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = this.getSettings();
    this.listeners.forEach((l) => l(snapshot));
  }
}

export const modSettingsStore = new ModSettingsStore();
