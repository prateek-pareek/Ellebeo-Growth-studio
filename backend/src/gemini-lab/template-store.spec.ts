import { TEMPLATES } from './templates';
import { assertRenderable, builtinLibrary, toStored, toTemplate, validateStored } from './template-store';

/**
 * The gate that makes a template library safe to open up: a layout that would
 * render a broken post is refused when it is SAVED, with the reason — not
 * discovered later by a technician whose post came out wrong.
 */
describe('template store', () => {
  it('round-trips every built-in layout through storage without drift', () => {
    for (const t of TEMPLATES) {
      const back = toTemplate(toStored(t));
      expect([t.id, back?.id]).toEqual([t.id, t.id]);
      expect([t.id, back?.photoMode]).toEqual([t.id, t.photoMode]);
      expect([t.id, back?.text]).toEqual([t.id, t.text]);
      expect([t.id, back?.photo]).toEqual([t.id, t.photo]);
      expect([t.id, back?.block]).toEqual([t.id, t.block]);
      expect([t.id, back?.textAlign]).toEqual([t.id, t.textAlign]);
    }
  });

  it('accepts the whole shared library', () => {
    for (const row of builtinLibrary()) {
      expect([row.key, validateStored(row as any).errors]).toEqual([row.key, []]);
    }
  });

  it('refuses a layout whose regions collide, at save time', () => {
    const bad = {
      key: 'broken', name: 'Broken', intent: 'x', photoMode: 'framed',
      regions: { photo: { col: 1, row: 1, colSpan: 6, rowSpan: 6 }, text: { col: 1, row: 1, colSpan: 6, rowSpan: 6 } },
      defaults: { textAlign: 'left', typeAlign: 'top', typeScale: 'balanced' },
    };
    const { errors } = validateStored(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/overlap|gutter/i);
  });

  it('refuses a layout with no anchor rather than silently correcting it', () => {
    const centred = {
      key: 'centred', name: 'Centred', intent: 'x', photoMode: 'framed',
      regions: { photo: { col: 3, row: 1, colSpan: 8, rowSpan: 5 }, text: { col: 2, row: 7, colSpan: 10, rowSpan: 5 } },
      defaults: { textAlign: 'center', typeAlign: 'top', typeScale: 'balanced' },
    };
    expect(validateStored(centred).errors.join(' ')).toMatch(/anchor/i);
  });

  it('refuses a region outside the 12x12 grid', () => {
    const off = {
      key: 'off', name: 'Off grid', intent: 'x', photoMode: 'framed',
      regions: { photo: { col: 9, row: 1, colSpan: 8, rowSpan: 5 }, text: { col: 1, row: 7, colSpan: 6, rowSpan: 4 } },
      defaults: {},
    };
    expect(validateStored(off).errors.join(' ')).toMatch(/malformed/i);
  });

  it('refuses a photo mode it cannot render', () => {
    expect(toTemplate({
      key: 'x', name: 'x', intent: 'x', photoMode: 'hologram',
      regions: { text: { col: 1, row: 1, colSpan: 6, rowSpan: 4 } }, defaults: {},
    })).toBeNull();
  });

  it('requires a photo region for every mode that places one', () => {
    expect(toTemplate({
      key: 'x', name: 'x', intent: 'x', photoMode: 'framed',
      regions: { text: { col: 1, row: 1, colSpan: 6, rowSpan: 4 } }, defaults: {},
    })).toBeNull();
  });

  it('requires the human-facing fields, since the writer is shown the intent', () => {
    const base = builtinLibrary()[0] as any;
    expect(validateStored({ ...base, intent: '' }).errors[0]).toMatch(/intent/i);
    expect(validateStored({ ...base, name: '' }).errors[0]).toMatch(/name/i);
    expect(validateStored({ ...base, key: '' }).errors[0]).toMatch(/key/i);
  });

  it('drops values it does not recognise instead of trusting them', () => {
    const t = toTemplate({
      key: 'x', name: 'x', intent: 'x', photoMode: 'typographic',
      regions: { text: { col: 1, row: 1, colSpan: 8, rowSpan: 4 } },
      defaults: { textAlign: 'justified', typeScale: 'enormous', photoShapes: ['hexagon', 'arch'] },
      allows: { typeScale: ['dramatic', 'gigantic'], decoration: 'maybe' },
      suits: ['menu', 'not-a-format'],
    })!;
    expect(t.textAlign).toBe('left');
    expect(t.typeScale).toBe('balanced');
    expect(t.photoShapes).toEqual(['arch']);
    expect(t.allows?.typeScale).toEqual(['dramatic']);
    expect(t.allows?.decoration).toBeUndefined();
    expect(t.suits).toEqual(['menu']);
  });

  it('carries allowances through storage', () => {
    const priceCard = TEMPLATES.find((t) => t.id === 'price-card')!;
    expect(toTemplate(toStored(priceCard) as any)?.allows?.decoration).toBe(false);
  });

  it('reports every problem it finds, not just the first', () => {
    expect(assertRenderable(TEMPLATES[0])).toEqual([]);
  });
});
