import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto, CompleteOnboardingDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async getProfile(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        user: {
          select: { email: true, role: true }
        }
      }
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateProfile(tenantId: string, updateDto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: updateDto,
    });
  }

  async getOnboardingStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingCompleted: true, onboardingStep: true }
    });
    return tenant;
  }

  async completeOnboarding(tenantId: string, dto: CompleteOnboardingDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        onboardingStep: dto.step,
        onboardingCompleted: true,
      },
    });
  }

  async getSubscription(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
        status: true,
      }
    });
    return tenant;
  }

  async getUsageStats(tenantId: string) {
    // Basic usage stats aggregation
    const [clientsCount, generatedContent, scheduledPosts] = await Promise.all([
      this.prisma.client.count({ where: { tenantId } }),
      this.prisma.contentItem.count({ where: { tenantId } }),
      this.prisma.scheduledPost.count({ where: { tenantId } }),
    ]);

    return {
      clientsCount,
      generatedContent,
      scheduledPosts,
    };
  }
}
