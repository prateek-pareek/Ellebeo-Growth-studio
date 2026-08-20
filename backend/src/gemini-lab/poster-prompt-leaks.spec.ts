import { buildPosterPrompt } from './poster-generate';

/**
 * The two things that must never reach an image model.
 *
 * Both were found, fixed, and documented for the ai_layout path — and both
 * were still live in the poster path months later, because the fix was
 * applied where the bug was seen rather than everywhere the prompt is built.
 * A real run produced a poster with INTER typeset as body copy under the
 * headline. These fail if either ever comes back.
 */

const brand = {
  name: 'Lok Salon',
  palette: {
    background: '#F3EDE3',
    depth: '#3F4A3C',
    accent: '#A3B18A',
    secondary: '#D8C3A5',
    primary: '#6B705C',
  },
  typography: { heading: 'Playfair Display', body: 'Inter' },
  mood: 'quiet_luxury',
  essence: ['calm', 'considered'],
  serviceAreas: ['Mumbai'],
} as any;

const brief = {
  headline: 'Autumn colour refresh',
  subhead: '20% off through September',
  format: 'statement',
} as any;

describe('what the poster prompt is allowed to say', () => {
  const prompt = buildPosterPrompt(brief, brand, '4:5');

  it('never puts a hex code in front of the model', () => {
    // Told these were "to mix with, never to display", it set one as the
    // visible headline. The value simply does not go in.
    expect(prompt).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('never names a typeface', () => {
    // A font name is a proper noun in a prompt full of copy, so it gets
    // typeset. "INTER" appeared as body copy on a real generated poster.
    expect(prompt).not.toMatch(/Playfair|Inter\b/i);
  });

  it('still describes the colours and the type, rather than dropping them', () => {
    // The fix is a substitution, not a deletion: strip the values and the
    // model designs in default greys with a default face.
    expect(prompt.toLowerCase()).toMatch(/cream|warm|pale|off-white/);
    expect(prompt.toLowerCase()).toMatch(/serif/);
    expect(prompt.toLowerCase()).toMatch(/sans/);
  });

  it('still carries the brief and the brand name', () => {
    expect(prompt).toContain('Lok Salon');
    expect(prompt).toContain('Autumn colour refresh');
  });
});
