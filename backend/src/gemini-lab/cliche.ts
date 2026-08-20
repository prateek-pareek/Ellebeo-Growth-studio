/** Gemini Lab–only. Do not import from the /generate pipeline. */

/**
 * Catches the beauty-industry filler that a prompt cannot talk the model out of.
 *
 * The shipped instructions name these phrases and forbid them explicitly. A
 * real run with that wording in place still produced "bespoke" twice,
 * "effortless", "enhance your natural beauty", "experience the" and "radiant"
 * across three of three options. This is the same lesson as the hex codes and
 * the typeface names: an instruction not to do something is not a mechanism,
 * and the only reliable fix is to check afterwards.
 *
 * So the list lives here as data, the copy is measured against it, and
 * anything that trips it is sent back for one targeted rewrite. The prompt
 * still carries the guidance — that raises the floor — but nothing depends on
 * it being obeyed.
 */

/**
 * Phrases that mark a line as could-be-any-salon.
 *
 * Every entry has been observed in real output from this pipeline. They are
 * matched case-insensitively on word boundaries, so "discovery" and
 * "radiantly" do not trip "discover" or "radiant" by accident.
 */
export const CLICHES: readonly string[] = [
  'dreaming of',
  'unlock the secret',
  'unlock your',
  'elevate your',
  'experience the',
  'step into a world',
  'discover',
  'transform your',
  'effortless',
  'effortlessly',
  'stunning',
  'gorgeous',
  'bespoke',
  'curated',
  'radiant',
  'luxurious',
  'indulge',
  'pamper',
  'enhance your natural beauty',
  'your best self',
  'hair goals',
  'hair game',
  'tells a story',
  'works of art',
  'masterpiece',
];

const PATTERNS: ReadonlyArray<{ phrase: string; re: RegExp }> = CLICHES.map((phrase) => ({
  phrase,
  // Word boundaries at both ends so "discovery" survives while "discover" does
  // not, and multi-word phrases still match across a single space.
  re: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i'),
}));

/** Every cliché present in the text, in the order they appear in the list. */
export function findCliches(text: string): string[] {
  if (!text) return [];
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.phrase);
}

export type CopyFields = {
  headline?: string;
  subhead?: string;
  hook?: string;
  body?: string;
  cta?: string;
};

/** Which fields of a post carry filler, and which phrases they carry. */
export function auditCopy(copy: CopyFields): Array<{ field: keyof CopyFields; found: string[] }> {
  const out: Array<{ field: keyof CopyFields; found: string[] }> = [];
  for (const field of ['headline', 'subhead', 'hook', 'body', 'cta'] as const) {
    const found = findCliches(copy[field] ?? '');
    if (found.length) out.push({ field, found });
  }
  return out;
}

/**
 * The rewrite brief for the offending lines.
 *
 * Deliberately narrow: it is given only the lines that failed and the phrases
 * that failed them, so a repair cannot quietly restyle a post that was already
 * good, and cannot reach any of the facts — the offer, the price, the quote —
 * that the post is built on.
 */
export function buildRepairPrompt(params: {
  copy: CopyFields;
  problems: Array<{ field: keyof CopyFields; found: string[] }>;
  brandVoice?: string;
}): string {
  const lines: string[] = [
    'These lines from a hair and beauty studio post use filler that could belong to any salon. Rewrite ONLY the lines listed, keeping their meaning and length.',
    '',
  ];
  for (const p of params.problems) {
    lines.push(`${p.field}: "${(params.copy[p.field] ?? '').trim()}"`);
    lines.push(`  remove: ${p.found.join(', ')}`);
  }
  lines.push('');
  if (params.brandVoice) lines.push(`Brand voice: ${params.brandVoice}`);
  lines.push(
    'Replace the filler with something concrete — a technique, a timeframe, a place, a number, or plain description.',
    'Do not add a price, a date, a discount or a client quote that is not already in the line.',
    'Keep each rewritten line the same kind of line: a headline stays a headline, a call to action stays a call to action.',
    '',
    `Return JSON only: {${params.problems.map((p) => `"${p.field}":""`).join(',')}}`,
  );
  return lines.join('\n');
}

/** Merges a repair reply over the original, keeping anything the model dropped. */
export function applyRepair(copy: CopyFields, raw: string): CopyFields {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return copy;
  }
  const next: CopyFields = { ...copy };
  for (const field of ['headline', 'subhead', 'hook', 'body', 'cta'] as const) {
    const value = parsed?.[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    // A repair that reintroduces filler is not a repair.
    if (findCliches(trimmed).length) continue;
    next[field] = trimmed;
  }
  return next;
}
