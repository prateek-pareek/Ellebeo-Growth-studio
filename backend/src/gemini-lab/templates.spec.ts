import { TEMPLATES, TEMPLATES_BY_ID, allowancesFor, compositionFromTemplate, templatesFor } from './templates';
import { validateComposition } from './gemini-lab-compositor';

const w = 1080, h = 1350;
const mw = Math.round(w * 0.065) / w;
const mh = Math.round(w * 0.065) / h;
const safeArea = { x0: mw, y0: mh, x1: 1 - mw, y1: 1 - mh };

const ctx = (over: any = {}) => ({
  canvasW: w,
  canvasH: h,
  hasPair: true,
  hasPhoto: true,
  safeArea,
  headlineFits: () => true,
  ...over,
});

/**
 * The point of the template library: geometry is correct by construction, so
 * the preset-fallback path — the largest source of template-looking output —
 * becomes unreachable in normal operation.
 */
describe('template library', () => {
  it('every template passes the validator the AI output had to pass', () => {
    for (const t of TEMPLATES) {
      const comp = compositionFromTemplate(t, { blockKinds: t.block ? ['steps'] : [] });
      const result = validateComposition(comp, ctx({
        content: { steps: [{ label: 'One' }, { label: 'Two' }] },
      }));
      expect([t.id, result.ok, result.ok ? '' : result.reason]).toEqual([t.id, true, '']);
    }
  });

  it('every template still validates with no block content', () => {
    for (const t of TEMPLATES) {
      const result = validateComposition(compositionFromTemplate(t), ctx());
      expect([t.id, result.ok]).toEqual([t.id, true]);
    }
  });

  it('is not silently repaired — the geometry is right as authored', () => {
    // A template that only passes because a repair rescued it is not a
    // designed layout, it is a lucky one.
    for (const t of TEMPLATES) {
      const comp = compositionFromTemplate(t, { blockKinds: t.block ? ['rows'] : [] });
      const result = validateComposition(comp, ctx({ content: { rows: [{ label: 'A', value: '$1' }, { label: 'B', value: '$2' }] } }));
      if (!result.ok) throw new Error(`${t.id}: ${result.reason}`);
      expect([t.id, result.composition.textAlign]).toEqual([t.id, t.textAlign]);
      if (t.photo) {
        const authored = result.composition.typeBox;
        expect([t.id, authored.w > 0]).toEqual([t.id, true]);
      }
    }
  });

  it('offers templates for every photo mode', () => {
    for (const mode of ['framed', 'full_bleed', 'typographic', 'dual_framed'] as const) {
      expect(templatesFor({ photoMode: mode }).length).toBeGreaterThan(0);
    }
  });

  it('gives the commercial formats their purpose-built layouts', () => {
    const menu = templatesFor({ photoMode: 'typographic', format: 'menu' });
    expect(menu[0].id).toBe('price-card');
    const quote = templatesFor({ photoMode: 'typographic', format: 'testimonial' });
    expect(quote[0].id).toBe('poster-quote');
  });

  it('only offers block-capable templates when the post has a block', () => {
    for (const mode of ['framed', 'full_bleed', 'typographic'] as const) {
      for (const t of templatesFor({ photoMode: mode, needsBlock: true })) {
        expect([t.id, !!t.block]).toEqual([t.id, true]);
      }
    }
  });

  it('never places a photo region on a typographic poster', () => {
    for (const t of templatesFor({ photoMode: 'typographic' })) {
      expect(compositionFromTemplate(t).photoRegion).toBeUndefined();
    }
  });

  it('gives more than one genuinely different layout per mode', () => {
    expect(templatesFor({ photoMode: 'framed' }).length).toBeGreaterThan(3);
    expect(templatesFor({ photoMode: 'typographic' }).length).toBeGreaterThan(2);
  });
});

describe('template allowances', () => {
  it('locks a motif off the layouts that cannot carry one', () => {
    // Deny-by-default per property is how brand platforms actually govern
    // templates: editable is never the same as free.
    for (const id of ['price-card', 'poster-quote', 'corner-detail', 'compare-side']) {
      expect([id, allowancesFor(TEMPLATES_BY_ID.get(id)!).decoration]).toEqual([id, false]);
    }
  });

  it('defaults to permitting a motif where the layout has room', () => {
    expect(allowancesFor(TEMPLATES_BY_ID.get('editorial-column')!).decoration).toBe(true);
  });

  it('keeps a dense price card off the dramatic scale', () => {
    const allows = allowancesFor(TEMPLATES_BY_ID.get('price-card')!);
    expect(allows.typeScale).not.toContain('dramatic');
  });

  it('falls back to the layout’s own scale when none is declared', () => {
    const t = TEMPLATES_BY_ID.get('editorial-column')!;
    expect(allowancesFor(t).typeScale).toEqual([t.typeScale]);
  });
});
