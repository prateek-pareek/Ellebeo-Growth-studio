import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto, UpdateCampaignDto, AddContentToCampaignDto, ApplyScheduleDto } from './dto/campaign.dto';

@Injectable()
export class CampaignService {
  constructor(private prisma: PrismaService) {}

  async getCampaigns(tenantId: string) {
    return this.prisma.campaign.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createCampaign(tenantId: string, dto: CreateCampaignDto) {
    return this.prisma.campaign.create({
      data: {
        ...dto,
        tenantId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      }
    });
  }

  async getCampaign(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id }
    });
    if (!campaign || campaign.tenantId !== tenantId || campaign.deletedAt) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async updateCampaign(tenantId: string, id: string, dto: UpdateCampaignDto) {
    await this.getCampaign(tenantId, id);
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      }
    });
  }

  async deleteCampaign(tenantId: string, id: string) {
    await this.getCampaign(tenantId, id);
    return this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }

  async addContent(tenantId: string, id: string, dto: AddContentToCampaignDto) {
    await this.getCampaign(tenantId, id);
    // Real implementation would link contentItems to campaign via a join table or update scheduledPosts
    // For simplicity, let's assume we update the scheduledPosts campaignId
    return this.prisma.scheduledPost.updateMany({
      where: { contentItemId: { in: dto.contentItemIds }, tenantId },
      data: { campaignId: id }
    });
  }

  async removeContent(tenantId: string, id: string, contentId: string) {
    await this.getCampaign(tenantId, id);
    return this.prisma.scheduledPost.updateMany({
      where: { contentItemId: contentId, tenantId, campaignId: id },
      data: { campaignId: null }
    });
  }

  async getScheduleSuggestion(tenantId: string, id: string) {
    await this.getCampaign(tenantId, id);
    // Placeholder for CalendarIntelligenceService
    return {
      suggestions: [
        { contentItemId: 'dummy', suggestedDate: new Date(), reason: 'High engagement time' }
      ]
    };
  }

  async applySchedule(tenantId: string, id: string, dto: ApplyScheduleDto) {
    await this.getCampaign(tenantId, id);
    // Placeholder for applying the selected suggestions
    return { success: true };
  }
}
