import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetContentQueryDto, RateContentDto } from './dto/content.dto';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async getContent(tenantId: string, query: GetContentQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize || '20', 10), 50);
    const skip = (page - 1) * pageSize;

    const whereClause: any = { tenantId, deletedAt: null };

    if (query.status) whereClause.status = query.status;
    if (query.serviceCategory) {
      whereClause.appointment = { serviceCategory: query.serviceCategory };
    }
    if (query.jobId) whereClause.generationJobId = query.jobId;
    if (query.dateFrom || query.dateTo) {
      whereClause.createdAt = {};
      if (query.dateFrom) whereClause.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) whereClause.createdAt.lte = new Date(query.dateTo);
    }

    const [rows, total] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: whereClause,
        include: {
          appointment: {
            select: {
              serviceCategory: true,
              serviceName: true,
              appointmentDate: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
          generationJob: {
            select: { jobPayload: true },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentItem.count({ where: whereClause }),
    ]);

    // Fetch processedImageUrlFeed via raw SQL (column exists in DB but not in Prisma model)
    const ids = rows.map(r => r.id);
    let imageUrlMap: Record<string, string> = {};
    if (ids.length > 0) {
      const imageRows = await this.prisma.$queryRaw<Array<{ id: string; processed_image_url_feed: string | null }>>`
        SELECT id::text, processed_image_url_feed
        FROM platform.content_items
        WHERE id = ANY(${ids}::uuid[])
      `;
      for (const r of imageRows) {
        if (r.processed_image_url_feed) imageUrlMap[r.id] = r.processed_image_url_feed;
      }
    }

    const data = rows.map(r => {
      const pv = r.platformVariants as any;
      let postFormat = 'caption';
      if (r.reelScript) postFormat = 'reel';
      else if (pv?.type === 'carousel') postFormat = 'carousel';
      else if (pv?.type === 'story') postFormat = 'story';

      const jobPayload = r.generationJob?.jobPayload as any;
      const goal = jobPayload?.goal ?? null;

      return { ...r, processedImageUrlFeed: imageUrlMap[r.id] ?? null, postFormat, goal };
    });
    return data;
  }

  async getContentItem(tenantId: string, id: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: { appointment: true, imageAssets: true }
    });
    if (!item || item.tenantId !== tenantId || item.deletedAt) throw new NotFoundException('Content not found');
    return item;
  }

  async updateContent(tenantId: string, id: string, dto: { caption?: string; callToAction?: string; hashtags?: string[]; hookSentence?: string }) {
    await this.getContentItem(tenantId, id);
    return this.prisma.contentItem.update({
      where: { id },
      data: {
        ...(dto.caption !== undefined && { caption: dto.caption }),
        ...(dto.callToAction !== undefined && { callToAction: dto.callToAction }),
        ...(dto.hashtags !== undefined && { hashtags: dto.hashtags }),
        ...(dto.hookSentence !== undefined && { hookSentence: dto.hookSentence }),
        updatedAt: new Date(),
      },
    });
  }

  async approveContent(tenantId: string, id: string, userId: string) {
    await this.getContentItem(tenantId, id);
    return this.prisma.contentItem.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: { connect: { id: userId } }
      }
    });
  }

  async rejectContent(tenantId: string, id: string) {
    await this.getContentItem(tenantId, id);
    return this.prisma.contentItem.update({
      where: { id },
      data: { status: 'draft' } // Simplified rejection to draft
    });
  }

  async selectOption(tenantId: string, id: string, dto: { optionIndex: number }) {
    const item = await this.getContentItem(tenantId, id);
    const options = item.generationOptions as any[];

    if (!options || !options[dto.optionIndex]) {
      throw new NotFoundException('Invalid option index');
    }

    const selected = options[dto.optionIndex];

    return this.prisma.contentItem.update({
      where: { id },
      data: {
        caption: selected.caption,
        hookSentence: selected.hookSentence,
        callToAction: selected.callToAction,
        hashtags: selected.hashtags,
        altText: selected.altText,
        estimatedReadTime: selected.estimatedReadTime,
        confidenceScore: selected.brandVoiceConfidenceScore,
        selectedModel: selected.generatedBy,
      }
    });
  }

  async rateContent(tenantId: string, id: string, dto: RateContentDto) {
    await this.getContentItem(tenantId, id);
    
    const updated = await this.prisma.contentItem.update({
      where: { id },
      data: {
        technicianToneRating: dto.rating as any,
        ratedAt: new Date()
      }
    });

    // Tone calibration logic
    let scoreAdjustment = 0;
    if (dto.rating === 'sounds_like_me') scoreAdjustment = 0.1;
    else if (dto.rating === 'close_but_not_quite') scoreAdjustment = 0;
    else if (dto.rating === 'doesnt_sound_like_me') scoreAdjustment = -0.2;

    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
    });

    if (brandDna) {
      const newScore = Math.max(0, Math.min(1, (brandDna.averageConfidenceScore || 0.5) + scoreAdjustment));
      let override = brandDna.preferredModelOverride;
      
      // If performance score drops too low, potentially override model
      if (newScore < 0.3) {
        override = 'claude-3-5-sonnet';
      }

      await this.prisma.brandDNA.update({
        where: { id: brandDna.id },
        data: { averageConfidenceScore: newScore, preferredModelOverride: override }
      });
    }

    return updated;
  }

  async exportPack(tenantId: string, id: string) {
    await this.getContentItem(tenantId, id);
    // Placeholder path; retrieval should be done through signed URL generation endpoint.
    const fakeUrl = `tenants/${tenantId}/exports/${id}/content_pack.zip`;
    return this.prisma.contentItem.update({
      where: { id },
      data: { exportPackUrl: fakeUrl, exportGeneratedAt: new Date() }
    });
  }

  async getExportPackDownload(tenantId: string, id: string) {
    const item = await this.getContentItem(tenantId, id);
    if (!item.exportPackUrl) throw new NotFoundException('Export pack not found or not generated');
    return { downloadUrl: item.exportPackUrl };
  }

  async deleteContent(tenantId: string, id: string) {
    await this.getContentItem(tenantId, id);
    return this.prisma.contentItem.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' }
    });
  }
}
