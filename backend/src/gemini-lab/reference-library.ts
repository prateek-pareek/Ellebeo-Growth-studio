/** Gemini Lab–only. Do not import from the /generate pipeline. */

import * as fs from 'fs';
import * as path from 'path';
import { scanReference, type ReferenceScan } from './reference-scan';

/**
 * The studio's own designed slides, used as arrangements for new posts.
 *
 * The built-in template library is 21 hand-authored layouts, and the planner
 * only ever sees a slice of it: 2 for a before/after, 4 for a full-bleed. That
 * is the whole reason a studio's feed comes back looking the same every run —
 * no prompt fixes a pool of two.
 *
 * A studio already owns hundreds of finished slides. Each one is a usable
 * arrangement, and needs no geometry extraction to be one: the image goes
 * straight to the page designer, blurred so only its structure survives.
 *
 * Slides are classified once, at startup, by scanReference — the model cannot
 * be trusted to say whether its own reference carries a photograph, so the
 * pixels decide. Only slides that really do carry one are offered for a post
 * built around a client photo.
 */

export type ReferenceLayout = {
  id: string;
  file: string;
  scan: ReferenceScan;
};

const DIR = process.env['GEMINI_LAB_REFERENCE_DIR'] || path.join(process.cwd(), 'assets', 'reference-layouts');

let cache: ReferenceLayout[] | null = null;

/** Everything in the folder, classified. Read once and kept. */
export async function loadReferenceLibrary(): Promise<ReferenceLayout[]> {
  if (cache) return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  } catch {
    cache = [];
    return cache;
  }

  const out: ReferenceLayout[] = [];
  for (const f of files) {
    const file = path.join(DIR, f);
    try {
      const scan = await scanReference(fs.readFileSync(file));
      out.push({ id: f.replace(/\.[^.]+$/, ''), file, scan });
    } catch {
      // A slide that cannot be read is simply not in the library.
    }
  }
  cache = out;
  return cache;
}

/**
 * A reference for this post, or null to let the designer compose freely.
 *
 * `avoid` carries the ids this run has already used, so four options do not all
 * land on the same arrangement — which would reproduce the very sameness the
 * library exists to fix.
 */
export async function pickReference(params: {
  needsPhoto: boolean;
  avoid?: readonly string[];
  random?: () => number;
}): Promise<ReferenceLayout | null> {
  const all = await loadReferenceLibrary();
  if (all.length === 0) return null;

  // A reference is only useful for a client-photo post if the photograph is
  // the point of it.
  //
  // A type-led deck — headline, body copy, a small framed inset — teaches the
  // model to make a small framed inset. A real run against one produced posts
  // with the client at 12% and 14% of the canvas, and rejected half the
  // options outright. The layout was faithfully reproduced; it was simply the
  // wrong layout to hand a post that exists to show someone's hair.
  const MIN_PHOTO_LED = 0.25;
  const usable = all.filter((r) =>
    params.needsPhoto
      ? r.scan.kind === 'photo' && r.scan.photoArea >= MIN_PHOTO_LED
      : r.scan.kind === 'typographic',
  );
  // No photo-led reference is better than a bad one: the caller composes
  // freely, which is what it did before any of this existed.
  if (usable.length === 0) return null;

  const avoid = new Set(params.avoid ?? []);
  const fresh = usable.filter((r) => !avoid.has(r.id));
  const pool = fresh.length > 0 ? fresh : usable;
  const rnd = params.random ?? Math.random;
  return pool[Math.floor(rnd() * pool.length)] ?? null;
}

/** What the library holds, for logging and for a health check. */
export async function describeLibrary(): Promise<{
  total: number;
  photo: number;
  photoLed: number;
  typographic: number;
  dir: string;
}> {
  const all = await loadReferenceLibrary();
  return {
    total: all.length,
    photo: all.filter((r) => r.scan.kind === 'photo').length,
    // The ones actually offered for a client-photo post.
    photoLed: all.filter((r) => r.scan.kind === 'photo' && r.scan.photoArea >= 0.25).length,
    typographic: all.filter((r) => r.scan.kind === 'typographic').length,
    dir: DIR,
  };
}

/** Clears the cache. Tests only. */
export function resetReferenceLibrary(): void {
  cache = null;
}
