/** Gemini Lab–only. Do not import from the /generate pipeline. */

/**
 * Content blocks — the piece the compositor was missing.
 *
 * Until now a Gemini Lab post could only ever be ONE artifact: a photo plus
 * up to four text roles (kicker/headline/subhead/cta). Every layout, every
 * AI-authored grid composition, was a rearrangement of that identical set of
 * parts — which is exactly why the output read as "the same template" no
 * matter how much the placement varied. A viewer doesn't perceive a moved
 * headline as a different post; they perceive a different KIND of post.
 *
 * Blocks fix that at the root. A numbered process card, a price list, a
 * myth-vs-fact split and a testimonial quote are structurally different
 * artifacts, not different arrangements of the same one.
 *
 * Split follows the existing architecture exactly:
 *   - CONTENT (what the post says) lives on LabSlideSpec, like headline/cta
 *   - PLACEMENT (where it sits) lives on LabComposition, like photoBox/typeBox
 *
 * This file owns both shapes plus their coercion, and deliberately imports
 * nothing from the compositor so the dependency runs one way only.
 */

/** Grid units over the safe area. Defined here (not in the compositor) to keep the import graph acyclic. */
export type GridRegion = { col: number; row: number; colSpan: number; rowSpan: number };

export type StepItem = { label: string; detail?: string };
export type RowItem = { label: string; value: string };
export type CheckItem = { text: string; positive: boolean };
export type QuoteContent = { text: string; attribution?: string };

/**
 * Everything a format can put on a post beyond the four text roles.
 * All optional: a format populates only the fields it needs, and the
 * renderer draws only the blocks whose content actually arrived.
 */
export type FormatContent = {
  steps?: StepItem[];
  rows?: RowItem[];
  checklist?: CheckItem[];
  quote?: QuoteContent;
  /** Short emphasis chip — "20% OFF", "3 SPOTS LEFT", "DIWALI". */
  badge?: string;
  /** Labels drawn on the two halves of a dual-photo compare. */
  compareLabels?: { left: string; right: string };
};

export type BlockKind = 'steps' | 'rows' | 'checklist' | 'quote' | 'badge';

export const BLOCK_KINDS: BlockKind[] = ['steps', 'rows', 'checklist', 'quote', 'badge'];

/** A block placed on the design grid. Content is looked up by kind from FormatContent. */
export type PlacedBlock = { kind: BlockKind; region: GridRegion };

/**
 * Minimum grid footprint per block kind, in 12x12 cells. A price list squeezed
 * into two rows of grid is unreadable, and rejecting it early is cheaper than
 * discovering it after the render.
 */
export const MIN_BLOCK_SPAN: Record<BlockKind, { colSpan: number; rowSpan: number }> = {
  steps: { colSpan: 4, rowSpan: 3 },
  rows: { colSpan: 4, rowSpan: 2 },
  checklist: { colSpan: 4, rowSpan: 2 },
  quote: { colSpan: 4, rowSpan: 3 },
  badge: { colSpan: 2, rowSpan: 1 },
};

/** Caps that keep a block legible at Instagram size rather than turning into a wall of 9px type. */
export const MAX_STEPS = 4;
export const MAX_ROWS = 5;
export const MAX_CHECKS = 5;

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * AI proposes, server validates — the same discipline as clampDesignSpec and
 * validateComposition. Anything malformed is dropped rather than thrown, so a
 * partially-bad content payload degrades to fewer blocks instead of failing
 * the whole generation.
 */
export function coerceFormatContent(raw: unknown): FormatContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: FormatContent = {};

  if (Array.isArray(r.steps)) {
    const steps = r.steps
      .map((s) => {
        const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        return { label: str(o.label, 34), detail: str(o.detail, 60) || undefined };
      })
      .filter((s) => !!s.label)
      .slice(0, MAX_STEPS);
    if (steps.length >= 2) out.steps = steps;
  }

  if (Array.isArray(r.rows)) {
    const rows = r.rows
      .map((s) => {
        const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        return { label: str(o.label, 30), value: str(o.value, 14) };
      })
      .filter((s) => !!s.label && !!s.value)
      .slice(0, MAX_ROWS);
    if (rows.length >= 2) out.rows = rows;
  }

  if (Array.isArray(r.checklist)) {
    const items = r.checklist
      .map((s) => {
        const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        return { text: str(o.text, 42), positive: o.positive !== false };
      })
      .filter((s) => !!s.text)
      .slice(0, MAX_CHECKS);
    if (items.length >= 2) out.checklist = items;
  }

  if (r.quote && typeof r.quote === 'object') {
    const q = r.quote as Record<string, unknown>;
    const text = str(q.text, 150);
    if (text) out.quote = { text, attribution: str(q.attribution, 30) || undefined };
  }

  const badge = str(r.badge, 18);
  if (badge) out.badge = badge;

  if (r.compareLabels && typeof r.compareLabels === 'object') {
    const c = r.compareLabels as Record<string, unknown>;
    const left = str(c.left, 12);
    const right = str(c.right, 12);
    if (left && right) out.compareLabels = { left, right };
  }

  return out;
}

/** Does this content actually carry what the named block needs to draw? */
export function hasContentFor(kind: BlockKind, content: FormatContent | undefined): boolean {
  if (!content) return false;
  switch (kind) {
    case 'steps': return !!content.steps?.length;
    case 'rows': return !!content.rows?.length;
    case 'checklist': return !!content.checklist?.length;
    case 'quote': return !!content.quote?.text;
    case 'badge': return !!content.badge;
    default: return false;
  }
}

/**
 * Blocks the AI placed, filtered to those it can actually fill. Placement
 * without content would render an empty hole in the composition — the exact
 * class of bug that makes a post look broken rather than designed.
 */
export function coercePlacedBlocks(raw: unknown, content: FormatContent | undefined): PlacedBlock[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<BlockKind>();
  const out: PlacedBlock[] = [];
  for (const item of raw) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const kind = o.kind as BlockKind;
    if (!BLOCK_KINDS.includes(kind) || seen.has(kind)) continue;
    if (!hasContentFor(kind, content)) continue;
    const reg = o.region as Record<string, unknown> | undefined;
    if (!reg || typeof reg !== 'object') continue;
    const col = Math.round(Number(reg.col));
    const row = Math.round(Number(reg.row));
    const colSpan = Math.round(Number(reg.colSpan));
    const rowSpan = Math.round(Number(reg.rowSpan));
    if (![col, row, colSpan, rowSpan].every(Number.isFinite)) continue;
    seen.add(kind);
    out.push({ kind, region: { col, row, colSpan, rowSpan } });
  }
  // Three content blocks on one 1080x1350 canvas is already dense; more than
  // that stops being a post and starts being a spreadsheet.
  return out.slice(0, 3);
}
