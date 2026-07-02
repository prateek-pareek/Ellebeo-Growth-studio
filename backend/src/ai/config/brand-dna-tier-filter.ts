// ============================================================================
// brand-dna-tier-filter.ts
// Strips Brand DNA fields that are locked for the tenant's subscription tier
// before passing to the prompt builder. This ensures the AI only uses fields
// the tenant has actually unlocked — higher tiers = richer, more bespoke output.
//
// Tier matrix (from product spec):
//   Tier 1 / free:  Basic fields only — name, category, location, essence (1 sentence),
//                   tone (3 words), emoji, caption length, 3 colours, basic image direction
//   Tier 2:         + Full 5-colour palette, brand world anchor, advanced image direction,
//                     logo rules, vocabulary lists
//   Tier 3 / 4 / 5: + Moodboard, asset library, signature system, detailed ideal client
// ============================================================================

export type TierKey = 'free' | 'standard' | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'premium';

// Numeric rank so comparisons are simple
const TIER_RANK: Record<TierKey, number> = {
  free:     0,
  standard: 1,
  tier1:    1,
  tier2:    2,
  tier3:    3,
  tier4:    4,
  tier5:    5,
  premium:  3, // legacy — treated as tier3
};

function rank(tier: string): number {
  return TIER_RANK[tier as TierKey] ?? 0;
}

// Fields unlocked at Tier 2+ (Enhanced)
const TIER2_FIELDS = [
  'secondaryBrandColor', 'depthBrandColor',   // 4th and 5th palette colours
  'brandWorldAnchor',
  'imageEnergy',
  'lightingPreference', 'texturePreference', 'compositionStyle', 'finishPreference', 'environmentPreference',
  'brandTier',
  'moodTag', 'aestheticDirection', 'formattingStyle',
  'vocabularyPreferred', 'preferredVocabulary',
  'vocabularyBlacklist', 'blacklistedWords',
  'doNotSay',
  'secondaryPersona',
  'clientPainPoints',
  'logoUsageNotes',
  'uniqueSellingProposition',
  'signatureOutcome',
] as const;

// Fields unlocked at Tier 3+ (Premium)
const TIER3_FIELDS = [
  'moodboardUrls', 'moodboardLabels',
  'assetLibrary',
  'signatureSystem',
  'lightSignature', 'recurringMotif', 'framingHabit', 'colourDiscipline',
  'typeRule', 'finish', 'alwaysAbsent',
  'audienceLifestyle',
  'clientFears', 'clientTrustTriggers', 'clientVisualTaste',
  'clientBuyingTriggers', 'clientEmotionalOutcome',
  'visualRanking', 'styleRanking',
] as const;

/**
 * Returns a copy of the Brand DNA record with fields not available at the
 * tenant's tier set to null/undefined. The original object is never mutated.
 */
export function filterDnaForTier(dna: Record<string, any>, tier: string): Record<string, any> {
  const r = rank(tier);
  const filtered = { ...dna };

  if (r < 2) {
    for (const field of TIER2_FIELDS) {
      filtered[field] = undefined;
    }
  }

  if (r < 3) {
    for (const field of TIER3_FIELDS) {
      filtered[field] = undefined;
    }
  }

  return filtered;
}

/**
 * Returns a human-readable label for what the current tier unlocks in prompts.
 * Used in logs / observability only.
 */
export function tierDnaLabel(tier: string): string {
  const r = rank(tier);
  if (r >= 3) return 'Full Brand DNA (moodboard + asset library + signature system)';
  if (r >= 2) return 'Enhanced Brand DNA (full palette + vocabulary + image direction)';
  return 'Basic Brand DNA (name, tone, 3 colours, brief essence)';
}
