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
  }

  // --------------------------------------------------------------------------
  // Main Pipeline Execution
  // --------------------------------------------------------------------------

  async run(payload: GenerationJobPayload): Promise<GenerationResult> {
    // Tweak jobs only carry { jobId } in the BullMQ payload — detect and delegate
    if (!payload.tenantId) {
      return this.runTweak(payload.jobId);
    }

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

      const primaryImage = payload.imageAssets[0]!;
      const isLocalVisionUrl = primaryImage.rawStoragePath.startsWith('http://localhost') ||
                               primaryImage.rawStoragePath.startsWith('http://127.');

      if (!isLocalVisionUrl) try {
        // Only use Cloudinary URL if we have an actual cloudinaryPublicId — otherwise fall back to rawStoragePath
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
      } catch (err) {
        // Vision failure is non-fatal — caption still generated from appointment context
        console.error(`[Orchestrator] Vision analysis failed for job ${jobId}:`, err);
      }
    }

    // ── Step 2: Prompt Building ──────────────────────────────────────────────
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
    const assembledPrompt = await this.promptBuilder.assembleGenerationPrompt({
      brandDNA,
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
        (appointment?.serviceCategory as any) || 'general',
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
          brandDNABlacklist: brandDNA.vocabularyBlacklist ?? [],
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

    // ── Step 5.5: Image Processing ────────────────────────────────────────────
    let imageResult: ImageProcessingResult | null = null;
    let aiImageCostUSD = 0;
    if (payload.imageAssets.length > 0) {
      const primaryAsset = payload.imageAssets[0]!;
      const consentShowFace = !!(consentCheck.activeRestrictions as any)?.show_face;

      // Localhost URLs can't be reached by Cloudinary/OpenAI — use Sharp instead
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
              console.error(`[Orchestrator] Cloudinary re-upload failed for job ${jobId}:`, err);
            }
          }
        }
        componentStatus.image = 'completed';
      } catch (err) {
        componentStatus.image = 'failed';
        console.error(`[Orchestrator] Image processing failed for job ${jobId}:`, err);
      }
    }

    // ── Step 5.55: AI-designed feed image (gpt-image-1) ─────────────────────
    const feedPhotoUrl = payload.imageAssets.find(a => a.isAfterPhoto)?.rawStoragePath
      ?? payload.imageAssets[0]?.rawStoragePath;

    if (feedPhotoUrl && captionResult && imageResult) {
      try {
        const feedPrompt = `Transform this beauty photo into a professional Instagram feed post for "${brandDNA.businessName}".
Brand colors: ${brandDNA.primaryBrandColor ?? '#1a1a1a'} and ${brandDNA.secondaryBrandColor ?? '#f5f0eb'}.
Aesthetic: ${brandDNA.aestheticDirection ?? 'minimal editorial premium beauty'}.
Caption hook: "${captionResult.hookSentence || captionResult.caption.slice(0, 80)}"
Requirements:
- Keep the real photo as the main visual — preserve the person/hair authentically
- Add subtle brand-matched design: clean typography, brand color accents
- Minimal overlay — let the photo shine
- Professional beauty industry aesthetic
- Square format, Instagram-ready`;

        const imageBuffer = await (async () => {
          const https = await import('https');
          const http = await import('http');
          return new Promise<Buffer>((resolve, reject) => {
            const protocol = feedPhotoUrl.startsWith('https') ? https : http;
            (protocol as any).get(feedPhotoUrl, (res: any) => {
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
              aiFeedUrl = await this.logoOverlay.applyLogo({ imageUrl: aiFeedUrl, logoUrl: brandDNA.logoUrl, position: brandDNA.logoPosition, tenantId });
            }
            imageResult = { ...imageResult, variants: { ...imageResult.variants, feedUrl: aiFeedUrl } };
            aiImageCostUSD = AI_CONFIG.imageCosts['gpt-image-1-1024'];
            console.log(`[Orchestrator] AI feed image generated for job ${jobId}`);
          }
        }
      } catch (err) {
        console.warn(`[Orchestrator] AI feed image failed, using original:`, (err as Error).message);
      }
    }

    // ── Step 5.6: Carousel Slides (conditional) ───────────────────────────────
    // Upload before photo to Cloudinary for before/after alternation
    let beforeCloudinaryId: string | undefined;
    const beforeAsset = payload.imageAssets.find(a => a.isBeforePhoto && a.rawStoragePath);
    if (beforeAsset && process.env['CLOUDINARY_CLOUD_NAME']) {
      try {
        beforeCloudinaryId = beforeAsset.cloudinaryPublicId
          ?? await this.imagePipeline.uploadUrl(beforeAsset.rawStoragePath, tenantId);
      } catch { /* non-fatal */ }
    }

    let carouselSlides: CarouselSlides | null = null;
    const isCarousel = (generationOptions.outputFormats as string[]).includes('carousel');
    const afterPhotoUrl = payload.imageAssets.find(a => a.isAfterPhoto)?.rawStoragePath
      ?? payload.imageAssets[0]?.rawStoragePath;
    const beforePhotoUrl = payload.imageAssets.find(a => a.isBeforePhoto)?.rawStoragePath;

    if (isCarousel && afterPhotoUrl && captionResult) {
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

        try {
          // Try AI image generation first
          const aiSlides = await this.aiImageGen.generateCarousel({
            afterPhotoUrl,
            beforePhotoUrl,
            concepts: conceptResult.concepts,
            tenantId,
            businessName: brandDNA.businessName,
            brandColor: brandDNA.primaryBrandColor ?? '#1a1a1a',
            secondaryColor: brandDNA.secondaryBrandColor ?? '#f5f0eb',
            aesthetic: brandDNA.aestheticDirection ?? 'minimal editorial',
            serviceType: appointment?.serviceCategory ?? 'beauty treatment',
          });
          // Apply logo to each carousel slide
          const slidesWithLogo = brandDNA.logoUrl
            ? await Promise.all(aiSlides.map(async s => ({ ...s, url: await this.logoOverlay.applyLogo({ imageUrl: s.url, logoUrl: brandDNA.logoUrl, position: brandDNA.logoPosition, tenantId }) })))
            : aiSlides;
          carouselSlides = { type: 'carousel', slides: slidesWithLogo };
          console.log(`[Orchestrator] Carousel: ${aiSlides.length} AI-generated slides for job ${jobId}`);
        } catch (aiErr) {
          // Fallback to Cloudinary if AI generation fails
          console.warn(`[Orchestrator] AI image gen failed, falling back to Cloudinary:`, aiErr);
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
        console.error(`[Orchestrator] Carousel generation failed for job ${jobId}:`, err);
      }
    }

    // ── Step 5.65: Story Frames (conditional) ────────────────────────────────
    let storyOutput: StoryOutput | null = null;
    const isStory = (generationOptions.outputFormats as string[]).includes('story');
    if (isStory && afterPhotoUrl && captionResult) {
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

        try {
          const aiFrames = await this.aiImageGen.generateStory({
            afterPhotoUrl,
            beforePhotoUrl,
            frames: storyFrames.frames,
            tenantId,
            businessName: brandDNA.businessName,
            brandColor: brandDNA.primaryBrandColor ?? '#1a1a1a',
            secondaryColor: brandDNA.secondaryBrandColor ?? '#f5f0eb',
            aesthetic: brandDNA.aestheticDirection ?? 'minimal editorial',
            serviceType: appointment?.serviceCategory ?? 'beauty treatment',
          });
          const framesWithLogo = brandDNA.logoUrl
            ? await Promise.all(aiFrames.map(async f => ({ ...f, url: await this.logoOverlay.applyLogo({ imageUrl: f.url, logoUrl: brandDNA.logoUrl, position: brandDNA.logoPosition, tenantId }) })))
            : aiFrames;
          storyOutput = { type: 'story', frames: framesWithLogo };
          console.log(`[Orchestrator] Story: ${aiFrames.length} AI-generated frames for job ${jobId}`);
        } catch (aiErr) {
          console.warn(`[Orchestrator] AI story gen failed, falling back to Cloudinary:`, aiErr);
          if (imageResult?.cloudinaryPublicId) {
            storyOutput = this.storyPipeline.generate({
              cloudinaryPublicId: imageResult.cloudinaryPublicId,
              beforePublicId: beforeCloudinaryId,
              brandColour: brandDNA.primaryBrandColor ?? '#1a1a1a',
              concepts: storyFrames.frames,
            });
          }
        }
        console.log(`[Orchestrator] Story: 4 frames generated for job ${jobId}`);
      } catch (err) {
        console.error(`[Orchestrator] Story frame generation failed for job ${jobId}:`, err);
      }
    }

    // ── Step 5.66: Reel Shot Storyboard (conditional) ────────────────────────
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
        console.log(`[Orchestrator] Reel storyboard: ${reelShotResult.shots.length} shots for job ${jobId}`);
      } catch (err) {
        console.error(`[Orchestrator] Reel shot generation failed for job ${jobId}:`, err);
      }
    }

    // ── Step 5.7: Voiceover (conditional) ────────────────────────────────────
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
        console.error(`[Orchestrator] Voiceover generation failed for job ${jobId}:`, err);
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
      imageResult,
      voiceoverResult,
      carouselSlides,
      storyOutput,
      reelShotResult,
    });

    // ── Step 7: Final State Transition ────────────────────────────────────────
    const totalCostUSD = this.modelRouter.estimateCost(llmConfig.modelId, totalTokensIn, totalTokensOut) + aiImageCostUSD;
    await this.transitionState(jobId, 'generating_text', 'completed');
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { estimatedCostUsd: totalCostUSD },
    }).catch(() => {});
    await this.progressEmitter.emit(jobId, tenantId, 'completed');

    // ── Step 8: Notify tenant ────────────────────────────────────────────────
    this.notify?.({
      tenantId,
      type: 'content_generation_complete',
      title: 'Content ready to review',
      body: 'Your new post is ready. Tap to review and schedule.',
      data: { contentItemId, jobId },
    }).catch(() => {});

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
  // Tweak Pipeline — lightweight caption-only refinement
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
      await this.prisma.generationJob.update({ where: { id: jobId }, data: { state: 'failed' } }).catch(() => {});
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
      },
    });

    // Persist image URL if available (column not in Prisma model — use raw SQL)
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
