// ============================================================================
// chain-output.types.ts — Individual Chain I/O Types
// ============================================================================

import type { UserTier, SocialPlatform } from './job-payload.types';

// ---------------------------------------------------------------------------
// Vision Analysis Chain
// ---------------------------------------------------------------------------

export interface VisionAnalysisResult {
  servicePerformed: string;
  serviceTags: string[];
  technicalDetails: string;
  transformationDescription: string;
  keyVisualDetail: string;
  imageQuality: 'excellent' | 'good' | 'acceptable' | 'poor';
  facesDetected: boolean;
  settingDetected: string;
  framingType: 'macro' | 'portrait' | 'wide' | 'unknown';
  faceCoordinates?: {
    eyesYPercent: number;
    mouthYPercent: number;
  };
}

// ---------------------------------------------------------------------------
// Caption Generation Chain
// ---------------------------------------------------------------------------

export interface CaptionGenerationResult {
  caption: string;
  hookSentence: string;
  callToAction: string;
  hashtags: string[];
  altText: string;
  estimatedReadTime: number;
  brandVoiceConfidenceScore: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ---------------------------------------------------------------------------
// Reel Script Chain
// ---------------------------------------------------------------------------

export interface ElevenLabsVoiceSettings {
  voiceId: string;
  voiceName: string;
  stability: number;
  similarityBoost: number;
  style: number;
}

export interface ReelScriptResult {
  script: string;
  wordCount: number;
  estimatedDurationSeconds: number;
  elevenLabsVoiceSettings: ElevenLabsVoiceSettings;
}

// ---------------------------------------------------------------------------
// Platform Variant Chain
// ---------------------------------------------------------------------------

export interface PlatformVariantResult {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  callToAction: string;
}

// ---------------------------------------------------------------------------
// Tweak Chain
// ---------------------------------------------------------------------------

export interface TweakResult {
  contentItemId: string;
  tweakedCaption: string;
  tweakedHashtags: string[];
  tweakedCallToAction: string;
  brandVoiceConfidenceScore: number;
  tokenCost: number;
}

// ---------------------------------------------------------------------------
// Model Router
// ---------------------------------------------------------------------------

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  modelId: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  systemPromptCacheKey: string | null;
}

export interface ModelRoutingContext {
  userTier: UserTier;
  brandDNAComplexityScore: number;
  previousConfidenceScore?: number;
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  /** Which fragments were loaded from cache vs built fresh */
  cacheHits: {
    brandDNAFragment: boolean;
    goldenExamplesFragment: boolean;
  };
}

// ---------------------------------------------------------------------------
// Image Processing
// ---------------------------------------------------------------------------

export interface ImageVariantUrls {
  feedUrl: string;
  storyUrl: string;
  thumbnailUrl: string;
}

export interface ImageProcessingResult {
  cloudinaryPublicId: string;
  variants: ImageVariantUrls;
  faceBlurred: boolean;
  facesDetectedCount: number;
  brandOverlayApplied: boolean;
  originalStoragePath: string;
}

// ---------------------------------------------------------------------------
// Reel Assembly
// ---------------------------------------------------------------------------

export interface ReelResult {
  storagePath: string;
  cdnUrl: string;
  durationSeconds: number;
  hasVoiceover: boolean;
  hasMusic: boolean;
  musicTrackId: string | null;
  musicTrackTitle: string | null;
  shotstackRenderId: string;
}

// ---------------------------------------------------------------------------
// Voice Generation (ElevenLabs)
// ---------------------------------------------------------------------------

export interface VoiceoverResult {
  audioStoragePath: string;
  audioCdnUrl: string;
  durationSeconds: number;
  voiceId: string;
  voiceName: string;
}

// ---------------------------------------------------------------------------
// Music Selection (Pixabay)
// ---------------------------------------------------------------------------

export interface MusicTrack {
  trackId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  cdnUrl: string;
  moodTags: string[];
}
