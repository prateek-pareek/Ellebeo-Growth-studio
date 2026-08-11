// Controlled vocabularies for Brand DNA Guided v2 (BRAND_DNA_GUIDED_V2).
// Single source of truth — mirrored (not imported, no shared package exists) into
// frontend/src/lib/brand-dna/v2-schema.ts. Keep both in sync with prisma/schema.prisma
// enums BrandMood / BrandObjective / GenderFocus / LanguageVariant.
// See /brand_dna_implementation_plan.md §4 — values are provisional pending product sign-off.

export const BRAND_MOODS = [
  'SOFT_GLAM',
  'CLEAN_CLINICAL',
  'EDITORIAL_MINIMAL',
  'NATURAL_ORGANIC',
  'BOLD_LUXE',
  'PLAYFUL_FRESH',
] as const;

export const BRAND_OBJECTIVES = [
  'PREMIUM_CLIENTS',
  'FILL_QUIET_DAYS',
  'EDUCATE_TRUST',
  'PROMOTE_BRIDAL',
  'LAUNCH_PRODUCT',
] as const;

export const GENDER_FOCUS_OPTIONS = ['WOMEN', 'MEN', 'ALL'] as const;

export const LANGUAGE_VARIANTS = ['AU', 'UK', 'US'] as const;
