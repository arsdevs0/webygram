import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_PALETTES } from '../src/themes/flowPalettes.ts';
import { resolveFlowPalette, readableForeground, readableAccent, contrastRatio, mixColor } from '../src/themes/themeTokens.ts';

test('all Flow themes keep readable text and distinct surfaces in light, dark and OLED', () => {
  assert.equal(new Set(FLOW_PALETTES.map(p => p.id)).size, 26);
  for (const palette of FLOW_PALETTES) for (const mode of ['light', 'dark', 'amoled'] as const) {
    const t = resolveFlowPalette(palette, mode);
    for (const surface of [t.bgMain, t.bgPanel, t.bubbleIn, t.bubbleOut]) {
      assert.ok(contrastRatio(t.text, surface) >= 4.5, `${palette.name} ${mode}: text on ${surface}`);
    }
    assert.notEqual(t.bgMain, t.bgElevated);
    if (mode === 'amoled') assert.equal(t.bgMain, '#000000');
    for (const accent of [t.primary, '#2AABEE', '#F59E0B', '#8B5CF6']) {
      assert.ok(contrastRatio(accent, readableForeground(accent)) >= 4.5);
      assert.ok(contrastRatio(readableAccent(accent, t.bgPanel, t.text), t.bgPanel) >= 4.5);
    }
  }
});

test('tonal surfaces use the active palette rather than a hardcoded blue', () => {
  assert.equal(mixColor('#ffffff', '#000000', .5), '#808080');
  const mono = resolveFlowPalette(FLOW_PALETTES.find(p => p.id === 'flow-monochrome')!, 'dark');
  assert.equal(mono.bgMain, '#111111');
  assert.equal(mono.bubbleOut.slice(1, 3), mono.bubbleOut.slice(3, 5));
});
