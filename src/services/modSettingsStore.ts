import { modernTelegramColors } from '../themes/modernTelegram';
import { ModSettings, ColorPalette, AccentColor } from '../types/modSettings';
import { FLOW_PALETTES } from '../themes/flowPalettes';
import { findFlowPalette, resolveFlowPalette, readableAccent, readableForeground, mixColor } from '../themes/themeTokens';

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
  {
    id: 'night-blue',
    name: 'Original Telegram',
    subtitle: 'Classic blue, bubbles and navigation',
    bgMain: '#0E1621',
    bgPanel: '#17212B',
    bgElevated: '#202B36',
    bubbleOut: '#2B5278',
    bubbleOutBorder: '#3A6896',
    bubbleIn: '#182533',
    bubbleInBorder: '#243447',
    border: '#0E1621',
    previewSwatches: ['#0E1621', '#17212B', '#2B5278'],
  },
  ...FLOW_PALETTES.map(palette => resolveFlowPalette(palette, 'dark')),
  {
    id: 'amoled-black',
    name: 'AMOLED Onyx',
    subtitle: 'True Pitch Black OLED',
    bgMain: '#000000',
    bgPanel: '#0A0E14',
    bgElevated: '#121822',
    bubbleOut: '#1E3A5F',
    bubbleOutBorder: '#2D5488',
    bubbleIn: '#0F151E',
    bubbleInBorder: '#1E293B',
    border: '#111827',
    previewSwatches: ['#000000', '#0A0E14', '#1E3A5F'],
  },
  {
    id: 'emerald-forest',
    name: 'Emerald Matrix',
    subtitle: 'Deep Pine & Jade Mint',
    bgMain: '#06130E',
    bgPanel: '#0C1F17',
    bgElevated: '#132E23',
    bubbleOut: '#14533E',
    bubbleOutBorder: '#1E7558',
    bubbleIn: '#0F261D',
    bubbleInBorder: '#193B2E',
    border: '#071711',
    previewSwatches: ['#06130E', '#0C1F17', '#10B981'],
  },
  {
    id: 'royal-amethyst',
    name: 'Royal Amethyst',
    subtitle: 'Deep Nebula & Velvet Violet',
    bgMain: '#0F0A1C',
    bgPanel: '#171029',
    bgElevated: '#22183B',
    bubbleOut: '#432371',
    bubbleOutBorder: '#5D3499',
    bubbleIn: '#1C1333',
    bubbleInBorder: '#2B1E4D',
    border: '#120C21',
    previewSwatches: ['#0F0A1C', '#171029', '#8B5CF6'],
  },
  {
    id: 'sunset-rose',
    name: 'Crimson Velvet',
    subtitle: 'Warm Wine & Rose Quartz',
    bgMain: '#170910',
    bgPanel: '#220E18',
    bgElevated: '#311523',
    bubbleOut: '#691E42',
    bubbleOutBorder: '#8C2A59',
    bubbleIn: '#28111D',
    bubbleInBorder: '#3D1B2C',
    border: '#190A11',
    previewSwatches: ['#170910', '#220E18', '#F43F5E'],
  },
  {
    id: 'cyber-gold',
    name: 'Cyber Gold',
    subtitle: 'Obsidian Bronze & Amber',
    bgMain: '#120F08',
    bgPanel: '#1C170D',
    bgElevated: '#292214',
    bubbleOut: '#574011',
    bubbleOutBorder: '#785919',
    bubbleIn: '#211B0F',
    bubbleInBorder: '#362C19',
    border: '#141109',
    previewSwatches: ['#120F08', '#1C170D', '#F59E0B'],
  },
  {
    id: 'oceanic-teal',
    name: 'Oceanic Abyss',
    subtitle: 'Deep Pacific & Cyan',
    bgMain: '#06151C',
    bgPanel: '#0C212B',
    bgElevated: '#13303E',
    bubbleOut: '#154D63',
    bubbleOutBorder: '#1E6B88',
    bubbleIn: '#0E2733',
    bubbleInBorder: '#183B4D',
    border: '#071820',
    previewSwatches: ['#06151C', '#0C212B', '#06B6D4'],
  },
  {
    id: 'daylight-classic',
    name: 'Daylight Classic',
    subtitle: 'Crisp Light Sky & Mint',
    isLight: true,
    bgMain: '#E6EBEE',
    bgPanel: '#FFFFFF',
    bgElevated: '#F1F5F9',
    bubbleOut: '#EFFDDE',
    bubbleOutBorder: '#D2F4B0',
    bubbleIn: '#FFFFFF',
    bubbleInBorder: '#E2E8F0',
    border: '#E2E8F0',
    previewSwatches: ['#E6EBEE', '#FFFFFF', '#2AABEE'],
  },
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
      // Restore the requested Telegram appearance after the earlier Flow rollout.
      // Only appearance changes; privacy, media and other mod preferences survive.
      if (parsed.designVersion !== 3) {
        Object.assign(settings, {
          colorPalette: 'night-blue', accentColor: 'telegram-blue', themeMode: 'dark',
          chatWallpaper: 'pattern-tg', bubbleStyle: 'telegram', navigationStyle: 'telegram',
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, designVersion: 3 }));
      }
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.settings, designVersion: 3 }));
    } catch {
      // Ignore quota errors
    }
  }

  public getSettings(): ModSettings {
    return this.settings;
  }

  public getActivePaletteTokens(): PaletteThemeTokens {
    const flow = findFlowPalette(this.settings.colorPalette);
    if (flow) return resolveFlowPalette(flow, this.settings.themeMode);
    if (['night-blue', 'daylight-classic', 'amoled-black'].includes(this.settings.colorPalette)) {
      const base = COLOR_PALETTES.find(p => p.id === this.settings.colorPalette) || COLOR_PALETTES[0];
      return { ...base, ...modernTelegramColors(this.settings.themeMode) };
    }
    return (
      COLOR_PALETTES.find((p) => p.id === this.settings.colorPalette) || COLOR_PALETTES[0]
    );
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
    if (key === 'colorPalette') {
      if (value === 'night-blue') {
        this.settings.accentColor = 'telegram-blue';
        this.settings.chatWallpaper = 'pattern-tg';
        this.settings.bubbleStyle = 'telegram';
      }
      const pal = COLOR_PALETTES.find((p) => p.id === value);
      if (pal && !String(value).startsWith('flow-')) {
        this.settings.themeMode = pal.isLight ? 'light' : pal.id === 'amoled-black' ? 'amoled' : 'dark';
      }
    } else if (key === 'themeMode' && !this.settings.colorPalette.startsWith('flow-')) {
      if (value === 'light') {
        this.settings.colorPalette = 'daylight-classic';
      } else if (value === 'amoled') {
        this.settings.colorPalette = 'amoled-black';
      } else if (this.settings.colorPalette === 'daylight-classic') {
        this.settings.colorPalette = 'night-blue';
      }
    }
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
    const onPrimary = this.settings.accentColor === 'theme' && pal.onPrimary ? pal.onPrimary : readableForeground(primary);
    const ink = pal.text || (pal.isLight ? '#202124' : '#F1F3F4');
    const muted = pal.muted || (pal.isLight ? '#595E65' : '#B3BAC3');

    if (pal.isLight) {
      root.classList.remove('dark', 'amoled');
    } else if (this.settings.themeMode === 'amoled' || pal.id === 'amoled-black') {
      root.classList.add('dark', 'amoled');
    } else {
      root.classList.add('dark');
      root.classList.remove('amoled');
    }

    root.setAttribute('data-palette', pal.id);
    const interfaceStyle = pal.id.startsWith('flow-') ? 'flow' : 'telegram';
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
    root.style.setProperty('--tg-primary-text', readableAccent(primary, pal.bgPanel, ink));
    root.style.setProperty('--tg-text', ink);
    root.style.setProperty('--tg-muted', muted);
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
