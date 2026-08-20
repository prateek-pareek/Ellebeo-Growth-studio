/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { GridRegion } from './gemini-lab-blocks';
import type {
  LabCompositionInput,
  PhotoShape,
  TypeScaleId,
} from './gemini-lab-compositor';
import type { PostFormatId } from './gemini-lab-formats';

/**
 * Designed layouts, as data.
 *
 * The pipeline used to ask a language model to author `{col,row,colSpan,rowSpan}`
 * per post, validate the result against craft rules, and render one of seven
 * presets whenever it failed. That is the wrong job for the tool: models place
 * boxes badly, and the measured result was a critic scoring every option 56-65
 * with the same three complaints — dead space, text regions too narrow, centred
 * type with no anchor. No prompt fixes that, because the fault is the request.
 *
 * Every serious competitor works the other way round: a library of designed
 * layouts with real constraints, and AI for selection and fill. This is that
 * library.
 *
 * The division of labour is now:
 *
 *   geometry            → these templates (composed once, by hand, correctly)
 *   what kind of post   → the creative plan (server-assigned, see creative-plan.ts)
 *   words and content   → the model, which is genuinely good at it
 *   tone within brand   → palette + type variation, derived from brand assets
 *   judging the render  → the vision critic, which looks at real pixels
 *
 * Every template is verified against the same validator the AI output had to
 * pass, so a template can never produce a rejection and the preset-fallback
 * path becomes unreachable in normal operation. Craft rules — gutters,
 * anchors, minimum type widths — are satisfied by construction rather than
 * checked after the fact.
 */

export type PostTemplate = {
  id: string;
  /** Human name, for logs and the UI. */
  name: string;
  /** What this layout is FOR. Shown to the model so it writes copy that suits the shape it will be set in. */
  intent: string;
  photoMode: 'framed' | 'full_bleed' | 'typographic' | 'dual_framed';
  /** Absent for a typographic poster, which carries no photograph. */
  photo?: GridRegion;
  text: GridRegion;
  /** Where a content block (steps, price rows, checklist, quote) sits, when the format has one. */
  block?: GridRegion;
  textAlign: 'left' | 'center' | 'right';
  typeAlign: 'top' | 'center' | 'bottom';
  typeScale: TypeScaleId;
  /** Silhouettes that suit this composition. The plan picks from these, never outside them. */
  photoShapes?: PhotoShape[];
  /** Formats this layout genuinely suits. Empty means it suits any. */
  suits?: PostFormatId[];
  /**
   * What the generator is permitted to vary on this layout.
   *
   * Modelled on how brand-management platforms actually govern templates:
   * every layer is locked on import and an administrator explicitly unlocks
   * the few properties end-users may touch — and even then, constrained
   * ("colours from brand guidelines", "position within safe areas"). Editable
   * is never the same as free.
   *
   * Our templates fixed geometry but left every other axis implicitly open,
   * which is how a dense price card could also be handed a sparkle motif. A
   * layout now declares its own tolerances, and the plan may not exceed them.
   * Omitted means "the sensible default for this layout", never "anything".
   */
  allows?: TemplateAllowances;
};

export type TemplateAllowances = {
  /** Type scales that keep this layout readable. Absent means the template's own scale is fixed. */
  typeScale?: TypeScaleId[];
  /** May a decoration motif render here? Dense layouts say no. */
  decoration?: boolean;
  /**
   * Palette treatments this layout survives. Absent means any.
   * A layout whose type sits on a photograph cannot also take a dark ground.
   */
  paletteTreatments?: string[];
};

/** What a layout permits, with the defaults applied. */
export function allowancesFor(template: PostTemplate): Required<TemplateAllowances> {
  return {
    typeScale: template.allows?.typeScale ?? [template.typeScale],
    decoration: template.allows?.decoration ?? true,
    paletteTreatments: template.allows?.paletteTreatments ?? [],
  };
}

const r = (col: number, row: number, colSpan: number, rowSpan: number): GridRegion => ({
  col,
  row,
  colSpan,
  rowSpan,
});

/**
 * FRAMED — a photograph in its own region beside or above the type.
 *
 * Gutters are at least one full grid cell everywhere, and no layout centres
 * both the photo and the type, so the anchor rule holds by construction.
 */
const FRAMED: PostTemplate[] = [
  {
    id: 'editorial-column',
    name: 'Editorial column',
    intent: 'A tall photograph on the right with a quiet column of type on the left. Classic magazine opener.',
    photoMode: 'framed',
    photo: r(7, 1, 6, 12),
    text: r(1, 4, 5, 6),
    block: r(1, 10, 5, 3),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'dramatic',
    photoShapes: ['rect', 'rounded', 'arch'],
  },
  {
    id: 'editorial-column-mirror',
    name: 'Editorial column, mirrored',
    intent: 'The same editorial opener with the photograph on the left. Use when the subject faces right.',
    photoMode: 'framed',
    photo: r(1, 1, 6, 12),
    text: r(8, 4, 5, 6),
    block: r(8, 10, 5, 3),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'dramatic',
    photoShapes: ['rect', 'rounded', 'arch'],
  },
  {
    id: 'gallery-top',
    name: 'Gallery, type beneath',
    intent: 'A wide photograph across the top with the headline set beneath it, like a print spread.',
    photoMode: 'framed',
    photo: r(1, 1, 12, 6),
    text: r(1, 8, 8, 2),
    block: r(1, 10, 12, 3),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'balanced',
    photoShapes: ['rect', 'rounded'],
  },
  {
    id: 'statement-over',
    name: 'Type first, photo beneath',
    intent: 'A large headline at the top with the photograph below it. Leads with the idea, not the picture.',
    photoMode: 'framed',
    photo: r(1, 6, 12, 7),
    text: r(1, 1, 9, 4),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
    photoShapes: ['rect', 'rounded'],
  },
  {
    id: 'inset-portrait',
    name: 'Inset portrait',
    intent: 'A narrow upright photograph inset on the right, with generous type filling the left. Quiet and premium.',
    photoMode: 'framed',
    photo: r(8, 2, 5, 8),
    text: r(1, 2, 6, 8),
    // Three rows, not two: a steps block needs that much to stay legible
    // (MIN_BLOCK_SPAN), and a slot too small for its content is a slot that
    // silently drops the content.
    block: r(1, 10, 12, 3),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'balanced',
    photoShapes: ['arch', 'rounded', 'rect'],
  },
  {
    id: 'corner-detail',
    name: 'Corner detail',
    intent: 'A small photograph tucked into the lower right while large type carries the frame. Process and teaching posts.',
    photoMode: 'framed',
    photo: r(8, 8, 5, 5),
    text: r(1, 1, 10, 5),
    block: r(1, 7, 6, 6),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
    photoShapes: ['circle', 'rounded', 'rect'],
    allows: { decoration: false, typeScale: ['dramatic', 'balanced'] },
  },
  {
    id: 'centre-medallion',
    name: 'Medallion',
    intent: 'A circular photograph set high and off-centre, with the type settled beneath it. Warm and personal.',
    photoMode: 'framed',
    // Deliberately off-centre. A centred medallion over centred type is the
    // "everything down the middle" arrangement the anchor rule exists to stop
    // — it reads as a slide, not a composition.
    photo: r(2, 1, 6, 5),
    text: r(1, 7, 12, 3),
    block: r(1, 10, 12, 3),
    textAlign: 'center',
    typeAlign: 'top',
    typeScale: 'balanced',
    photoShapes: ['circle', 'arch'],
  },
];

/** FULL BLEED — the photograph fills the canvas and the type sits on it. */
const FULL_BLEED: PostTemplate[] = [
  {
    id: 'caption-low',
    name: 'Low caption',
    intent: 'The photograph carries everything with one quiet line of type low on the left.',
    photoMode: 'full_bleed',
    text: r(1, 9, 8, 3),
    block: r(1, 4, 11, 3),
    textAlign: 'left',
    typeAlign: 'bottom',
    typeScale: 'compact',
    allows: { typeScale: ['compact', 'balanced'] },
  },
  {
    id: 'cover-story',
    name: 'Cover story',
    intent: 'A bold headline across the lower half of the photograph, like a magazine cover line.',
    photoMode: 'full_bleed',
    text: r(1, 7, 10, 5),
    block: r(1, 2, 11, 4),
    textAlign: 'left',
    typeAlign: 'bottom',
    typeScale: 'dramatic',
  },
  {
    id: 'headline-top',
    name: 'Headline above',
    intent: 'Type across the top of the photograph, leaving the subject clear below. Use when the face sits low.',
    photoMode: 'full_bleed',
    text: r(1, 1, 10, 4),
    block: r(1, 6, 11, 5),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'balanced',
  },
  {
    id: 'centre-statement',
    name: 'Centred statement',
    intent: 'One short line centred over the photograph. Only for images with a calm middle.',
    photoMode: 'full_bleed',
    text: r(2, 5, 10, 4),
    block: r(1, 10, 12, 3),
    textAlign: 'center',
    typeAlign: 'center',
    typeScale: 'dramatic',
    allows: { decoration: false, typeScale: ['dramatic'] },
  },
];

/** TYPOGRAPHIC — no photograph. Brand colour, type and content carry the whole poster. */
const TYPOGRAPHIC: PostTemplate[] = [
  {
    id: 'poster-stack',
    name: 'Poster, stacked',
    intent: 'A large headline at the top and the content stacked beneath it. The default poster.',
    photoMode: 'typographic',
    text: r(1, 1, 11, 4),
    block: r(1, 6, 12, 7),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
  },
  {
    id: 'poster-centre',
    name: 'Poster, centred',
    intent: 'A centred headline over a centred block. Formal and announcement-like.',
    photoMode: 'typographic',
    text: r(1, 2, 12, 4),
    block: r(2, 7, 10, 5),
    textAlign: 'center',
    typeAlign: 'center',
    typeScale: 'dramatic',
  },
  {
    id: 'price-card',
    name: 'Price card',
    intent: 'A short heading with a long scannable list beneath. Built for prices and openings — the list is the point.',
    photoMode: 'typographic',
    text: r(1, 1, 10, 3),
    // Rows 4-11, not 5-12: a short price list left the whole lower third of
    // the card empty, and the last row sat away from the foot with nothing
    // under it. Pulling the block up closes the gap under the heading and
    // leaves a deliberate margin instead of a void.
    block: r(1, 4, 12, 8),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'balanced',
    suits: ['menu', 'offer', 'availability'],
    allows: { decoration: false, typeScale: ['balanced', 'compact'] },
  },
  {
    id: 'poster-quote',
    name: 'Quote poster',
    intent: 'A small kicker with a large quote filling the frame. For a client’s own words.',
    photoMode: 'typographic',
    text: r(1, 1, 11, 3),
    block: r(1, 5, 12, 7),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'compact',
    suits: ['testimonial'],
    allows: { decoration: false, typeScale: ['compact', 'balanced'] },
  },
  {
    id: 'poster-split',
    name: 'Poster, split field',
    intent: 'Headline held in the upper left with the content ranged beneath and right. Asymmetric and editorial.',
    photoMode: 'typographic',
    text: r(1, 1, 7, 5),
    block: r(1, 7, 12, 6),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
  },
  {
    id: 'poster-rule',
    name: 'Poster, ruled',
    intent: 'A short kicker over a heavy headline, with the content set below a clear break. Formal, notice-board directness.',
    photoMode: 'typographic',
    text: r(1, 2, 9, 4),
    block: r(1, 7, 12, 6),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'dramatic',
  },
  {
    id: 'poster-low',
    name: 'Poster, weighted low',
    intent: 'Open space at the top with the headline and content settled into the lower two-thirds. Calm and confident.',
    photoMode: 'typographic',
    text: r(1, 4, 10, 3),
    block: r(1, 8, 12, 5),
    textAlign: 'left',
    typeAlign: 'bottom',
    typeScale: 'dramatic',
  },
  {
    id: 'poster-wide-list',
    name: 'Poster, wide list',
    intent: 'A compact heading with a long full-width list beneath. For anything with more than three items to read.',
    photoMode: 'typographic',
    text: r(1, 1, 8, 2),
    block: r(1, 4, 12, 9),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'balanced',
    allows: { decoration: false, typeScale: ['balanced', 'compact'] },
  },
  // menu, offer and availability all shared `price-card` and nothing else, so
  // three different kinds of post came back as the same picture — and four
  // options of one of them came back as the same picture four times.
  {
    id: 'price-card-centred',
    name: 'Price card, centred',
    intent: 'The heading centred over a narrower list. For a short menu where a full-width row would strand the price far from its name.',
    photoMode: 'typographic',
    text: r(2, 1, 10, 3),
    block: r(2, 5, 10, 7),
    textAlign: 'center',
    typeAlign: 'top',
    typeScale: 'balanced',
    suits: ['menu', 'offer', 'availability'],
    allows: { decoration: false, typeScale: ['balanced', 'compact'] },
  },
  {
    id: 'offer-hero-number',
    name: 'Offer, number first',
    intent: 'The saving set enormous at the top with the terms small beneath. For one offer, stated once, that should be readable across a room.',
    photoMode: 'typographic',
    text: r(1, 1, 11, 5),
    block: r(1, 7, 11, 5),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
    suits: ['offer'],
    allows: { decoration: false, typeScale: ['dramatic'] },
  },
  {
    id: 'availability-slots',
    name: 'Openings, ranged low',
    intent: 'A short line up top with the open times gathered at the foot, where a reader looks for a list. For last-minute availability.',
    photoMode: 'typographic',
    text: r(1, 1, 10, 3),
    block: r(1, 6, 11, 7),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'compact',
    suits: ['availability', 'menu'],
    allows: { decoration: false, typeScale: ['compact', 'balanced'] },
  },
  {
    id: 'quote-centred',
    name: 'Quote, centred',
    intent: 'The client’s words centred in the frame with the attribution small beneath. A plainer setting than the poster.',
    photoMode: 'typographic',
    text: r(2, 2, 10, 3),
    block: r(2, 6, 10, 6),
    textAlign: 'center',
    typeAlign: 'top',
    typeScale: 'balanced',
    suits: ['testimonial'],
    allows: { decoration: false, typeScale: ['balanced', 'compact'] },
  },
  {
    id: 'quote-lower-third',
    name: 'Quote, held low',
    intent: 'A short kicker high on the page and the quote weighted to the lower half, so the top of the frame breathes.',
    photoMode: 'typographic',
    text: r(1, 1, 9, 2),
    block: r(1, 5, 11, 8),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'compact',
    suits: ['testimonial', 'proof'],
    allows: { decoration: false, typeScale: ['compact', 'balanced'] },
  },
];

/** DUAL — a genuine before/after pair, side by side. */
const DUAL: PostTemplate[] = [
  {
    id: 'compare-side',
    name: 'Side by side',
    intent: 'The two photographs matched and level, with a short label above. Let the comparison do the work.',
    photoMode: 'dual_framed',
    photo: r(1, 4, 12, 9),
    text: r(1, 1, 9, 2),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'compact',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['compact'] },
  },
  {
    id: 'compare-caption-below',
    name: 'Side by side, caption below',
    intent: 'The pair set high with the type beneath, so the eye lands on the result first.',
    photoMode: 'dual_framed',
    photo: r(1, 1, 12, 8),
    text: r(1, 10, 10, 3),
    textAlign: 'left',
    typeAlign: 'bottom',
    typeScale: 'compact',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['compact'] },
  },
  // The pair had exactly two arrangements, so every before/after a studio
  // ever generated came back as one of two pictures. These give the same
  // comparison somewhere else to stand.
  //
  // Each one hands the compositor a differently shaped region, and the split
  // orientation is measured from that region against the photographs' own
  // aspect — so a tall region here stacks the pair rather than slicing it into
  // two vertical slivers, which is what the wide-only assumption used to do.
  {
    id: 'compare-column-type-right',
    name: 'Pair left, type right',
    intent: 'The two photographs held in a tall column on the left, with the type in the right margin. The comparison reads down the page.',
    photoMode: 'dual_framed',
    photo: r(1, 1, 6, 12),
    text: r(8, 5, 5, 5),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'compact',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['compact', 'balanced'] },
  },
  {
    id: 'compare-column-type-left',
    name: 'Pair right, type left',
    intent: 'The mirrored column: photographs down the right, type held left. Use when the subject faces left.',
    photoMode: 'dual_framed',
    photo: r(7, 1, 6, 12),
    text: r(1, 5, 5, 5),
    textAlign: 'left',
    typeAlign: 'center',
    typeScale: 'compact',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['compact', 'balanced'] },
  },
  {
    id: 'compare-full-bleed-pair',
    name: 'Pair, edge to edge',
    intent: 'The comparison filling the frame with one quiet line of type above it. Nothing competes with the two photographs.',
    photoMode: 'dual_framed',
    photo: r(1, 3, 12, 10),
    text: r(1, 1, 9, 2),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'compact',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['compact'] },
  },
  {
    id: 'compare-headline-over',
    name: 'Pair beneath a headline',
    intent: 'A full headline across the top with the pair set large below it. For a transformation worth announcing.',
    photoMode: 'dual_framed',
    photo: r(1, 5, 12, 8),
    text: r(1, 1, 10, 3),
    textAlign: 'left',
    typeAlign: 'top',
    typeScale: 'dramatic',
    suits: ['proof'],
    allows: { decoration: false, typeScale: ['dramatic', 'balanced'] },
  },
];

export const TEMPLATES: PostTemplate[] = [...FRAMED, ...FULL_BLEED, ...TYPOGRAPHIC, ...DUAL];

export const TEMPLATES_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

/** Templates that can carry this post. Never returns an empty list for a valid mode. */
export function templatesFor(params: {
  photoMode: PostTemplate['photoMode'];
  format?: PostFormatId;
  /** The post carries a content block, so a template with nowhere to put one will not do. */
  needsBlock?: boolean;
  /** The library to choose from. Defaults to the built-ins so callers without a database still work. */
  library?: PostTemplate[];
}): PostTemplate[] {
  const library = params.library?.length ? params.library : TEMPLATES;
  const byMode = library.filter((t) => t.photoMode === params.photoMode);
  // A template that names formats is specialised for them; one that names none
  // is general. Prefer the specialists when a format matches.
  const specialists = params.format ? byMode.filter((t) => t.suits?.includes(params.format!)) : [];
  const general = byMode.filter((t) => !t.suits?.length);
  const pool = specialists.length ? [...specialists, ...general] : general.length ? general : byMode;
  const withBlock = params.needsBlock ? pool.filter((t) => !!t.block) : pool;
  return withBlock.length ? withBlock : pool;
}

/**
 * Layouts built specifically for this format.
 *
 * `templatesFor` returns specialists ahead of general layouts, but the plan
 * weights every candidate equally — so `price-card`, drawn for price lists,
 * won one time in four against three general posters on the one format it
 * exists for. List order communicates nothing to a weighted pick; the plan has
 * to be told which layouts are purpose-built.
 */
export function specialistsFor(
  format: PostFormatId | undefined,
  photoMode: PostTemplate['photoMode'],
): string[] {
  if (!format) return [];
  return TEMPLATES.filter((t) => t.photoMode === photoMode && t.suits?.includes(format)).map((t) => t.id);
}

/**
 * The composition a template produces.
 *
 * Deterministic: the same template and inputs always give the same geometry.
 * The block region is only included when the post actually has block content,
 * so a template with a block slot degrades cleanly to a plain post.
 */
export function compositionFromTemplate(
  template: PostTemplate,
  opts: { photoShape?: PhotoShape; blockKinds?: string[] } = {},
): LabCompositionInput {
  const composition: LabCompositionInput = {
    photoMode: template.photoMode,
    textRegion: template.text,
    textAlign: template.textAlign,
    typeAlign: template.typeAlign,
    typeScale: template.typeScale,
    typeOnPhoto: template.photoMode === 'full_bleed',
    photoShape: opts.photoShape ?? template.photoShapes?.[0] ?? 'rect',
  };
  if (template.photo) composition.photoRegion = template.photo;
  if (template.block && opts.blockKinds?.length) {
    // One block slot per template by design: two content blocks on a 1080x1350
    // canvas stops being a post and starts being a spreadsheet.
    composition.blocks = [{ kind: opts.blockKinds[0], region: template.block }];
  }
  return composition;
}
