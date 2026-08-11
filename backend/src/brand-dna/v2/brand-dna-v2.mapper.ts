import { BrandDnaProfile } from '@prisma/client';
import { BrandDNARecord } from '../../ai/types/job-payload.types';

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
      image_energy: profile.mood,
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
    imageEnergy: profile.mood,
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
    aestheticDirection: null,
    moodTag: profile.mood,
    primaryBrandColor: profile.palette[0] ?? null,
    secondaryBrandColor: profile.palette[1] ?? null,
    backgroundBrandColor: profile.palette[2] ?? null,
    accentBrandColor: profile.palette[3] ?? null,
    depthBrandColor: profile.palette[4] ?? null,
    brandFont: profile.typographyHeading ?? profile.typographyBody ?? null,
    locationCity: null,
    brandTier: 'mainstream',
    captionLengthPreference: 'medium',
    emojiStyle: 'minimal',
    averageConfidenceScore: 0.5,
    preferredModelOverride: null,
    logoUrl: null,
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
