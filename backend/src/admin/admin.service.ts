import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantStatusDto, ResolveFailedJobDto, UpdateTierLimitsDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService) {}

  async getTenants() {
    return this.prisma.tenant.findMany({
      include: { user: { select: { email: true } } },
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateTenantStatus(id: string, dto: UpdateTenantStatusDto) {
    return this.prisma.tenant.update({
      where: { id },
      data: { status: dto.status as any },
    });
  }

  async restrictGeneration(id: string, restricted: boolean) {
    return this.prisma.tenant.update({
      where: { id },
      data: { generationRestricted: restricted },
    });
  }

  async suspendGeneration(id: string, suspended: boolean) {
    return this.prisma.tenant.update({
      where: { id },
      data: { generationSuspended: suspended },
    });
  }

  async resetTrialUsage(id: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { trialGenerationsUsed: 0, planGenerationsTotal: 0, planGenerationsUsed: 0 },
    });
  }

  async getFlaggedContent() {
    return this.prisma.contentItem.findMany({
      where: { status: 'flagged' },
      include: { tenant: true },
    });
  }

  async clearFlag(id: string) {
    return this.prisma.contentItem.update({
      where: { id },
      data: { status: 'approved', flaggedReason: null, isAdminFlagged: false },
    });
  }

  async killContent(id: string) {
    return this.prisma.contentItem.update({
      where: { id },
      data: { status: 'blocked', blockedReason: 'Admin killed content' },
    });
  }

  async featureContent(id: string) {
    // Logic for featuring content could involve adding to a special table or flag
    return { success: true, message: 'Content featured' };
  }

  async getFailedJobs() {
    return this.prisma.failedJob.findMany({
      where: { isResolved: false },
      include: { tenant: true },
    });
  }

  async resolveFailedJob(id: string, userId: string, dto: ResolveFailedJobDto) {
    return this.prisma.failedJob.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
        resolutionNotes: dto.resolutionNotes,
      },
    });
  }

  async retryFailedJob(id: string) {
    const failedJob = await this.prisma.failedJob.findUnique({ where: { id } });
    if (!failedJob) throw new NotFoundException('Failed job not found');
    
    // Logic to re-enqueue the job would go here
    return { success: true, message: 'Job re-enqueued' };
  }

  async getCostReport() {
    // Aggregate estimated_cost_usd from generation_jobs
    const stats = await this.prisma.generationJob.aggregate({
      _sum: { estimatedCostUsd: true },
    });
    return { totalCost: stats._sum.estimatedCostUsd || 0 };
  }

  async getGenerationVolume() {
    return this.prisma.generationJob.count();
  }

  async getAbuseFlags() {
    return this.prisma.contentItem.count({ where: { status: 'flagged' } });
  }

  // ── Plan settings (single purchasable plan) ────────────────────────────────

  // Used only when there's no real generation-cost history yet (e.g. fresh
  // install) — blended from known model pricing: ~$0.001 caption text +
  // ~$0.045 gpt-image-1 feed image. Real measured average takes over once
  // generation jobs with estimatedCostUsd exist.
  private static readonly FALLBACK_COST_PER_GENERATION = 0.046;

  // $queryRaw bypasses the PrismaService tenant-isolation middleware (which
  // blocks aggregate without tenantId) — this is intentionally platform-wide.
  private async getAvgCostPerGeneration(): Promise<{ avgCostPerGeneration: number; isCostMeasured: boolean }> {
    const [costRow] = await this.prisma.$queryRaw<[{ avg: number | null }]>`
      SELECT AVG(estimated_cost_usd) AS avg
      FROM platform.generation_jobs
      WHERE estimated_cost_usd IS NOT NULL
    `;

    const avgCostPerGeneration = (costRow?.avg ?? null) !== null
      ? Number(costRow.avg)
      : AdminService.FALLBACK_COST_PER_GENERATION;
    return { avgCostPerGeneration, isCostMeasured: costRow?.avg !== null };
  }

  private async buildPlanSettingsView(row: { priceUsd: number; generationsIncluded: number }) {
    const { avgCostPerGeneration, isCostMeasured } = await this.getAvgCostPerGeneration();
    const estimatedCost = avgCostPerGeneration * row.generationsIncluded;
    const estimatedMargin = row.priceUsd - estimatedCost;
    const marginPercent = row.priceUsd > 0 ? (estimatedMargin / row.priceUsd) * 100 : 0;

    return {
      priceUsd: row.priceUsd,
      generationsIncluded: row.generationsIncluded,
      avgCostPerGeneration,
      isCostMeasured,
      estimatedCost,
      estimatedMargin,
      marginPercent,
    };
  }

  async getPlanSettings() {
    const row = await this.prisma.planSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return this.buildPlanSettingsView(row);
  }

  async updatePlanSettings(dto: { priceUsd?: number; generationsIncluded?: number }) {
    const row = await this.prisma.planSettings.upsert({
      where: { id: 'default' },
      update: {
        ...(dto.priceUsd !== undefined ? { priceUsd: dto.priceUsd } : {}),
        ...(dto.generationsIncluded !== undefined ? { generationsIncluded: dto.generationsIncluded } : {}),
      },
      create: {
        id: 'default',
        priceUsd: dto.priceUsd ?? 50,
        generationsIncluded: dto.generationsIncluded ?? 100,
      },
    });
    return this.buildPlanSettingsView(row);
  }

  // ── Tier generation limits (per-tier daily generation/reel caps) ───────────

  // Must match GenerationService.DEFAULT_TIER_LIMITS — used only to self-seed
  // the table on first read, so a fresh table matches today's real limits.
  private static readonly DEFAULT_TIER_LIMITS: Record<string, { generationsPerDay: number; reelsPerDay: number }> = {
    free: { generationsPerDay: 5, reelsPerDay: 2 },
    standard: { generationsPerDay: 50, reelsPerDay: 10 },
    premium: { generationsPerDay: 999, reelsPerDay: 999 },
    tier1: { generationsPerDay: 2, reelsPerDay: 0 },
    tier2: { generationsPerDay: 2, reelsPerDay: 2 },
    tier3: { generationsPerDay: 999, reelsPerDay: 20 },
    tier4: { generationsPerDay: 999, reelsPerDay: 20 },
    tier5: { generationsPerDay: 999, reelsPerDay: 999 },
  };

  // Reference only (see CLAUDE.md Five-Tier Commercial Model) — not synced
  // from Stripe, just used to estimate margin per tier in the admin view.
  private static readonly TIER_MONTHLY_PRICE_USD: Record<string, number> = {
    tier1: 59,
    tier2: 99,
    tier3: 250,
    tier4: 500,
    tier5: 2000,
  };

  private static readonly TIER_DISPLAY_ORDER = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'free', 'standard', 'premium'];

  async getTierLimits() {
    let rows = await this.prisma.tierGenerationLimits.findMany();

    if (rows.length === 0) {
      await this.prisma.tierGenerationLimits.createMany({
        data: Object.entries(AdminService.DEFAULT_TIER_LIMITS).map(([tier, v]) => ({
          tier: tier as any,
          generationsPerDay: v.generationsPerDay,
          reelsPerDay: v.reelsPerDay,
        })),
        skipDuplicates: true,
      });
      rows = await this.prisma.tierGenerationLimits.findMany();
    }

    const { avgCostPerGeneration, isCostMeasured } = await this.getAvgCostPerGeneration();

    return rows
      .slice()
      .sort((a, b) => AdminService.TIER_DISPLAY_ORDER.indexOf(a.tier) - AdminService.TIER_DISPLAY_ORDER.indexOf(b.tier))
      .map((row) => {
        const tierPriceUsd = AdminService.TIER_MONTHLY_PRICE_USD[row.tier] ?? null;
        const estimatedDailyCostUsd = avgCostPerGeneration * row.generationsPerDay;
        const estimatedMonthlyCostUsd = estimatedDailyCostUsd * 30;
        const estimatedMonthlyMarginUsd = tierPriceUsd !== null ? tierPriceUsd - estimatedMonthlyCostUsd : null;
        const estimatedMonthlyMarginPercent = tierPriceUsd !== null && tierPriceUsd > 0
          ? (estimatedMonthlyMarginUsd! / tierPriceUsd) * 100
          : null;

        return {
          tier: row.tier,
          generationsPerDay: row.generationsPerDay,
          reelsPerDay: row.reelsPerDay,
          tierPriceUsd,
          avgCostPerGeneration,
          isCostMeasured,
          estimatedDailyCostUsd,
          estimatedMonthlyCostUsd,
          estimatedMonthlyMarginUsd,
          estimatedMonthlyMarginPercent,
        };
      });
  }

  async updateTierLimits(tier: string, dto: UpdateTierLimitsDto) {
    if (!(tier in AdminService.DEFAULT_TIER_LIMITS)) {
      throw new BadRequestException(`Unknown tier: ${tier}`);
    }
    const defaults = AdminService.DEFAULT_TIER_LIMITS[tier]!;

    await this.prisma.tierGenerationLimits.upsert({
      where: { tier: tier as any },
      update: {
        ...(dto.generationsPerDay !== undefined ? { generationsPerDay: dto.generationsPerDay } : {}),
        ...(dto.reelsPerDay !== undefined ? { reelsPerDay: dto.reelsPerDay } : {}),
      },
      create: {
        tier: tier as any,
        generationsPerDay: dto.generationsPerDay ?? defaults.generationsPerDay,
        reelsPerDay: dto.reelsPerDay ?? defaults.reelsPerDay,
      },
    });

    const all = await this.getTierLimits();
    return all.find((r) => r.tier === tier);
  }
}
