// ============================================================================
// brand-dna-blacklist.util.ts
// Single source of truth for "which words/phrases must never appear in
// generated content" — merges the legacy flat columns (vocabularyBlacklist,
// doNotSay) with the V2 brandDnaV2.written_conventions.avoid_phrases list.
// The current onboarding UI only ever writes to brandDnaV2 for these fields,
// so any consumer reading the flat columns alone silently sees an empty list.
// ============================================================================

export function getEffectiveBlacklist(brandDNA: {
  vocabularyBlacklist?: string[] | null;
  doNotSay?: string[] | null;
  brandDnaV2?: unknown;
}): string[] {
  const flat = [
    ...(brandDNA.vocabularyBlacklist ?? []),
    ...(brandDNA.doNotSay ?? []),
  ];

  let v2List: unknown[] = [];
  if (brandDNA.brandDnaV2) {
    try {
      const v2 = typeof brandDNA.brandDnaV2 === 'string' ? JSON.parse(brandDNA.brandDnaV2) : brandDNA.brandDnaV2;
      const avoidPhrases = (v2 as any)?.written_conventions?.avoid_phrases;
      if (Array.isArray(avoidPhrases)) v2List = avoidPhrases;
    } catch {
      // Malformed brandDnaV2 JSON — fall back to flat fields only.
    }
  }

  const merged = [...flat, ...v2List].filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
  return Array.from(new Set(merged));
}
