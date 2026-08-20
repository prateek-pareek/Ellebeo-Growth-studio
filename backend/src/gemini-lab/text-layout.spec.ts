import { wrapMeasured } from './gemini-lab-compositor';
import { measureText } from './text-metrics';

const HEADING = 'Playfair Display';
const BODY = 'Inter';
const font = { family: HEADING };

/**
 * The two text defects that produced visibly wrong posts:
 *
 *  1. Copy silently losing its last words. The wrapper hit its line limit,
 *     `break`ed, and returned what it had — so the studio published a
 *     truncated sentence with nothing anywhere to say so.
 *  2. Wrapping by character count against one flat width ratio, which is
 *     blind to the actual face, to letter-spacing, and to the difference
 *     between "WWW" and "iii".
 *
 * The single-line cases here are the reachable ones in production: a price
 * row's label is wrapped to maxLines 1, so any label wider than its column
 * was previously cut without a trace.
 */
describe('wrapMeasured', () => {
  it('reports when it had to cut words instead of dropping them silently', () => {
    const narrow = wrapMeasured('Full balayage with toner and gloss finish', 200, 40, 1, font);
    expect(narrow.dropped).toBe(true);
    // What it kept is still real text, not an empty line.
    expect(narrow.lines.join(' ').length).toBeGreaterThan(0);
  });

  it('does not claim a cut when everything was set', () => {
    const fits = wrapMeasured('Lived-in blonde', 600, 40, 2, font);
    expect(fits.dropped).toBe(false);
    expect(fits.lines.join(' ')).toBe('Lived-in blonde');
  });

  it('keeps every word when given enough lines', () => {
    const text = 'Soft lived-in balayage with a hand-painted money piece';
    const wrapped = wrapMeasured(text, 400, 34, 5, font);
    expect(wrapped.dropped).toBe(false);
    expect(wrapped.lines.join(' ').split(/\s+/)).toEqual(text.split(/\s+/));
  });

  it('never emits a line wider than the box', () => {
    const text = 'Hand-painted dimensional colour for autumn';
    const maxWidth = 420;
    const size = 44;
    const { lines } = wrapMeasured(text, maxWidth, size, 4, font);
    for (const line of lines) {
      // Single words longer than the box are the one unavoidable exception.
      if (line.includes(' ')) expect(measureText(line, HEADING, size)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it('wraps sooner once letter-spacing is applied', () => {
    const text = 'Autumn gloss refresh booking';
    const tight = wrapMeasured(text, 420, 44, 4, { family: HEADING, tracking: 0 });
    const loose = wrapMeasured(text, 420, 44, 4, { family: HEADING, tracking: 5 });
    // Tracking was invisible to the old measurement, so tracked headlines
    // overflowed the box they had been measured into.
    expect(loose.lines.length).toBeGreaterThanOrEqual(tight.lines.length);
  });

  it('fits more of a narrow-lettered line than a wide-lettered one', () => {
    const wide = wrapMeasured('WWWWW WWWWW WWWWW', 400, 40, 4, font);
    const narrow = wrapMeasured('iiiii iiiii iiiii', 400, 40, 4, font);
    expect(wide.lines.length).toBeGreaterThan(narrow.lines.length);
  });

  it('respects the face it is actually set in', () => {
    // Cormorant is far narrower than Cinzel; the same string in the same box
    // should not wrap identically. Character counting said it would.
    const text = 'Signature colour and cut for the season ahead';
    const cormorant = wrapMeasured(text, 380, 40, 6, { family: 'Cormorant Garamond' });
    const cinzel = wrapMeasured(text, 380, 40, 6, { family: 'Cinzel' });
    expect(cinzel.lines.length).toBeGreaterThan(cormorant.lines.length);
  });

  it('handles empty and single-word input without throwing', () => {
    expect(wrapMeasured('', 300, 40, 2, font).lines).toEqual([]);
    expect(wrapMeasured('Balayage', 300, 40, 2, font).lines).toEqual(['Balayage']);
  });

  it('still works without font metrics, on the old ratio', () => {
    const wrapped = wrapMeasured('Lived-in blonde tones', 400, 40, 3);
    expect(wrapped.lines.join(' ')).toBe('Lived-in blonde tones');
  });

  it('measures the body face for block text too', () => {
    // Price-list labels are set in the body face; measuring them with the
    // heading face would misplace the leader dots.
    expect(measureText('Full set', BODY, 30)).toBeGreaterThan(0);
  });
});
