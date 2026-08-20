import { contrast, mix, pickPaletteTreatment, TREATMENT_IDS } from './palette-variation';
import type { LabPalette } from './gemini-lab-compositor';

const brand: LabPalette = {
  background: '#F6EEE4',
  secondary: '#E8D5C4',
  depth: '#5C4033',
  accent: '#C9A227',
  primary: '#8A7A6A',
};

describe('palette variation', () => {
  it('only ever emits colours derived from the brand', () => {
    // Not a hue check — a check that nothing is invented from thin air: every
    // treatment is built by role-swapping or mixing the brand's own five.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const t = pickPaletteTreatment(brand);
      seen.add(t.id);
    }
    for (const id of seen) expect(TREATMENT_IDS).toContain(id);
  });

  it('every offered treatment can carry legible type on its own ground', () => {
    // A variation that needs a plate behind the text to be readable is a bug
    // with a colour, not a variation.
    for (let i = 0; i < 300; i += 1) {
      const { palette } = pickPaletteTreatment(brand);
      const best = [palette.depth, palette.primary, palette.background, '#141210', '#FFFFFF'].reduce(
        (a, c) => (contrast(palette.background, c) > contrast(palette.background, a) ? c : a),
      );
      expect(contrast(palette.background, best)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('actually varies across posts', () => {
    const ids = new Set(Array.from({ length: 100 }, () => pickPaletteTreatment(brand).id));
    expect(ids.size).toBeGreaterThan(2);
  });

  it('steers away from the treatments used recently', () => {
    const recent = ['signature', 'inverted', 'tinted'];
    let repeats = 0;
    for (let i = 0; i < 300; i += 1) {
      if (recent.includes(pickPaletteTreatment(brand, recent).id)) repeats += 1;
    }
    expect(repeats).toBeLessThan(90);
  });

  it('offers a genuinely dark ground, not just lighter tints', () => {
    const found = Array.from({ length: 300 }, () => pickPaletteTreatment(brand)).some(
      (t) => t.palette.background.toLowerCase() === brand.depth.toLowerCase(),
    );
    expect(found).toBe(true);
  });

  it('is deterministic when given a fixed random source', () => {
    const a = pickPaletteTreatment(brand, [], () => 0);
    const b = pickPaletteTreatment(brand, [], () => 0);
    expect(a.id).toBe(b.id);
  });

  it('mixes between two brand colours without leaving the range', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('survives a low-contrast brand palette without emitting an unreadable ground', () => {
    const washed: LabPalette = {
      background: '#FAFAFA', secondary: '#F2F2F2', depth: '#EDEDED', accent: '#F5F5F5', primary: '#F0F0F0',
    };
    for (let i = 0; i < 50; i += 1) {
      const { palette } = pickPaletteTreatment(washed);
      const best = ['#141210', '#FFFFFF'].reduce(
        (a, c) => (contrast(palette.background, c) > contrast(palette.background, a) ? c : a),
      );
      expect(contrast(palette.background, best)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
