import { pairingId, pickTypePairing } from './type-variation';
import { TYPE_PAIRINGS } from './guided-dna/contract';
import type { LabTypography, MoodHint } from './gemini-lab-compositor';

const MOODS: MoodHint[] = [
  'SOFT_GLAM', 'CLEAN_CLINICAL', 'EDITORIAL_MINIMAL',
  'NATURAL_ORGANIC', 'BOLD_LUXE', 'PLAYFUL_FRESH',
];

/** Only faces the renderer can actually load — an unknown family silently falls back to Playfair. */
const AVAILABLE = new Set([
  'Playfair Display', 'Cormorant Garamond', 'Fraunces',
  'Cinzel', 'Outfit', 'Inter', 'Source Sans 3',
]);

describe('type pairing variation', () => {
  it('gives every mood more than the one pairing it used to have', () => {
    for (const mood of MOODS) {
      const brand = TYPE_PAIRINGS[mood] as LabTypography;
      const seen = new Set(
        Array.from({ length: 200 }, () => pairingId(pickTypePairing(brand, mood))),
      );
      expect([mood, seen.size > 1]).toEqual([mood, true]);
    }
  });

  it('only ever returns faces the renderer can load', () => {
    for (const mood of MOODS) {
      const brand = TYPE_PAIRINGS[mood] as LabTypography;
      for (let i = 0; i < 100; i += 1) {
        const t = pickTypePairing(brand, mood);
        expect(AVAILABLE.has(t.heading)).toBe(true);
        expect(AVAILABLE.has(t.body)).toBe(true);
      }
    }
  });

  it('keeps the brand its own configured pairing in the running', () => {
    const brand: LabTypography = { heading: 'Cinzel', body: 'Source Sans 3' };
    const seen = new Set(
      Array.from({ length: 300 }, () => pairingId(pickTypePairing(brand, 'SOFT_GLAM'))),
    );
    // A studio that deliberately chose its fonts must still see them.
    expect(seen.has('Cinzel/Source Sans 3')).toBe(true);
  });

  it('steers away from the pairings used recently', () => {
    const brand = TYPE_PAIRINGS.SOFT_GLAM as LabTypography;
    const recent = ['Playfair Display/Inter'];
    let repeats = 0;
    for (let i = 0; i < 300; i += 1) {
      if (pairingId(pickTypePairing(brand, 'SOFT_GLAM', recent)) === recent[0]) repeats += 1;
    }
    expect(repeats).toBeLessThan(60);
  });

  it('falls back to the brand pairing when the mood is unknown', () => {
    const brand: LabTypography = { heading: 'Playfair Display', body: 'Inter' };
    expect(pickTypePairing(brand, undefined)).toEqual(brand);
  });

  it('never pairs a display serif against itself as body text', () => {
    // Cinzel and Cormorant are display faces; setting body copy in them is
    // unreadable at subhead sizes.
    const unreadableAsBody = new Set(['Cinzel', 'Cormorant Garamond', 'Playfair Display']);
    for (const mood of MOODS) {
      const brand = TYPE_PAIRINGS[mood] as LabTypography;
      for (let i = 0; i < 100; i += 1) {
        expect(unreadableAsBody.has(pickTypePairing(brand, mood).body)).toBe(false);
      }
    }
  });
});
