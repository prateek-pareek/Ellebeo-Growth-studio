// ============================================================================
// job-payload.types.ts — Core Job Payload and Supporting Types
// ============================================================================

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export type ConsentStatus = 'granted' | 'partial' | 'withdrawn' | 'expired';

export interface ConsentRestrictions {
  show_face: boolean;
  use_name: boolean;
  allow_tagging: boolean;
  allow_before_after: boolean;
  allow_extended_use: boolean;
}

export interface ConsentRecord {
  consentId: string;
  clientId: string;
  tenantId: string;
  status: ConsentStatus;
  restrictions: ConsentRestrictions;
  grantedAt: string;
  expiresAt: string | null;
  lastUpdatedAt: string;
  version: number;
}

export interface ConsentValidationResult {
  valid: boolean;
  reason?: 'withdrawn' | 'expired' | 'not_found' | 'restrictions_violated';
  activeRestrictions: ConsentRestrictions;
}

// ---------------------------------------------------------------------------
// Brand DNA
// ---------------------------------------------------------------------------

export type BrandTone =
  | 'warm_and_friendly'
  | 'polished_and_premium'
  | 'clinical_and_expert'
  | 'edgy_and_bold'
  | 'soft_and_nurturing'
  | 'playful_and_fun';

export type BrandMoodTag =
  | 'luxury' | 'upbeat' | 'chill' | 'elegant'
  | 'bold' | 'clinical' | 'warm' | 'playful';

export interface BrandDNARecord {
  brandDNAId: string;
  tenantId: string;
  version: number;
  primaryTone: BrandTone;
  secondaryTone: BrandTone | null;
  personaDescription: string;
  preferredVocabulary: string[];
  blacklistedWords: string[];
  clientTerminology: string;
  businessName: string;
  heroServices: string[];
  targetAudience: string;
  uniqueSellingPoint: string;
  locationCity: string;
  primaryBrandColour: string;
  secondaryBrandColour: string;
  brandFontPreference: string | null;
  moodTag: BrandMoodTag;
  captionLengthPreference: 'short' | 'medium' | 'long';
  useEmojis: boolean;
  emojiStyle: 'minimal' | 'moderate' | 'heavy';
  preferredCTAStyle: string;
  complexityScore: number;
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Business Goal
// ---------------------------------------------------------------------------

export type BusinessGoalType =
  | 'attract_new_clients'
  | 'fill_quiet_days'
  | 'promote_high_margin_services'
  | 'build_brand_authority'
  | 'retain_existing_clients'
  | 'launch_new_service'
  | 'seasonal_promotion';

// ---------------------------------------------------------------------------
// Golden Example
// ---------------------------------------------------------------------------

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';
export type OutputFormat = 'feed' | 'story' | 'reel';
export type UserTier = 'standard' | 'premium';

export interface GoldenExample {
  exampleId: string;
  tenantId: string;
  captionText: string;
  platform: SocialPlatform;
  qualityScore: number;
  hashtags: string[];
  postedAt: string;
}

// ---------------------------------------------------------------------------
// Image Assets
// ---------------------------------------------------------------------------

export interface ImageAsset {
  rawS3Key: string;
  cloudinaryPublicId?: string;
  visionAnalysisCache?: string;
}

// ---------------------------------------------------------------------------
// Generation Options
// ---------------------------------------------------------------------------

export interface GenerationOptions {
  outputFormats: OutputFormat[];
  includeVoiceover: boolean;
  includeMusic: boolean;
  platform: SocialPlatform[];
  userTier: UserTier;
}

// ---------------------------------------------------------------------------
// Generation Job Payload — the complete, immutable job contract
// ---------------------------------------------------------------------------

export interface GenerationJobPayload {
  jobId: string;
  tenantId: string;
  appointmentId: string;
  clientId: string;
  consentSnapshot: ConsentRecord;
  brandDNA: BrandDNARecord;
  businessGoal: BusinessGoalType;
  imageAssets: ImageAsset[];
  generationOptions: GenerationOptions;
  goldenExamples: GoldenExample[];
  createdAt: string;
  priority: 1 | 5;
}

// ---------------------------------------------------------------------------
// Job State Machine
// ---------------------------------------------------------------------------

export type JobState =
  | 'CREATED'
  | 'QUEUED'
  | 'PROCESSING_IMAGE'
  | 'PROCESSING_VISION'
  | 'BUILDING_PROMPT'
  | 'GENERATING_TEXT'
  | 'GENERATING_REEL'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'BLOCKED'
  | 'DLQ';

export const VALID_STATE_TRANSITIONS: Record<JobState, ReadonlyArray<JobState>> = {
  CREATED:           ['QUEUED'],
  QUEUED:            ['PROCESSING_IMAGE', 'BLOCKED'],
  PROCESSING_IMAGE:  ['PROCESSING_VISION', 'FAILED', 'BLOCKED'],
  PROCESSING_VISION: ['BUILDING_PROMPT', 'FAILED', 'BLOCKED'],
  BUILDING_PROMPT:   ['GENERATING_TEXT', 'FAILED', 'BLOCKED'],
  GENERATING_TEXT:   ['GENERATING_REEL', 'COMPLETED', 'FAILED', 'BLOCKED'],
  GENERATING_REEL:   ['COMPLETED', 'FAILED', 'BLOCKED'],
  COMPLETED:         ['BLOCKED'],
  FAILED:            ['RETRYING', 'DLQ'],
  RETRYING:          ['QUEUED', 'DLQ'],
  BLOCKED:           [],
  DLQ:               [],
} as const;

export class InvalidStateTransitionError extends Error {
  constructor(from: JobState, to: JobState) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export function validateStateTransition(from: JobState, to: JobState): void {
  const allowed = VALID_STATE_TRANSITIONS[from] as ReadonlyArray<JobState>;
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

// ---------------------------------------------------------------------------
// Rate Limit
// ---------------------------------------------------------------------------

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  remainingGenerations?: number;
  remainingReels?: number;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Tweak
// ---------------------------------------------------------------------------

export interface TweakRequest {
  contentItemId: string;
  tenantId: string;
  previousCaption: string;
  tweakInstruction: string;
  platform: SocialPlatform | null;
}
