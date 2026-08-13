/** Phrase lists for the LLM-free video hard gate. Word-boundary matched. */

export const GUARANTEED_RESULTS_PHRASES = [
  'guaranteed',
  'permanent results',
  'will definitely',
  'you will look',
  'fixes permanently',
  '100% effective',
  'zero risk',
  'completely safe',
  'no side effects',
  'pain free guaranteed',
] as const;

export const MEDICAL_CLAIM_PHRASES = [
  'cures',
  'heals',
  'treats',
  'medical grade results',
  'clinically proven',
  'fda approved',
  'tga approved',
  'dermatologist strength',
  'prescribed',
] as const;

export const BODY_SHAME_PHRASES = [
  'ugly',
  'fat',
  'overweight',
  'fix your',
  'hide your',
  'disguise your',
  'problem areas',
  'flaws',
  'imperfections you hate',
] as const;

export const MEDICAL_BEFORE_AFTER_PHRASES = [
  'before and after',
  'before/after',
  'before & after',
  'transformation',
  'wrinkle-free',
  '10 years younger',
] as const;

export const MEDICAL_URGENCY_PHRASES = [
  'book now',
  'only 2 slots',
  'only two slots',
  'limited time',
  'last chance',
] as const;

export const MEDICAL_TESTIMONIAL_PHRASES = [
  'testimonial',
  'client quote',
  'my results',
  'look at me now',
] as const;

export const PEOPLE_STOCK_TAGS = [
  'face',
  'portrait',
  'person',
  'people',
  'woman',
  'man',
  'girl',
  'boy',
  'model',
  'selfie',
  'body',
] as const;

export function containsBannedPhrase(text: string, phrases: readonly string[]): string | null {
  const haystack = text.trim();
  if (!haystack) return null;
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (pattern.test(haystack)) return phrase;
  }
  return null;
}

export function isPeopleStockTagList(tags: string[]): boolean {
  return tags.some((tag) =>
    (PEOPLE_STOCK_TAGS as readonly string[]).includes(tag.trim().toLowerCase()),
  );
}
