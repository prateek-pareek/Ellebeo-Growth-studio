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

export interface ConsentRecord extends Record<string, any> {
  id: string;
  clientId: string;
  tenantId: string;
  status: any;
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

export interface BrandDNARecord extends Record<string, any> {
  id: string;
  tenantId: string;
  businessName: string;
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
  rawStoragePath: string;
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
  | 'created'
  | 'queued'
  | 'processing_image'
  | 'processing_vision'
  | 'building_prompt'
  | 'generating_text'
  | 'generating_reel'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'blocked'
  | 'dead_letter';

export const VALID_STATE_TRANSITIONS: Record<JobState, ReadonlyArray<JobState>> = {
  created:           ['queued'],
  queued:            ['processing_image', 'blocked'],
  processing_image:  ['processing_vision', 'failed', 'blocked'],
  processing_vision: ['building_prompt', 'failed', 'blocked'],
  building_prompt:   ['generating_text', 'failed', 'blocked'],
  generating_text:   ['generating_reel', 'completed', 'failed', 'blocked'],
  generating_reel:   ['completed', 'failed', 'blocked'],
  completed:         ['blocked'],
  failed:            ['retrying', 'dead_letter'],
  retrying:          ['queued', 'dead_letter'],
  blocked:           [],
  dead_letter:       [],
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
