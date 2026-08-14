import { BrandDnaProfile, Prisma } from '@prisma/client';
import { BrandDNARecord } from '../../ai/types/job-payload.types';
import { BrandDnaV2Contract } from './brand-dna-v2.types';

// Free-text aesthetic direction per mood — read directly by
// generation-orchestrator.ts for image generation whenever visualRanking is
// empty (always true for v2 profiles, which have no style-ranking field).
// Without this, every v2 tenant's images fell back to the same hardcoded
// generic string regardless of which mood they picked.
const MOOD_AESTHETIC_DIRECTION: Record<string, string> = {
  SOFT_GLAM: 'soft romantic feminine glam, warm polished tones',
  CLEAN_CLINICAL: 'clean clinical minimalist, precise cool tones, sterile trust-first look',
  EDITORIAL_MINIMAL: 'editorial minimalist, sleek refined quiet confidence',
  NATURAL_ORGANIC: 'natural organic earthy, gentle handcrafted feel',
  BOLD_LUXE: 'bold luxe dramatic, high-end statement-making',
  PLAYFUL_FRESH: 'playful fresh vibrant, energetic fun-first',
};

function aestheticDirectionForMood(profile: BrandDnaProfile): string {
  if (profile.mood === 'CUSTOM') return profile.customMoodLabel || 'minimal editorial premium beauty';
  return MOOD_AESTHETIC_DIRECTION[profile.mood] ?? 'minimal editorial premium beauty';
}

// Adapts a BrandDnaProfile row (schemaVersion 2, BRAND_DNA_GUIDED_V2 —
// /brand_dna_implementation_plan.md) into the legacy BrandDNARecord shape the
// generation pipeline already reads (prompt-builder.ts's brandDnaV2 branch,
// getEffectiveBlacklist, getEffectiveFonts, isMedicalAestheticsBrand). This is
// what lets Phase 2's dual-read plug in without touching those pipeline files.
//
// Fields with no v2 equivalent (vocabulary blacklist, style ranking, signature
// system, ICP depth, content pillars — dropped per the plan's 15-field
// contract) are left empty/default; the pipeline simply sees less signal for
// tenants on a v2 profile, same as it does for any tenant with sparse v1 data.
export function mapBrandDnaProfileToLegacyRecord(profile: BrandDnaProfile): BrandDNARecord {
  const brandDnaV2 = {
    foundations: {
      professional_name: profile.brandName,
    },
    essence: {
      image_energy: profile.mood === 'CUSTOM' ? (profile.customMoodLabel ?? profile.mood) : profile.mood,
    },
    visual_identity: {
      palette: {
        primary: profile.palette[0],
        secondary: profile.palette[1],
        background: profile.palette[2],
        accent: profile.palette[3],
        depth: profile.palette[4],
      },
    },
    typography: {
      heading_font: profile.typographyHeading ?? undefined,
      body_font: profile.typographyBody ?? undefined,
    },
    voice_v2: {
      three_words: profile.essence.join(', ') || undefined,
    },
    written_conventions: {},
    commercial: {
      desired_outcome: profile.objective,
    },
    ideal_client_v2: {
      lifestyle: profile.clientTypes.join(', ') || undefined,
    },
    compliance: {
      medical_aesthetics_practitioner: profile.medicalAestheticsCompliance,
    },
    signature_system: {},
  };

  return {
    id: profile.id,
    tenantId: profile.tenantId,
    businessName: profile.brandName,
    version: profile.schemaVersion,
    isCurrent: profile.isCurrent,
    brandDnaV2,
    serviceCategories: [profile.serviceCategory, ...profile.services].filter(Boolean),
    serviceArea: profile.serviceAreas[0] ?? null,
    reputationAsset: null,
    workDifferentiation: null,
    brandEssenceSentence: null,
    brandWorldAnchor: null,
    imageEnergy: profile.mood === 'CUSTOM' ? (profile.customMoodLabel ?? profile.mood) : profile.mood,
    oneLiner: profile.userWrittenStory ?? profile.aiDraftedStory ?? null,
    uniqueSellingProposition: null,
    signatureOutcome: null,
    primaryPersona: null,
    secondaryPersona: null,
    clientPainPoints: [],
    primaryTone: null,
    secondaryTone: null,
    emojiPolicy: 'minimal',
    vocabularyBlacklist: [],
    vocabularyPreferred: [],
    doNotSay: [],
    formattingStyle: null,
    aestheticDirection: aestheticDirectionForMood(profile),
    moodTag: profile.mood === 'CUSTOM' ? (profile.customMoodLabel ?? profile.mood) : profile.mood,
    primaryBrandColor: profile.palette[0] ?? null,
    secondaryBrandColor: profile.palette[1] ?? null,
    backgroundBrandColor: profile.palette[2] ?? null,
    accentBrandColor: profile.palette[3] ?? null,
    depthBrandColor: profile.palette[4] ?? null,
    brandFont: profile.typographyHeading ?? profile.typographyBody ?? null,
    locationCity: null,
    brandTier: 'mainstream',
    // The current v2 onboarding flow has no caption-length control at all —
    // default to the tight 2-line target rather than the legacy 'medium'
    // (60-100 words), which is what every real tenant was silently getting.
    captionLengthPreference: 'short',
    emojiStyle: 'minimal',
    averageConfidenceScore: 0.5,
    preferredModelOverride: null,
    logoUrl: profile.logoAssetId,
    logoPosition: 'bottom_right',
    moodboardUrls: [],
    moodboardLabels: [],
    lightingPreference: null,
    texturePreference: null,
    compositionStyle: null,
    environmentPreference: null,
    finishPreference: null,
    audienceLifestyle: profile.clientTypes.join(', ') || null,
    commercialObjective: profile.objective,
    visualRanking: [],
    clientFears: null,
    clientTrustTriggers: null,
    clientVisualTaste: null,
    clientBuyingTriggers: null,
    clientEmotionalOutcome: null,
    brandPerceptionGoal: null,
    brandProofStatement: null,
    brandNeverLooksLike: null,
    lastUpdatedAt: profile.updatedAt,
    autoPopulated: profile.needsReview,
  };
}

// Maps a stored BrandDnaProfile row to the nested wire contract the frontend
// reads/writes (§4 of the plan) — the DB storage shape is flat/normalised,
// this is the boundary where it becomes the grouped identity/offering/
// audience/strategy/config/story object.
export function mapProfileToContract(profile: BrandDnaProfile): BrandDnaV2Contract {
  return {
    schemaVersion: 2,
    technicianId: profile.tenantId,
    identity: {
      brandName: profile.brandName,
      logoAssetId: profile.logoAssetId,
      palette: profile.palette,
      mood: profile.mood as BrandDnaV2Contract['identity']['mood'],
      customMoodLabel: profile.customMoodLabel,
      typography: { heading: profile.typographyHeading, body: profile.typographyBody },
      essence: profile.essence,
    },
    offering: {
      serviceCategory: profile.serviceCategory,
      services: profile.services,
      signatureHandle: profile.signatureHandle,
      serviceAreas: profile.serviceAreas,
    },
    audience: {
      ageMin: profile.ageMin,
      ageMax: profile.ageMax,
      genderFocus: profile.genderFocus as BrandDnaV2Contract['audience']['genderFocus'],
      clientTypes: profile.clientTypes,
    },
    strategy: {
      objective: profile.objective as BrandDnaV2Contract['strategy']['objective'],
      postsPerWeek: profile.postsPerWeek,
      bookingTargetPerMonth: profile.bookingTargetPerMonth,
    },
    config: {
      languageVariant: profile.languageVariant as BrandDnaV2Contract['config']['languageVariant'],
      platforms: {
        instagram: profile.platformInstagram,
        facebook: profile.platformFacebook,
        tiktok: profile.platformTiktok,
      },
      medicalAestheticsCompliance: profile.medicalAestheticsCompliance,
      useAssetLibrary: profile.useAssetLibrary,
    },
    story: {
      userWritten: profile.userWrittenStory,
      aiDrafted: profile.aiDraftedStory,
    },
    meta: {
      completedAt: profile.completedAt ? profile.completedAt.toISOString() : null,
      source: 'guided_v2',
    },
  };
}

// Inverse of mapProfileToContract — the shape the PUT /brand-dna/v2 body maps
// to for a Prisma create/update. needsReview is always false here: this path
// is only reached by explicit technician confirmation, never a heuristic
// migration guess (compare scripts/migrate-brand-dna-v2.ts, which sets it true).
export function mapContractToProfileData(
  contract: BrandDnaV2Contract,
  tenantId: string,
): Prisma.BrandDnaProfileUncheckedCreateInput {
  return {
    tenantId,
    schemaVersion: 2,
    isCurrent: true,
    needsReview: false,
    brandName: contract.identity.brandName,
    logoAssetId: contract.identity.logoAssetId,
    palette: contract.identity.palette,
    mood: contract.identity.mood as any,
    customMoodLabel: contract.identity.mood === 'CUSTOM' ? contract.identity.customMoodLabel : null,
    typographyHeading: contract.identity.typography.heading,
    typographyBody: contract.identity.typography.body,
    essence: contract.identity.essence,
    serviceCategory: contract.offering.serviceCategory,
    services: contract.offering.services,
    signatureHandle: contract.offering.signatureHandle,
    serviceAreas: contract.offering.serviceAreas,
    ageMin: contract.audience.ageMin,
    ageMax: contract.audience.ageMax,
    genderFocus: contract.audience.genderFocus as any,
    clientTypes: contract.audience.clientTypes,
    objective: contract.strategy.objective as any,
    postsPerWeek: contract.strategy.postsPerWeek,
    bookingTargetPerMonth: contract.strategy.bookingTargetPerMonth,
    languageVariant: contract.config.languageVariant as any,
    platformInstagram: contract.config.platforms.instagram,
    platformFacebook: contract.config.platforms.facebook,
    platformTiktok: contract.config.platforms.tiktok,
    medicalAestheticsCompliance: contract.config.medicalAestheticsCompliance,
    useAssetLibrary: contract.config.useAssetLibrary,
    userWrittenStory: contract.story.userWritten,
    aiDraftedStory: contract.story.aiDrafted,
    completedAt: contract.meta.completedAt ? new Date(contract.meta.completedAt) : new Date(),
  };
}
