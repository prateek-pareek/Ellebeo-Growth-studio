import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantStatusDto, ResolveFailedJobDto } from './dto/admin.dto';

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

  private async buildPlanSettingsView(row: { priceUsd: number; generationsIncluded: number }) {
    // $queryRaw bypasses the PrismaService tenant-isolation middleware (which
    // blocks aggregate without tenantId) — this is intentionally platform-wide.
    const [costRow] = await this.prisma.$queryRaw<[{ avg: number | null }]>`
      SELECT AVG(estimated_cost_usd) AS avg
      FROM platform.generation_jobs
      WHERE estimated_cost_usd IS NOT NULL
    `;

    const avgCostPerGeneration = (costRow?.avg ?? null) !== null
      ? Number(costRow.avg)
      : AdminService.FALLBACK_COST_PER_GENERATION;
    const isCostMeasured = costRow?.avg !== null;
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
}
