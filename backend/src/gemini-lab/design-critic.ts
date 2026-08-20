/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { GridRegion } from './gemini-lab-blocks';
import type { LabCompositionInput } from './gemini-lab-compositor';

/**
 * Looks at the post that was actually rendered and says what to change.
 *
 * The existing quality gate does call vision on the render, but it asks one
 * composite yes/no question — "is this balanced, premium, and free of text
 * over the face?" — and a NO produces a generic reason. Nothing in the
 * pipeline could act on that: the retry regenerates the COPY from a sentence
 * of feedback and never touches the composition, so the geometry that caused
 * the failure came back unchanged. A judge that cannot say what is wrong
 * cannot improve anything.
 *
 * This returns structured, applicable edits against the same 12x12 grid the
 * composition was authored on, so a revision is a targeted change to the
 * design rather than a fresh roll of the dice.
 *
 * Deliberately narrow in what it may change: regions, alignment and scale.
 * It cannot rewrite copy, change the format, or introduce a photo — those are
 * decided upstream and re-deciding them here would make the pipeline's
 * guarantees unprovable.
 */

export type DesignCritique = {
  /** 0-100. The critic's own read of the rendered post. */
  score: number;
  /** What is wrong, in the critic's words. Empty when nothing is. */
  issues: string[];
  /** Applicable changes. Absent fields are left exactly as authored. */
  revision?: {
    photoRegion?: GridRegion;
    textRegion?: GridRegion;
    textAlign?: 'left' | 'center' | 'right';
    typeScale?: 'compact' | 'balanced' | 'dramatic';
    typeAlign?: 'top' | 'center' | 'bottom';
    blocks?: Array<{ kind: string; region: GridRegion }>;
  };
};

const CRITIC_MODEL = 'gemini-2.5-flash';

export const CRITIQUE_PROMPT = [
  'You are a senior art director reviewing a finished Instagram post for a premium beauty studio, before it is published.',
  'You are looking at the RENDERED image. Judge what you can actually see, not what was intended.',
  '',
  'Score it 0-100 on: is the type legible at thumbnail size; is the composition balanced and deliberate; does the type crowd or collide with the photo subject; is there dead space that makes it look unfinished; does it read as designed rather than as a template with the words swapped.',
  '',
  'Then, ONLY if the score is below 80, return a "revision" that fixes the biggest problem. The canvas is a 12x12 grid; regions are {"col":1-12,"row":1-12,"colSpan":n,"rowSpan":n}, 1-indexed, and must stay inside the grid.',
  'You may change ONLY these: photoRegion, textRegion, textAlign, typeScale, typeAlign, and the regions of existing blocks. You may not rewrite the words, change the kind of post, or add or remove a photo.',
  'Rules the renderer enforces, so a revision breaking them will be discarded: the photo and text regions must not overlap and must leave at least one grid cell of gutter; the text region needs at least 5 of the 12 columns; a block must not overlap the photo or the text.',
  '',
  'Common, fixable faults, in the order they matter: type sitting over a face or the busiest part of the photo; a text region too narrow so the headline wraps to four cramped lines; photo and text both centred so the post has no anchor; a large empty band because a region was over-allocated.',
  '',
  'Return JSON only, no prose:',
  '{"score":0,"issues":["..."],"revision":{"textRegion":{"col":1,"row":7,"colSpan":7,"rowSpan":4},"textAlign":"left","typeScale":"dramatic"}}',
  'If the post is good, return {"score":86,"issues":[]} with no revision.',
].join('\n');

function asRegion(raw: unknown): GridRegion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const col = Math.round(Number(r.col));
  const row = Math.round(Number(r.row));
  const colSpan = Math.round(Number(r.colSpan));
  const rowSpan = Math.round(Number(r.rowSpan));
  if (![col, row, colSpan, rowSpan].every(Number.isFinite)) return undefined;
  if (col < 1 || row < 1 || colSpan < 1 || rowSpan < 1) return undefined;
  if (col + colSpan - 1 > 12 || row + rowSpan - 1 > 12) return undefined;
  return { col, row, colSpan, rowSpan };
}

/** Parses the critic's reply. Anything malformed degrades to "no revision" rather than throwing. */
export function parseCritique(raw: string): DesignCritique | null {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const score = Number(parsed?.score);
  if (!Number.isFinite(score)) return null;

  const issues = Array.isArray(parsed?.issues)
    ? parsed.issues.map((i: unknown) => String(i).trim()).filter(Boolean).slice(0, 5)
    : [];

  const r = parsed?.revision;
  let revision: DesignCritique['revision'];
  if (r && typeof r === 'object') {
    const photoRegion = asRegion(r.photoRegion);
    const textRegion = asRegion(r.textRegion);
    const blocks = Array.isArray(r.blocks)
      ? r.blocks
          .map((b: any) => {
            const region = asRegion(b?.region);
            const kind = typeof b?.kind === 'string' ? b.kind : null;
            return region && kind ? { kind, region } : null;
          })
          .filter(Boolean)
          .slice(0, 3) as Array<{ kind: string; region: GridRegion }>
      : undefined;
    const textAlign = ['left', 'center', 'right'].includes(r.textAlign) ? r.textAlign : undefined;
    const typeScale = ['compact', 'balanced', 'dramatic'].includes(r.typeScale) ? r.typeScale : undefined;
    const typeAlign = ['top', 'center', 'bottom'].includes(r.typeAlign) ? r.typeAlign : undefined;
    if (photoRegion || textRegion || blocks?.length || textAlign || typeScale || typeAlign) {
      revision = { photoRegion, textRegion, blocks, textAlign, typeScale, typeAlign };
    }
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), issues, revision };
}

/**
 * Merges a revision onto the composition that produced the render.
 *
 * Only the named fields move. Everything the critic did not mention — the
 * photo mode, the shape, the panels, the block content — is carried through
 * untouched, so a revision cannot quietly undo a decision made upstream.
 */
export function applyRevision(
  composition: LabCompositionInput | undefined,
  revision: DesignCritique['revision'],
): LabCompositionInput | undefined {
  if (!composition || !revision) return composition;
  const next: LabCompositionInput = { ...composition };
  if (revision.photoRegion && composition.photoMode !== 'full_bleed' && composition.photoMode !== 'typographic') {
    next.photoRegion = revision.photoRegion;
    // A grid region supersedes any raw box the model authored, or the stale
    // box would win and the revision would appear to do nothing.
    delete (next as { photoBox?: unknown }).photoBox;
  }
  if (revision.textRegion) {
    next.textRegion = revision.textRegion;
    delete (next as { typeBox?: unknown }).typeBox;
  }
  if (revision.textAlign) next.textAlign = revision.textAlign;
  if (revision.typeScale) next.typeScale = revision.typeScale;
  if (revision.typeAlign) next.typeAlign = revision.typeAlign;
  if (revision.blocks?.length) next.blocks = revision.blocks;
  return next;
}

/** Asks the critic to look at a rendered post. Returns null when the call fails — never throws into the render path. */
export async function critiqueRender(params: {
  apiKey: string;
  png: Buffer;
  /** What the post was trying to be, so the critic judges it against its own brief. */
  brief: string;
  model?: string;
}): Promise<DesignCritique | null> {
  const model = params.model || process.env['GEMINI_CRITIC_MODEL'] || CRITIC_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${CRITIQUE_PROMPT}\n\nWhat this post is meant to be:\n${params.brief}` },
                { inlineData: { mimeType: 'image/png', data: params.png.toString('base64') } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );
    const json = (await res.json()) as any;
    if (!res.ok) return null;
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    return parseCritique(text);
  } catch {
    return null;
  }
}
