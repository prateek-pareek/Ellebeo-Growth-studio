import { contentForFormat, contentSatisfiesFormat } from './gemini-lab-formats';
import type { FormatContent } from './gemini-lab-blocks';

const everything: FormatContent = {
  steps: [{ label: 'Map the shape' }, { label: 'Paint the lift' }],
  rows: [{ label: 'Full set', value: '$120' }, { label: 'Refill', value: '$65' }],
  checklist: [{ text: 'Brush daily', positive: true }, { text: 'Skip oil', positive: false }],
  quote: { text: 'She actually listened to what I wanted.', attribution: 'Priya R.' },
  badge: '20% OFF',
  compareLabels: { left: 'Before', right: 'After' },
};

/**
 * The gap these close was observed live: a `meet the artist` post rendered
 * with a quote block, i.e. a fabricated client testimonial on a real studio's
 * feed. The testimonial FORMAT is withheld unless a real review is supplied,
 * but nothing stopped another format from drawing a quote block anyway.
 */
describe('contentForFormat', () => {
  it('never lets a non-testimonial format publish a client quote', () => {
    for (const id of ['statement', 'intro', 'process', 'tips', 'myth', 'occasion', 'own', 'offer', 'menu'] as const) {
      expect([id, contentForFormat(id, everything)?.quote]).toEqual([id, undefined]);
    }
  });

  it('lets the testimonial format carry the quote it exists for', () => {
    expect(contentForFormat('testimonial', everything)?.quote?.text).toBe(everything.quote!.text);
  });

  it('never lets a format that was not gated on real figures show price rows', () => {
    for (const id of ['statement', 'intro', 'process', 'tips', 'myth', 'occasion', 'own', 'testimonial'] as const) {
      expect([id, contentForFormat(id, everything)?.rows]).toEqual([id, undefined]);
    }
  });

  it('lets the commercial formats show their rows', () => {
    for (const id of ['menu', 'offer', 'availability'] as const) {
      expect(contentForFormat(id, everything)?.rows).toHaveLength(2);
    }
  });

  it('keeps each format to its own block kinds', () => {
    expect(contentForFormat('process', everything)).toEqual({ steps: everything.steps });
    expect(contentForFormat('tips', everything)).toEqual({ checklist: everything.checklist });
    expect(contentForFormat('myth', everything)).toEqual({ checklist: everything.checklist });
  });

  it('only labels a comparison on a real before/after post', () => {
    expect(contentForFormat('proof', everything)?.compareLabels).toEqual(everything.compareLabels);
    expect(contentForFormat('statement', everything)?.compareLabels).toBeUndefined();
  });

  it('returns undefined when nothing survives, so no empty region is drawn', () => {
    expect(contentForFormat('statement', everything)).toBeUndefined();
    expect(contentForFormat('intro', { quote: { text: 'invented' } })).toBeUndefined();
  });

  it('passes through absent content unchanged', () => {
    expect(contentForFormat('process', undefined)).toBeUndefined();
  });

  it('composes with the under-fill guard', () => {
    // A process post whose steps were stripped (because it sent none) must
    // not then claim to satisfy the format.
    const stripped = contentForFormat('process', { quote: { text: 'nope' } });
    expect(stripped).toBeUndefined();
    expect(contentSatisfiesFormat('process', stripped)).toBe(false);
  });
});
