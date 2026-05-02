// ============================================================================
// generation-orchestrator.ts — Assembles All Chains Into the Full Pipeline
// Manages state transitions, partial success, and component-level tracking.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { ConsentGuard } from '../guards/consent.guard';
import { ModelRouter } from './model-router';
import { PromptBuilder } from './prompt-builder';
import { VisionAnalysisChain } from '../chains/vision-analysis.chain';
import { CaptionGenerationChain } from '../chains/caption-generation.chain';
import { ReelScriptChain } from '../chains/reel-script.chain';
import { PlatformVariantChain } from '../chains/platform-variant.chain';
import { JobProgressEmitter } from '../emitters/job-progress.emitter';
import type { GenerationJobPayload } from '../types/job-payload.types';
import type { GenerationResult, ComponentStatus } from '../types/generation-result.types';
import type { VisionAnalysisResult, CaptionGenerationResult, ReelScriptResult, PlatformVariantResult } from '../types/chain-output.types';
import { validateStateTransition } from '../types/job-payload.types';
import type { JobState } from '../types/job-payload.types';

export class GenerationOrchestrator {
  private readonly modelRouter: ModelRouter;
  private readonly promptBuilder: PromptBuilder;
  private readonly visionChain: VisionAnalysisChain;
  private readonly captionChain: CaptionGenerationChain;
  private readonly reelScriptChain: ReelScriptChain;
  private readonly platformVariantChain: PlatformVariantChain;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly consentGuard: ConsentGuard,
    private readonly progressEmitter: JobProgressEmitter,
    modelRouter: ModelRouter,
    promptBuilder: PromptBuilder
  ) {
    this.modelRouter = modelRouter;
    this.promptBuilder = promptBuilder;
    this.visionChain = new VisionAnalysisChain(prisma, modelRouter);
    this.captionChain = new CaptionGenerationChain();
    this.reelScriptChain = new ReelScriptChain(modelRouter);
    this.platformVariantChain = new PlatformVariantChain(modelRouter);
  }

  // --------------------------------------------------------------------------
  // Main Pipeline Execution
  // --------------------------------------------------------------------------

  async run(payload: GenerationJobPayload): Promise<GenerationResult> {
    const { jobId, tenantId, clientId, consentSnapshot, brandDNA, generationOptions } = payload;
    const jobStart = Date.now();

    // ── Checkpoint 2: Consent re-validation inside worker ──
    const consentCheck = await this.consentGuard.validateAtProcessing(
      consentSnapshot,
      clientId
    );
    if (!consentCheck.valid) {
      await this.transitionState(jobId, 'QUEUED', 'BLOCKED');
      throw new ConsentBlockedError(`Job ${jobId} blocked: ${consentCheck.reason}`);
    }

    // Track partial results for partial success support
    let visionResult: VisionAnalysisResult | null = null;
    let captionResult: CaptionGenerationResult | null = null;
    let reelScriptResult: ReelScriptResult | null = null;
    let platformVariants: PlatformVariantResult[] | null = null;

    const componentStatus: {
      caption: ComponentStatus;
      image: ComponentStatus;
      reel: ComponentStatus;
    } = { caption: 'pending', image: 'pending', reel: 'pending' };

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let modelUsed = AI_CONFIG_MODEL_LABEL(payload);

    // ── Step 1: Vision Analysis ──────────────────────────────────────────────
    await this.transitionState(jobId, 'QUEUED', 'PROCESSING_IMAGE');
    await this.progressEmitter.emit(jobId, tenantId, 'PROCESSING_IMAGE');

    if (payload.imageAssets.length > 0) {
      await this.transitionState(jobId, 'PROCESSING_IMAGE', 'PROCESSING_VISION');
      await this.progressEmitter.emit(jobId, tenantId, 'PROCESSING_VISION');

      try {
        const primaryImage = payload.imageAssets[0]!;
        const visionAnalysis = await this.visionChain.analyse({
          imageUrl: `https://res.cloudinary.com/${process.env['CLOUDINARY_CLOUD_NAME']}/image/upload/${primaryImage.cloudinaryPublicId ?? primaryImage.rawStoragePath}`,
          storagePath: primaryImage.rawStoragePath,
          cachedResult: primaryImage.visionAnalysisCache,
        });
        visionResult = visionAnalysis.result;
      } catch (err) {
        // Vision failure is non-fatal — caption still generated from appointment context
        console.error(`[Orchestrator] Vision analysis failed for job ${jobId}:`, err);
      }
    }

    // ── Step 2: Prompt Building ──────────────────────────────────────────────
    await this.transitionState(jobId, 'PROCESSING_VISION', 'BUILDING_PROMPT');
    await this.progressEmitter.emit(jobId, tenantId, 'BUILDING_PROMPT');

    const primaryPlatform = generationOptions.platform[0] ?? 'instagram';
    const assembledPrompt = await this.promptBuilder.assembleGenerationPrompt({
      brandDNA,
      visionResult,
      businessGoal: payload.businessGoal,
      goldenExamples: payload.goldenExamples,
      platform: primaryPlatform,
    });

    // ── Step 3: Caption Generation ───────────────────────────────────────────
    await this.transitionState(jobId, 'BUILDING_PROMPT', 'GENERATING_TEXT');
    await this.progressEmitter.emit(jobId, tenantId, 'GENERATING_TEXT');

    const routingContext = {
      userTier: generationOptions.userTier,
      brandDNAComplexityScore: brandDNA.complexityScore,
    };
    const llmConfig = this.modelRouter.selectTextModel(routingContext);
    modelUsed = `${llmConfig.provider}/${llmConfig.modelId}`;

    try {
      captionResult = await this.captionChain.generate({
        assembledPrompt,
        llmConfig,
        brandDNABlacklist: brandDNA.blacklistedWords,
        allowRetry: true,
      });
      componentStatus.caption = 'completed';

      // Emit partial result — send caption to frontend as soon as it's ready
      await this.progressEmitter.emitPartialResult(jobId, tenantId, {
        caption: captionResult.caption,
        hashtags: captionResult.hashtags,
      });
    } catch (err) {
      componentStatus.caption = 'failed';
      console.error(`[Orchestrator] Caption generation failed for job ${jobId}:`, err);
    }

    // ── Step 4: Platform Variants (conditional) ───────────────────────────────
    if (captionResult && generationOptions.platform.length > 1) {
      try {
        platformVariants = await this.platformVariantChain.generateVariants({
          primaryCaption: captionResult,
          targetPlatforms: generationOptions.platform,
          brandDNA,
        });
      } catch (err) {
        console.error(`[Orchestrator] Platform variant generation failed for job ${jobId}:`, err);
        // Non-fatal — primary caption is still valid
      }
    }

    // ── Step 5: Reel Script (conditional) ────────────────────────────────────
    if (
      captionResult &&
      generationOptions.includeVoiceover &&
      generationOptions.outputFormats.includes('reel')
    ) {
      try {
        reelScriptResult = await this.reelScriptChain.generate({
          caption: captionResult,
          visionResult,
          brandDNA,
        });
      } catch (err) {
        console.error(`[Orchestrator] Reel script generation failed for job ${jobId}:`, err);
        // Non-fatal
      }
    }

    // ── Step 6: Persist Result ────────────────────────────────────────────────
    const processingMs = Date.now() - jobStart;
    const contentItemId = await this.persistResult({
      payload,
      captionResult,
      platformVariants,
      reelScriptResult,
      visionResult,
      componentStatus,
      modelUsed,
      totalTokensIn,
      totalTokensOut,
      processingMs,
    });

    // ── Step 7: Final State Transition ────────────────────────────────────────
    await this.transitionState(jobId, 'GENERATING_TEXT', 'COMPLETED');
    await this.progressEmitter.emit(jobId, tenantId, 'COMPLETED');

    return {
      jobId,
      tenantId,
      appointmentId: payload.appointmentId,
      contentItemId,
      captionStatus: componentStatus.caption,
      imageStatus: componentStatus.image,
      reelStatus: componentStatus.reel,
      caption: captionResult,
      platformVariants,
      processedImage: null,     // Set by image-processing worker separately
      reel: null,               // Set by video-assembly worker separately
      reelScript: reelScriptResult,
      visionAnalysis: visionResult,
      modelUsed,
      totalTokensInput: totalTokensIn,
      totalTokensOutput: totalTokensOut,
      estimatedCostUSD: this.modelRouter.estimateCost(
        llmConfig.modelId, totalTokensIn, totalTokensOut
      ),
      totalProcessingTimeMs: processingMs,
      brandVoiceConfidenceScore: captionResult?.brandVoiceConfidenceScore ?? 0,
      completedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // State Machine Transition + DB Update
  // --------------------------------------------------------------------------

  private async transitionState(
    jobId: string,
    from: JobState,
    to: JobState
  ): Promise<void> {
    validateStateTransition(from, to);
    await this.prisma.$executeRaw`
      UPDATE generation_jobs
      SET state = ${to}, updated_at = NOW()
      WHERE job_id = ${jobId}::uuid
    `;
  }

  // --------------------------------------------------------------------------
  // Persist Final Result to content_items
  // --------------------------------------------------------------------------

  private async persistResult(params: {
    payload: GenerationJobPayload;
    captionResult: CaptionGenerationResult | null;
    platformVariants: PlatformVariantResult[] | null;
    reelScriptResult: ReelScriptResult | null;
    visionResult: VisionAnalysisResult | null;
    componentStatus: { caption: ComponentStatus; image: ComponentStatus; reel: ComponentStatus };
    modelUsed: string;
    totalTokensIn: number;
    totalTokensOut: number;
    processingMs: number;
  }): Promise<string> {
    const { payload, captionResult, platformVariants, reelScriptResult, componentStatus } = params;
    const { v4: uuidv4 } = await import('uuid');
    const contentItemId = uuidv4();

    await this.prisma.$executeRaw`
      INSERT INTO content_items (
        content_item_id, job_id, tenant_id, appointment_id,
        caption_status, image_status, reel_status,
        caption, hook_sentence, call_to_action, hashtags, alt_text,
        estimated_read_time, confidence_score,
        platform_variants, reel_script,
        created_at, updated_at, completed_at
      ) VALUES (
        ${contentItemId}::uuid,
        ${payload.jobId}::uuid,
        ${payload.tenantId}::uuid,
        ${payload.appointmentId}::uuid,
        ${componentStatus.caption},
        ${componentStatus.image},
        ${componentStatus.reel},
        ${captionResult?.caption ?? null},
        ${captionResult?.hookSentence ?? null},
        ${captionResult?.callToAction ?? null},
        ${captionResult?.hashtags ?? []}::text[],
        ${captionResult?.altText ?? null},
        ${captionResult?.estimatedReadTime ?? null},
        ${captionResult?.brandVoiceConfidenceScore ?? null},
        ${platformVariants ? JSON.stringify(platformVariants) : null}::jsonb,
        ${reelScriptResult?.script ?? null},
        NOW(), NOW(), NOW()
      )
    `;

    // Update generation_jobs with cost metadata
    await this.prisma.$executeRaw`
      UPDATE generation_jobs
      SET model_used = ${params.modelUsed},
          tokens_input = ${params.totalTokensIn},
          tokens_output = ${params.totalTokensOut},
          processing_ms = ${params.processingMs},
          updated_at = NOW()
      WHERE job_id = ${payload.jobId}::uuid
    `;

    return contentItemId;
  }
}

// Helper to determine model label from payload before routing
function AI_CONFIG_MODEL_LABEL(payload: GenerationJobPayload): string {
  return payload.generationOptions.userTier === 'premium'
    ? 'anthropic/claude-3-5-sonnet-20241022'
    : 'openai/gpt-4o-mini';
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class ConsentBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentBlockedError';
  }
}

