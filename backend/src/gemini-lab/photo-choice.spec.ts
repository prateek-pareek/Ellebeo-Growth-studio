import { photoFor, photoForOption, reconcilePill } from './gemini-lab.service';

/**
 * Which of the two uploaded photos a slide shows.
 *
 * A studio uploaded a before and an after and got four posts of the before,
 * each with BEFORE set as the pill. The rule read `index % 2 === 0` — a fair
 * alternation for a carousel, but every option in a single-slide run has
 * index 0, so it could only ever resolve to 'before'.
 */

describe('choosing between the before and the after', () => {
  it('shows the AFTER on a single-slide post, never the before', () => {
    // The reported bug, at the size it was reported: one slide, two photos.
    expect(photoFor('Look', 0, 1, true, true, true)).toBe('after');
  });

  it('shows the after on every option of a four-option single-slide run', () => {
    for (let opt = 0; opt < 4; opt += 1) {
      expect(photoFor('Look', 0, 1, true, true, true)).toBe('after');
    }
  });

  it('still pairs them when the layout is a real before-and-after', () => {
    expect(photoFor('Before & after', 0, 1, true, true, true)).toBe('both');
    expect(photoFor('Split', 0, 1, true, true, true)).toBe('both');
  });

  it('honours a slide that explicitly asks for one side', () => {
    expect(photoFor('Before', 1, 3, true, true, true)).toBe('before');
    expect(photoFor('The reveal', 1, 3, true, true, true)).toBe('after');
  });

  it('leads a carousel with the after, then tells the story in order', () => {
    // The cover is the feed thumbnail: it carries the result, not the problem.
    expect(photoFor('Cover', 0, 4, true, true, true)).toBe('after');
    expect(photoFor('Step 1', 1, 4, true, true, true)).toBe('before');
    expect(photoFor('Step 2', 2, 4, true, true, true)).toBe('after');
  });

  it('uses whichever photo exists when only one was uploaded', () => {
    expect(photoFor('Look', 0, 1, true, false, false)).toBe('before');
    expect(photoFor('Look', 0, 1, false, true, false)).toBe('after');
  });
});

describe('keeping the pill honest about the photo under it', () => {
  it('corrects a BEFORE pill on a slide showing the after', () => {
    // Exactly what shipped: an orange "after" post captioned BEFORE.
    expect(reconcilePill('BEFORE', 'after')).toBe('AFTER');
  });

  it('corrects an AFTER pill on a slide showing the before', () => {
    expect(reconcilePill('AFTER', 'before')).toBe('BEFORE');
  });

  it('drops it entirely on a split, where each photo is already labelled', () => {
    expect(reconcilePill('BEFORE', 'both')).toBeUndefined();
    expect(reconcilePill('AFTER', 'both')).toBeUndefined();
  });

  it('leaves any other pill alone', () => {
    // The check is narrow on purpose: it only knows about these two words.
    expect(reconcilePill('LOOK', 'after')).toBe('LOOK');
    expect(reconcilePill('BOOK NOW', 'both')).toBe('BOOK NOW');
    expect(reconcilePill('BEFORE & AFTER', 'both')).toBe('BEFORE & AFTER');
  });

  it('leaves a correct pill as it is', () => {
    expect(reconcilePill('AFTER', 'after')).toBe('AFTER');
    expect(reconcilePill('BEFORE', 'before')).toBe('BEFORE');
  });

  it('passes an absent pill straight through', () => {
    expect(reconcilePill(undefined, 'after')).toBeUndefined();
  });
});

describe('spreading the pair across the four options', () => {
  const pair = (mode: string, opt: number) => photoForOption('after', mode, opt, true, true);

  it('never returns the same side for all four options', () => {
    // Both bugs in one assertion: all-before was the report, all-after was
    // the over-correction.
    const set = new Set([0, 1, 2, 3].map((i) => pair('framed', i)));
    expect(set.size).toBeGreaterThan(1);
  });

  it('shows the pair on any layout built for two photos', () => {
    for (const i of [0, 1, 2, 3]) expect(pair('dual_framed', i)).toBe('both');
  });

  it('leans to the after, with one before for contrast', () => {
    const picks = [0, 1, 2, 3].map((i) => pair('framed', i));
    expect(picks.filter((p) => p === 'after')).toHaveLength(3);
    expect(picks.filter((p) => p === 'before')).toHaveLength(1);
  });

  it('never asks a single-photo layout to render both', () => {
    // The compositor would silently fall back to one photo and the pills
    // would then contradict what was drawn.
    for (const mode of ['framed', 'full_bleed', 'typographic']) {
      for (const i of [0, 1, 2, 3]) expect(pair(mode, i)).not.toBe('both');
    }
  });

  it('leaves a single-photo run exactly as the plan chose it', () => {
    expect(photoForOption('before', 'framed', 0, true, false)).toBe('before');
    expect(photoForOption('after', 'framed', 2, false, true)).toBe('after');
  });
});
