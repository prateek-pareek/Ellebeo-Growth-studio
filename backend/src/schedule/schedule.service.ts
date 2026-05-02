import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulePostDto, UpdateScheduledPostDto } from './dto/schedule.dto';

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  async getCalendar(tenantId: string, from: string, to: string) {
    const posts = await this.prisma.scheduledPost.findMany({
      where: {
        tenantId,
        deletedAt: null,
        scheduledFor: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        }
      },
      include: {
        contentItem: {
          select: {
            id: true,
            caption: true,
            reelThumbnailUrl: true,
            processedImageUrlFeed: true,
            status: true,
          }
        }
      },
      orderBy: { scheduledFor: 'asc' }
    });

    return {
      posts: posts.map(p => ({
        id: p.id,
        scheduledFor: p.scheduledFor.toISOString(),
        platform: p.platform,
        format: p.postFormat,
        contentItem: {
          id: p.contentItem.id,
          caption: p.contentItem.caption,
          thumbnailUrl: p.contentItem.reelThumbnailUrl || p.contentItem.processedImageUrlFeed,
          status: p.contentItem.status,
        },
        publishStatus: p.publishStatus,
      }))
    };
  }

  async schedule(tenantId: string, dto: SchedulePostDto) {
    return this.prisma.scheduledPost.create({
      data: {
        ...dto,
        tenantId,
        scheduledFor: new Date(dto.scheduledFor),
      }
    });
  }

  async updateSchedule(tenantId: string, id: string, dto: UpdateScheduledPostDto) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    return this.prisma.scheduledPost.update({
      where: { id },
      data: {
        ...dto,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      }
    });
  }

  async deleteSchedule(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    return this.prisma.scheduledPost.update({
      where: { id },
      data: { deletedAt: new Date(), publishStatus: 'cancelled' }
    });
  }

  async publishNow(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    if (post.publishStatus !== 'pending') {
      throw new BadRequestException('Only pending posts can be published');
    }

    // Here we would enqueue a job to the publishing worker
    // this.publisherQueue.add('publish', { postId: post.id });

    return { message: 'Publishing initiated' };
  }

  async getSocialAccounts(tenantId: string) {
    return this.prisma.socialAccount.findMany({
      where: { tenantId }
    });
  }

  // Real OAuth flow would redirect and capture codes. Mocks for now.
  async connectPlatform(tenantId: string, platform: 'instagram' | 'facebook', authCode?: string) {
    // If authCode is provided, we'd exchange it. For now, mock the connection.
    if (!authCode) {
      return { redirectUrl: `https://mock.auth.url/oauth2?platform=${platform}` };
    }

    return this.prisma.socialAccount.upsert({
      where: { unique_platform_per_tenant: { tenantId, platform } },
      update: { status: 'connected', tokenRefreshedAt: new Date() },
      create: {
        tenantId,
        platform,
        platformAccountId: `mock_id_${platform}`,
        accountName: `Mock ${platform} Page`,
        status: 'connected',
      }
    });
  }

  async disconnectSocialAccount(tenantId: string, id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.tenantId !== tenantId) throw new NotFoundException('Account not found');

    return this.prisma.socialAccount.update({
      where: { id },
      data: { status: 'disconnected', accessToken: null, refreshToken: null }
    });
  }
}
