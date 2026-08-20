/** Gemini Lab–only Brand DNA v2. Do not import from the /generate pipeline. */

import type { LabComposition, LabDecoration, MoodHint } from '../gemini-lab-compositor';

/**
 * Per-brand creative memory. Without this the pipeline is stateless: every
 * generation only knows "this brand, this photo", never "what did we already
 * give this brand last week" — so even a perfectly varied generator
 * eventually re-serves the same design. No prompt can fix that, because the
 * information simply isn't in the request.
 *
 * Modelled on growth-studio-poc/src/ai/creative-memory.ts, but persisted to
 * gemini_lab_brand_dna.recent_looks so it survives restarts and deploys.
 */

export const MAX_REMEMBERED_LOOKS = 8;

/**
 * A deliberately COARSE fingerprint of a rendered look. Exact float geometry
 * would never collide, so a precise signature would silently never match and
 * the whole avoid-list would be decorative. Quadrants + mode + mood is the
 * level at which two posts actually "look like the same post".
 */
export type LookSignature = {
  photoMode: LabComposition['photoMode'];
  /** Where the photo's centre sits, as a 3x3 grid cell id like 'C-R' (col-row). */
  photoCell: string;
  /** Where the type block's centre sits, same grid. */
  typeCell: string;
  /** Photo silhouette — an arch and a rectangle read as different designs even in the same position. */
  photoShape?: string;
  /** Grid cell of the headline, and of the CTA when placed separately — free placement means type position is now part of the look. */
  headlineCell?: string;
  ctaCell?: string;
  mood: MoodHint | null;
  decoration: LabDecoration | null;
  /**
   * What KIND of post this was (process, menu, testimonial…). This is the
   * strongest variety axis in the signature: a viewer scrolling a feed reads
   * two price cards as "the same post" even when the geometry differs, and
   * reads a price card next to a technique walkthrough as a real feed even
   * when both use the same grid.
   */
  format?: string;
  /** Which per-post colour treatment was used, so the next post picks a different ground. */
  paletteTreatment?: string;
  /** Heading/body pairing used, so consecutive posts are not set in the same faces. */
  typePairing?: string;
  /** Which designed layout carried the post — the strongest "same post again" signal there is. */
  templateId?: string;
  /**
   * True when the technician actually PICKED this option, false when it was
   * merely the one we promoted.
   *
   * Everything before this was an avoid-list: the system recorded what it
   * served and steered away from repeating itself. It never learned what the
   * studio liked, because the choice was thrown away — `recordLook` stored
   * `gated[0]` whether the technician picked option 1, option 4, or nothing at
   * all. A served look says "don't repeat this"; a chosen look says "this
   * studio likes this", and they must not be weighted the same way.
   */
  chosen?: boolean;
  at: string;
};

function cellOf(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const col = cx < 1 / 3 ? 'L' : cx < 2 / 3 ? 'C' : 'R';
  const row = cy < 1 / 3 ? 'T' : cy < 2 / 3 ? 'M' : 'B';
  return `${col}${row}`;
}

export function signatureOf(
  composition: LabComposition,
  mood: MoodHint | null,
  decoration: LabDecoration | null,
  format?: string,
  paletteTreatment?: string,
  typePairing?: string,
  templateId?: string,
): LookSignature {
  // The text group carries the headline; only a detached role sits apart.
  const headline = { box: composition.typeBox };
  const cta = composition.detached?.role === 'cta' ? composition.detached : undefined;
  return {
    photoMode: composition.photoMode,
    photoCell: cellOf(composition.photoBox.x, composition.photoBox.y, composition.photoBox.w, composition.photoBox.h),
    typeCell: cellOf(composition.typeBox.x, composition.typeBox.y, composition.typeBox.w, composition.typeBox.h),
    photoShape: composition.photoShape,
    headlineCell: headline ? cellOf(headline.box.x, headline.box.y, headline.box.w, headline.box.h) : undefined,
    ctaCell: cta ? cellOf(cta.box.x, cta.box.y, cta.box.w, cta.box.h) : undefined,
    mood,
    decoration,
    format,
    paletteTreatment,
    typePairing,
    templateId,
    at: new Date().toISOString(),
  };
}

/** Tolerates anything previously stored (or hand-edited) in the JSON column. */
export function parseRecentLooks(raw: unknown): LookSignature[] {
  if (!Array.isArray(raw)) return [];
  const out: LookSignature[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.photoMode !== 'string' || typeof r.photoCell !== 'string' || typeof r.typeCell !== 'string') continue;
    out.push({
      photoMode: r.photoMode as LabComposition['photoMode'],
      photoCell: r.photoCell,
      typeCell: r.typeCell,
      // These three were written by signatureOf() but dropped on the way back
      // in, so every remembered look degraded to geometry-only the moment it
      // was persisted: the avoid-list could never say "you already had an
      // arch here", and photoShape could never be weighted away from.
      photoShape: typeof r.photoShape === 'string' ? r.photoShape : undefined,
      headlineCell: typeof r.headlineCell === 'string' ? r.headlineCell : undefined,
      ctaCell: typeof r.ctaCell === 'string' ? r.ctaCell : undefined,
      mood: (typeof r.mood === 'string' ? r.mood : null) as MoodHint | null,
      decoration: (typeof r.decoration === 'string' ? r.decoration : null) as LabDecoration | null,
      format: typeof r.format === 'string' ? r.format : undefined,
      paletteTreatment: typeof r.paletteTreatment === 'string' ? r.paletteTreatment : undefined,
      typePairing: typeof r.typePairing === 'string' ? r.typePairing : undefined,
      templateId: typeof r.templateId === 'string' ? r.templateId : undefined,
      chosen: r.chosen === true,
      at: typeof r.at === 'string' ? r.at : new Date(0).toISOString(),
    });
  }
  return out.slice(-MAX_REMEMBERED_LOOKS);
}

export function appendLook(existing: LookSignature[], next: LookSignature): LookSignature[] {
  return [...existing, next].slice(-MAX_REMEMBERED_LOOKS);
}

/** Human-readable avoid-list for the prompt — newest first, since the most recent repeat is the most jarring. */
export function describeRecentLooks(looks: LookSignature[]): string[] {
  return [...looks]
    .reverse()
    .map((l) => [
      l.format ? `${l.format} post` : '',
      `photo ${l.photoMode}${l.photoShape && l.photoShape !== 'rect' ? ` (${l.photoShape})` : ''} @${l.photoCell}`,
      l.headlineCell ? `headline @${l.headlineCell}` : `type @${l.typeCell}`,
      l.ctaCell ? `cta @${l.ctaCell}` : '',
      l.mood ? l.mood.toLowerCase().replace(/_/g, ' ') : '',
      l.decoration && l.decoration !== 'none' ? l.decoration : '',
      l.paletteTreatment ? `${l.paletteTreatment} ground` : '',
      l.typePairing ? `set in ${l.typePairing}` : '',
      l.templateId ? `layout ${l.templateId}` : '',
    ].filter(Boolean).join(', '));
}

/**
 * Weighted pick that discourages — but never bans — recently used options.
 * Same blend growth-studio-poc proved out: a floor weight keeps exploration
 * alive, so a brand that has cycled through everything still gets choices
 * rather than an empty pool.
 */
export function pickAvoidingRecent<T extends string>(pool: readonly T[], recentlyUsed: readonly T[]): T {
  if (pool.length === 0) throw new Error('pickAvoidingRecent: empty pool');
  const recent = new Set(recentlyUsed.slice(-3));
  const weights = pool.map((item) => (recent.has(item) ? 0.08 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * What this brand has actively chosen, per axis, most recent last.
 *
 * Only looks the technician picked count. A look that was merely served
 * carries no preference information — treating the two the same would teach
 * the system that whatever it happened to promote was what the studio wanted.
 */
export function preferredValues(
  looks: LookSignature[],
  read: (l: LookSignature) => string | null | undefined,
): string[] {
  return looks.filter((l) => l.chosen).map(read).filter((v): v is string => !!v);
}

/**
 * Weighted pick that PREFERS what this brand has chosen before while still
 * steering away from what it was served most recently.
 *
 * The two pulls are deliberately different strengths: preference is a gentle
 * lean (a studio that likes deep grounds should get them often, not always),
 * while recency is a strong push (nobody wants the same post twice running).
 * A brand with no history behaves exactly as before.
 */
export function pickWithPreference<T extends string>(
  pool: readonly T[],
  recentlyUsed: readonly T[],
  preferred: readonly T[],
  /**
   * Options that are *right* for this job rather than merely liked — a layout
   * drawn for the format being made, say.
   *
   * Separate from `preferred` because the two are different claims and need
   * different strengths. Preference is a lean learned from behaviour and is
   * deliberately capped at 2.5x so a studio never gets locked in. Fitness is a
   * property of the design itself: expressing it by repeating an entry in
   * `preferred` could never exceed that cap, which is why a purpose-built
   * layout still lost three runs in four on its own format.
   */
  fitFor: readonly T[] = [],
): T {
  if (pool.length === 0) throw new Error('pickWithPreference: empty pool');
  const recent = new Set(recentlyUsed.slice(-3));
  const fit = new Set(fitFor);
  const likes = new Map<T, number>();
  for (const p of preferred) likes.set(p, (likes.get(p) ?? 0) + 1);

  const weights = pool.map((item) => {
    const base = recent.has(item) ? 0.08 : 1;
    // Caps the lean so a studio that picked one format three times does not
    // get locked into it forever — exploration has to survive.
    const lean = Math.min(2.5, 1 + (likes.get(item) ?? 0) * 0.5);
    // Strong enough to win comfortably, weak enough that recency can still
    // displace it — a purpose-built layout should be the default, not the only
    // answer a brand ever sees.
    const fitness = fit.has(item) ? 8 : 1;
    return base * lean * fitness;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
