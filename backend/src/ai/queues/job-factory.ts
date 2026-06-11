// ============================================================================
// job-factory.ts — Validates Input, Builds Job Payload, Pushes to Queue
// The API layer calls this. It never waits for generation to complete.
// Returns a Job ID within 200ms.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type Redis from 'ioredis';
import { contentGenerationQueue } from './queue.definitions';
import { ConsentGuard } from '../guards/consent.guard';
import { AI_CONFIG } from '../../config/ai.config';
import type {
  GenerationJobPayload,
  BrandDNARecord,
  ConsentRecord,
  GoldenExample,
  ImageAsset,
  GenerationOptions,
  BusinessGoalType,
  UserTier,
} from '../types/job-payload.types';
import type { JobAcceptedResponse } from '../types/generation-result.types';

interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  remainingGenerations?: number;
  remainingReels?: number;
  retryAfterMs?: number;
}
import { PrismaClient } from '@prisma/client';

// Helper — returns current year-month string e.g. '2026-06'
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Input shape expected from the API route handler
// ---------------------------------------------------------------------------

export interface CreateGenerationJobInput {
  tenantId: string;
  appointmentId: string;
  clientId: string;
  generationOptions: GenerationOptions;
}

// ---------------------------------------------------------------------------
// Rate Limiter — Sliding Window via Redis
// ---------------------------------------------------------------------------

class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkAndIncrement(
    key: string,
    limit: number,
    windowSec: number
  ): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    // Sliding window: remove old entries, count current, add new
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${uuidv4()}`);
    pipeline.expire(key, windowSec);

    const results = await pipeline.exec();

    // Result at index 1 is the count BEFORE this request
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= limit) {
      return {
        allowed: false,
        reason: `Limit of ${limit} requests per day reached`,
        retryAfterMs: windowSec * 1000,
      };
    }

    return {
      allowed: true,
      remainingGenerations: limit - currentCount - 1,
    };
  }

  async checkDebounce(key: string, ttlSec: number): Promise<boolean> {
    const exists = await this.redis.exists(key);
    if (exists) return false;  // debounce active — not allowed
    await this.redis.set(key, '1', 'EX', ttlSec);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Job Factory
// ---------------------------------------------------------------------------

export class JobFactory {
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly consentGuard: ConsentGuard
  ) {
    this.rateLimiter = new RateLimiter(redis);
  }

  // --------------------------------------------------------------------------
  // Main Entry Point — called by API route
  // --------------------------------------------------------------------------

  async createGenerationJob(
    input: CreateGenerationJobInput
  ): Promise<JobAcceptedResponse> {
    const { tenantId, appointmentId, clientId, generationOptions } = input;
    const tier: UserTier = generationOptions.userTier;
    const limits = AI_CONFIG.rateLimits[tier];
    const ym = currentYearMonth();
    const DAY_SEC = AI_CONFIG.cache.rateLimitWindowSec;   // 24h
    const MONTH_SEC = 31 * 24 * 3600;                     // ~31 days

    // 1a. Minimum interval between job submissions (anti-spam)
    const lastSubmitKey = AI_CONFIG.redisKeys.rateLimitLastSubmission(tenantId);
    const lastSubmit = await this.redis.get(lastSubmitKey);
    if (lastSubmit) {
      throw new RateLimitError(
        `Please wait ${limits.minJobIntervalSec} seconds between submissions`,
        'RATE_LIMIT_INTERVAL'
      );
    }

    // 1b. Concurrent job cap
    const concurrentKey = AI_CONFIG.redisKeys.rateLimitConcurrent(tenantId);
    const activeJobs = await this.redis.get(concurrentKey);
    if (activeJobs && parseInt(activeJobs, 10) >= limits.maxConcurrentJobs) {
      throw new RateLimitError(
        `Maximum ${limits.maxConcurrentJobs} concurrent jobs reached. Please wait for a job to finish.`,
        'RATE_LIMIT_CONCURRENT'
      );
    }

    // 1c. Daily generation limit (sliding window)
    const genLimitKey = AI_CONFIG.redisKeys.rateLimitGenerations(tenantId);
    const genCheck = await this.rateLimiter.checkAndIncrement(
      genLimitKey,
      limits.maxGenerationsPerDay,
      DAY_SEC
    );
    if (!genCheck.allowed) {
      throw new RateLimitError(genCheck.reason ?? 'Daily generation limit reached', 'RATE_LIMIT_DAILY');
    }

    // 1d. Monthly generation limit (simple counter with monthly TTL)
    const genMonthKey = AI_CONFIG.redisKeys.rateLimitGenerationsMonthly(tenantId, ym);
    const genMonthCheck = await this.rateLimiter.checkAndIncrement(
      genMonthKey,
      limits.maxGenerationsPerMonth,
      MONTH_SEC
    );
    if (!genMonthCheck.allowed) {
      throw new RateLimitError('Monthly generation limit reached. Resets on the 1st of next month.', 'RATE_LIMIT_MONTHLY');
    }

    // 1e. Image generation limits (carousel + story each generate multiple images)
    const hasImageGen = generationOptions.outputFormats.includes('carousel') ||
                        generationOptions.outputFormats.includes('story');
    if (hasImageGen) {
      const imgGenKey = AI_CONFIG.redisKeys.rateLimitImageGen(tenantId);
      const imgGenCheck = await this.rateLimiter.checkAndIncrement(
        imgGenKey,
        limits.maxImageGenerationsPerDay,
        DAY_SEC
      );
      if (!imgGenCheck.allowed) {
        throw new RateLimitError('Daily AI image generation limit reached', 'RATE_LIMIT_IMAGE_DAILY');
      }

      const imgGenMonthKey = AI_CONFIG.redisKeys.rateLimitImageGenMonthly(tenantId, ym);
      const imgGenMonthCheck = await this.rateLimiter.checkAndIncrement(
        imgGenMonthKey,
        limits.maxImageGenerationsPerMonth,
        MONTH_SEC
      );
      if (!imgGenMonthCheck.allowed) {
        throw new RateLimitError('Monthly AI image generation limit reached. Resets on the 1st of next month.', 'RATE_LIMIT_IMAGE_MONTHLY');
      }
    }

    // 2. Reel rate limit check (if reel requested)
    if (generationOptions.outputFormats.includes('reel')) {
      const reelLimitKey = AI_CONFIG.redisKeys.rateLimitReels(tenantId);
      const reelCheck = await this.rateLimiter.checkAndIncrement(
        reelLimitKey,
        limits.maxReelsPerDay,
        DAY_SEC
      );
      if (!reelCheck.allowed) {
        throw new RateLimitError(reelCheck.reason ?? 'Daily Reel limit reached', 'RATE_LIMIT_REELS');
      }
    }

    // 3. Consent validation (first checkpoint)
    const consentResult = await this.consentGuard.validateAtSubmission(
      appointmentId,
      clientId
    );
    if (!consentResult.valid) {
      throw new ConsentError(
        `Consent invalid: ${consentResult.reason}`,
        consentResult.reason ?? 'not_found'
      );
    }

    // 4. Fetch all required data from DB
    const [consentRecord, brandDNA, goldenExamples, appointment, businessGoal, imageAssets] =
      await Promise.all([
        this.fetchConsentRecord(clientId),
        this.fetchBrandDNA(tenantId),
        this.fetchGoldenExamples(tenantId),
        this.fetchAppointment(appointmentId),
        this.fetchBusinessGoal(tenantId),
        this.fetchImageAssets(appointmentId),
      ]);

    // 5. Validate all required data is present
    this.assertDataPresent({ consentRecord, brandDNA, appointment, businessGoal });

    // 6. Build the immutable job payload
    const jobId = uuidv4();
    const priority: 1 | 5 = tier === 'premium' ? 1 : 5;

    const payload: GenerationJobPayload = {
      jobId,
      tenantId,
      appointmentId,
      clientId,
      consentSnapshot: consentRecord!,
      brandDNA: brandDNA!,
      businessGoal: businessGoal! as BusinessGoalType,
      imageAssets: imageAssets ?? [],
      generationOptions,
      goldenExamples: goldenExamples ?? [],
      createdAt: new Date().toISOString(),
      priority,
    };

    // 7. Persist initial job record to DB
    await this.persistJobRecord(payload);

    // 8. Push to BullMQ queue
    await contentGenerationQueue.add(
      `generation:${jobId}`,
      payload,
      {
        jobId,
        ...AI_CONFIG.queues.contentGeneration.defaultJobOptions,
      }
    );

    // 9. Set the minimum-interval debounce key AFTER successful enqueue
    await this.redis.set(lastSubmitKey, '1', 'EX', limits.minJobIntervalSec);

    // 10. Increment concurrent job counter (expires after 10 minutes — job TTL)
    const pipe = this.redis.pipeline();
    pipe.incr(concurrentKey);
    pipe.expire(concurrentKey, 600);
    await pipe.exec();

    const estimatedWait = await this.estimateWaitSeconds(priority);

    return {
      jobId,
      status: 'accepted',
      message: 'Your content is being generated. You\'ll receive live updates momentarily.',
      estimatedWaitSeconds: estimatedWait,
    };
  }

  // --------------------------------------------------------------------------
  // Tweak Rate Check — enforced before calling /tweak endpoint
  // --------------------------------------------------------------------------

  async checkTweakAllowed(
    tenantId: string,
    contentItemId: string
  ): Promise<void> {
    const tweakKey = AI_CONFIG.redisKeys.rateLimitTweaks(tenantId, contentItemId);
    const tier = await this.fetchTenantTier(tenantId);
    const limit = AI_CONFIG.rateLimits[tier].maxTweaksPerContentItem;

    // Tweaks use a counter rather than a time window
    const count = await this.redis.incr(tweakKey);
    if (count === 1) {
      // First tweak — set TTL of 90 days (content item lifespan)
      await this.redis.expire(tweakKey, 90 * 24 * 3600);
    }
    if (count > limit) {
      throw new RateLimitError(
        `Maximum ${limit} tweaks per content item reached`,
        'RATE_LIMIT_TWEAKS'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Regeneration Debounce — 10 seconds between regenerate calls per item
  // --------------------------------------------------------------------------

  async checkRegenerationDebounce(contentItemId: string): Promise<void> {
    const debounceKey = AI_CONFIG.redisKeys.regenerationDebounce(contentItemId);
    const allowed = await this.rateLimiter.checkDebounce(
      debounceKey,
      AI_CONFIG.rateLimits.regenerationDebounceSec
    );
    if (!allowed) {
      throw new RateLimitError(
        'Please wait a moment before regenerating',
        'RATE_LIMIT_DEBOUNCE'
      );
    }
  }

  // --------------------------------------------------------------------------
  // DB Fetchers
  // --------------------------------------------------------------------------

  private async fetchConsentRecord(clientId: string): Promise<ConsentRecord | null> {
    const records = await this.prisma.$queryRaw<ConsentRecord[]>`
      SELECT consent_id AS "consentId",
             client_id  AS "clientId",
             tenant_id  AS "tenantId",
             status,
             restrictions,
             granted_at      AS "grantedAt",
             expires_at      AS "expiresAt",
             last_updated_at AS "lastUpdatedAt",
             version
      FROM consent_records
      WHERE client_id = ${clientId}
      ORDER BY last_updated_at DESC
      LIMIT 1
    `;
    return records[0] ?? null;
  }

  private async fetchBrandDNA(tenantId: string): Promise<BrandDNARecord | null> {
    const records = await this.prisma.$queryRaw<BrandDNARecord[]>`
      SELECT brand_dna_id         AS "brandDNAId",
             tenant_id            AS "tenantId",
             version,
             primary_tone         AS "primaryTone",
             secondary_tone       AS "secondaryTone",
             persona_description  AS "personaDescription",
             preferred_vocabulary AS "preferredVocabulary",
             blacklisted_words    AS "blacklistedWords",
             client_terminology   AS "clientTerminology",
             business_name        AS "businessName",
             hero_services        AS "heroServices",
             target_audience      AS "targetAudience",
             unique_selling_point AS "uniqueSellingPoint",
             location_city        AS "locationCity",
             primary_brand_colour AS "primaryBrandColour",
             secondary_brand_colour AS "secondaryBrandColour",
             brand_font_preference AS "brandFontPreference",
             mood_tag             AS "moodTag",
             caption_length_preference AS "captionLengthPreference",
             use_emojis           AS "useEmojis",
             emoji_style          AS "emojiStyle",
             preferred_cta_style  AS "preferredCTAStyle",
             complexity_score     AS "complexityScore",
             last_updated_at      AS "lastUpdatedAt"
      FROM brand_dna
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `;
    return records[0] ?? null;
  }

  private async fetchGoldenExamples(tenantId: string): Promise<GoldenExample[]> {
    return this.prisma.$queryRaw<GoldenExample[]>`
      SELECT example_id    AS "exampleId",
             tenant_id     AS "tenantId",
             caption_text  AS "captionText",
             platform,
             quality_score AS "qualityScore",
             hashtags,
             posted_at     AS "postedAt"
      FROM golden_examples
      WHERE tenant_id = ${tenantId}
      ORDER BY quality_score DESC
      LIMIT 5
    `;
  }

  private async fetchAppointment(appointmentId: string): Promise<unknown> {
    const records = await this.prisma.$queryRaw<unknown[]>`
      SELECT * FROM appointments WHERE appointment_id = ${appointmentId} LIMIT 1
    `;
    return records[0] ?? null;
  }

  private async fetchBusinessGoal(tenantId: string): Promise<string | null> {
    const records = await this.prisma.$queryRaw<Array<{ goal_type: string }>>`
      SELECT goal_type
      FROM business_goals
      WHERE tenant_id = ${tenantId}
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY activated_at DESC
      LIMIT 1
    `;
    return records[0]?.goal_type ?? null;
  }

  private async fetchImageAssets(appointmentId: string): Promise<ImageAsset[]> {
    return this.prisma.$queryRaw<ImageAsset[]>`
      SELECT raw_storage_path        AS "rawStoragePath",
             cloudinary_public_id    AS "cloudinaryPublicId",
             vision_analysis_cache   AS "visionAnalysisCache",
             s3_object_hash          AS "s3ObjectHash"
      FROM appointment_images
      WHERE appointment_id = ${appointmentId}
      ORDER BY created_at ASC
    `;
  }

  private async fetchTenantTier(tenantId: string): Promise<UserTier> {
    const records = await this.prisma.$queryRaw<Array<{ tier: string }>>`
      SELECT tier FROM tenants WHERE tenant_id = ${tenantId} LIMIT 1
    `;
    const tier = records[0]?.tier;
    return tier === 'premium' ? 'premium' : 'standard';
  }

  // --------------------------------------------------------------------------
  // Persist initial job record to generation_jobs table
  // --------------------------------------------------------------------------

  private async persistJobRecord(payload: GenerationJobPayload): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO generation_jobs (
        job_id, tenant_id, appointment_id, client_id,
        state, priority, created_at, updated_at
      ) VALUES (
        ${payload.jobId}::uuid,
        ${payload.tenantId}::uuid,
        ${payload.appointmentId}::uuid,
        ${payload.clientId}::uuid,
        'CREATED',
        ${payload.priority},
        ${payload.createdAt}::timestamptz,
        ${payload.createdAt}::timestamptz
      )
    `;
  }

  // --------------------------------------------------------------------------
  // Estimate wait time based on current queue depth
  // --------------------------------------------------------------------------

  private async estimateWaitSeconds(priority: 1 | 5): Promise<number> {
    const counts = await contentGenerationQueue.getJobCounts(
      'waiting', 'active'
    );
    const queueDepth = (counts.waiting ?? 0) + (counts.active ?? 0);
    const concurrency = AI_CONFIG.queues.contentGeneration.concurrency;
    // Rough estimate: avg 25s per job, scaled by queue depth and concurrency
    const baseEstimate = Math.ceil((queueDepth / concurrency) * 25);
    // Premium gets faster estimated wait (priority 1 jumps the queue)
    return priority === 1 ? Math.max(5, Math.ceil(baseEstimate * 0.5)) : Math.max(10, baseEstimate);
  }

  // --------------------------------------------------------------------------
  // Assertion helpers
  // --------------------------------------------------------------------------

  private assertDataPresent(data: {
    consentRecord: ConsentRecord | null;
    brandDNA: BrandDNARecord | null;
    appointment: unknown;
    businessGoal: string | null;
  }): void {
    if (!data.consentRecord) throw new JobFactoryError('Consent record not found');
    if (!data.brandDNA) throw new JobFactoryError('Brand DNA not configured for this account');
    if (!data.appointment) throw new JobFactoryError('Appointment not found');
    if (!data.businessGoal) throw new JobFactoryError('No active business goal set for this account');
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class JobFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobFactoryError';
  }
}

export class ConsentError extends Error {
  constructor(
    message: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'ConsentError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}
