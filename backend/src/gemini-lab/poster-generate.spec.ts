import { buildPosterPrompt } from './poster-generate';
import type { LabPalette, LabTypography } from './gemini-lab-compositor';

const palette: LabPalette = {
  background: '#F6EEE4', secondary: '#E8D5C4', depth: '#5C4033', accent: '#C9A227', primary: '#8A7A6A',
};
const typography: LabTypography = { heading: 'Cormorant Garamond', body: 'Inter' };
const brand = { name: 'Foil & Co', palette, typography, mood: 'EDITORIAL_MINIMAL' as const, essence: ['unhurried'], serviceAreas: ['Newtown'] };

/**
 * A generated poster gets the brand as MATERIAL and the studio's facts, and is
 * otherwise left alone. The old path spent its brief on grid coordinates and
 * craft rules, which is what made these posts bland.
 */
describe('poster brief', () => {
  it('hands over the brand as material, described rather than named', () => {
    // This used to assert the raw hex and the typeface name were present.
    // Both were the defect: handed `#F6EEE4` the model typesets `#F6EEE4`,
    // and handed "Cormorant Garamond" it typesets that. The brand still
    // reaches the model — as a description of itself.
    const p = buildPosterPrompt({ format: 'offer', headline: '20% off refills' }, brand, '4:5');
    expect(p).toMatch(/warm cream/i);
    expect(p).toMatch(/terracotta/i);
    expect(p).toMatch(/serif/i);
    expect(p).not.toContain('#F6EEE4');
    expect(p).not.toContain('Cormorant Garamond');
    expect(p).toContain('Foil & Co');
    expect(p).toMatch(/unhurried/);
    expect(p).toContain('Newtown');
  });

  it('directs each format as a designer would, not as a grid', () => {
    expect(buildPosterPrompt({ format: 'menu', headline: 'Colour menu' }, brand, '4:5')).toMatch(/scannable in two seconds/i);
    expect(buildPosterPrompt({ format: 'offer', headline: 'Sale' }, brand, '4:5')).toMatch(/saving is the hero/i);
    expect(buildPosterPrompt({ format: 'testimonial', headline: 'Kind words' }, brand, '4:5')).toMatch(/nothing competes with the words/i);
  });

  it('never mentions grids, regions or columns', () => {
    // The whole point: the model designs, it does not fill coordinates.
    const p = buildPosterPrompt({ format: 'menu', headline: 'x' }, brand, '4:5');
    expect(p).not.toMatch(/colSpan|rowSpan|12x12|photoRegion|textRegion|grid cell/i);
  });

  it('carries the studio figures verbatim so the artwork can be right', () => {
    const p = buildPosterPrompt(
      { format: 'offer', headline: '20% off', offerDetails: 'Classic refill $65, ends 31 August' },
      brand, '4:5',
    );
    expect(p).toContain('Classic refill $65, ends 31 August');
    expect(p).toMatch(/copied exactly/i);
  });

  it('lists every line that must appear, and forbids inventing more', () => {
    const p = buildPosterPrompt(
      { format: 'menu', headline: 'Colour menu', lines: ['Full balayage — $280', 'Toner — $70'], badge: '20% OFF' },
      brand, '4:5',
    );
    expect(p).toContain('Full balayage — $280');
    expect(p).toContain('20% OFF');
    expect(p).toMatch(/no invented prices/i);
  });

  it('quotes a real review verbatim when one was supplied', () => {
    const p = buildPosterPrompt(
      { format: 'testimonial', headline: 'Kind words', testimonial: 'She actually listened.' },
      brand, '4:5',
    );
    expect(p).toContain('She actually listened.');
    expect(p).toMatch(/verbatim/i);
  });

  it('keeps people out of generated artwork', () => {
    // A synthetic face published as a studio's own client would misrepresent
    // their work — this is the one rule that survives into the free path.
    expect(buildPosterPrompt({ format: 'tips', headline: 'x' }, brand, '4:5')).toMatch(/Do not include people/i);
  });

  it('states the output shape', () => {
    expect(buildPosterPrompt({ format: 'tips', headline: 'x' }, brand, '9:16')).toMatch(/tall vertical 9:16/);
  });
});
