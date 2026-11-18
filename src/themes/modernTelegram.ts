/** The supplied Telegram mobile reference: white/green day and navy/blue night. */
export function modernTelegramColors(mode: 'light' | 'dark' | 'amoled') {
  const light = mode === 'light';
  return { bgMain: light ? '#F0F0F3' : '#141F28',
    bgPanel: light ? '#FFFFFF' : '#1B2B38', bgElevated: light ? '#E8EEF1' : '#243746',
    bubbleOut: light ? '#ECFFD9' : '#315FBC', bubbleOutBorder: light ? '#DBEACD' : '#315FBC',
    bubbleIn: light ? '#FFFFFF' : '#1F303D', bubbleInBorder: light ? '#E1E7DD' : '#1F303D',
    border: light ? '#E2E5E7' : '#31424F', text: light ? '#1B1E20' : '#FFFFFF',
    muted: light ? '#747A7E' : '#92A5B2', primary: light ? '#00A7E7' : '#00AEF0',
    isLight: light, onPrimary: '#FFFFFF',
    previewSwatches: [light ? '#FFFFFF' : '#141F28', light ? '#ECFFD9' : '#1B2B38', light ? '#00A7E7' : '#00AEF0'] as [string, string, string] };
}
