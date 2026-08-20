/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { LabTypography, MoodHint } from './gemini-lab-compositor';
import { pickAvoidingRecent } from './guided-dna/creative-memory';

/**
 * Per-post type pairings, drawn from the faces that suit the brand's mood.
 *
 * Typography was the most static thing left in the pipeline: `TYPE_PAIRINGS`
 * maps each of the six moods to exactly ONE heading/body pair, so every post a
 * salon ever publishes is set in the same two faces at the same weight. On a
 * typographic poster the type IS the design, which makes this the single most
 * visible source of "every generation looks the same".
 *
 * It is also why two different salons are indistinguishable: with six moods
 * and one pairing each, a thousand studios share six typographic identities.
 *
 * Each mood below lists several pairings that genuinely belong to its
 * character — an editorial-minimal brand can be set in Cormorant or Playfair
 * or Fraunces and still read as editorial-minimal; it cannot be set in Outfit
 * without becoming a different brand. So this widens the pool without letting
 * a brand drift off its own mood, exactly like palette-variation.ts does for
 * colour.
 *
 * The brand's own configured pairing is always included and is never dropped —
 * a studio that deliberately chose its fonts still sees them regularly.
 */

const ALTERNATIVES: Record<MoodHint, LabTypography[]> = {
  SOFT_GLAM: [
    { heading: 'Playfair Display', body: 'Inter' },
    { heading: 'Cormorant Garamond', body: 'Inter' },
    { heading: 'Fraunces', body: 'Inter' },
    { heading: 'Playfair Display', body: 'Source Sans 3' },
  ],
  CLEAN_CLINICAL: [
    { heading: 'Inter', body: 'Inter' },
    { heading: 'Outfit', body: 'Inter' },
    { heading: 'Source Sans 3', body: 'Inter' },
    { heading: 'Inter', body: 'Source Sans 3' },
  ],
  EDITORIAL_MINIMAL: [
    { heading: 'Cormorant Garamond', body: 'Inter' },
    { heading: 'Playfair Display', body: 'Inter' },
    { heading: 'Fraunces', body: 'Source Sans 3' },
    { heading: 'Cormorant Garamond', body: 'Source Sans 3' },
  ],
  NATURAL_ORGANIC: [
    { heading: 'Fraunces', body: 'Source Sans 3' },
    { heading: 'Cormorant Garamond', body: 'Source Sans 3' },
    { heading: 'Fraunces', body: 'Inter' },
    { heading: 'Playfair Display', body: 'Source Sans 3' },
  ],
  BOLD_LUXE: [
    { heading: 'Cinzel', body: 'Inter' },
    { heading: 'Playfair Display', body: 'Inter' },
    { heading: 'Cinzel', body: 'Source Sans 3' },
    { heading: 'Fraunces', body: 'Inter' },
  ],
  PLAYFUL_FRESH: [
    { heading: 'Outfit', body: 'Inter' },
    { heading: 'Fraunces', body: 'Inter' },
    { heading: 'Outfit', body: 'Source Sans 3' },
    { heading: 'Source Sans 3', body: 'Inter' },
  ],
};

export function pairingId(t: LabTypography): string {
  return `${t.heading}/${t.body}`;
}

/**
 * A pairing for this post: the brand's own, or a sibling that suits the same
 * mood, weighted away from whatever was used recently.
 *
 * Falls back to the brand pairing whenever the mood is unknown, so a tenant
 * without a completed profile keeps exactly the behaviour it had.
 */
export function pickTypePairing(
  brandPairing: LabTypography,
  mood: MoodHint | undefined,
  recentIds: readonly string[] = [],
): LabTypography {
  const pool = mood ? ALTERNATIVES[mood] : undefined;
  if (!pool?.length) return brandPairing;

  // The brand's configured pairing always stays in the running.
  const byId = new Map<string, LabTypography>();
  byId.set(pairingId(brandPairing), brandPairing);
  for (const p of pool) byId.set(pairingId(p), p);

  const ids = [...byId.keys()];
  const chosen = pickAvoidingRecent(ids, recentIds as string[]);
  return byId.get(chosen) ?? brandPairing;
}
