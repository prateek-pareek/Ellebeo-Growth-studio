import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getDashboard(tenantId: string) {
    const cacheKey = `dashboard_${tenantId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // Fetch live stats
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [activeGoal, pendingContent, upcomingPosts, appointmentsLogged, generatedContent] = await Promise.all([
      this.prisma.businessGoal.findFirst({ where: { tenantId, isActive: true } }),
      this.prisma.contentItem.count({ where: { tenantId, status: 'draft', deletedAt: null } }),
      this.prisma.scheduledPost.findMany({
        where: { tenantId, scheduledFor: { gte: today }, publishStatus: 'pending', deletedAt: null },
        take: 10,
        orderBy: { scheduledFor: 'asc' },
        include: { contentItem: true }
      }),
      this.prisma.appointment.count({ where: { tenantId, createdAt: { gte: startOfWeek } } }),
      this.prisma.contentItem.count({ where: { tenantId, createdAt: { gte: startOfWeek } } }),
    ]);

    const dashboardData = {
      bookingProgress: {
        current: activeGoal?.currentValue || 0,
        target: activeGoal?.targetValue || 100,
        percentComplete: (activeGoal && activeGoal.targetValue) ? ((activeGoal.currentValue / activeGoal.targetValue) * 100) : 0,
        daysRemainingInPeriod: 14, // Mock
      },
      upcomingPosts: upcomingPosts.map(p => ({
        id: p.id,
        scheduledFor: p.scheduledFor,
        platform: p.platform,
        format: p.postFormat,
        contentItem: p.contentItem ? {
          id: p.contentItem.id,
          caption: p.contentItem.caption,
          thumbnailUrl: p.contentItem.reelThumbnailUrl || p.contentItem.processedImageUrlFeed,
          status: p.contentItem.status,
        } : null,
        publishStatus: p.publishStatus,
      })),
      pendingContent,
      activeGoal,
      nudges: [
        {
          type: 'action_required',
          message: 'You have 3 drafts awaiting approval',
          actionLabel: 'Review Content',
          actionRoute: '/library?status=draft'
        }
      ],
      thisWeekStats: {
        postsPublished: 5, // Mock
        appointmentsLogged,
        contentGenerated: generatedContent,
      }
    };

    // Cache for 5 minutes (300000 ms or 300 s depending on cache-manager version, 
    // nestjs/cache-manager v5 uses ms)
    await this.cacheManager.set(cacheKey, dashboardData, 300000);

    return dashboardData;
  }

  async getAlerts(tenantId: string) {
    return [
      { id: '1', message: 'Instagram token expiring soon', type: 'warning' }
    ];
  }

  async dismissAlert(tenantId: string, alertId: string) {
    return { success: true };
  }
}
