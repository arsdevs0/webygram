/** Telegram's default light surfaces and dark violet accents. */
export function modernTelegramColors(mode: 'light' | 'dark' | 'amoled') {
  const light = mode === 'light';
  return { bgMain: light ? '#F1F3F5' : mode === 'amoled' ? '#000000' : '#181818',
    bgPanel: light ? '#FFFFFF' : mode === 'amoled' ? '#080808' : '#212121', bgElevated: light ? '#F4F4F5' : '#2C2C2C',
    bubbleOut: light ? '#E3FFC8' : '#766AC8', bubbleOutBorder: light ? '#D2EDBA' : '#766AC8',
    bubbleIn: light ? '#FFFFFF' : '#212121', bubbleInBorder: light ? '#E5E7EB' : '#303030',
    border: light ? '#E5E7EB' : '#303030', text: light ? '#111827' : '#FFFFFF',
    muted: light ? '#707579' : '#AAAAAA', primary: light ? '#3390EC' : '#8774E1',
    isLight: light, onPrimary: '#FFFFFF',
    previewSwatches: [light ? '#F1F3F5' : '#181818', light ? '#FFFFFF' : '#212121', light ? '#3390EC' : '#8774E1'] as [string, string, string] };
}
