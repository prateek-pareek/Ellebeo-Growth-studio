// ============================================================================
// generation-result.types.ts — Final Output and WebSocket Event Types
// ============================================================================

import type { JobState } from './job-payload.types';
import type {
  CaptionGenerationResult,
  PlatformVariantResult,
  ImageProcessingResult,
  ReelResult,
  ReelScriptResult,
  VisionAnalysisResult,
} from './chain-output.types';

// ---------------------------------------------------------------------------
// Component-level status (supports partial success)
// ---------------------------------------------------------------------------

export type ComponentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'blocked';

// ---------------------------------------------------------------------------
// Generation Result — the final content pack persisted to PostgreSQL
// ---------------------------------------------------------------------------

export interface GenerationResult {
  jobId: string;
  tenantId: string;
  appointmentId: string;
  contentItemId: string;

  // Per-component statuses — never fail the whole pack for one component
  captionStatus: ComponentStatus;
  imageStatus: ComponentStatus;
  reelStatus: ComponentStatus;

  // Caption output (may be null if captionStatus !== 'completed')
  caption: CaptionGenerationResult | null;
  platformVariants: PlatformVariantResult[] | null;

  // Image output
  processedImage: ImageProcessingResult | null;

  // Reel output
  reel: ReelResult | null;
  reelScript: ReelScriptResult | null;

  // Vision analysis (cached permanently in PostgreSQL)
  visionAnalysis: VisionAnalysisResult | null;

  // Observability metadata
  modelUsed: string;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedCostUSD: number;
  totalProcessingTimeMs: number;
  brandVoiceConfidenceScore: number;

  completedAt: string;
}

// ---------------------------------------------------------------------------
// WebSocket Progress Event
// ---------------------------------------------------------------------------

export interface JobProgressEvent {
  jobId: string;
  tenantId: string;
  state: JobState;
  progressPercent: number;
  currentStep: string;
  estimatedSecondsRemaining: number;
  partialResult?: {
    caption?: string;
    hashtags?: string[];
  };
  error?: {
    code: string;
    userMessage: string;
  };
}

// ---------------------------------------------------------------------------
// API Response types
// ---------------------------------------------------------------------------

export interface JobAcceptedResponse {
  jobId: string;
  status: 'accepted';
  message: string;
  estimatedWaitSeconds: number;
}

export interface TweakAcceptedResponse {
  jobId: string;
  contentItemId: string;
  status: 'accepted';
}

// ---------------------------------------------------------------------------
// DLQ / Failed Job Record
// ---------------------------------------------------------------------------

export interface FailedJobRecord {
  failedJobId: string;
  originalJobId: string;
  tenantId: string;
  appointmentId: string;
  failedAtStep: JobState;
  errorMessage: string;
  errorStack: string;
  fullPayload: string;          // JSON stringified GenerationJobPayload
  partialResultsPreserved: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// User-facing error code → message mapping
// ---------------------------------------------------------------------------

export const USER_ERROR_MESSAGES: Record<string, string> = {
  CONSENT_WITHDRAWN: 'This content could not be created because the client\'s consent has been withdrawn.',
  CONSENT_EXPIRED: 'Client consent has expired. Please ask your client to renew their consent before generating content.',
  CONSENT_NOT_FOUND: 'No consent record was found for this client. Please collect consent before generating content.',
  RATE_LIMIT_DAILY: 'You\'ve reached your daily content generation limit. Your limit resets tomorrow.',
  RATE_LIMIT_REELS: 'You\'ve reached your daily Reel generation limit. Your limit resets tomorrow.',
  RATE_LIMIT_DEBOUNCE: 'Please wait a moment before regenerating this content.',
  AI_TIMEOUT: 'Our AI took too long to respond. We\'re retrying your request automatically.',
  IMAGE_PROCESSING_FAILED: 'We couldn\'t process your photo. Please try a different image.',
  REEL_FAILED: 'Your caption and photo are ready! We\'ll deliver those now — the Reel can be regenerated separately.',
  VISION_FAILED: 'We couldn\'t analyse your photo automatically. Your caption has been generated based on your appointment details.',
  GENERIC_FAILURE: 'Something went wrong with your content request. Our team has been notified. Please try again.',
} as const;

export type UserErrorCode = keyof typeof USER_ERROR_MESSAGES;
