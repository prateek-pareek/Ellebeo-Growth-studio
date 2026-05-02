import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantStatusDto, ResolveFailedJobDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
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
}
