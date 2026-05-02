import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto, UpdateCampaignDto, AddContentToCampaignDto, ApplyScheduleDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  getCampaigns(@Req() req: any) {
    return this.campaignService.getCampaigns(req.user.tenantId);
  }

  @Post()
  createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) {
    return this.campaignService.createCampaign(req.user.tenantId, dto);
  }

  @Get(':id')
  getCampaign(@Req() req: any, @Param('id') id: string) {
    return this.campaignService.getCampaign(req.user.tenantId, id);
  }

  @Patch(':id')
  updateCampaign(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignService.updateCampaign(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  deleteCampaign(@Req() req: any, @Param('id') id: string) {
    return this.campaignService.deleteCampaign(req.user.tenantId, id);
  }

  @Post(':id/add-content')
  addContent(@Req() req: any, @Param('id') id: string, @Body() dto: AddContentToCampaignDto) {
    return this.campaignService.addContent(req.user.tenantId, id, dto);
  }

  @Delete(':id/content/:contentId')
  removeContent(@Req() req: any, @Param('id') id: string, @Param('contentId') contentId: string) {
    return this.campaignService.removeContent(req.user.tenantId, id, contentId);
  }

  @Get(':id/schedule-suggestion')
  getScheduleSuggestion(@Req() req: any, @Param('id') id: string) {
    return this.campaignService.getScheduleSuggestion(req.user.tenantId, id);
  }

  @Post(':id/apply-schedule')
  applySchedule(@Req() req: any, @Param('id') id: string, @Body() dto: ApplyScheduleDto) {
    return this.campaignService.applySchedule(req.user.tenantId, id, dto);
  }
}
