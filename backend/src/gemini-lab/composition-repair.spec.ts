import { validateComposition, type LabCompositionInput } from './gemini-lab-compositor';

const w = 1080, h = 1350;
const mw = Math.round(w * 0.065) / w;
const mh = Math.round(w * 0.065) / h;
const safeArea = { x0: mw, y0: mh, x1: 1 - mw, y1: 1 - mh };

const ctx = (over: Partial<Parameters<typeof validateComposition>[1]> = {}) => ({
  canvasW: w,
  canvasH: h,
  hasPair: false,
  hasPhoto: true,
  safeArea,
  headlineFits: () => true,
  ...over,
});

/**
 * Every rule here used to discard the model's entire composition and render
 * one of seven presets. That fallback was the largest single source of
 * template-looking output, so each of these repairs keeps an authored design
 * alive that would previously have been thrown away.
 */
describe('composition repairs', () => {
  it('opens a gutter between regions that merely touch', () => {
    // Columns 1-5 and 6-12 are the natural thing to author and give a gap of
    // exactly zero.
    const r = validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 6, row: 1, colSpan: 7, rowSpan: 12 },
      textRegion: { col: 1, row: 3, colSpan: 5, rowSpan: 6 },
      textAlign: 'left',
    }, ctx());
    expect(r.ok).toBe(true);
  });

  it('left-sets the type instead of rejecting a doubly-centred composition', () => {
    const r = validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 3, row: 1, colSpan: 8, rowSpan: 5 },
      textRegion: { col: 2, row: 7, colSpan: 10, rowSpan: 5 },
      textAlign: 'center',
    }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.composition.textAlign).toBe('left');
  });

  it('widens a too-narrow text region rather than discarding the layout', () => {
    // Fits only once the region is wider than authored.
    const fits = (box: { w: number }) => box.w > 420;
    const r = validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 8, row: 1, colSpan: 5, rowSpan: 12 },
      textRegion: { col: 1, row: 4, colSpan: 4, rowSpan: 5 },
      textAlign: 'left',
    }, ctx({ headlineFits: fits }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.composition.typeBox.w * w).toBeGreaterThan(420);
  });

  it('never widens the type across the photo', () => {
    const r = validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 8, row: 1, colSpan: 5, rowSpan: 12 },
      textRegion: { col: 1, row: 4, colSpan: 4, rowSpan: 5 },
      textAlign: 'left',
    }, ctx({ headlineFits: (b: { w: number }) => b.w > 420 }));
    if (r.ok) {
      const t = r.composition.typeBox;
      const p = r.composition.photoBox;
      expect(t.x + t.w).toBeLessThanOrEqual(p.x + 0.001);
    }
  });

  it('still rejects when no amount of widening can fit the headline', () => {
    const r = validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 8, row: 1, colSpan: 5, rowSpan: 12 },
      textRegion: { col: 1, row: 4, colSpan: 4, rowSpan: 5 },
      textAlign: 'left',
    }, ctx({ headlineFits: () => false }));
    expect(r.ok).toBe(false);
  });

  it('reflows a block that lands on the text region', () => {
    const comp: LabCompositionInput = {
      photoMode: 'typographic',
      textRegion: { col: 1, row: 1, colSpan: 10, rowSpan: 4 },
      blocks: [{ kind: 'steps', region: { col: 1, row: 2, colSpan: 10, rowSpan: 5 } }],
    };
    const r = validateComposition(comp, ctx({
      content: { steps: [{ label: 'One' }, { label: 'Two' }] },
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const block = r.composition.blocks![0];
      const type = r.composition.typeBox;
      const overlaps = block.box.y < type.y + type.h && block.box.y + block.box.h > type.y;
      expect(overlaps).toBe(false);
    }
  });

  it('keeps rejecting things that are genuinely unrenderable', () => {
    expect(validateComposition({ photoMode: 'framed' } as LabCompositionInput, ctx()).ok).toBe(false);
    expect(validateComposition({
      photoMode: 'dual_framed',
      photoRegion: { col: 1, row: 1, colSpan: 6, rowSpan: 6 },
      textRegion: { col: 1, row: 8, colSpan: 10, rowSpan: 3 },
    }, ctx({ hasPair: false })).ok).toBe(false);
    expect(validateComposition({
      photoMode: 'framed',
      photoRegion: { col: 1, row: 1, colSpan: 6, rowSpan: 6 },
      textRegion: { col: 1, row: 8, colSpan: 10, rowSpan: 3 },
    }, ctx({ hasPhoto: false })).ok).toBe(false);
  });
});
