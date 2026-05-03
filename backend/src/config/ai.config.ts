// ============================================================================
// ai.config.ts — Single Source of Truth for All AI Layer Configuration
// All model IDs, timeouts, rate limits, queue settings, Redis keys here.
// Never hardcode these values in individual modules.
// ============================================================================

export const AI_CONFIG = {
  // --------------------------------------------------------------------------
  // LLM Models
  // --------------------------------------------------------------------------
  models: {
    standardText: {
      provider: 'openai' as const,
      modelId: 'gpt-4o-mini',
      temperature: 0.75,
      maxTokens: 1024,
      timeoutMs: 30_000,
    },
    premiumText: {
      provider: 'anthropic' as const,
      modelId: 'claude-3-5-sonnet-20241022',
      temperature: 0.72,
      maxTokens: 1024,
      timeoutMs: 45_000,
    },
    vision: {
      provider: 'openai' as const,
      modelId: 'gpt-4o',
      temperature: 0.2,       // low — vision output should be factual
      maxTokens: 512,
      timeoutMs: 45_000,
    },
    reelScript: {
      provider: 'openai' as const,
      modelId: 'gpt-4o-mini',
      temperature: 0.8,
      maxTokens: 256,
      timeoutMs: 30_000,
    },
  },

  // --------------------------------------------------------------------------
  // Model Routing Thresholds
  // --------------------------------------------------------------------------
  routing: {
    /** Brand DNA complexity score above this → route to Claude */
    complexityScoreThreshold: 0.7,
    /** Brand voice confidence below this → retry with amplified instruction */
    brandVoiceConfidenceRetryThreshold: 0.6,
    /** Reel script max word count (≈15 seconds spoken at natural pace) */
    reelScriptMaxWords: 38,
  },

  // --------------------------------------------------------------------------
  // External API Timeouts (ms)
  // --------------------------------------------------------------------------
  timeouts: {
    openaiMini: 30_000,
    openaiVision: 45_000,
    anthropicClaude: 45_000,
    cloudinaryTransform: 20_000,
    shotstackRender: 180_000,     // 3 minutes
    elevenLabs: 30_000,
    pixabayMusic: 10_000,
    storageUpload: 30_000,
  },

  // --------------------------------------------------------------------------
  // BullMQ Queue Settings
  // --------------------------------------------------------------------------
  queues: {
    contentGeneration: {
      name: 'content-generation',
      concurrency: 10,
      rateLimit: { max: 50, duration: 60_000 },   // 50 jobs/min
      defaultJobOptions: {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
      jobTTLMs: 600_000,   // 10 minutes
    },
    imageProcessing: {
      name: 'image-processing',
      concurrency: 20,
      rateLimit: { max: 100, duration: 60_000 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 1_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    },
    videoAssembly: {
      name: 'video-assembly',
      concurrency: 5,
      rateLimit: { max: 10, duration: 60_000 },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    },
    deadLetter: {
      name: 'dead-letter-queue',
      concurrency: 0,   // no workers — manual review only
    },
  },

  // --------------------------------------------------------------------------
  // Redis Cache TTLs (seconds)
  // --------------------------------------------------------------------------
  cache: {
    brandDNAFragmentTTL: 86_400,      // 24 hours
    goldenExamplesFragmentTTL: 86_400, // 24 hours
    musicTrackTTL: 604_800,            // 7 days
    regenerationDebounceTTL: 10,       // 10 seconds
    presignedUrlTTL: 600,              // 10 minutes
    rateLimitWindowSec: 86_400,        // 24 hours (daily rolling window)
  },

  // --------------------------------------------------------------------------
  // Redis Key Prefixes
  // --------------------------------------------------------------------------
  redisKeys: {
    brandDNAFragment: (tenantId: string, version: number) =>
      `brandna:fragment:${tenantId}:v${version}`,
    goldenExamplesFragment: (tenantId: string, version: number) =>
      `golden:fragment:${tenantId}:v${version}`,
    musicTrack: (tenantId: string) =>
      `music:track:${tenantId}`,
    rateLimitGenerations: (tenantId: string) =>
      `ratelimit:gen:${tenantId}`,
    rateLimitReels: (tenantId: string) =>
      `ratelimit:reel:${tenantId}`,
    rateLimitTweaks: (tenantId: string, contentItemId: string) =>
      `ratelimit:tweak:${tenantId}:${contentItemId}`,
    regenerationDebounce: (contentItemId: string) =>
      `debounce:regen:${contentItemId}`,
    socketRoom: (tenantId: string) =>
      `room:tenant:${tenantId}`,
  },

  // --------------------------------------------------------------------------
  // Per-Tier Rate Limits
  // --------------------------------------------------------------------------
  rateLimits: {
    standard: {
      maxGenerationsPerDay: 30,
      maxReelsPerDay: 5,
      maxTweaksPerContentItem: 10,
    },
    premium: {
      maxGenerationsPerDay: 100,
      maxReelsPerDay: 20,
      maxTweaksPerContentItem: 10,
    },
    regenerationDebounceSec: 10,
  },

  // --------------------------------------------------------------------------
  // Cloudinary Transformation Settings
  // --------------------------------------------------------------------------
  cloudinary: {
    faceBlurIntensity: 60,
    outputFormats: {
      feed: { width: 1080, height: 1080, crop: 'fill' as const },
      story: { width: 1080, height: 1920, crop: 'fill' as const },
      thumbnail: { width: 400, height: 400, crop: 'fill' as const },
    },
    quality: 'auto' as const,
    format: 'auto' as const,
  },

  // --------------------------------------------------------------------------
  // Shotstack Reel Settings
  // --------------------------------------------------------------------------
  shotstack: {
    pollIntervalMs: 5_000,
    maxPollAttempts: 36,       // 36 × 5s = 3 minutes
    beforeImageDurationSec: 2,
    afterImageDurationSec: 3,
    textOverlayAppearSec: 1.5,
    musicVolume: 0.3,
    voiceoverVolume: 1.0,
    outputResolution: '1080' as const,
    outputFps: 30,
  },

  // --------------------------------------------------------------------------
  // ElevenLabs Voice Mapping (brand tone → voice)
  // --------------------------------------------------------------------------
  elevenLabs: {
    voiceMap: {
      warm_and_friendly: { voiceName: 'Rachel', voiceId: '21m00Tcm4TlvDq8ikWAM' },
      polished_and_premium: { voiceName: 'Bella', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
      clinical_and_expert: { voiceName: 'Antoni', voiceId: 'ErXwobaYiN019PkySvjV' },
      edgy_and_bold: { voiceName: 'Arnold', voiceId: 'VR6AewLTigWG4xSOukaG' },
      soft_and_nurturing: { voiceName: 'Elli', voiceId: 'MF3mGyEYCl7XYWbV9V6O' },
      playful_and_fun: { voiceName: 'Domi', voiceId: 'AZnzlk1XvdvUeBnXmlld' },
    },
    defaultStability: 0.5,
    defaultSimilarityBoost: 0.75,
    defaultStyle: 0.0,
  },

  // --------------------------------------------------------------------------
  // WebSocket Progress Mapping
  // --------------------------------------------------------------------------
  progressMap: {
    created: { percent: 0, step: 'Submitting your content request...' },
    queued: { percent: 5, step: 'Getting your content ready...' },
    processing_image: { percent: 20, step: 'Applying your brand style to the photo...' },
    processing_vision: { percent: 35, step: 'Understanding what was done in this appointment...' },
    building_prompt: { percent: 50, step: 'Reading your Brand DNA...' },
    generating_text: { percent: 70, step: 'Writing your caption in your voice...' },
    generating_reel: { percent: 85, step: 'Assembling your Reel...' },
    completed: { percent: 100, step: 'Your content is ready to review' },
    failed: { percent: 0, step: 'Something went wrong — we\'re looking into it' },
    retrying: { percent: 0, step: 'Retrying your content request...' },
    blocked: { percent: 0, step: 'Content blocked — consent settings have changed' },
    dead_letter: { percent: 0, step: 'Content request could not be completed' },
  },

  // --------------------------------------------------------------------------
  // OpenTelemetry
  // --------------------------------------------------------------------------
  otel: {
    serviceName: 'growthstudio-ai-layer',
    serviceVersion: '1.0.0',
    metricsEndpoint: '/metrics',
  },

  // --------------------------------------------------------------------------
  // Firebase Settings
  firebase: {
    projectId: process.env['FIREBASE_PROJECT_ID'] || '',
    clientEmail: process.env['FIREBASE_CLIENT_EMAIL'] || '',
    privateKey: process.env['FIREBASE_PRIVATE_KEY'] || '',
    storageBucket: process.env['FIREBASE_STORAGE_BUCKET'] || '',
    presignedUrlExpirySeconds: 600,
  },

  // --------------------------------------------------------------------------
  // Cost Estimation (USD per 1K tokens — update when pricing changes)
  // --------------------------------------------------------------------------
  pricing: {
    'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
    'gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
    'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  },
} as const;

export type AIConfig = typeof AI_CONFIG;
