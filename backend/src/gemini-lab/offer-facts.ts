/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { FormatContent } from './gemini-lab-blocks';
import type { PostFormatId } from './gemini-lab-formats';

/**
 * Verifies that every figure on a commercial post came from the studio.
 *
 * The prompt already says it: "Every price, percentage, date and deadline on
 * the post must come from that text." Nothing checked. A prompt is a request,
 * and a model that rounds $65 to $70, shifts a deadline by a week, or adds a
 * plausible-looking "was $180" produces a post that is wrong in the one way
 * that actually costs a studio money and trust — a customer arrives expecting
 * the price on the picture.
 *
 * This is the same discipline the rest of the pipeline already uses for the
 * things models get wrong reliably: verify server-side rather than ask nicely.
 * Anything carrying a figure the studio did not supply is dropped before it
 * can be rendered.
 *
 * Deliberately scoped to the commercial formats. Elsewhere a number is
 * usually harmless ("3 signs you need a refill"), and checking everything
 * would strip good copy for no gain.
 */

export const COMMERCIAL_FORMATS: PostFormatId[] = ['offer', 'menu', 'availability'];

export function isCommercialFormat(id: PostFormatId | undefined): boolean {
  return !!id && COMMERCIAL_FORMATS.includes(id);
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * The claims a reader would act on: amounts, percentages, and dates.
 *
 * Currency symbols are dropped deliberately — "$120" and "120" are the same
 * claim, and a studio writing "120" should not have the post rejected for
 * rendering "$120". Month names are normalised to three letters so "31 Aug"
 * matches "31 August".
 */
export function extractFigures(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: string[] = [];

  // Percentages first, so "20%" is not also counted as the bare number 20.
  const percents = new Set<string>();
  for (const m of lower.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
    const value = normaliseNumber(m[1]);
    percents.add(value);
    out.push(`${value}%`);
  }

  for (const m of lower.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = normaliseNumber(m[0]);
    if (percents.has(value)) continue;
    out.push(value);
  }

  for (const month of MONTHS) {
    // Matches the full name and any leading abbreviation of at least three
    // letters, so "sept", "sep" and "september" all resolve to one token.
    const re = new RegExp(`\\b${month.slice(0, 3)}[a-z]*\\b`, 'g');
    for (const m of lower.matchAll(re)) {
      if (month.startsWith(m[0])) out.push(month.slice(0, 3));
    }
  }
  return out;
}

function normaliseNumber(raw: string): string {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : raw;
}

/** Figures asserted by `candidate` that the studio's own words never mention. */
export function unsupportedFigures(candidate: string, source: string): string[] {
  const supported = new Set(extractFigures(source));
  return [...new Set(extractFigures(candidate))].filter((f) => !supported.has(f));
}

export type OfferAudit = {
  content: FormatContent | undefined;
  /** Human-readable list of what was removed, for the log and the retry feedback. */
  removed: string[];
  /** A figure the studio never supplied appears in copy that cannot simply be dropped. */
  copyIsUnsupported: boolean;
};

/**
 * Strips every unsupported claim from a commercial post.
 *
 * Rows and badges are dropped individually — a price list missing one line is
 * still true, whereas a price list containing one invented line is not. Copy
 * (headline/subhead/CTA) cannot be repaired by deletion without mangling the
 * sentence, so it is reported instead and the caller fails the option, which
 * routes it into the existing regeneration pass with feedback.
 */
export function auditOfferContent(params: {
  format: PostFormatId | undefined;
  content: FormatContent | undefined;
  copy: Array<string | undefined>;
  offerDetails: string | undefined;
}): OfferAudit {
  const source = params.offerDetails?.trim();
  if (!isCommercialFormat(params.format) || !source) {
    return { content: params.content, removed: [], copyIsUnsupported: false };
  }

  const removed: string[] = [];
  const content: FormatContent = { ...(params.content ?? {}) };

  if (content.rows?.length) {
    const kept = content.rows.filter((row) => {
      const bad = unsupportedFigures(`${row.label} ${row.value}`, source);
      if (bad.length) removed.push(`row "${row.label} ${row.value}" (${bad.join(', ')} not supplied)`);
      return bad.length === 0;
    });
    if (kept.length) content.rows = kept;
    else delete content.rows;
  }

  if (content.badge) {
    const bad = unsupportedFigures(content.badge, source);
    if (bad.length) {
      removed.push(`badge "${content.badge}" (${bad.join(', ')} not supplied)`);
      delete content.badge;
    }
  }

  const copyIsUnsupported = params.copy.some(
    (line) => !!line && unsupportedFigures(line, source).length > 0,
  );

  return {
    content: Object.keys(content).length ? content : undefined,
    removed,
    copyIsUnsupported,
  };
}
