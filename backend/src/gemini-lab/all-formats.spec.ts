import { POST_FORMATS, type PostFormatId } from './gemini-lab-formats';
import { TEMPLATES, templatesFor, type PostTemplate } from './templates';

const FORMAT_IDS = Object.keys(POST_FORMATS) as PostFormatId[];

/**
 * Every post format the studio can pick, in every photo situation it can be
 * picked in.
 *
 * The formats are offered in the UI as equals, so any one of them reaching a
 * dead end — no layout, or only one — is a broken choice presented as a
 * working one. `menu`, `offer` and `availability` shared a single layout
 * between all three, which is why four options of an offer came back as the
 * same picture four times.
 */

const MODES: PostTemplate['photoMode'][] = ['framed', 'full_bleed', 'typographic', 'dual_framed'];

describe('every format can actually be built', () => {
  it.each(FORMAT_IDS)('%s has a layout in every photo mode', (format: PostFormatId) => {
    for (const photoMode of MODES) {
      const out = templatesFor({ photoMode, format });
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it.each(FORMAT_IDS)('%s has more than one arrangement to choose from', (format: PostFormatId) => {
    // Four options drawn from a pool of one are four copies of one picture.
    const pool = new Set<string>();
    for (const photoMode of MODES) {
      templatesFor({ photoMode, format }).forEach((t) => pool.add(t.id));
    }
    expect(pool.size).toBeGreaterThan(1);
  });
});

describe('the formats with their own purpose-built layouts', () => {
  // These are the ones a studio uses commercially, and the ones that were
  // starved: one layout each, shared three ways.
  it.each(['menu', 'offer', 'availability', 'testimonial', 'proof'])(
    '%s has at least two layouts drawn for it specifically',
    (format: string) => {
      const own = TEMPLATES.filter((t) => (t.suits ?? []).includes(format as any));
      expect(own.length).toBeGreaterThanOrEqual(2);
    },
  );

  it('gives a before-and-after post more than two ways to sit on the page', () => {
    const dual = TEMPLATES.filter((t) => t.photoMode === 'dual_framed');
    expect(dual.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the library itself stays sane', () => {
  it('has no duplicate ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every region inside the 12x12 grid', () => {
    for (const t of TEMPLATES) {
      for (const [name, region] of Object.entries({ photo: t.photo, text: t.text, block: t.block })) {
        if (!region) continue;
        expect(`${t.id}.${name}.col`.length && region.col).toBeGreaterThanOrEqual(1);
        expect(region.row).toBeGreaterThanOrEqual(1);
        expect(region.col + region.colSpan - 1).toBeLessThanOrEqual(12);
        expect(region.row + region.rowSpan - 1).toBeLessThanOrEqual(12);
      }
    }
  });

  it('gives every template that PLACES a photo somewhere to put it', () => {
    for (const t of TEMPLATES) {
      // full_bleed carries a photograph but declares no region: the photo is
      // the whole canvas. Only the layouts that place one in a box need a box.
      if (t.photoMode === 'framed' || t.photoMode === 'dual_framed') {
        expect(t.photo).toBeDefined();
      }
      if (t.photoMode === 'typographic') expect(t.photo).toBeUndefined();
    }
  });

  it('gives every template a text region and a real intent', () => {
    for (const t of TEMPLATES) {
      expect(t.text).toBeDefined();
      expect((t.intent || '').length).toBeGreaterThan(20);
      expect((t.name || '').length).toBeGreaterThan(2);
    }
  });
});
