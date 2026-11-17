export function modernTelegramColors(mode: 'light' | 'dark' | 'amoled') {
  const light = mode === 'light';
  return { bgMain: light ? '#ECEEFF' : mode === 'amoled' ? '#090B12' : '#141929',
    bgPanel: light ? '#FAFAFF' : '#1D2437', bgElevated: light ? '#E8EDFF' : '#2B3550',
    bubbleOut: light ? '#DCECFF' : '#254872', bubbleOutBorder: light ? '#CADFFF' : '#355E8A',
    bubbleIn: light ? '#FFFFFF' : '#222C42', bubbleInBorder: light ? '#E2E8FB' : '#303D58',
    border: light ? '#DCE2F8' : '#303B53', text: light ? '#14213D' : '#F1F4FF',
    muted: light ? '#637093' : '#ABB8D3', primary: light ? '#0668F9' : '#58ACFF',
    isLight: light, onPrimary: light ? '#FFFFFF' : '#10192A',
    previewSwatches: [light ? '#ECEEFF' : '#141929', light ? '#FAFAFF' : '#1D2437', light ? '#0668F9' : '#58ACFF'] as [string, string, string] };
}

