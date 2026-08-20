import { FALLBACK_ADVANCE_RATIO, hasRealMetrics, measureText } from './text-metrics';

const FAMILIES = [
  'Playfair Display',
  'Cormorant Garamond',
  'Fraunces',
  'Cinzel',
  'Outfit',
  'Inter',
  'Source Sans 3',
];

describe('font metrics', () => {
  it('parses every font in the renderer registry', () => {
    for (const family of FAMILIES) {
      expect([family, hasRealMetrics(family)]).toEqual([family, true]);
    }
  });

  it('distinguishes wide letters from narrow ones — the whole point', () => {
    // Same character count, wildly different widths. The old character-count
    // measurement scored these identically, which is why headlines overflowed.
    const wide = measureText('WWWWWW', 'Playfair Display', 100);
    const narrow = measureText('iiiiii', 'Playfair Display', 100);
    expect(wide).toBeGreaterThan(narrow * 2);
  });

  it('scales linearly with font size', () => {
    const at50 = measureText('Lived-in blonde', 'Inter', 50);
    const at100 = measureText('Lived-in blonde', 'Inter', 100);
    expect(at100 / at50).toBeCloseTo(2, 5);
  });

  it('counts letter-spacing, which the old measurement ignored entirely', () => {
    const tight = measureText('Lived-in blonde', 'Inter', 60, 0);
    const tracked = measureText('Lived-in blonde', 'Inter', 60, 2);
    expect(tracked - tight).toBeCloseTo('Lived-in blonde'.length * 2, 5);
  });

  it('reports different widths for different families at the same size', () => {
    const text = 'Soft autumn balayage';
    const widths = FAMILIES.map((f) => measureText(text, f, 64));
    // If the parser silently fell through to the flat ratio everywhere, every
    // family would measure identically — this is the regression guard.
    expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(1);
  });

  it('lands in a sane range against the old flat estimate', () => {
    // Not a tight bound — just proof the units are right and we are not off
    // by an em-square factor.
    const text = 'Lived-in blonde';
    const old = text.length * FALLBACK_ADVANCE_RATIO * 60;
    for (const family of FAMILIES) {
      const measured = measureText(text, family, 60);
      expect(measured).toBeGreaterThan(old * 0.5);
      expect(measured).toBeLessThan(old * 1.6);
    }
  });

  it('falls back instead of throwing for an unknown family', () => {
    expect(hasRealMetrics('Not A Real Font')).toBe(false);
    expect(measureText('abc', 'Not A Real Font', 100)).toBeCloseTo(3 * FALLBACK_ADVANCE_RATIO * 100, 5);
  });

  it('measures empty text as zero', () => {
    expect(measureText('', 'Inter', 60)).toBe(0);
  });
});
