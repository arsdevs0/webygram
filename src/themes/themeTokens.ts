import { FLOW_PALETTES, type FlowPalette } from './flowPalettes.ts';

export function mixColor(first: string, second: string, amount: number): string {
  const a = first.replace('#', ''), b = second.replace('#', '');
  return '#' + [0, 2, 4].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * amount + parseInt(b.slice(i, i + 2), 16) * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

export function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function readableForeground(background: string) {
  const preferred = contrastRatio(background, '#111111') > contrastRatio(background, '#ffffff') ? '#111111' : '#ffffff';
  return contrastRatio(background, preferred) >= 4.5 ? preferred : '#000000';
}

/** Keep interactive text readable even with custom accent / palette combinations. */
export function readableAccent(accent: string, surface: string, ink: string) {
  for (let step = 0; step <= 20; step++) {
    const color = mixColor(ink, accent, step / 20);
    if (contrastRatio(color, surface) >= 4.5) return color;
  }
  return ink;
}

export function resolveFlowPalette(palette: FlowPalette, mode: 'light' | 'dark' | 'amoled') {
  const isLight = mode === 'light';
  const seed = palette[isLight ? 'light' : 'dark'];
  const bgMain = mode === 'amoled' ? '#000000' : seed.background;
  const bgPanel = mode === 'amoled' ? '#080808' : seed.surface;
  const bgElevated = mode === 'amoled' ? '#1c1c1c' : mixColor(seed.onSurface, bgPanel, isLight ? .07 : .09);
  const bubbleOut = mixColor(seed.primary, bgPanel, isLight ? .10 : .19);
  const surfaces = [bgMain, bgPanel, bgElevated, bubbleOut];
  let text = seed.onSurface;
  let muted = seed.onSurfaceVariant;
  for (let step = 0; step <= 20; step++) {
    text = mixColor(isLight ? '#000000' : '#ffffff', seed.onSurface, step / 20);
    if (surfaces.every(surface => contrastRatio(text, surface) >= 4.5)) break;
  }
  for (let step = 0; step <= 20; step++) {
    muted = mixColor(text, seed.onSurfaceVariant, step / 20);
    if (surfaces.every(surface => contrastRatio(muted, surface) >= 4.5)) break;
  }
  return {
    id: palette.id, name: palette.name, subtitle: palette.subtitle, isLight,
    bgMain, bgPanel, bgElevated,
    bubbleOut,
    bubbleOutBorder: mixColor(seed.outline, bgPanel, .6),
    bubbleIn: bgPanel, bubbleInBorder: mixColor(seed.outline, bgPanel, .5),
    border: seed.outline, text, muted,
    primary: seed.primary, onPrimary: contrastRatio(seed.primary, seed.onPrimary) >= 4.5 ? seed.onPrimary : readableForeground(seed.primary), error: seed.error,
    previewSwatches: [bgMain, bgPanel, seed.primary] as [string, string, string],
  };
}

export function findFlowPalette(id: string) { return FLOW_PALETTES.find(p => p.id === id); }

/** Choose a nearby foreground that remains readable on every related surface. */
export function readableText(preferred:string,surfaces:string[],minimum=4.5):string {
  if(surfaces.every(surface=>contrastRatio(preferred,surface)>=minimum))return preferred;
  const score=(color:string)=>Math.min(...surfaces.map(surface=>contrastRatio(color,surface)));
  const target=score('#111111')>score('#ffffff')?'#111111':'#ffffff';
  for(let step=1;step<=40;step++){const color=mixColor(target,preferred,step/40);if(score(color)>=minimum)return color;}
  return target;
}
