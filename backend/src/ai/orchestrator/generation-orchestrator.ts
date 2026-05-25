// ============================================================================
// generation-orchestrator.ts — Assembles All Chains Into the Full Pipeline
// Manages state transitions, partial success, and component-level tracking.
// ============================================================================

import { Prisma, PrismaClient } from '@prisma/client';
import { ConsentGuard } from '../guards/consent.guard';
import { ModelRouter } from './model-router';
import { PromptBuilder } from './prompt-builder';
import { VisionAnalysisChain } from '../chains/vision-analysis.chain';
import { CaptionGenerationChain } from '../chains/caption-generation.chain';
import { ReelScriptChain } from '../chains/reel-script.chain';
import { PlatformVariantChain } from '../chains/platform-variant.chain';
import { OutputValidator } from '../guards/output-validator';
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
  private readonly outputValidator: OutputValidator;

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
    this.outputValidator = new OutputValidator();
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
      await this.transitionState(jobId, 'queued', 'blocked');
      throw new ConsentBlockedError(`Job ${jobId} blocked: ${consentCheck.reason}`);
    }

    // Track partial results for partial success support
    let visionResult: VisionAnalysisResult | null = null;
    let captionResult: CaptionGenerationResult | null = null;
    let generationOptionsResult: (CaptionGenerationResult & { generatedBy: string })[] = [];
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
    await this.transitionState(jobId, 'queued', 'processing_image');
    await this.progressEmitter.emit(jobId, tenantId, 'processing_image');

    // Always advance through processing_vision — required by state machine regardless of whether images exist
    await this.transitionState(jobId, 'processing_image', 'processing_vision');

    if (payload.imageAssets.length > 0) {
      await this.progressEmitter.emit(jobId, tenantId, 'processing_vision');

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
    await this.transitionState(jobId, 'processing_vision', 'building_prompt');
    await this.progressEmitter.emit(jobId, tenantId, 'building_prompt');

    // Fetch appointment to determine service category mapping
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      select: { serviceCategory: true }
    });

    const isMedical = appointment?.serviceCategory === 'injectables_cosmetic' || 
                      appointment?.serviceCategory === 'laser_treatments';
    const category = isMedical ? 'medical_aesthetics' : 'general';
    
    // Fetch active MasterPrompt based on mapped category
    const masterPrompt = await this.prisma.masterPrompt.findFirst({
      where: { category, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const primaryPlatform = generationOptions.platform[0] ?? 'instagram';
    const assembledPrompt = await this.promptBuilder.assembleGenerationPrompt({
      brandDNA,
      visionResult,
      businessGoal: payload.businessGoal,
      goldenExamples: payload.goldenExamples,
      platform: primaryPlatform,
      serviceCategory: appointment?.serviceCategory as import('../config/service-guardrails').ServiceCategory | undefined,
      masterPromptText: masterPrompt?.systemPrompt,
      consentRestrictions: consentCheck.activeRestrictions,
    });

    // ── Step 3: Caption Generation ───────────────────────────────────────────
    await this.transitionState(jobId, 'building_prompt', 'generating_text');
    await this.progressEmitter.emit(jobId, tenantId, 'generating_text');

    const routingContext = {
      userTier: generationOptions.userTier,
      brandDNAComplexityScore: brandDNA.averageConfidenceScore ?? 0,
    };
    const llmConfig = this.modelRouter.selectTextModel(routingContext);
    modelUsed = `${llmConfig.provider}/${llmConfig.modelId}`;

    try {
      const multiResult = await this.captionChain.generateMultipleOptions({
        assembledPrompt,
        brandDNABlacklist: brandDNA.vocabularyBlacklist ?? brandDNA.blacklistedWords ?? [],
        allowRetry: true,
      });
      captionResult = multiResult.primary;
      generationOptionsResult = multiResult.options;
      
      componentStatus.caption = 'completed';
      const validation = await this.outputValidator.validate(
        captionResult.caption,
        payload.consentSnapshot,
        'general',
        tenantId
      );
      if (validation.correctedOutput) captionResult.caption = validation.correctedOutput;
      if (validation.requiresRegeneration) {
        const retryPrompt = {
          ...assembledPrompt,
          userPrompt: `${assembledPrompt.userPrompt}\n\nCRITICAL REGENERATION REQUIREMENT:\nPrevious output failed validation for:\n- ${validation.hardFailures.join('\n- ')}\nDo not use any prohibited phrasing.`,
        };
        captionResult = await this.captionChain.generate({
          assembledPrompt: retryPrompt,
          llmConfig,
          brandDNABlacklist: brandDNA.blacklistedWords,
          allowRetry: false,
        });
        const secondPass = await this.outputValidator.validate(
          captionResult.caption,
          payload.consentSnapshot,
          'general',
          tenantId
        );
        if (secondPass.requiresRegeneration) componentStatus.caption = 'failed';
      }
      totalTokensIn += captionResult.tokenUsage?.inputTokens ?? 0;
      totalTokensOut += captionResult.tokenUsage?.outputTokens ?? 0;

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
    if (captionResult && generationOptions.outputFormats.includes('reel')) {
      try {
        reelScriptResult = await this.reelScriptChain.generate({
          caption: captionResult,
          visionResult,
          brandDNA,
        });
        componentStatus.reel = 'completed';
      } catch (err) {
        componentStatus.reel = 'failed';
        console.error(`[Orchestrator] Reel script generation failed for job ${jobId}:`, err);
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
      generationOptionsResult,
    });

    // ── Step 7: Final State Transition ────────────────────────────────────────
    await this.transitionState(jobId, 'generating_text', 'completed');
    await this.progressEmitter.emit(jobId, tenantId, 'completed');

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
    await this.prisma.generationJob.update({ where: { id: jobId }, data: { state: to } });
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
    generationOptionsResult: (CaptionGenerationResult & { generatedBy: string })[];
  }): Promise<string> {
    const { payload, captionResult, platformVariants, reelScriptResult, componentStatus, generationOptionsResult } = params;
    const { v4: uuidv4 } = await import('uuid');
    const contentItemId = uuidv4();

    await this.prisma.contentItem.create({
      data: {
        id: contentItemId,
        generationJobId: payload.jobId,
        tenantId: payload.tenantId,
        appointmentId: payload.appointmentId,
        captionStatus: componentStatus.caption,
        imageStatus: componentStatus.image,
        reelStatus: componentStatus.reel,
        caption: captionResult?.caption ?? null,
        hookSentence: captionResult?.hookSentence ?? null,
        callToAction: captionResult?.callToAction ?? null,
        hashtags: captionResult?.hashtags ?? [],
        altText: captionResult?.altText ?? null,
        estimatedReadTime: captionResult?.estimatedReadTime ?? null,
        confidenceScore: captionResult?.brandVoiceConfidenceScore ?? null,
        generationOptions: (Array.isArray(generationOptionsResult) ? generationOptionsResult : [generationOptionsResult]) as unknown as Prisma.InputJsonValue[],
        platformVariants: platformVariants
          ? (platformVariants as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        reelScript: reelScriptResult?.script ?? null,
        completedAt: new Date(),
      },
    });

    // Update generation_jobs with cost metadata
    await this.prisma.generationJob.update({
      where: { id: payload.jobId },
      data: {
        modelUsed: params.modelUsed,
        tokensInput: params.totalTokensIn,
        tokensOutput: params.totalTokensOut,
        processingMs: params.processingMs,
      },
    });

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
