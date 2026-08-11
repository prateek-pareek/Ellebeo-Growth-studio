// Brand DNA Guided v2 (BRAND_DNA_GUIDED_V2) — see /brand_dna_implementation_plan.md §4.
// Mirrors backend/src/brand-dna/v2/brand-dna-v2.types.ts — no shared package exists
// between frontend/backend in this repo, so keep both in sync by hand.

export const BRAND_MOODS = [
  "SOFT_GLAM",
  "CLEAN_CLINICAL",
  "EDITORIAL_MINIMAL",
  "NATURAL_ORGANIC",
  "BOLD_LUXE",
  "PLAYFUL_FRESH",
] as const;

export const BRAND_OBJECTIVES = [
  "PREMIUM_CLIENTS",
  "FILL_QUIET_DAYS",
  "EDUCATE_TRUST",
  "PROMOTE_BRIDAL",
  "LAUNCH_PRODUCT",
] as const;

export const GENDER_FOCUS_OPTIONS = ["WOMEN", "MEN", "ALL"] as const;

export const LANGUAGE_VARIANTS = ["AU", "UK", "US"] as const;

export const ESSENCE_WORDS = [
  "WARM", "FEMININE", "PREMIUM", "BOLD", "MINIMAL", "PLAYFUL",
  "CLINICAL", "LUXURIOUS", "EARTHY", "EDGY", "ROMANTIC", "CONFIDENT",
  "CALM", "VIBRANT", "REFINED", "APPROACHABLE", "MODERN", "TIMELESS",
] as const;

export const TYPE_PAIRINGS = [
  "CLASSIC_SERIF", "MODERN_SANS", "EDITORIAL_MIX", "WARM_ROUNDED", "BOLD_DISPLAY", "SOFT_SCRIPT",
] as const;

export type BrandMoodV2 = (typeof BRAND_MOODS)[number];
export type BrandObjectiveV2 = (typeof BRAND_OBJECTIVES)[number];
export type GenderFocusV2 = (typeof GENDER_FOCUS_OPTIONS)[number];
export type LanguageVariantV2 = (typeof LANGUAGE_VARIANTS)[number];

export type BrandDnaV2Contract = {
  schemaVersion: 2;
  technicianId: string;
  identity: {
    brandName: string;
    logoAssetId: string | null;
    palette: string[];
    mood: BrandMoodV2;
    typography: { heading: string | null; body: string | null };
    essence: string[];
  };
  offering: {
    serviceCategory: string;
    services: string[];
    signatureHandle: string | null;
    serviceAreas: string[];
  };
  audience: {
    ageMin: number;
    ageMax: number;
    genderFocus: GenderFocusV2;
    clientTypes: string[];
  };
  strategy: {
    objective: BrandObjectiveV2;
    postsPerWeek: number;
    bookingTargetPerMonth: number;
  };
  config: {
    languageVariant: LanguageVariantV2;
    platforms: { instagram: boolean; facebook: boolean; tiktok: boolean };
    medicalAestheticsCompliance: boolean;
    useAssetLibrary: boolean;
  };
  story: {
    userWritten: string | null;
    aiDrafted: string | null;
  };
  meta: {
    completedAt: string | null;
    source: "guided_v2";
  };
};
