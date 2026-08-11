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

export const ESSENCE_WORDS = [
  'WARM', 'FEMININE', 'PREMIUM', 'BOLD', 'MINIMAL', 'PLAYFUL',
  'CLINICAL', 'LUXURIOUS', 'EARTHY', 'EDGY', 'ROMANTIC', 'CONFIDENT',
  'CALM', 'VIBRANT', 'REFINED', 'APPROACHABLE', 'MODERN', 'TIMELESS',
] as const;

export const TYPE_PAIRINGS = [
  'CLASSIC_SERIF', 'MODERN_SANS', 'EDITORIAL_MIX', 'WARM_ROUNDED', 'BOLD_DISPLAY', 'SOFT_SCRIPT',
] as const;

// Deterministic starter palettes per mood — never LLM-generated, so a
// suggestion response can never hand back an invalid/hallucinated hex code.
export const MOOD_PALETTE_SEEDS: Record<(typeof BRAND_MOODS)[number], string[]> = {
  SOFT_GLAM: ['#F5D6D0', '#C98A8A', '#FFF7F3', '#8A5A5A', '#3D2A2A'],
  CLEAN_CLINICAL: ['#EAF2F2', '#3A7C7C', '#FFFFFF', '#1F3D3D', '#0F1F1F'],
  EDITORIAL_MINIMAL: ['#EDEDED', '#1A1A1A', '#FFFFFF', '#5C5C5C', '#000000'],
  NATURAL_ORGANIC: ['#F4EFE6', '#8A7355', '#FAF8F4', '#4E4335', '#2A241C'],
  BOLD_LUXE: ['#D4AF37', '#1A1A2E', '#FFFFFF', '#8A7968', '#000000'],
  PLAYFUL_FRESH: ['#FFE5B4', '#FF6F61', '#FFFFFF', '#4ECDC4', '#2D2D2D'],
};
