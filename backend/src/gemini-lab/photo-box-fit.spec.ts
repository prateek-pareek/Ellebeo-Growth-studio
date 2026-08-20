import { splitOrientationFor, fitBoxToAspect } from './gemini-lab-compositor';

/**
 * Fitting the slot to the photograph instead of the other way round.
 *
 * A real before/after run put two 900x1200 portraits into a tall, narrow
 * region and halved its WIDTH, producing two ~0.18-aspect slivers — a
 * vertical strip of each face — while the rest of the post sat empty.
 */

const PORTRAIT = 900 / 1200; // 0.75, an ordinary phone photo
const GAP = 24;

describe('which way a pair of photos splits', () => {
  it('stacks two portraits in a tall, narrow region', () => {
    // The region from the failing run: 443x1175px on a 1080x1350 canvas.
    expect(splitOrientationFor({ w: 443, h: 1175 }, PORTRAIT, GAP)).toBe('stacked');
  });

  it('the stacked cell is close to the photo, where side-by-side was a sliver', () => {
    const box = { w: 443, h: 1175 };
    const sideCell = (box.w - GAP) / 2 / box.h;
    const stackCell = box.w / ((box.h - GAP) / 2);
    expect(sideCell).toBeLessThan(0.25); // the sliver that shipped
    expect(stackCell).toBeGreaterThan(0.6);
    expect(stackCell).toBeLessThan(0.95); // near the photo's own 0.75
  });

  it('still places them side by side in a wide, short region', () => {
    expect(splitOrientationFor({ w: 1000, h: 420 }, PORTRAIT, GAP)).toBe('side_by_side');
  });

  it('stacks two landscape photos in a squarish region', () => {
    // Not the intuitive answer, and the right one: stacking gives each
    // landscape a wide 2.3-aspect cell, where halving the width would give
    // each a portrait-shaped 0.55 — the wrong shape for a landscape photo.
    expect(splitOrientationFor({ w: 900, h: 800 }, 1.5, GAP)).toBe('stacked');
  });

  it('puts two landscapes side by side once the region is wide enough', () => {
    expect(splitOrientationFor({ w: 2000, h: 600 }, 1.5, GAP)).toBe('side_by_side');
  });

  it('does not crash on a degenerate box or aspect', () => {
    expect(splitOrientationFor({ w: 0, h: 0 }, PORTRAIT, GAP)).toBe('side_by_side');
    expect(splitOrientationFor({ w: 400, h: 400 }, 0, GAP)).toBe('side_by_side');
  });
});

describe('reshaping a slot that disagrees with the photo', () => {
  it('leaves an ordinary crop alone', () => {
    // 4:5 slot, 0.75 photo — normal framing, not damage.
    const box = { x: 0, y: 0, w: 800, h: 1000 };
    expect(fitBoxToAspect(box, PORTRAIT)).toEqual(box);
  });

  it('narrows a slot that is far too wide for the photo', () => {
    const out = fitBoxToAspect({ x: 0, y: 0, w: 1200, h: 300 }, PORTRAIT);
    expect(out.w).toBeLessThan(1200);
    expect(out.h).toBe(300);
  });

  it('shortens a slot that is far too tall for the photo', () => {
    const out = fitBoxToAspect({ x: 0, y: 0, w: 300, h: 1200 }, PORTRAIT);
    expect(out.h).toBeLessThan(1200);
    expect(out.w).toBe(300);
  });

  it('keeps the reshaped slot inside the original and centred', () => {
    const box = { x: 100, y: 50, w: 300, h: 1200 };
    const out = fitBoxToAspect(box, PORTRAIT);
    expect(out.x).toBeGreaterThanOrEqual(box.x);
    expect(out.y).toBeGreaterThanOrEqual(box.y);
    expect(out.x + out.w).toBeLessThanOrEqual(box.x + box.w);
    expect(out.y + out.h).toBeLessThanOrEqual(box.y + box.h);
    // Centred: equal slack above and below, to within rounding.
    expect(Math.abs((out.y - box.y) - (box.y + box.h - out.y - out.h))).toBeLessThanOrEqual(1);
  });

  it('never reshapes all the way to the photo — that would leave a hole', () => {
    // Meeting partway is deliberate: the slot moves to the edge of tolerance.
    const out = fitBoxToAspect({ x: 0, y: 0, w: 300, h: 1200 }, PORTRAIT);
    expect(out.w / out.h).toBeLessThan(PORTRAIT);
  });

  it('returns the box unchanged rather than throwing on bad input', () => {
    const box = { x: 0, y: 0, w: 300, h: 1200 };
    expect(fitBoxToAspect(box, 0)).toEqual(box);
    expect(fitBoxToAspect({ x: 0, y: 0, w: 0, h: 0 }, PORTRAIT)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
