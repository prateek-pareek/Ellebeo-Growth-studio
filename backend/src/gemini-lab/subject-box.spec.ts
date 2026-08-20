import { parseSubjectBox, keepOutRegion, overlaps, safeBandFor } from './subject-box';

/**
 * Type landing on the subject's face is the design critic's most frequent
 * complaint across every version of this pipeline. These cover the geometry
 * that decides whether it can happen.
 */

describe('reading the subject box back from the model', () => {
  it('takes a well-formed box', () => {
    const box = parseSubjectBox('{"x":0.3,"y":0.1,"w":0.35,"h":0.3,"kind":"face"}');
    expect(box).toEqual({ x: 0.3, y: 0.1, w: 0.35, h: 0.3, kind: 'face' });
  });

  it('reads a reply wrapped in a code fence', () => {
    const box = parseSubjectBox('```json\n{"x":0.1,"y":0.2,"w":0.4,"h":0.4,"kind":"person"}\n```');
    expect(box?.kind).toBe('person');
  });

  it('pulls a box back inside the frame rather than trusting it', () => {
    // A box running off the edge would crop to nothing downstream.
    const box = parseSubjectBox('{"x":0.8,"y":0.9,"w":0.5,"h":0.5,"kind":"face"}');
    expect(box!.x + box!.w).toBeLessThanOrEqual(1);
    expect(box!.y + box!.h).toBeLessThanOrEqual(1);
  });

  it('refuses a box with no area', () => {
    expect(parseSubjectBox('{"x":0.5,"y":0.5,"w":0,"h":0.3,"kind":"face"}')).toBeNull();
  });

  it('refuses a box covering the whole frame', () => {
    // That is the model describing the photograph, not locating anything in
    // it, and the compositor cannot act on it.
    expect(parseSubjectBox('{"x":0,"y":0,"w":1,"h":1,"kind":"face"}')).toBeNull();
  });

  it('refuses anything unparseable rather than guessing', () => {
    expect(parseSubjectBox('I can see a woman in a hat')).toBeNull();
    expect(parseSubjectBox('{"x":"left","y":0.1,"w":0.2,"h":0.2}')).toBeNull();
  });

  it('falls back to unknown when the kind is not one we handle', () => {
    expect(parseSubjectBox('{"x":0.1,"y":0.1,"w":0.2,"h":0.2,"kind":"cat"}')?.kind).toBe('unknown');
  });
});

describe('keeping type off the face', () => {
  const face = { x: 0.35, y: 0.1, w: 0.3, h: 0.3, kind: 'face' as const };

  it('pads the keep-out area beyond the face itself', () => {
    // Type that merely touches the hairline still reads as crowding.
    const out = keepOutRegion(face, 0.06);
    expect(out.x).toBeLessThan(face.x);
    expect(out.w).toBeGreaterThan(face.w);
  });

  it('never pads outside the frame', () => {
    const corner = { x: 0.02, y: 0.02, w: 0.2, h: 0.2, kind: 'face' as const };
    const out = keepOutRegion(corner, 0.1);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.x + out.w).toBeLessThanOrEqual(1);
  });

  it('spots a headline that would land on the face', () => {
    // A block across the upper third, where headlines usually go.
    const headline = { x: 0.08, y: 0.12, w: 0.84, h: 0.22 };
    expect(overlaps(headline, keepOutRegion(face))).toBe(true);
  });

  it('leaves a headline clear of the face alone', () => {
    const lower = { x: 0.08, y: 0.72, w: 0.84, h: 0.18 };
    expect(overlaps(lower, keepOutRegion(face))).toBe(false);
  });

  it('does not count edges merely touching as an overlap', () => {
    const region = { x: 0, y: 0, w: 0.35, h: 1 };
    expect(overlaps(region, { x: 0.35, y: 0.1, w: 0.3, h: 0.3 })).toBe(false);
  });
});

describe('choosing where the words can go', () => {
  it('sends type to the bottom when the face is high', () => {
    expect(safeBandFor({ x: 0.3, y: 0.05, w: 0.3, h: 0.3, kind: 'face' })).toBe('bottom');
  });

  it('sends type to the top when the face is low', () => {
    expect(safeBandFor({ x: 0.3, y: 0.6, w: 0.3, h: 0.3, kind: 'face' })).toBe('top');
  });
});
