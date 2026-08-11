// Shared Brand DNA Guided v2 contract — see /brand_dna_implementation_plan.md §4.
// This is the API/pipeline-facing shape. DB storage (BrandDnaProfile, prisma/schema.prisma)
// is flat/normalised; map between the two at the read/write boundary (brand-dna.service.ts).

import { BRAND_MOODS, BRAND_OBJECTIVES, GENDER_FOCUS_OPTIONS, LANGUAGE_VARIANTS } from './brand-dna-v2.constants';

export type BrandMoodV2 = (typeof BRAND_MOODS)[number];
export type BrandObjectiveV2 = (typeof BRAND_OBJECTIVES)[number];
export type GenderFocusV2 = (typeof GENDER_FOCUS_OPTIONS)[number];
export type LanguageVariantV2 = (typeof LANGUAGE_VARIANTS)[number];

export interface BrandDnaV2Contract {
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
    source: 'guided_v2';
  };
}
