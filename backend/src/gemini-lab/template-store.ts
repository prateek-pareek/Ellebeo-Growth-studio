/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { GridRegion } from './gemini-lab-blocks';
import { validateComposition, type PhotoShape, type TypeScaleId } from './gemini-lab-compositor';
import { isPostFormatId, type PostFormatId } from './gemini-lab-formats';
import { TEMPLATES, compositionFromTemplate, type PostTemplate, type TemplateAllowances } from './templates';

/**
 * Templates as stored data, and the gate everything must pass to become one.
 *
 * The hard-coded library proved the model but caps the product: only an
 * engineer can add a layout, so the library grows at the speed of deploys.
 * Brand platforms solve this by making templates content — authored in a
 * design tool, imported, versioned, and governed — which turns growing the
 * library into a design job rather than an engineering one.
 *
 * The rule taken directly from how they do it: **validate at import, not at
 * render.** A template that would produce a broken post is refused when it is
 * saved, with the reason, rather than discovered later by a technician whose
 * post came out wrong. `assertRenderable` below is that gate, and it runs the
 * real compositor validator rather than a second, weaker copy of the rules.
 */

/** The stored shape. Mirrors the GeminiLabTemplate row. */
export type StoredTemplate = {
  key: string;
  name: string;
  intent: string;
  photoMode: string;
  regions: unknown;
  defaults: unknown;
  allows?: unknown;
  suits?: string[];
};

const PHOTO_MODES = ['framed', 'full_bleed', 'typographic', 'dual_framed'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;
const V_ALIGNS = ['top', 'center', 'bottom'] as const;
const SCALES: TypeScaleId[] = ['compact', 'balanced', 'dramatic'];
const SHAPES: PhotoShape[] = ['rect', 'rounded', 'arch', 'circle', 'pill'];

function region(raw: unknown): GridRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const col = Math.round(Number(r.col));
  const row = Math.round(Number(r.row));
  const colSpan = Math.round(Number(r.colSpan));
  const rowSpan = Math.round(Number(r.rowSpan));
  if (![col, row, colSpan, rowSpan].every(Number.isFinite)) return null;
  if (col < 1 || row < 1 || colSpan < 1 || rowSpan < 1) return null;
  if (col + colSpan - 1 > 12 || row + rowSpan - 1 > 12) return null;
  return { col, row, colSpan, rowSpan };
}

/** A stored row as the renderer's template type, or null when it is malformed. */
export function toTemplate(row: StoredTemplate): PostTemplate | null {
  const photoMode = PHOTO_MODES.find((m) => m === row.photoMode);
  if (!photoMode) return null;

  const regions = (row.regions ?? {}) as Record<string, unknown>;
  const text = region(regions.text);
  if (!text) return null;
  const photo = region(regions.photo);
  // Only the modes that place a photo in its own region need one. A full-bleed
  // photograph fills the canvas and a typographic poster has none at all, so
  // demanding a region for either rejects perfectly valid layouts.
  const placesPhoto = photoMode === 'framed' || photoMode === 'dual_framed';
  if (placesPhoto && !photo) return null;

  const d = (row.defaults ?? {}) as Record<string, unknown>;
  const a = (row.allows ?? undefined) as Record<string, unknown> | undefined;

  const allows: TemplateAllowances | undefined = a
    ? {
        typeScale: Array.isArray(a.typeScale)
          ? (a.typeScale.filter((v) => SCALES.includes(v as TypeScaleId)) as TypeScaleId[])
          : undefined,
        decoration: typeof a.decoration === 'boolean' ? a.decoration : undefined,
        paletteTreatments: Array.isArray(a.paletteTreatments)
          ? a.paletteTreatments.map(String)
          : undefined,
      }
    : undefined;

  return {
    id: row.key,
    name: row.name,
    intent: row.intent,
    photoMode,
    ...(photo && placesPhoto ? { photo } : {}),
    text,
    ...(region(regions.block) ? { block: region(regions.block)! } : {}),
    textAlign: ALIGNS.find((x) => x === d.textAlign) ?? 'left',
    typeAlign: V_ALIGNS.find((x) => x === d.typeAlign) ?? 'top',
    typeScale: SCALES.find((x) => x === d.typeScale) ?? 'balanced',
    photoShapes: Array.isArray(d.photoShapes)
      ? (d.photoShapes.filter((v) => SHAPES.includes(v as PhotoShape)) as PhotoShape[])
      : undefined,
    suits: (row.suits ?? []).filter(isPostFormatId) as PostFormatId[],
    // Carried through storage: a layout's tolerances are part of its design,
    // and dropping them here would silently re-open every property the
    // template deliberately locked.
    ...(allows && Object.values(allows).some((v) => v !== undefined) ? { allows } : {}),
  };
}

/** The renderer's template turned back into a storable row. Used to seed the shared library. */
export function toStored(t: PostTemplate, sortOrder = 0) {
  return {
    key: t.id,
    name: t.name,
    intent: t.intent,
    photoMode: t.photoMode,
    regions: { ...(t.photo ? { photo: t.photo } : {}), text: t.text, ...(t.block ? { block: t.block } : {}) },
    defaults: {
      textAlign: t.textAlign,
      typeAlign: t.typeAlign,
      typeScale: t.typeScale,
      ...(t.photoShapes ? { photoShapes: t.photoShapes } : {}),
    },
    allows: t.allows ?? null,
    suits: t.suits ?? [],
    source: 'builtin',
    sortOrder,
  };
}

/** Canvas the gate judges against. 4:5 is the tightest of the supported ratios, so passing here passes everywhere. */
const GATE_CANVAS = { w: 1080, h: 1350 };

/**
 * Refuses a layout that would render a broken post — at save time.
 *
 * Runs the real compositor validator, and requires the geometry to pass **as
 * authored**: a template that only survives because a repair rescued it is not
 * a designed layout, and every post made from it would inherit that flaw.
 */
export function assertRenderable(template: PostTemplate): string[] {
  const errors: string[] = [];
  const mw = Math.round(GATE_CANVAS.w * 0.065) / GATE_CANVAS.w;
  const mh = Math.round(GATE_CANVAS.w * 0.065) / GATE_CANVAS.h;
  const safeArea = { x0: mw, y0: mh, x1: 1 - mw, y1: 1 - mh };

  for (const withBlock of template.block ? [false, true] : [false]) {
    const result = validateComposition(
      compositionFromTemplate(template, { blockKinds: withBlock ? ['steps'] : [] }),
      {
        canvasW: GATE_CANVAS.w,
        canvasH: GATE_CANVAS.h,
        hasPair: true,
        hasPhoto: true,
        safeArea,
        headlineFits: () => true,
        content: withBlock ? { steps: [{ label: 'One' }, { label: 'Two' }] } : undefined,
      },
    );
    if (!result.ok) {
      errors.push(`${withBlock ? 'with a content block: ' : ''}${result.reason}`);
      continue;
    }
    // Passing only because a repair moved something means the layout was not
    // designed correctly — the repair exists for AI output, not for templates.
    if (result.composition.textAlign !== template.textAlign) {
      errors.push('the text alignment had to be corrected — photo and type are both centred, so the layout has no anchor');
    }
  }
  return errors;
}

/** Everything a stored row must satisfy before it is allowed into the library. */
export function validateStored(row: StoredTemplate): { template: PostTemplate | null; errors: string[] } {
  if (!row.key?.trim()) return { template: null, errors: ['A template needs a key.'] };
  if (!row.name?.trim()) return { template: null, errors: ['A template needs a name.'] };
  if (!row.intent?.trim()) return { template: null, errors: ['A template needs an intent — it is what the writer is told the layout is for.'] };

  const template = toTemplate(row);
  if (!template) {
    return {
      template: null,
      errors: ['The layout is malformed: check photoMode, and that every region sits inside the 12x12 grid.'],
    };
  }
  return { template, errors: assertRenderable(template) };
}

/** The shared library as rows, for seeding a database that has none. */
export function builtinLibrary() {
  return TEMPLATES.map((t, i) => toStored(t, i));
}
