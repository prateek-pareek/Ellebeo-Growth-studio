import { Injectable, NotFoundException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateContentDto, TweakContentDto } from './dto/generation.dto';
import { GenerationGateway } from './generation.gateway';
import { contentGenerationQueue } from '../ai/queues/queue.definitions';

@Injectable()
export class GenerationService {
  constructor(
    private prisma: PrismaService,
    private generationGateway: GenerationGateway,
  ) { }

  async generate(tenantId: string, clientId: string, dto: GenerateContentDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const tier = tenant?.subscriptionTier ?? 'free';
    const trialBypassed = process.env.TRIAL_LIMIT_BYPASS?.trim() === 'true';

    // ── Tier gate: booking-only for tier1/tier2 ──────────────────────────────
    const bookingOnlyTiers = ['free', 'standard', 'tier1', 'tier2'];
    const isBookingOnly = bookingOnlyTiers.includes(tier);
    const isNonBookingPost = !dto.appointmentId || dto.postType === 'brand' || dto.postType === 'marketing';

    if (isBookingOnly && isNonBookingPost) {
      throw new ForbiddenException({
        error: 'BOOKING_REQUIRED',
        message: 'Your plan only supports content generated from Elle.Be.O bookings. Upgrade to Tier 3 to create brand and marketing posts.',
      });
    }

    // ── Appointment lookup (required for booking posts) ───────────────────────
    let appointment: any = null;
    let consentRecord: any = null;

    if (dto.appointmentId) {
      appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        include: { client: true }
      });

      if (!appointment || appointment.tenantId !== tenantId) {
        throw new NotFoundException('Appointment not found');
      }

      // Resolve consent
      consentRecord = appointment.consentRecordId
        ? await this.prisma.consentRecord.findUnique({ where: { id: appointment.consentRecordId } })
        : await this.prisma.consentRecord.findFirst({
          where: { clientId: appointment.clientId, tenantId, isCurrent: true },
          orderBy: { updatedAt: 'desc' },
        });

      if (!consentRecord || consentRecord.status !== 'granted') {
        throw new BadRequestException('Valid consent record is required for generation');
      }
    }

    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
    });

    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before generation');
    }

    // ── Daily limit gate — admin-configurable per tier ────────────────────────
    // Applies to all 5 paid commercial tiers (tier1-tier5). 'free' is excluded
    // here — it has its own separate lifetime trial/purchased-pack gate below,
    // which already serves the same cost-protection purpose for that tier.
    const limits = await this.getTierLimits(tier);
    const usage = await this.getTodayUsage(tenantId);

    if (!trialBypassed && ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'].includes(tier)) {
      if (usage.generations >= limits.generations) {
        throw new ForbiddenException({
          error: 'DAILY_LIMIT_REACHED',
          message: `You've reached your limit of ${limits.generations} generations today. Your limit resets at midnight UTC.`,
        });
      }
    }

    // ── Trial / plan gate for free tier ──────────────────────────────────────
    const TRIAL_LIMIT = 2;
    const trialUsed = tenant?.trialGenerationsUsed ?? 0;
    const trialAvailable = trialUsed < TRIAL_LIMIT;
    const planTotal = tenant?.planGenerationsTotal ?? 0;
    const planUsed = tenant?.planGenerationsUsed ?? 0;
    const planAvailable = planUsed < planTotal;

    let usingPlanGeneration = false;
    if (!trialBypassed && tier === 'free') {
      if (trialAvailable) {
        // still within the 2 free generations
      } else if (planAvailable) {
        usingPlanGeneration = true;
      } else {
        throw new ForbiddenException({
          error: planTotal > 0 ? 'PLAN_EXHAUSTED' : 'TRIAL_EXHAUSTED',
          message: planTotal > 0
            ? "You've used all your purchased generations. Buy more to keep creating content."
            : "You've used your 2 free generations. Choose a plan to keep creating content.",
        });
      }
    }

    const isReel = (dto.outputFormats as string[]).some(f => f === 'reel');

    // If the job originated from a specific gallery template ("Use template"),
    // resolve its rendererKey so the orchestrator can honour that exact
    // structure instead of leaving layout selection entirely to the AI agent.
    let layoutHint: string | null = null;
    if (dto.templateSlug) {
      const template = await this.prisma.template.findUnique({
        where: { slug: dto.templateSlug },
        select: { rendererKey: true },
      });
      layoutHint = template?.rendererKey ?? null;
    }

    // Create the generation job
    const job = await this.prisma.generationJob.create({
      data: {
        tenantId,
        appointmentId: appointment?.id ?? null,
        clientId: appointment?.clientId ?? clientId,
        jobPayload: dto as any,
        consentSnapshot: (consentRecord ?? {}) as any,
        brandDnaSnapshot: brandDna as any,
        brandDnaVersion: brandDna.version,
        outputFormats: dto.outputFormats,
        platforms: dto.platforms,
        includeVoiceover: dto.includeVoiceover,
        includeMusic: dto.includeMusic,
        state: 'created',
      }
    });

    if (!trialBypassed) {
      if (usingPlanGeneration) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { planGenerationsUsed: { increment: 1 } },
        });
      } else if (trialAvailable) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { trialGenerationsUsed: { increment: 1 } },
        });
      }
    }

    // Check Growth Studio's own image_assets table first (only for booking posts)
    let imageAssets: any[] = [];
    if (appointment) {
      const imageAssetRecords = await this.prisma.imageAsset.findMany({
        where: { tenantId, appointmentId: appointment.id, deletedAt: null },
        orderBy: [{ isAfterPhoto: 'desc' }, { createdAt: 'asc' }],
        select: { rawUrl: true, cloudinaryPublicId: true, visionAnalysis: true, isBeforePhoto: true, isAfterPhoto: true },
      });

      imageAssets = imageAssetRecords
        .filter(a => a.rawUrl)
        .map(a => ({
          rawStoragePath: a.rawUrl!,
          cloudinaryPublicId: a.cloudinaryPublicId ?? undefined,
          visionAnalysisCache: a.visionAnalysis ? JSON.stringify(a.visionAnalysis) : undefined,
          isBeforePhoto: a.isBeforePhoto,
          isAfterPhoto: a.isAfterPhoto,
        }));

      // Fall back to the CRM booking's after-photo if no Growth Studio image assets exist
      if (imageAssets.length === 0 && appointment.crmBookingId) {
        const rows = await this.prisma.$queryRaw<Array<{ recipientIntakeData: Record<string, unknown> | null }>>`
          SELECT "recipientIntakeData" FROM public."Booking" WHERE id = ${appointment.crmBookingId}::uuid LIMIT 1
        `;
        const afterPhotoUrl = rows[0]?.recipientIntakeData?.['afterPhotoUrl'] as string | undefined;
        if (afterPhotoUrl) {
          imageAssets = [{ rawStoragePath: afterPhotoUrl, cloudinaryPublicId: undefined, visionAnalysisCache: undefined, isBeforePhoto: false, isAfterPhoto: true }];
        }
      }
    }

    await contentGenerationQueue.add(
      `generation:${job.id}`,
      {
        jobId: job.id,
        tenantId,
        appointmentId: appointment?.id ?? null,
        clientId: appointment?.clientId ?? clientId,
        consentSnapshot: consentRecord ?? {},
        brandDNA: brandDna,
        businessGoal: (dto.goal as any) || 'build_brand_authority',
        imageAssets,
        generationOptions: {
          outputFormats: dto.outputFormats as any,
          includeVoiceover: dto.includeVoiceover,
          includeMusic: dto.includeMusic,
          platform: dto.platforms as any,
          userTier: tier as any,
        },
        goldenExamples: [],
        createdAt: new Date().toISOString(),
        priority: 5,
        layoutHint,
      } as any,
      { jobId: job.id },
    );

    const estimatedSeconds = isReel ? 120 : 30;

    this.generationGateway.emitJobUpdate(job.id, job.state as any);

    return {
      jobId: job.id,
      estimatedSeconds,
      rateLimitRemaining: {
        generationsRemaining: Math.max(0, limits.generations - usage.generations - 1),
        reelsRemaining: isReel ? Math.max(0, limits.reels - usage.reels - 1) : Math.max(0, limits.reels - usage.reels),
        generationsLimit: limits.generations,
        reelsLimit: limits.reels,
        resetsAt: this.getNextMidnightUTC(),
      }
    };
  }

  async getJobStatus(tenantId: string, jobId: string) {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.tenantId !== tenantId) throw new NotFoundException('Job not found');
    this.generationGateway.emitJobUpdate(job.id, job.state as any);
    return job;
  }

  async tweakContent(tenantId: string, dto: TweakContentDto) {
    const content = await this.prisma.contentItem.findUnique({
      where: { id: dto.contentItemId },
      include: { appointment: true }
    });

    if (!content || content.tenantId !== tenantId) {
      throw new NotFoundException('Content not found');
    }

    // Create a new tweak job
    const job = await this.prisma.generationJob.create({
      data: {
        tenantId,
        appointmentId: content.appointmentId,
        clientId: content.appointment.clientId,
        jobPayload: dto as any,
        consentSnapshot: {} as any, // Mock
        brandDnaSnapshot: {} as any, // Mock
        brandDnaVersion: 1,
        outputFormats: [],
        platforms: [],
        state: 'created',
      }
    });

    await contentGenerationQueue.add(`tweak:${job.id}`, { jobId: job.id } as any, { jobId: job.id });

    this.generationGateway.emitJobUpdate(job.id, job.state);

    return {
      jobId: job.id,
      estimatedSeconds: 15,
    };
  }

  async getRateLimitStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    const limits = await this.getTierLimits(tenant?.subscriptionTier ?? 'free');
    const usage = await this.getTodayUsage(tenantId);

    const TRIAL_LIMIT = 2;
    const isFreeTier = (tenant?.subscriptionTier ?? 'free') === 'free';

    return {
      generationsLimit: limits.generations,
      generationsUsed: usage.generations,
      generationsRemaining: Math.max(0, limits.generations - usage.generations),
      reelsLimit: limits.reels,
      reelsUsed: usage.reels,
      reelsRemaining: Math.max(0, limits.reels - usage.reels),
      resetsAt: this.getNextMidnightUTC(),
      trial: {
        active: isFreeTier,
        limit: TRIAL_LIMIT,
        used: tenant?.trialGenerationsUsed ?? 0,
        remaining: isFreeTier ? Math.max(0, TRIAL_LIMIT - (tenant?.trialGenerationsUsed ?? 0)) : null,
      },
      plan: {
        total: tenant?.planGenerationsTotal ?? 0,
        used: tenant?.planGenerationsUsed ?? 0,
        remaining: Math.max(0, (tenant?.planGenerationsTotal ?? 0) - (tenant?.planGenerationsUsed ?? 0)),
      },
    };
  }

  // Public-safe plan info for the /plans page — price + generation count only,
  // no cost/margin data (that's admin-only via AdminController).
  async getPlanInfo() {
    const settings = await this.prisma.planSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return { priceUsd: settings.priceUsd, generationsIncluded: settings.generationsIncluded };
  }

  // Defaults match the limits that were hardcoded here before tier limits
  // became admin-editable — used only to self-seed the DB table on first read.
  private static readonly DEFAULT_TIER_LIMITS: Record<string, { generations: number; reels: number }> = {
    free: { generations: 5, reels: 2 },
    standard: { generations: 50, reels: 10 },
    premium: { generations: 999, reels: 999 },
    tier1: { generations: 2, reels: 0 },
    tier2: { generations: 2, reels: 2 },
    tier3: { generations: 999, reels: 20 },
    tier4: { generations: 999, reels: 20 },
    tier5: { generations: 999, reels: 999 },
  };

  private tierLimitsCache: { data: Record<string, { generations: number; reels: number }>; fetchedAt: number } | null = null;
  private static readonly TIER_LIMITS_CACHE_TTL_MS = 60_000;

  private async loadTierLimits(): Promise<Record<string, { generations: number; reels: number }>> {
    if (this.tierLimitsCache && Date.now() - this.tierLimitsCache.fetchedAt < GenerationService.TIER_LIMITS_CACHE_TTL_MS) {
      return this.tierLimitsCache.data;
    }

    let rows = await this.prisma.tierGenerationLimits.findMany();

    if (rows.length === 0) {
      // First-ever read — seed the table with today's defaults so behavior is
      // unchanged until an admin actually edits a tier via the admin portal.
      await this.prisma.tierGenerationLimits.createMany({
        data: Object.entries(GenerationService.DEFAULT_TIER_LIMITS).map(([tier, v]) => ({
          tier: tier as any,
          generationsPerDay: v.generations,
          reelsPerDay: v.reels,
        })),
        skipDuplicates: true,
      });
      rows = await this.prisma.tierGenerationLimits.findMany();
    }

    const data: Record<string, { generations: number; reels: number }> = {};
    for (const row of rows) {
      data[row.tier] = { generations: row.generationsPerDay, reels: row.reelsPerDay };
    }

    this.tierLimitsCache = { data, fetchedAt: Date.now() };
    return data;
  }

  private async getTierLimits(tier: string): Promise<{ generations: number; reels: number }> {
    const data = await this.loadTierLimits();
    return data[tier] ?? GenerationService.DEFAULT_TIER_LIMITS['free']!;
  }

  private async getTodayUsage(tenantId: string): Promise<{ generations: number; reels: number }> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const jobs = await this.prisma.generationJob.findMany({
      where: {
        tenantId,
        createdAt: { gte: startOfDay },
        state: { notIn: ['failed', 'dead_letter', 'blocked'] },
      },
      select: { outputFormats: true },
    });

    const reels = jobs.filter(j =>
      (j.outputFormats as string[]).some(f => f === 'reel')
    ).length;

    return { generations: jobs.length, reels };
  }

  private getNextMidnightUTC(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  async previewPrompts(tenantId: string, dto: GenerateContentDto) {
    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
    });
    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before previewing prompts');
    }

    let appointment: any = null;
    if (dto.appointmentId) {
      appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        include: { client: true }
      });
    }

    const isMedical = appointment?.serviceCategory === 'injectables_cosmetic' ||
      appointment?.serviceCategory === 'laser_treatments';
    const category = isMedical ? 'medical_aesthetics' : 'general';

    const masterPrompt = await this.prisma.masterPrompt.findFirst({
      where: { category, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const { PromptBuilder } = await import('../ai/orchestrator/prompt-builder');
    const mockCache = {
      getBrandDNAFragment: async () => null,
      setBrandDNAFragment: async () => { },
      getGoldenExamplesFragment: async () => null,
      setGoldenExamplesFragment: async () => { },
    } as any;
    const promptBuilder = new PromptBuilder(mockCache);

    const assembledPrompt = await promptBuilder.assembleGenerationPrompt({
      brandDNA: brandDna as any,
      visionResult: null,
      businessGoal: (dto.goal || 'attract_new_clients') as any,
      goldenExamples: [],
      platform: (dto.platforms?.[0] || 'instagram') as any,
      serviceCategory: appointment?.serviceCategory as any,
      masterPromptText: masterPrompt?.systemPrompt ?? undefined,
      consentRestrictions: {
        show_face: true,
        use_name: true,
        allow_tagging: true,
        allow_before_after: true,
        allow_extended_use: true,
      },
      appointmentContext: {
        serviceName: appointment?.serviceName ?? undefined,
        clientFirstName: appointment?.client?.firstName ?? undefined,
        serviceCategory: appointment?.serviceCategory ?? undefined,
      },
    });

    return {
      systemPrompt: assembledPrompt.systemPrompt,
      userPrompt: assembledPrompt.userPrompt,
    };
  }
}
