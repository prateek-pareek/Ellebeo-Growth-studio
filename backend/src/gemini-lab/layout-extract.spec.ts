import { EXTRACT_PROMPT, extractedKey, parseExtracted } from './layout-extract';
import { validateStored } from './template-store';

const good = JSON.stringify({
  name: 'Split editorial',
  intent: 'A tall photo on the right with type ranged left.',
  photoMode: 'framed',
  regions: {
    photo: { col: 7, row: 1, colSpan: 6, rowSpan: 12 },
    text: { col: 1, row: 4, colSpan: 5, rowSpan: 6 },
  },
  defaults: { textAlign: 'left', typeAlign: 'center', typeScale: 'dramatic' },
});

/**
 * Extraction is how the library grows without an engineer — but only if an
 * extracted layout is held to exactly the standard a hand-authored one is.
 * A layout that renders badly is worse than no layout, because it is applied
 * to real posts before anyone notices.
 */
describe('layout extraction', () => {
  it('produces something the import gate accepts', () => {
    const t = parseExtracted(good, 'ref-test-1')!;
    expect(validateStored(t).errors).toEqual([]);
  });

  it('is refused by the same gate that guards hand-authored layouts', () => {
    // Overlapping regions — the single most likely misread of a busy post.
    const overlapping = JSON.stringify({
      name: 'Bad', intent: 'x', photoMode: 'framed',
      regions: {
        photo: { col: 1, row: 1, colSpan: 8, rowSpan: 8 },
        text: { col: 2, row: 2, colSpan: 6, rowSpan: 5 },
      },
      defaults: {},
    });
    const t = parseExtracted(overlapping, 'ref-bad')!;
    expect(validateStored(t).errors.length).toBeGreaterThan(0);
  });

  it('never claims a format, so one screenshot cannot take a specialist slot', () => {
    expect(parseExtracted(good, 'k')!.suits).toEqual([]);
  });

  it('tolerates a fenced reply', () => {
    expect(parseExtracted('```json\n' + good + '\n```', 'k')?.photoMode).toBe('framed');
  });

  it('returns null rather than a broken template on unusable output', () => {
    expect(parseExtracted('I see a nice layout here', 'k')).toBeNull();
    expect(parseExtracted('{"name":"x"}', 'k')).toBeNull();
    expect(parseExtracted('{"photoMode":"framed"}', 'k')).toBeNull();
  });

  it('falls back to usable human-facing text', () => {
    const t = parseExtracted(JSON.stringify({ photoMode: 'typographic', regions: { text: { col: 1, row: 1, colSpan: 8, rowSpan: 4 } } }), 'k')!;
    expect(t.name.length).toBeGreaterThan(0);
    expect(t.intent.length).toBeGreaterThan(0);
  });

  it('tells the reader to copy the arrangement and nothing else', () => {
    // Copying colour or type would make every studio look like whatever they
    // screenshotted, which is the opposite of the point.
    expect(EXTRACT_PROMPT).toMatch(/ignore the colours, the fonts, the words/i);
    expect(EXTRACT_PROMPT).toMatch(/gutter/i);
    expect(EXTRACT_PROMPT).toMatch(/at least 5 of the 12 columns/i);
  });

  it('makes a readable, unique key', () => {
    const k = extractedKey('Client Post Screenshot!.png');
    expect(k).toMatch(/^ref-client-post-screenshot/);
    expect(extractedKey('x')).not.toBe(k);
  });
});
