// ============================================================================
// generation-orchestrator.ts â€” Assembles All Chains Into the Full Pipeline
// Manages state transitions, partial success, and component-level tracking.
// ============================================================================

import { Prisma, PrismaClient } from '@prisma/client';
import { ConsentGuard } from '../guards/consent.guard';
import { ModelRouter } from './model-router';
import { PromptBuilder } from './prompt-builder';
import { filterDnaForTier, tierDnaLabel } from '../config/brand-dna-tier-filter';
import { buildStyleDirectionBlock } from '../config/visual-style-library';
import { VisionAnalysisChain } from '../chains/vision-analysis.chain';
import { CaptionGenerationChain } from '../chains/caption-generation.chain';
import { ReelScriptChain } from '../chains/reel-script.chain';
import { PlatformVariantChain } from '../chains/platform-variant.chain';
import { OutputValidator } from '../guards/output-validator';
import { JobProgressEmitter } from '../emitters/job-progress.emitter';
import { ImagePipelineService } from '../services/image-pipeline.service';
import { SharpImagePipelineService } from '../services/sharp-image-pipeline.service';
import { CarouselPipelineService, type CarouselSlides } from '../services/carousel-pipeline.service';
import { CarouselConceptChain } from '../chains/carousel-concept.chain';
import { StoryFrameChain } from '../chains/story-frame.chain';
import { StoryPipelineService, type StoryOutput } from '../services/story-pipeline.service';
import { AiImageGenerationService } from '../services/ai-image-generation.service';
import { LogoOverlayService } from '../services/logo-overlay.service';
import { ReelShotChain, type ReelShotResult } from '../chains/reel-shot.chain';
import { extractBrandVoice } from '../config/brand-voice';
import { AI_CONFIG } from '../../config/ai.config';
import { ElevenLabsService } from '../services/elevenlabs.service';
import { OpenAiTtsService } from '../services/openai-tts.service';
import type { GenerationJobPayload } from '../types/job-payload.types';
import type { GenerationResult, ComponentStatus } from '../types/generation-result.types';
import type { VisionAnalysisResult, CaptionGenerationResult, ReelScriptResult, PlatformVariantResult, ImageProcessingResult, VoiceoverResult } from '../types/chain-output.types';
import { validateStateTransition } from '../types/job-payload.types';
import type { JobState } from '../types/job-payload.types';

// New services and chains
import { TierGatingService } from '../services/tier-gating.service';
import { ArtDirectorBriefChain } from '../chains/art-director-brief.chain';
import { ScoringGateService } from '../services/scoring-gate.service';
import { BrandStrategistChain } from '../chains/brand-strategist.chain';
import { CreativeDirectorChain } from '../chains/creative-director.chain';
import { GridOrchestratorService } from '../services/grid-orchestrator.service';
import { MoodboardVisionChain } from '../chains/moodboard-vision.chain';
import { AssetLibraryVisionChain, type AssetLibraryItemInput } from '../chains/asset-library-vision.chain';
import { TemplateAgentService } from '../services/template-agent.service';
import { ImageEnhancementService } from '../services/image-enhancement.service';

type NotifyFn = (dto: {
  tenantId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) => Promise<void>;

export class GenerationOrchestrator {
  private readonly modelRouter: ModelRouter;
  private readonly promptBuilder: PromptBuilder;
  private readonly visionChain: VisionAnalysisChain;
  private readonly captionChain: CaptionGenerationChain;
  private readonly reelScriptChain: ReelScriptChain;
  private readonly platformVariantChain: PlatformVariantChain;
  private readonly outputValidator: OutputValidator;
  private readonly imagePipeline: ImagePipelineService;
  private readonly sharpPipeline: SharpImagePipelineService;
  private readonly carouselPipeline: CarouselPipelineService;
  private readonly elevenLabsService: ElevenLabsService;
  private readonly openAiTtsService: OpenAiTtsService;
  private readonly carouselConceptChain: CarouselConceptChain;
  private readonly storyFrameChain: StoryFrameChain;
  private readonly storyPipeline: StoryPipelineService;
  private readonly reelShotChain: ReelShotChain;
  private readonly aiImageGen: AiImageGenerationService;
  private readonly logoOverlay: LogoOverlayService;

  // New properties
  private readonly tierGating: TierGatingService;
  private readonly artDirectorBriefChain: ArtDirectorBriefChain;
  private readonly scoringGate: ScoringGateService;
  private readonly brandStrategistChain: BrandStrategistChain;
  private readonly creativeDirectorChain: CreativeDirectorChain;
  private readonly gridOrchestrator: GridOrchestratorService;
  private readonly moodboardVisionChain: MoodboardVisionChain;
  private readonly assetLibraryVisionChain: AssetLibraryVisionChain;
  private readonly templateAgent: TemplateAgentService;
  private readonly imageEnhancementService: ImageEnhancementService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly consentGuard: ConsentGuard,
    private readonly progressEmitter: JobProgressEmitter,
    modelRouter: ModelRouter,
    promptBuilder: PromptBuilder,
    private readonly notify?: NotifyFn,
  ) {
    this.modelRouter = modelRouter;
    this.promptBuilder = promptBuilder;
    this.visionChain = new VisionAnalysisChain(prisma, modelRouter);
    this.captionChain = new CaptionGenerationChain();
    this.reelScriptChain = new ReelScriptChain(modelRouter);
    this.platformVariantChain = new PlatformVariantChain(modelRouter);
    this.outputValidator = new OutputValidator();
    this.imagePipeline = new ImagePipelineService(prisma);
    this.sharpPipeline = new SharpImagePipelineService();
    this.carouselPipeline = new CarouselPipelineService();
    this.elevenLabsService = new ElevenLabsService();
    this.openAiTtsService = new OpenAiTtsService();
    this.carouselConceptChain = new CarouselConceptChain();
    this.storyFrameChain = new StoryFrameChain();
    this.storyPipeline = new StoryPipelineService();
    this.reelShotChain = new ReelShotChain();
    this.aiImageGen = new AiImageGenerationService();
    this.logoOverlay = new LogoOverlayService();

    // New instantiations
    this.tierGating = new TierGatingService(prisma);
    this.artDirectorBriefChain = new ArtDirectorBriefChain();
    this.scoringGate = new ScoringGateService();
    this.brandStrategistChain = new BrandStrategistChain();
    this.creativeDirectorChain = new CreativeDirectorChain();
    // PrismaClient from NestJS main passes a PrismaService which is compatible
    this.gridOrchestrator = new GridOrchestratorService(prisma as any);
    this.moodboardVisionChain = new MoodboardVisionChain();
    this.assetLibraryVisionChain = new AssetLibraryVisionChain();
    this.templateAgent = new TemplateAgentService();
    this.imageEnhancementService = new ImageEnhancementService();
  }

  // --------------------------------------------------------------------------
  // Main Pipeline Execution
  // --------------------------------------------------------------------------

  async run(payload: GenerationJobPayload): Promise<GenerationResult> {
    // Tweak jobs only carry { jobId } in the BullMQ payload â€” detect and delegate
    if (!payload.tenantId) {
      return this.runTweak(payload.jobId);
    }

    const { jobId, tenantId, clientId, consentSnapshot, brandDNA, generationOptions } = payload;
    const jobStart = Date.now();

    // Validate Subscription Tier limits and gates (Tier 1 vs Tier 2 vs Tier 3)
    const tenantRecord = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const isNonBooking = !payload.appointmentId;
    await this.tierGating.validateRequest(tenantId, tenantRecord?.subscriptionTier ?? 'basic', isNonBooking);

    // â”€â”€ Checkpoint 2: Consent re-validation inside worker â”€â”€
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
    let strategistOutput: any = null;

    const componentStatus: {
      caption: ComponentStatus;
      image: ComponentStatus;
      reel: ComponentStatus;
    } = { caption: 'pending', image: 'pending', reel: 'pending' };

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let modelUsed = AI_CONFIG_MODEL_LABEL(payload);

    // â”€â”€ Step 1: Vision Analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await this.transitionState(jobId, 'queued', 'processing_image');
    await this.progressEmitter.emit(jobId, tenantId, 'processing_image');

    // Always advance through processing_vision â€” required by state machine regardless of whether images exist
    await this.transitionState(jobId, 'processing_image', 'processing_vision');

    // Run appointment image vision + moodboard vision in parallel (both non-fatal)
    const moodboardUrls: string[] = Array.isArray((brandDNA as any).moodboardUrls)
      ? (brandDNA as any).moodboardUrls.filter(Boolean)
      : [];
    const moodboardLabels: string[] = Array.isArray((brandDNA as any).moodboardLabels)
      ? (brandDNA as any).moodboardLabels
      : [];

    let moodboardVisionSummary: string | null = null;
    let assetLibraryVisionSummary: string | null = null;

    // Extract asset library items from brandDnaV2 JSON, respecting usage and consent rules
    const rawAssetLibrary: AssetLibraryItemInput[] = (() => {
      try {
        const v2 = brandDNA.brandDnaV2
          ? (typeof brandDNA.brandDnaV2 === 'string' ? JSON.parse(brandDNA.brandDnaV2) : brandDNA.brandDnaV2) as Record<string, any>
          : null;
        return Array.isArray(v2?.asset_library) ? v2.asset_library : [];
      } catch { return []; }
    })();

    const appointmentVisionTask = (async () => {
      if (payload.imageAssets.length === 0) return;
      await this.progressEmitter.emit(jobId, tenantId, 'processing_vision');
      const primaryImage = payload.imageAssets[0]!;
      const isLocalVisionUrl = primaryImage.rawStoragePath.startsWith('http://localhost') ||
        primaryImage.rawStoragePath.startsWith('http://127.');
      if (isLocalVisionUrl) return;
      try {
        const imageUrl = (process.env['CLOUDINARY_CLOUD_NAME'] && primaryImage.cloudinaryPublicId)
          ? `https://res.cloudinary.com/${process.env['CLOUDINARY_CLOUD_NAME']}/image/upload/${primaryImage.cloudinaryPublicId}`
          : primaryImage.rawStoragePath;
        const visionAnalysis = await this.visionChain.analyse({
          imageUrl,
          storagePath: primaryImage.rawStoragePath,
          imageHash: primaryImage.s3ObjectHash,
          cachedResult: primaryImage.visionAnalysisCache,
        });
        visionResult = visionAnalysis.result;
      } catch {
        // Non-fatal â€” caption still generated from appointment context
      }
    })();

    const moodboardVisionTask = (async () => {
      const cache: any[] = Array.isArray((brandDNA as any).moodboardIntentsCache)
        ? (brandDNA as any).moodboardIntentsCache
        : [];
      
      if (cache.length > 0) {
        // "Roulette" Algorithm: pick 1 lighting, 1 texture, 1 mood to prevent hallucination
        const lightings = cache.filter(c => c.intent.toLowerCase() === 'lighting');
        const textures = cache.filter(c => c.intent.toLowerCase() === 'texture');
        const moods = cache.filter(c => ['mood', 'vibe', 'style'].includes(c.intent.toLowerCase()));
        
        const selected = [];
        if (lightings.length > 0) selected.push(lightings[Math.floor(Math.random() * lightings.length)].summary);
        if (textures.length > 0) selected.push(textures[Math.floor(Math.random() * textures.length)].summary);
        if (moods.length > 0) selected.push(moods[Math.floor(Math.random() * moods.length)].summary);
        
        if (selected.length > 0) {
          moodboardVisionSummary = selected.join(' ');
        }
      }
    })();

    const assetLibraryVisionTask = (async () => {
      if (rawAssetLibrary.length === 0) return;
      try {
        const summary = await this.assetLibraryVisionChain.analyse(rawAssetLibrary);
        if (summary) assetLibraryVisionSummary = summary;
      } catch {
        // Non-fatal â€” generation continues without asset library vision if it fails
      }
    })();

    await Promise.all([appointmentVisionTask, moodboardVisionTask, assetLibraryVisionTask]);

    // â”€â”€ Step 2: Prompt Building â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await this.transitionState(jobId, 'processing_vision', 'building_prompt');
    await this.progressEmitter.emit(jobId, tenantId, 'building_prompt');

    // Fetch appointment to determine service category mapping + context for prompt
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      select: {
        serviceCategory: true,
        serviceName: true,
        client: { select: { firstName: true } },
      },
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

    // Apply tier filter — strip Brand DNA fields the tenant hasn't unlocked
    const tieredDna = filterDnaForTier(brandDNA as unknown as Record<string, any>, generationOptions.userTier) as typeof brandDNA;
    // log tier filter applied (observable in backend stdout)

    let determinedGrid: any = { pillar: 'client_results', layout: 'passepartout_text', gridConstraints: '' };
    try {
      determinedGrid = await this.gridOrchestrator.determineNextLayoutAndPillar(tenantId);
      if (payload.businessGoal === 'build_brand_authority') {
        determinedGrid.pillar = 'education_tips';
        console.log(`[GRID ROTATOR OVERRIDE]: Forced Pillar="education_tips" because businessGoal is "build_brand_authority" (Educate).`);
      }
      console.log(`[GRID ROTATOR]: Selected Pillar="${determinedGrid.pillar}" with Constraints: "${determinedGrid.gridConstraints}" for tenant ${tenantId}`);
    } catch (gridErr) {
      console.error('[GRID ROTATOR ERROR] Failed to compute grid, falling back to default:', gridErr);
    }

    let recentFeedback: any[] = [];
    try {
      recentFeedback = await this.prisma.contentFeedback.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch (feedbackErr: any) {
      console.warn('[FEEDBACK LEARNER WARNING]: Could not query recent feedbacks (table may not exist yet):', feedbackErr.message);
    }

    const assembledPrompt = await this.promptBuilder.assembleGenerationPrompt({
      brandDNA: tieredDna,
      visionResult,
      businessGoal: payload.businessGoal,
      goldenExamples: payload.goldenExamples,
      platform: primaryPlatform,
      serviceCategory: appointment?.serviceCategory as import('../config/service-guardrails').ServiceCategory | undefined,
      masterPromptText: masterPrompt?.systemPrompt,
      consentRestrictions: consentCheck.activeRestrictions,
      appointmentContext: {
        serviceName: appointment?.serviceName ?? undefined,
        clientFirstName: appointment?.client?.firstName ?? undefined,
        serviceCategory: appointment?.serviceCategory ?? undefined,
      },
      contentPillar: determinedGrid.pillar,
      recentFeedback,
      moodboardVisionSummary: moodboardVisionSummary ?? undefined,
      assetLibraryVisionSummary: assetLibraryVisionSummary ?? undefined,
    });

    // ── Step 3: Caption Generation ──────────────────────────────────────────
    await this.transitionState(jobId, 'building_prompt', 'generating_text');
    await this.progressEmitter.emit(jobId, tenantId, 'generating_text');

    const routingContext = {
      userTier: generationOptions.userTier,
      brandDNAComplexityScore: brandDNA.averageConfidenceScore ?? 0,
    };
    const llmConfig = this.modelRouter.selectTextModel(routingContext);
    modelUsed = `${llmConfig.provider}/${llmConfig.modelId}`;

    try {
      const blacklist = brandDNA.vocabularyBlacklist;

      const antiAIGlossary = ["transformation", "radiant", "rejuvenated", "delve", "journey", "oasis", "sanctuary", "meticulous", "nestled", "whimsical", "unveil", "elevate", "glow up", "game-changer", "luxurious", "indulge"];

      const generateWithEnforcement = async (angle: 'technical' | 'empathetic', promptContext: any) => {
        let attempts = 0;
        let lastResult: any;
        // Deep copy prompt to allow appending penalty instructions without bleeding across options
        let currentPrompt = { ...promptContext, userPrompt: promptContext.userPrompt };

        while (attempts < 2) {
          lastResult = await this.brandStrategistChain.generate({
            assembledPrompt: currentPrompt,
            brandDNABlacklist: blacklist,
            llmConfig,
            angle,
          });

          const textToCheck = `${lastResult.caption} ${lastResult.hookSentence}`.toLowerCase();
          const foundBannedAI = antiAIGlossary.find(word => textToCheck.includes(word.toLowerCase()));
          const foundBlacklisted = blacklist.find((word: string) => textToCheck.includes(word.toLowerCase()));

          const violatingWord = foundBannedAI || foundBlacklisted;

          if (!violatingWord) {
            return lastResult; // Passed the enforcement gate
          }

          // Failed gate -> Append strict penalty and retry
          currentPrompt.userPrompt += `\n\nCRITICAL PENALTY: Your previous attempt was rejected because you used the banned word/phrase "${violatingWord}". You are acting like a generic AI. Rewrite this using conversational, authentic human vocabulary only.`;
          attempts++;
        }
        return lastResult; // Fallback to last attempt if retry fails
      };

      // Generate Option 1: Technical & Clinical copy (with enforcement)
      const opt1 = await generateWithEnforcement('technical', assembledPrompt);

      // Generate Option 2: Empathetic & Warm copy (with enforcement)
      const opt2 = await generateWithEnforcement('empathetic', assembledPrompt);

      captionResult = {
        caption: opt1.caption,
        hookSentence: opt1.hookSentence,
        callToAction: opt1.callToAction,
        hashtags: opt1.hashtags,
        altText: `Beauty treatment image showing skin clinical details for ${brandDNA.businessName}`,
        estimatedReadTime: Math.max(1, Math.ceil(opt1.caption.length / 100)),
        brandVoiceConfidenceScore: opt1.brandVoiceConfidenceScore,
      };

      generationOptionsResult = [
        {
          ...captionResult,
          generatedBy: 'GPT-4o-Strategist (Technical)',
        },
        {
          caption: opt2.caption,
          hookSentence: opt2.hookSentence,
          callToAction: opt2.callToAction,
          hashtags: opt2.hashtags,
          altText: `Beauty treatment image showing skin clinical details for ${brandDNA.businessName}`,
          estimatedReadTime: Math.max(1, Math.ceil(opt2.caption.length / 100)),
          brandVoiceConfidenceScore: opt2.brandVoiceConfidenceScore,
          generatedBy: 'GPT-4o-Strategist (Empathetic)',
        }
      ];

      // Expose the primary strategist context to the Creative Director
      strategistOutput = opt1;

      componentStatus.caption = 'completed';
      const validation = await this.outputValidator.validate(
        captionResult.caption,
        payload.consentSnapshot,
        (appointment?.serviceCategory as any) || 'general',
        tenantId
      );
      if (validation.correctedOutput) captionResult.caption = validation.correctedOutput;
      if (validation.requiresRegeneration) {
        componentStatus.caption = 'failed';
      }

      // Emit partial result — send caption to frontend as soon as it's ready
      await this.progressEmitter.emitPartialResult(jobId, tenantId, {
        caption: captionResult.caption,
        hashtags: captionResult.hashtags,
      });
    } catch (err) {
      console.error('[Orchestrator Step 3 Error]:', err);
      componentStatus.caption = 'failed';
    }

    // ── Step 3.5: Template Agent Layout Selection ─────────────────────────────
    if (captionResult) {
      try {
        const isCarouselOpt = (generationOptions.outputFormats as string[]).includes('carousel');
        const agentDecision = await this.templateAgent.selectTemplate({
          brief: captionResult.caption,
          brandName: brandDNA.businessName || 'Brand',
          aesthetic: (brandDNA.visualRanking?.length ? buildStyleDirectionBlock(brandDNA.visualRanking) : null) ?? brandDNA.aestheticDirection ?? 'minimal editorial',
          textLength: captionResult.caption.length,
          slideIndex: 0,
          totalSlides: isCarouselOpt ? 4 : 1,
          gridConstraints: determinedGrid.gridConstraints,
          visionResult: visionResult,
        });

        // Assign directly to allow Universal Dynamic Renderer to handle new templates
        determinedGrid.layout = agentDecision.selected_layout_id;
        console.log(`[TEMPLATE AGENT] Intelligent selection passed to rendering engine: ${determinedGrid.layout}`);
      } catch (err) {
        console.error('[Orchestrator Step 3.5 Template Agent Error]:', err);
      }
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
        // Non-fatal â€” primary caption is still valid
      }
    }

    // â”€â”€ Step 5: Reel Script (conditional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      }
    }

    // â”€â”€ Step 5.5: Image Processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let imageResult: ImageProcessingResult | null = null;
    let aiImageCostUSD = 0;
    const consentShowFace = !!(consentCheck.activeRestrictions as any)?.show_face;
    if (payload.imageAssets.length > 0) {
      const primaryAsset = payload.imageAssets[0]!;

      // Localhost URLs can't be reached by Cloudinary/OpenAI â€” use Sharp instead
      const isLocalUrl = primaryAsset.rawStoragePath.startsWith('http://localhost') ||
        primaryAsset.rawStoragePath.startsWith('http://127.');
      const useCloudinary = !!process.env['CLOUDINARY_CLOUD_NAME'] && !isLocalUrl;

      try {
        if (useCloudinary) {
          imageResult = await this.imagePipeline.process({
            rawStoragePath: primaryAsset.rawStoragePath,
            existingCloudinaryId: primaryAsset.cloudinaryPublicId,
            consentShowFace,
            brandPrimaryColour: brandDNA.primaryBrandColor ?? '#000000',
            brandSecondaryColour: brandDNA.secondaryBrandColor ?? '#ffffff',
            outputFormats: ['feed', 'story', 'reel'],
            contentItemId: 'deferred',
            tenantId,
          });
        } else {
          // Sharp handles localhost + no-Cloudinary cases
          imageResult = await this.sharpPipeline.process({
            rawImageUrl: primaryAsset.rawStoragePath,
            consentShowFace,
            outputFormats: ['feed', 'story', 'reel'],
            contentItemId: 'deferred',
            tenantId,
          });

          // If Cloudinary is configured, upload the Sharp-processed Firebase image
          // so carousel slides can be generated using Cloudinary text overlays
          if (process.env['CLOUDINARY_CLOUD_NAME'] && imageResult) {
            try {
              const cloudinaryId = await this.imagePipeline.uploadUrl(imageResult.variants.feedUrl, tenantId);
              imageResult = { ...imageResult, cloudinaryPublicId: cloudinaryId };
            } catch (err) {
            }
          }
        }
        componentStatus.image = 'completed';
      } catch (err) {
        componentStatus.image = 'failed';
      }
    }

    // â”€â”€ Step 5.55: AI-designed feed image (gpt-image-1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const feedPhotoUrlRaw = payload.imageAssets.find(a => a.isAfterPhoto)?.rawStoragePath
      ?? payload.imageAssets[0]?.rawStoragePath;

    let feedPhotoUrl: string | undefined = feedPhotoUrlRaw;
    if (feedPhotoUrlRaw && !consentShowFace) {
      try {
        feedPhotoUrl = await this.sharpPipeline.blurImage(feedPhotoUrlRaw, tenantId);
      } catch (err) {
        console.error('[Orchestrator Step 5.55 Consent Blur Error]:', err);
        feedPhotoUrl = undefined; // fail closed â€” never send an unblurred face to the AI model
      }
    }

    if (feedPhotoUrl && captionResult && imageResult) {
      const safeFeedPhotoUrl = feedPhotoUrl;
      try {
        const feedPrompt = `Transform this beauty photo into a professional Instagram feed post for "${brandDNA.businessName}".
Brand colors: ${brandDNA.primaryBrandColor ?? '#1a1a1a'} and ${brandDNA.secondaryBrandColor ?? '#f5f0eb'}.
Aesthetic: ${(brandDNA.visualRanking?.length ? buildStyleDirectionBlock(brandDNA.visualRanking) : null) ?? brandDNA.aestheticDirection ?? 'minimal editorial premium beauty'}.
Caption hook: "${captionResult.hookSentence || captionResult.caption.slice(0, 80)}"
Requirements:
${consentShowFace
  ? '- Keep the real photo as the main visual â€” preserve the person/hair authentically'
  : '- The client\'s face is already obscured for privacy â€” do NOT sharpen, restore, reconstruct, or otherwise reveal any facial detail; keep it fully obscured'}
- Add subtle brand-matched design: clean typography, brand color accents
- Minimal overlay â€” let the photo shine
- Professional beauty industry aesthetic
- Square format, Instagram-ready`;

        const imageBuffer = await (async () => {
          const https = await import('https');
          const http = await import('http');
          return new Promise<Buffer>((resolve, reject) => {
            const protocol = safeFeedPhotoUrl.startsWith('https') ? https : http;
            (protocol as any).get(safeFeedPhotoUrl, (res: any) => {
              const chunks: Buffer[] = [];
              res.on('data', (c: Buffer) => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });
        })();

        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
        const imageFile = new File([imageBuffer], 'photo.jpg', { type: 'image/jpeg' });
        const response = await openai.images.edit({
          model: 'gpt-image-1',
          image: imageFile,
          prompt: feedPrompt,
          size: '1024x1024',
        });

        const base64 = response.data?.[0]?.b64_json;
        if (base64) {
          const { firebaseStorage } = await import('../../config/firebase.client');
          if (firebaseStorage) {
            const buffer = Buffer.from(base64, 'base64');
            const bucket = firebaseStorage.bucket();
            const filePath = `generated/${tenantId}/feed_${Date.now()}.png`;
            const file = bucket.file(filePath);
            await file.save(buffer, { contentType: 'image/png', public: true });
            let aiFeedUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
            // Apply logo overlay if set in Brand DNA
            if (brandDNA.logoUrl) {
              aiFeedUrl = await this.logoOverlay.applyLogo({ imageUrl: aiFeedUrl, logoUrl: brandDNA.logoUrl as string, position: brandDNA.logoPosition as any, tenantId });
            }
            imageResult = { ...imageResult, variants: { ...imageResult.variants, feedUrl: aiFeedUrl } };
            aiImageCostUSD = AI_CONFIG.imageCosts['gpt-image-1-1024'];
          }
        }
      } catch (err) {
      }
    }

    // â”€â”€ Step 5.6: Carousel Slides (conditional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Upload before photo to Cloudinary for before/after alternation
    let beforeCloudinaryId: string | undefined;
    const beforeAsset = payload.imageAssets.find(a => a.isBeforePhoto && a.rawStoragePath);
    if (beforeAsset && process.env['CLOUDINARY_CLOUD_NAME']) {
      try {
        // Consent gate: only upload the raw (unblurred) before-photo when face display is allowed
        beforeCloudinaryId = beforeAsset.cloudinaryPublicId
          ?? await this.imagePipeline.uploadUrl(
            consentShowFace ? beforeAsset.rawStoragePath : await this.sharpPipeline.blurImage(beforeAsset.rawStoragePath, tenantId),
            tenantId,
          );
      } catch { /* non-fatal */ }
    }

    let carouselSlides: CarouselSlides | null = null;
    const isCarousel = (generationOptions.outputFormats as string[]).includes('carousel');
    let afterPhotoUrl = payload.imageAssets.find(a => a.isAfterPhoto)?.rawStoragePath
      ?? payload.imageAssets[0]?.rawStoragePath
      ?? '';
    let beforePhotoUrl = payload.imageAssets.find(a => a.isBeforePhoto)?.rawStoragePath;

    // Consent gate: blur the raw source photos before any further AI processing
    // (enhancement/carousel/story) touches them â€” never let an unblurred face
    // reach a downstream AI image model when consent denies face display.
    if (!consentShowFace) {
      if (afterPhotoUrl) {
        try {
          afterPhotoUrl = await this.sharpPipeline.blurImage(afterPhotoUrl, tenantId);
        } catch (err) {
          console.error('[Orchestrator Step 5.6 Consent Blur Error]:', err);
          afterPhotoUrl = '';
        }
      }
      if (beforePhotoUrl) {
        try {
          beforePhotoUrl = await this.sharpPipeline.blurImage(beforePhotoUrl, tenantId);
        } catch (err) {
          console.error('[Orchestrator Step 5.6 Consent Blur Error]:', err);
          beforePhotoUrl = undefined;
        }
      }
    }

    // Ticket 5: AI Super Resolution and Inpainting
    const brandColor = brandDNA.primaryBrandColor ?? '#1a1a1a';
    if (afterPhotoUrl) {
      afterPhotoUrl = await this.imageEnhancementService.enhanceImage(afterPhotoUrl, moodboardVisionSummary ?? '', brandColor);
    }
    if (beforePhotoUrl) {
      beforePhotoUrl = await this.imageEnhancementService.enhanceImage(beforePhotoUrl, moodboardVisionSummary ?? '', brandColor);
    }

    if (isCarousel && captionResult) {
      try {
        const conceptResult = await this.carouselConceptChain.generate({
          hookSentence: captionResult.hookSentence || captionResult.caption.slice(0, 80),
          callToAction: captionResult.callToAction || 'Book your appointment today',
          serviceName: appointment?.serviceName ?? 'Beauty treatment',
          clientFirstName: appointment?.client?.firstName ?? undefined,
          businessGoal: payload.businessGoal,
          brandName: brandDNA.businessName,
          slideCount: 4,
          brandVoice: extractBrandVoice(brandDNA),
        });

        // Step 2 of two-step prompting: Generate bespoke visual design briefs via Creative Director Agent
        const briefResult = await this.creativeDirectorChain.generate({
          strategistOutput,
          brandDNA,
          concepts: conceptResult.concepts,
        });

        try {
          // Extract dynamic fonts from BrandDNA structure
          const headingFont = brandDNA.brandFont || (brandDNA.brandDnaV2 as any)?.typography?.heading_font || 'Playfair Display';
          const bodyFont = (brandDNA.brandDnaV2 as any)?.typography?.body_font || 'Inter';

          // Try AI image generation first
          const aiSlides = await this.aiImageGen.generateCarousel({
            afterPhotoUrl,
            beforePhotoUrl,
            concepts: conceptResult.concepts,
            tenantId,
            businessName: brandDNA.businessName,
            brandColor: brandDNA.primaryBrandColor ?? '#1a1a1a',
            secondaryColor: brandDNA.secondaryBrandColor ?? '#f5f0eb',
            aesthetic: (brandDNA.visualRanking?.length ? buildStyleDirectionBlock(brandDNA.visualRanking) : null) ?? brandDNA.aestheticDirection ?? 'minimal editorial',
            serviceType: appointment?.serviceCategory ?? 'beauty treatment',
            artDirectorBrief: briefResult.slides,
            layoutType: determinedGrid.layout,
            brandFont: headingFont,
            bodyFont: bodyFont,
            visualRanking: brandDNA.visualRanking ?? [],
            capitalizationRule: (brandDNA.brandDnaV2 as any)?.typography?.capitalization_rule || (brandDNA.brandDnaV2 as any)?.typography?.capitalizationRule || 'uppercase',
            footerBrandToggle: (brandDNA.brandDnaV2 as any)?.typography?.footer_brand_toggle !== false && (brandDNA.brandDnaV2 as any)?.typography?.footerBrandToggle !== false,
            backgroundBrandColor: brandDNA.backgroundBrandColor ?? '#F7F4EF',
            accentBrandColor: brandDNA.accentBrandColor ?? '#D4A373',
            depthBrandColor: brandDNA.depthBrandColor ?? '#1E1E1C',
            moodboardVisionSummary: moodboardVisionSummary ?? undefined,
            visionResult: visionResult ?? undefined,
          });
          // Apply logo to each carousel slide
          const slidesWithLogo = brandDNA.logoUrl
            ? await Promise.all(aiSlides.map(async s => ({ ...s, url: await this.logoOverlay.applyLogo({ imageUrl: s.url, logoUrl: brandDNA.logoUrl as string, position: brandDNA.logoPosition as any, tenantId }) })))
            : aiSlides;
          carouselSlides = { type: 'carousel', slides: slidesWithLogo };
        } catch (aiErr) {
          console.error('[Orchestrator Slide Generation Fallback]:', aiErr);
          // Fallback to Cloudinary if AI generation fails
          if (imageResult?.cloudinaryPublicId) {
            carouselSlides = this.carouselPipeline.generate({
              cloudinaryPublicId: imageResult.cloudinaryPublicId,
              beforePublicId: beforeCloudinaryId,
              brandColour: brandDNA.primaryBrandColor ?? '#1a1a1a',
              concepts: conceptResult.concepts,
            });
          }
        }
      } catch (err) {
        console.error('[Orchestrator Step 5.6 Error]:', err);
      }
    }

    // â”€â”€ Step 5.65: Story Frames (conditional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let storyOutput: StoryOutput | null = null;
    const isStory = (generationOptions.outputFormats as string[]).includes('story');
    if (isStory && captionResult) {
      try {
        const storyFrames = await this.storyFrameChain.generate({
          hookSentence: captionResult.hookSentence || captionResult.caption.slice(0, 80),
          callToAction: captionResult.callToAction || 'Book your appointment today',
          serviceName: appointment?.serviceName ?? 'Beauty treatment',
          clientFirstName: appointment?.client?.firstName ?? undefined,
          businessGoal: payload.businessGoal,
          brandName: brandDNA.businessName,
          brandVoice: extractBrandVoice(brandDNA),
        });

        // Step 2 of two-step prompting: Generate bespoke visual design briefs via Creative Director Agent
        const briefResult = await this.creativeDirectorChain.generate({
          strategistOutput,
          brandDNA,
          concepts: storyFrames.frames,
        });

        try {
          const headingFont = brandDNA.brandFont || (brandDNA.brandDnaV2 as any)?.typography?.heading_font || 'Playfair Display';
          const bodyFont = (brandDNA.brandDnaV2 as any)?.typography?.body_font || 'Inter';

          const aiFrames = await this.aiImageGen.generateStory({
            afterPhotoUrl,
            beforePhotoUrl,
            frames: storyFrames.frames,
            tenantId,
            businessName: brandDNA.businessName,
            brandColor: brandDNA.primaryBrandColor ?? '#1a1a1a',
            secondaryColor: brandDNA.secondaryBrandColor ?? '#f5f0eb',
            aesthetic: (brandDNA.visualRanking?.length ? buildStyleDirectionBlock(brandDNA.visualRanking) : null) ?? brandDNA.aestheticDirection ?? 'minimal editorial',
            serviceType: appointment?.serviceCategory ?? 'beauty treatment',
            artDirectorBrief: briefResult.slides,
            layoutType: determinedGrid.layout,
            brandFont: headingFont,
            bodyFont: bodyFont,
            visualRanking: brandDNA.visualRanking ?? [],
            capitalizationRule: (brandDNA.brandDnaV2 as any)?.typography?.capitalization_rule || (brandDNA.brandDnaV2 as any)?.typography?.capitalizationRule || 'uppercase',
            footerBrandToggle: (brandDNA.brandDnaV2 as any)?.typography?.footer_brand_toggle !== false && (brandDNA.brandDnaV2 as any)?.typography?.footerBrandToggle !== false,
            backgroundBrandColor: brandDNA.backgroundBrandColor ?? '#F7F4EF',
            accentBrandColor: brandDNA.accentBrandColor ?? '#D4A373',
            moodboardVisionSummary: moodboardVisionSummary ?? undefined,
            visionResult: visionResult ?? undefined,
          });
          const framesWithLogo = brandDNA.logoUrl
            ? await Promise.all(aiFrames.map(async f => ({ ...f, url: await this.logoOverlay.applyLogo({ imageUrl: f.url, logoUrl: brandDNA.logoUrl as string, position: brandDNA.logoPosition as any, tenantId }) })))
            : aiFrames;
          storyOutput = { type: 'story', frames: framesWithLogo };
        } catch (aiErr) {
          console.error('[Orchestrator Story Generation Fallback]:', aiErr);
          if (imageResult?.cloudinaryPublicId) {
            storyOutput = this.storyPipeline.generate({
              cloudinaryPublicId: imageResult.cloudinaryPublicId,
              beforePublicId: beforeCloudinaryId,
              brandColour: brandDNA.primaryBrandColor ?? '#1a1a1a',
              concepts: storyFrames.frames,
            });
          }
        }
      } catch (err) {
        console.error('[Orchestrator Step 5.65 Error]:', err);
      }
    }

    // ── Step 5.66: Reel Shot Storyboard (conditional) ──────────────────────────────────────────
    let reelShotResult: ReelShotResult | null = null;
    const isReel = (generationOptions.outputFormats as string[]).includes('reel');
    if (isReel && captionResult) {
      try {
        reelShotResult = await this.reelShotChain.generate({
          hookSentence: captionResult.hookSentence || captionResult.caption.slice(0, 80),
          callToAction: captionResult.callToAction || 'Book your appointment today',
          serviceName: appointment?.serviceName ?? 'Beauty treatment',
          clientFirstName: appointment?.client?.firstName ?? undefined,
          businessGoal: payload.businessGoal,
          brandName: brandDNA.businessName,
          brandVoice: extractBrandVoice(brandDNA),
        });
      } catch (err) {
      }
    }

    // â”€â”€ Step 5.7: Voiceover (conditional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let voiceoverResult: VoiceoverResult | null = null;
    if (reelScriptResult && generationOptions.outputFormats.includes('reel')) {
      try {
        if (process.env['ELEVENLABS_API_KEY']) {
          const voice = reelScriptResult.elevenLabsVoiceSettings;
          voiceoverResult = await this.elevenLabsService.generateVoiceover({
            script: reelScriptResult.script,
            voiceId: voice.voiceId,
            stability: voice.stability,
            similarityBoost: voice.similarityBoost,
            style: voice.style,
          });
        } else {
          voiceoverResult = await this.openAiTtsService.generateVoiceover({
            script: reelScriptResult.script,
          });
        }
      } catch (err) {
      }
    }

    // ── Step 6: Scoring & Compliance Gate ─────────────────────────
    let originalPhotoBuffer: Buffer | undefined;
    let generatedPhotoBuffer: Buffer | undefined;

    try {
      const origUrl = payload.imageAssets[0]?.rawStoragePath;
      const genUrl = imageResult?.variants?.feedUrl;
      
      if (origUrl && genUrl) {
        const [origRes, genRes] = await Promise.all([
          fetch(origUrl),
          fetch(genUrl)
        ]);
        if (origRes.ok && genRes.ok) {
          originalPhotoBuffer = Buffer.from(await origRes.arrayBuffer());
          generatedPhotoBuffer = Buffer.from(await genRes.arrayBuffer());
        }
      }
    } catch (e) {
      console.warn('[Validation Engine] Failed to fetch image buffers for Face Protection analysis.', e);
    }

    const scoringResult = await this.scoringGate.evaluate({
      caption: captionResult?.caption ?? '',
      hashtags: captionResult?.hashtags ?? [],
      blacklist: brandDNA.vocabularyBlacklist,
      hasBefore: !!beforePhotoUrl,
      beforeAfterAllowed: consentCheck.activeRestrictions?.allow_before_after !== false,
      isCarousel: isCarousel,
      slidesCount: carouselSlides?.slides?.length ?? 0,
      tenantId,
      prisma: this.prisma,
      originalPhotoBuffer,
      generatedPhotoBuffer,
    });

    // â”€â”€ Step 6.5: Persist Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      imageResult,
      voiceoverResult,
      carouselSlides,
      storyOutput,
      reelShotResult,
      scoringResult,
      contentPillar: determinedGrid.pillar,
      layoutType: determinedGrid.layout,
    });

    // â”€â”€ Step 7: Final State Transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const totalCostUSD = this.modelRouter.estimateCost(llmConfig.modelId, totalTokensIn, totalTokensOut) + aiImageCostUSD;
    const targetState = scoringResult.passed ? 'completed' : 'blocked';
    await this.transitionState(jobId, 'generating_text', targetState);
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { estimatedCostUsd: totalCostUSD },
    }).catch(() => { });
    await this.progressEmitter.emit(jobId, tenantId, targetState);

    // â”€â”€ Step 8: Notify tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.notify?.({
      tenantId,
      type: 'content_generation_complete',
      title: 'Content ready to review',
      body: 'Your new post is ready. Tap to review and schedule.',
      data: { contentItemId, jobId },
    }).catch(() => { });

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
      estimatedCostUSD: totalCostUSD,
      totalProcessingTimeMs: processingMs,
      brandVoiceConfidenceScore: captionResult?.brandVoiceConfidenceScore ?? 0,
      completedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // State Machine Transition + DB Update
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // Tweak Pipeline â€” lightweight caption-only refinement
  // --------------------------------------------------------------------------

  private async runTweak(jobId: string): Promise<GenerationResult> {
    const jobStart = Date.now();

    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`Tweak job ${jobId} not found`);

    const tweakDto = job.jobPayload as { contentItemId: string; tweakInstruction: string; component: string };
    const { tenantId } = job;

    try {
      await this.prisma.generationJob.update({ where: { id: jobId }, data: { state: 'generating_text' } });
      await this.progressEmitter.emit(jobId, tenantId, 'generating_text');

      const contentItem = await this.prisma.contentItem.findUnique({ where: { id: tweakDto.contentItemId } });
      if (!contentItem) throw new Error(`Content item ${tweakDto.contentItemId} not found`);

      const brandDna = await this.prisma.brandDNA.findFirst({
        where: { tenantId, isCurrent: true },
        include: { pillars: true },
      });

      const blacklist: string[] = [
        ...((brandDna?.vocabularyBlacklist ?? []) as string[]),
        ...((brandDna?.doNotSay ?? []) as string[]),
      ];

      const { systemPrompt, userPrompt } = this.promptBuilder.assembleTweakPrompt({
        previousCaption: contentItem.caption ?? '',
        previousHashtags: Array.isArray(contentItem.hashtags) ? (contentItem.hashtags as string[]) : [],
        tweakInstruction: tweakDto.tweakInstruction,
        brandDNA: {
          businessName: brandDna?.businessName ?? 'Beauty Business',
          primaryTone: (brandDna?.primaryTone ?? 'professional_warm') as any,
          blacklistedWords: blacklist,
          ...(brandDna ?? {}),
        } as any,
        platform: 'instagram',
      });

      const llmConfig = this.modelRouter.selectTextModel({ userTier: 'standard', brandDNAComplexityScore: 0 });

      const result = await this.captionChain.generate({
        assembledPrompt: { systemPrompt, userPrompt, cacheHits: { brandDNAFragment: false, goldenExamplesFragment: false } },
        llmConfig,
        brandDNABlacklist: blacklist,
        allowRetry: false,
      });

      await this.prisma.contentItem.update({
        where: { id: contentItem.id },
        data: {
          caption: result.caption,
          hashtags: result.hashtags as any,
          callToAction: result.callToAction,
          hookSentence: result.hookSentence,
        },
      });

      await this.prisma.generationJob.update({ where: { id: jobId }, data: { state: 'completed' } });
      await this.progressEmitter.emit(jobId, tenantId, 'completed');

      return {
        jobId,
        tenantId,
        appointmentId: job.appointmentId,
        contentItemId: contentItem.id,
        captionStatus: 'completed',
        imageStatus: 'pending',
        reelStatus: 'pending',
        caption: result,
        platformVariants: null,
        processedImage: null,
        reel: null,
        reelScript: null,
        visionAnalysis: null,
        modelUsed: `${llmConfig.provider}/${llmConfig.modelId}`,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        estimatedCostUSD: 0,
        totalProcessingTimeMs: Date.now() - jobStart,
        brandVoiceConfidenceScore: result.brandVoiceConfidenceScore ?? 0,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      await this.prisma.generationJob.update({ where: { id: jobId }, data: { state: 'failed' } }).catch(() => { });
      await this.progressEmitter.emit(jobId, tenantId, 'failed');
      throw err;
    }
  }

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
    imageResult: ImageProcessingResult | null;
    voiceoverResult: VoiceoverResult | null;
    carouselSlides: CarouselSlides | null;
    storyOutput: StoryOutput | null;
    reelShotResult: ReelShotResult | null;
    scoringResult?: any;
    contentPillar?: string | null;
    layoutType?: string | null;
  }): Promise<string> {
    const { payload, captionResult, platformVariants, reelScriptResult, componentStatus, generationOptionsResult, scoringResult, contentPillar, layoutType } = params;
    const { v4: uuidv4 } = await import('uuid');
    const contentItemId = uuidv4();

    const failedScoring = scoringResult && !scoringResult.passed;
    const status = failedScoring ? 'blocked' : 'draft';
    const blockedReason = failedScoring ? scoringResult.reason : null;

    await this.prisma.contentItem.create({
      data: {
        id: contentItemId,
        generationJobId: payload.jobId,
        tenantId: payload.tenantId,
        appointmentId: payload.appointmentId,
        status: status as any,
        blockedReason,
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
        platformVariants: params.carouselSlides
          ? (params.carouselSlides as unknown as Prisma.InputJsonValue)
          : params.storyOutput
            ? (params.storyOutput as unknown as Prisma.InputJsonValue)
            : params.reelShotResult
              ? (params.reelShotResult as unknown as Prisma.InputJsonValue)
              : platformVariants
                ? (platformVariants as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
        reelScript: reelScriptResult?.script ?? null,
        completedAt: new Date(),
        contentPillar: contentPillar ?? null,
        layoutType: layoutType ?? null,
      },
    });

    // Persist image URL if available (column not in Prisma model â€” use raw SQL)
    if (params.imageResult) {
      await this.prisma.$executeRaw`
        UPDATE platform.content_items
        SET processed_image_url_feed = ${params.imageResult.variants.feedUrl},
            image_status             = 'completed',
            updated_at               = NOW()
        WHERE id = ${contentItemId}::uuid
      `;
    }

    // Persist voiceover URL if available
    if (params.voiceoverResult) {
      await this.prisma.$executeRaw`
        UPDATE platform.content_items
        SET voiceover_url = ${params.voiceoverResult.audioCdnUrl},
            updated_at    = NOW()
        WHERE id = ${contentItemId}::uuid
      `;
    }

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
  return ['premium', 'tier3', 'tier4', 'tier5'].includes(payload.generationOptions.userTier)
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
