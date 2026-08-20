/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type {
  LabDecoration,
  LabLayout,
  PhotoShape,
  TypeScaleId,
} from './gemini-lab-compositor';
import type { PostFormat, PostFormatId } from './gemini-lab-formats';
import { allowancesFor, specialistsFor, templatesFor, TEMPLATES_BY_ID, type PostTemplate } from './templates';
import {
  pickAvoidingRecent,
  pickWithPreference,
  preferredValues,
  type LookSignature,
} from './guided-dna/creative-memory';

/**
 * The design axes the creative-director model does not actually vary.
 *
 * This is not a preference, it is a measurement that has been recorded in
 * this codebase twice already: left free to choose, the model returned
 * `format=statement, layout=cover, photoMode=framed` as its first option in
 * every single run, and `options[0]` is the one promoted to the user. That is
 * the whole of the "Gemini Lab generates one template every time" bug — the
 * generator is capable of hundreds of arrangements and reliably picks one.
 *
 * `format` was already assigned server-side for exactly this reason. The
 * remaining axes were left to prose ("photoMode must NOT be framed on both
 * options", "the two options must differ visually"), which does not work:
 * asking more firmly cannot beat a default this strong, and every one of
 * those paragraphs was a request the model was free to ignore. They are
 * assigned here instead, so variety is a property of the pipeline rather
 * than a hope about the model.
 *
 * What stays AI-authored is everything that needs judgement about THIS photo
 * and THIS brand: the copy, the grid regions, the numeric design brief, the
 * panels, the content of each block. The plan fixes *what kind of thing to
 * make*; the model still designs it.
 */
export type OptionPlan = {
  /** Which option this is, 0-based, across all providers. */
  index: number;
  format: PostFormatId;
  layout: LabLayout;
  photoMode: 'framed' | 'full_bleed' | 'dual_framed' | 'typographic';
  photoShape: PhotoShape;
  decoration: LabDecoration;
  typeScale: TypeScaleId;
  /**
   * The designed layout this option is set in.
   *
   * Geometry is no longer authored by the model — see templates.ts. The plan
   * picks a layout that suits the format and the photo mode, and the model
   * fills it.
   */
  templateId: string;
};

export const LAB_LAYOUTS: LabLayout[] = [
  'cover',
  'split',
  'banner',
  'framed_cta',
  'type_step',
  'minimal_caption',
  'stacked_quote',
];

export const LAB_DECORATIONS: LabDecoration[] = ['none', 'hairline', 'corner', 'dots', 'grid', 'sparkle'];

/** Layouts whose preset geometry is a framed photo beside/above a type block. */
const FRAMED_LAYOUTS: LabLayout[] = ['cover', 'framed_cta', 'type_step', 'stacked_quote'];
/** Layouts whose preset geometry is a full-bleed photo with type over it. */
const FULL_BLEED_LAYOUTS: LabLayout[] = ['banner', 'minimal_caption'];

/**
 * Shapes that read as editorial beauty rather than as a slide. `rect` is kept
 * in the pool but the shaped crops are what stop two framed posts looking
 * like the same post, so they are not a rare special case here.
 */
const FRAMED_SHAPES: PhotoShape[] = ['rect', 'rounded', 'arch', 'circle', 'pill'];

/** Type-led families, for posters that have no photograph to lean on. */
const TYPOGRAPHIC_LAYOUTS: LabLayout[] = ['type_step', 'stacked_quote', 'framed_cta', 'cover'];

const TYPE_SCALES: TypeScaleId[] = ['compact', 'balanced', 'dramatic'];

/**
 * Formats that are posters, not photographs with captions.
 *
 * A price list, a sale and "three slots left this week" are commercial
 * artwork: the message IS the design. Putting a client's headshot behind a
 * price list does not make it more persuasive, it makes it look like a
 * different post with prices stuck on top — and it forced the technician to
 * supply an irrelevant photo (or the pipeline to spend an image-generation
 * call inventing a decorative still life) before a sale post could exist at
 * all. These are always set typographically, photo or no photo.
 */
const POSTER_FORMATS = new Set<PostFormatId>(['menu', 'offer', 'availability']);

export type PlanContext = {
  /** Formats this generation may choose from — already filtered for photos and available facts. */
  formats: PostFormat[];
  /** Format the technician explicitly picked in the Lab UI. Wins for option 0 when it is available. */
  requestedFormat?: string;
  /** Two real photographs of one client, so `split` / `dual_framed` are honest. */
  isPair: boolean;
  /** Is there any photograph to place? Without one, every option is a poster. */
  hasPhoto: boolean;
  /** What this brand has already been served — every axis is weighted away from these. */
  recentLooks: LookSignature[];
  /** True when the chosen format carries a content block, so a layout without a slot for one will not do. */
  needsBlock?: (format: PostFormatId) => boolean;
  /** The salon's layout library — the shared set plus any of its own. Defaults to the built-ins. */
  library?: PostTemplate[];
  /**
   * A layout read from this run's style reference.
   *
   * Treated as fit for every option, not merely preferred: the technician
   * uploaded a picture and said "like this", which is a stronger signal about
   * this post than anything the system inferred on its own.
   */
  referenceLayoutId?: string | null;
};

/**
 * One plan per option, each visibly different from the others AND from what
 * this brand was served recently.
 *
 * The guarantees are structural, not statistical: no two options share a
 * layout or a format while the pools allow it, and — the specific failure
 * that was being asked for in prose — options never all come back `framed`.
 */
export function buildOptionPlans(count: number, ctx: PlanContext): OptionPlan[] {
  const formatPool = ctx.formats.map((f) => f.id);
  const recentFormats = recentValues(ctx.recentLooks, (l) => l.format);
  // What the studio has actually PICKED, as opposed to what it was served.
  // Only chosen looks carry preference — see preferredValues.
  const likedFormats = preferredValues(ctx.recentLooks, (l) => l.format);
  const likedDecorations = preferredValues(ctx.recentLooks, (l) => l.decoration);
  const recentModes = recentValues(ctx.recentLooks, (l) => l.photoMode);
  const recentShapes = recentValues(ctx.recentLooks, (l) => l.photoShape);
  const recentDecorations = recentValues(ctx.recentLooks, (l) => l.decoration);

  const recentTemplates = recentValues(ctx.recentLooks, (l) => l.templateId);
  const likedTemplates = preferredValues(ctx.recentLooks, (l) => l.templateId);
  const usedTemplates: string[] = [];
  const usedFormats: PostFormatId[] = [];
  const usedLayouts: LabLayout[] = [];
  const usedModes: OptionPlan['photoMode'][] = [];
  const plans: OptionPlan[] = [];

  for (let index = 0; index < count; index += 1) {
    // An explicit pick from the UI owns EVERY option — but only if it survived
    // availableFormats(), so a format needing prices or a second photo can
    // never be forced into existence and then have to invent what it claims.
    //
    // This used to own option 0 only, and the other three picked freely from
    // the pool. The intent was variety, but it produced the wrong kind: ask for
    // a sale with "20% off all balayage before 30 September" and you got one
    // offer poster plus a lash-mapping process card, an availability post and a
    // myth-buster — three of four ignoring both the format and the facts the
    // technician had just typed. Variety belongs in the ANGLE, palette, layout
    // and typography, all of which still vary per option below; it does not
    // belong in silently changing what the post is about.
    const requested =
      ctx.requestedFormat && formatPool.includes(ctx.requestedFormat as PostFormatId)
        ? (ctx.requestedFormat as PostFormatId)
        : null;
    const format =
      requested ??
      pickPreferred<PostFormatId>(
        formatPool,
        usedFormats,
        [...(recentFormats as PostFormatId[]), ...usedFormats],
        likedFormats as PostFormatId[],
      ) ??
      formatPool[0] ??
      'statement';
    usedFormats.push(format);

    // A reference layout owns the first option outright.
    //
    // Weighting it was not enough: the plan balances photo modes so the set is
    // never all one thing, which meant a framed reference could only surface
    // in the framed slot and reached about half of runs. Someone who uploads a
    // picture and says "like this" should see it, so option 1 simply is it —
    // and the remaining options still vary as usual, so the run keeps offering
    // real alternatives.
    const reference =
      index === 0 && ctx.referenceLayoutId
        ? (ctx.library ?? []).find((t) => t.id === ctx.referenceLayoutId)
        : undefined;

    const photoMode = reference
      ? reference.photoMode
      : pickPhotoMode({
          index, count, format, isPair: ctx.isPair, hasPhoto: ctx.hasPhoto, usedModes, recentModes,
        });
    usedModes.push(photoMode);

    // The layout itself: a designed template, chosen for this format and this
    // photo mode, weighted away from what this brand has just been served and
    // toward what it has actually picked before.
    const pool = templatesFor({
      photoMode,
      format,
      needsBlock: ctx.needsBlock?.(format) ?? false,
      library: ctx.library,
    });
    // A layout drawn for this format leads the weighting — the plan is told
    // which are purpose-built rather than inferring it from list order, which
    // a weighted pick cannot see. Still a lean, not a lock: a price list can
    // occasionally land in a general poster, it just should not by default.
    const template =
      reference ??
      pickTemplate(
        pool,
        usedTemplates,
        [...recentTemplates, ...usedTemplates],
        likedTemplates,
        [
          ...(ctx.referenceLayoutId ? [ctx.referenceLayoutId] : []),
          ...specialistsFor(format, photoMode),
        ],
      ) ?? pool[0];
    if (!template) throw new Error('No layout available for this post — the template library is empty.');
    usedTemplates.push(template.id);

    const layoutPool = layoutsFor(photoMode, ctx.isPair);
    const layout =
      pickDistinct(layoutPool, usedLayouts, usedLayouts) ?? layoutPool[0] ?? 'cover';
    usedLayouts.push(layout);

    // A full-bleed photo has no frame to shape, so shape only means something
    // for a framed one — offering it there would be a decision with no effect.
    const photoShape: PhotoShape =
      photoMode === 'framed' ? pickAvoidingRecent(FRAMED_SHAPES, recentShapes as PhotoShape[]) : 'rect';
    // The layout's own tolerances win over the general rule. A dense price
    // card set "dramatic" pushes its list off the canvas, and a comparison
    // needs its labels small — those are properties of the design, not
    // preferences, so the template gets the final say.
    const allows = allowancesFor(template);
    const scalePool = allows.typeScale.length ? allows.typeScale : TYPE_SCALES;
    const typeScale = photoMode === 'typographic' && scalePool.includes('dramatic')
      ? 'dramatic'
      : pickAvoidingRecent(scalePool, []);

    plans.push({
      index,
      format,
      templateId: template.id,
      layout,
      photoMode,
      // Constrained to the silhouettes this layout was designed around — an
      // arch in a slot drawn for a circle is not variety, it is a mistake.
      photoShape: template.photoShapes?.length
        ? pickAvoidingRecent(template.photoShapes, recentShapes as PhotoShape[])
        : photoShape,
      // A layout that says no motif gets none — a dense poster carrying a
      // sparkle as well as a price list is noise, not decoration.
      decoration: allows.decoration
        ? pickWithPreference(
            LAB_DECORATIONS,
            recentDecorations as LabDecoration[],
            likedDecorations as LabDecoration[],
          )
        : 'none',
      typeScale,
    });
  }
  return plans;
}

function pickPhotoMode(ctx: {
  index: number;
  count: number;
  format: PostFormatId;
  isPair: boolean;
  hasPhoto: boolean;
  usedModes: OptionPlan['photoMode'][];
  recentModes: string[];
}): OptionPlan['photoMode'] {
  // The message is the artwork — see POSTER_FORMATS.
  if (POSTER_FORMATS.has(ctx.format)) return 'typographic';
  // Nothing to place. Previously this case demanded an uploaded photo or an
  // invented one; a poster is the honest answer.
  if (!ctx.hasPhoto) return 'typographic';
  // A genuine before/after is a structural fact about the photos, not a style
  // choice — one option should show them side by side.
  if (ctx.isPair && !ctx.usedModes.includes('dual_framed')) return 'dual_framed';

  // Balanced, not merely "not all the same". Two reasons, both concrete: a
  // set that came back 3 full_bleed to 1 framed would exhaust the two
  // full-bleed layouts and have to repeat one, and an even split is what
  // actually gives the technician a real choice rather than three of one
  // thing and a token alternative.
  const framed = ctx.usedModes.filter((m) => m === 'framed').length;
  const bleed = ctx.usedModes.filter((m) => m === 'full_bleed').length;
  if (framed > bleed) return 'full_bleed';
  if (bleed > framed) return 'framed';
  return pickAvoidingRecent(['framed', 'full_bleed'] as const, ctx.recentModes as Array<'framed' | 'full_bleed'>);
}

/**
 * Fallback layout for a carousel slide the model did not compose.
 *
 * Measured in the logs: the model authors a composition for slide 0 and
 * nothing else, so every later slide fell back to the SAME preset — slides 2
 * and 3 of a three-slide carousel came out byte-identical (`photo@RB
 * type@LM` on both). One carousel that repeats itself is the "same template"
 * complaint in miniature, inside a single post.
 *
 * Rotating the layout per slide means the presets differ even when the model
 * gives us nothing, so a carousel reads as a sequence rather than a stutter.
 */
export function slideLayout(plan: OptionPlan, slideIndex: number, isPair: boolean): LabLayout {
  if (slideIndex <= 0) return plan.layout;
  const pool = layoutsFor(plan.photoMode, isPair);
  if (pool.length <= 1) return plan.layout;
  const start = Math.max(0, pool.indexOf(plan.layout));
  return pool[(start + slideIndex) % pool.length];
}

function layoutsFor(photoMode: OptionPlan['photoMode'], isPair: boolean): LabLayout[] {
  // Layout selects the typographic family, so a poster wants the families
  // built around large type carrying the frame on its own.
  if (photoMode === 'typographic') return TYPOGRAPHIC_LAYOUTS;
  if (photoMode === 'dual_framed') return isPair ? ['split'] : FRAMED_LAYOUTS;
  return photoMode === 'full_bleed' ? FULL_BLEED_LAYOUTS : FRAMED_LAYOUTS;
}

/**
 * Prefer an option this run has not used yet; fall back to the weighted pick
 * once the pool is exhausted, so a small pool degrades to "repeated but still
 * varied" rather than throwing.
 */
function pickDistinct<T extends string>(pool: readonly T[], used: readonly T[], avoid: readonly T[]): T | null {
  if (!pool.length) return null;
  const fresh = pool.filter((item) => !used.includes(item));
  return pickAvoidingRecent(fresh.length ? fresh : pool, avoid as T[]);
}

/** A layout this run has not used yet, leaning toward ones the brand has picked before. */
function pickTemplate(
  pool: readonly PostTemplate[],
  used: readonly string[],
  avoid: readonly string[],
  preferred: readonly string[],
  fitFor: readonly string[] = [],
): PostTemplate | null {
  if (!pool.length) return null;
  const fresh = pool.filter((t) => !used.includes(t.id));
  const from = fresh.length ? fresh : pool;
  const id = pickWithPreference(
    from.map((t) => t.id),
    avoid as string[],
    preferred as string[],
    fitFor as string[],
  );
  // Resolved inside the pool: a tenant's own layout shares a key with the
  // shared one it overrides, and the global map would hand back the wrong one.
  return from.find((t) => t.id === id) ?? from[0];
}

/** pickDistinct, but leaning toward what this brand has chosen before. */
function pickPreferred<T extends string>(
  pool: readonly T[],
  used: readonly T[],
  avoid: readonly T[],
  preferred: readonly T[],
): T | null {
  if (!pool.length) return null;
  const fresh = pool.filter((item) => !used.includes(item));
  return pickWithPreference(fresh.length ? fresh : pool, avoid as T[], preferred as T[]);
}

/** Newest-last list of a single axis across remembered looks, deduped. */
function recentValues(looks: LookSignature[], read: (l: LookSignature) => string | null | undefined): string[] {
  return Array.from(new Set(looks.map(read).filter((v): v is string => !!v)));
}

/**
 * What each layout id FEELS like. These moved here from the prompt builder
 * with their menus: once layout is assigned rather than chosen, the model no
 * longer needs a menu to pick from — it needs to know what the one it was
 * given is meant to read as, so it can write and compose toward that.
 */
const LAYOUT_FEEL: Record<LabLayout, string> = {
  cover: 'premium editorial split — photo on one side, headline block on the other',
  split: 'two framed photos side by side, honest comparison',
  banner: 'bold, graphic, editorial cover-story energy — white type sitting on the photo',
  framed_cta: 'confident print-ad energy for a booking beat',
  type_step: 'large type carries the slide, the photo supports it — process/education energy',
  minimal_caption: 'quiet and confident, almost no chrome, the photograph carries everything',
  stacked_quote: 'magazine spread — photo above, a large pull-quote-style headline beneath',
};

const DECORATION_FEEL: Record<LabDecoration, string> = {
  none: 'no extra mark — let the mood carry it',
  hairline: 'a single quiet rule above the type — editorial, restrained',
  corner: 'a small open bracket in a far corner — quiet-luxury, unobtrusive',
  dots: 'a loose scatter of small dots away from the text — organic, playful',
  grid: 'fine tick marks along a margin — clinical, precise',
  sparkle: 'one small sparkle mark near the accent rule — a touch of shine',
};

/**
 * How each KIND of post is actually art-directed.
 *
 * The format briefs in gemini-lab-formats.ts say what a format IS, for
 * choosing between them. They say nothing about how to design one, so every
 * format was handed the same generic direction and came back as the same
 * arrangement with different words in it. A price list and a myth-buster are
 * not the same design problem: one is a table that must be scannable at
 * thumb-speed, the other is a two-sided comparison that only works if the
 * two sides are visibly opposed.
 */
const FORMAT_DIRECTION: Record<PostFormatId, string> = {
  statement: 'One idea, said once. The headline is the whole post — set it large and give it room. Resist adding a subhead that repeats it.',
  proof: 'Let the two photographs argue. Keep the type out of their way: a short label on each and one line of context. Never crop the pair unevenly — matched framing is what makes the comparison honest.',
  process: 'Numbered steps, in the order they happen. Each step label is 2-4 words; the detail line earns its place only if it says something the label cannot. Even spacing down the block — a process that looks irregular reads as improvised.',
  myth: 'Two sides, visibly opposed. The myth and the fact must not look like two items on one list — separate them, and let the correction be the louder half.',
  tips: 'A list built to be saved and re-read. Short, parallel phrasing — every item starts the same grammatical way. Four items beats six.',
  menu: 'A price list is a table. Labels flush left, prices flush right, one shared right edge, even rows. Scannability beats decoration: someone is looking for one number.',
  offer: 'Lead with the saving, then the deadline. The badge carries the number and should be the first thing seen. Everything else is small — an offer post that buries its own figure has failed.',
  availability: 'Urgency through scarcity, stated plainly. Few words, large. The slots are the content; do not dress them up.',
  testimonial: 'The client speaks, the studio stays quiet. Set the quote large enough to be read as a quote, attribute it small, and add nothing that argues alongside it.',
  intro: 'A person, not a service. Warmth over polish — the photograph carries the trust and the copy carries the reason to care.',
  occasion: 'Timely and warm, never salesy. Name the occasion, connect it to the studio in one line, and stop. No discount unless one was actually given.',
  own: 'The studio wrote this. Design around their words exactly as written — your job is typography and hierarchy, not editing.',
};

/** One block per option, for the prompt. Says what is fixed; everything unsaid stays the model's call. */
export function describePlan(plan: OptionPlan, formats: PostFormat[]): string {
  const format = formats.find((f) => f.id === plan.format);
  const template = TEMPLATES_BY_ID.get(plan.templateId);
  const mode =
    plan.photoMode === 'typographic'
      ? '"typographic" — THERE IS NO PHOTOGRAPH ON THIS POST. It is a designed poster: brand colour fields, large type and the content block carry the whole frame. Do not write copy that describes a photo, a person or a result you can see, and do not supply a photoRegion. Use panels to block in colour, and give the type and the block the real estate a photo would have taken.'
      : plan.photoMode === 'full_bleed'
      ? '"full_bleed" — the photo fills the whole canvas and the type sits over it, so set typeOnPhoto true'
      : plan.photoMode === 'dual_framed'
        ? '"dual_framed" — the before and after side by side'
        : `"framed" — the photo sits in its own region, cropped to a "${plan.photoShape}" silhouette`;
  if (plan.photoMode === 'typographic') {
    return [
      `OPTION ${plan.index + 1}:`,
      `  format: "${plan.format}"${format ? ` — ${format.brief}` : ''}`,
      `  ART DIRECTION: ${FORMAT_DIRECTION[plan.format]}`,
      `  This is ARTWORK — there is no photograph. It will be designed and rendered from your words alone, so write copy worth setting large: a line someone stops for. Give it the content the format needs and nothing else. The design is not your problem.`,
      `  Echo "format" back in the JSON.`,
    ].join(String.fromCharCode(10));
  }

  return [
    `OPTION ${plan.index + 1} — these are fixed, not choices:`,
    `  format: "${plan.format}"${format ? ` — ${format.brief}` : ''}`,
    `  ART DIRECTION for this format: ${FORMAT_DIRECTION[plan.format]}`,
    `  photoMode: ${mode}`,
    `  layout: "${plan.layout}" — ${LAYOUT_FEEL[plan.layout]}. This selects the typographic family only.`,
    template
      ? `  THE PAGE IS ALREADY DESIGNED — "${template.name}": ${template.intent} You are writing INTO this layout, so keep the headline short enough to sit in the space it gives you. Do not supply a composition, a photoRegion or a textRegion; they are set.`
      : '',
    `  decoration: "${plan.decoration}" — ${DECORATION_FEEL[plan.decoration]}`,
    `  typeScale: "${plan.typeScale}"${plan.photoMode === 'framed' ? `  ·  photoShape: "${plan.photoShape}"` : ''}`,
    `  Echo these values back verbatim in the JSON. Everything else — the copy, the grid regions, the design numbers, the panels, the block content — is yours to design for THIS photo and THIS brand.`,
  ]
    .filter(Boolean)
    .join('\n');
}
