/** Gemini Lab–only. Do not import from the /generate pipeline. */

/**
 * The prompt as a product surface, not a string literal.
 *
 * Every instruction the creative director receives is currently welded into
 * gemini-lab.service.ts as a template literal. That has three costs:
 *
 *  1. A technician who knows their own market — "we never say 'pamper'",
 *     "our clients are bridal, lead with the occasion" — has no way to say
 *     so. The wizard captures a mood and a story; it cannot capture craft.
 *  2. Nobody can tell which wording produced which result. A prompt that
 *     lives in a diff has no version, no author, and no measurable effect.
 *  3. Improving one costs a deploy, which means in practice they are never
 *     improved — the same paragraphs have been carried forward untouched
 *     while the pipeline around them changed completely.
 *
 * This registry gives every block an id, a default, and a per-tenant
 * override. The defaults are the exact text the pipeline uses today, so
 * adopting the registry changes no output until somebody edits something.
 *
 * Guardrails stay OUT of here deliberately. A studio may rewrite how its
 * posts sound; it may not rewrite the rule that prices must come from its own
 * words, or that a client's quote cannot be invented. Those are correctness,
 * not taste, and they remain in code where they cannot be edited away.
 */

export type PromptBlockId =
  | 'role'
  | 'photo_reading'
  | 'copy_rules'
  | 'caption_rules'
  | 'composition_craft'
  | 'house_style';

export type PromptBlock = {
  id: PromptBlockId;
  /** Shown in the editor. */
  label: string;
  /** What editing this actually changes, in the technician's words. */
  help: string;
  /** The text the pipeline uses when the tenant has not overridden it. */
  default: string;
  /** Hard ceiling, so an override cannot crowd out the rest of the prompt. */
  maxChars: number;
};

export const PROMPT_BLOCKS: Record<PromptBlockId, PromptBlock> = {
  role: {
    id: 'role',
    label: 'Who is writing',
    help: 'The voice and seniority the AI writes with. Change this to shift how the whole post sounds.',
    default: [
      'You are the stylist who did this work, writing about it — not an agency writing about a salon.',
      'You have twenty years behind the chair, you art-direct the whole post, and you would be embarrassed to publish a sentence that could belong to any salon in the country.',
      'Write the way you would talk to a client in the chair: plainly, with the specific detail only someone who was there would know.',
    ].join(' '),
    maxChars: 600,
  },
  photo_reading: {
    id: 'photo_reading',
    label: 'How to read the photo',
    help: 'What the AI should notice in your photo before it writes anything.',
    default: [
      'Look at the photo and name three things that are TRUE OF THIS ONE and would be false of a stock photo: the exact tone of the colour, where the light is coming from, how the ends sit, what the room is.',
      'At least one of them must appear in the copy. If your headline would still make sense with a different photo above it, you have not looked at this one.',
    ].join(' '),
    maxChars: 800,
  },
  copy_rules: {
    id: 'copy_rules',
    label: 'On-image copy',
    help: 'Length and style rules for the words that appear ON the post. Your banned phrases go here.',
    default: [
      '- headline: 3–6 words, billboard-short and specific to what this post is about. No quotes, emoji, or filler ("the result", "new look", "amazing", "transformation" unless it is a true before/after).',
      '- subhead: one line, max 8 words. Adds texture or place, not a second headline.',
      '- pill: 1–2 words, all caps. cta: max 3 words or "".',
    ].join('\n'),
    maxChars: 1400,
  },
  caption_rules: {
    id: 'caption_rules',
    label: 'Caption',
    help: 'The post people read under the image — hook, body, call to action, hashtags.',
    default: [
      '- hook: first line that stops the scroll. Not the headline repeated.',
      '- body: 2–4 short sentences in the brand voice. Sound like a stylist, not an ad.',
      '- cta: one soft booking line.',
      '- hashtags: 4–6, no # prefix, mix of niche and local. No spam tags.',
    ].join('\n'),
    maxChars: 1400,
  },
  composition_craft: {
    id: 'composition_craft',
    label: 'Design taste',
    help: 'How the AI should compose the page. Edit this if the layouts are not to your taste.',
    default: [
      'Asymmetry, generous negative space and off-centre placement read as editorial. Dead-centre everything reads as a template.',
      'Type never crosses a face. One thing should be clearly the biggest thing on the page — if the headline, the photo and the button are all competing, none of them wins.',
      'Every word must survive being shrunk to a thumbnail; anything that would not is set too small.',
    ].join(' '),
    maxChars: 900,
  },
  house_style: {
    id: 'house_style',
    label: 'House rules',
    help: 'Anything specific to your studio the AI keeps getting wrong. Empty by default.',
    default: '',
    maxChars: 1200,
  },
};

export const PROMPT_BLOCK_IDS = Object.keys(PROMPT_BLOCKS) as PromptBlockId[];

export type PromptOverrides = Partial<Record<PromptBlockId, string>>;

/** Tolerates anything previously stored, and enforces the per-block ceiling. */
export function coercePromptOverrides(raw: unknown): PromptOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const out: PromptOverrides = {};
  for (const id of PROMPT_BLOCK_IDS) {
    const value = source[id];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[id] = trimmed.slice(0, PROMPT_BLOCKS[id].maxChars);
  }
  return out;
}

/** The text the pipeline should use for a block, given this tenant's overrides. */
export function resolveBlock(id: PromptBlockId, overrides: PromptOverrides | undefined): string {
  const override = overrides?.[id];
  return override && override.trim() ? override.trim() : PROMPT_BLOCKS[id].default;
}

/** Every block resolved at once, for building a prompt. */
export function resolveAllBlocks(overrides: PromptOverrides | undefined): Record<PromptBlockId, string> {
  return Object.fromEntries(
    PROMPT_BLOCK_IDS.map((id) => [id, resolveBlock(id, overrides)]),
  ) as Record<PromptBlockId, string>;
}

/**
 * Asks a model to improve one block, given what the studio wants changed.
 *
 * Returns the rewritten block only — never a commentary, never the whole
 * prompt. The result is still bounded by the block's ceiling and still
 * subject to every guardrail in code, so an "improvement" cannot grant the
 * generator permission it does not have.
 */
export function buildImprovePrompt(params: {
  block: PromptBlock;
  current: string;
  wish: string;
}): string {
  return [
    'You are helping a beauty studio tune one section of the instructions their AI post generator follows.',
    '',
    `SECTION: ${params.block.label} — ${params.block.help}`,
    '',
    'CURRENT TEXT:',
    '<<<',
    params.current || '(empty)',
    '>>>',
    '',
    'WHAT THE STUDIO WANTS CHANGED:',
    '<<<',
    params.wish,
    '>>>',
    '',
    'Rewrite the section so it achieves what they asked, in the same instructional voice, as direct instructions to the generator.',
    `Keep it under ${params.block.maxChars} characters. Keep any rule the studio did not ask you to change.`,
    'Never write instructions that would let the generator invent a price, a discount, a client quote, an opening time, or a medical claim — those are enforced elsewhere and an instruction to ignore them will simply fail.',
    'Return JSON only: {"text":"the rewritten section"}',
  ].join('\n');
}

/** Parses the improve call. Falls back to null so the caller can keep the current text. */
export function parseImprovedBlock(raw: string, block: PromptBlock): string | null {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  try {
    const parsed = JSON.parse(text);
    const next = typeof parsed?.text === 'string' ? parsed.text.trim() : '';
    return next ? next.slice(0, block.maxChars) : null;
  } catch {
    return null;
  }
}
