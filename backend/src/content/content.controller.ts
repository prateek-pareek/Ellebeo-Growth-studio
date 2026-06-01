import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ContentService } from './content.service';
import { GetContentQueryDto, RateContentDto } from './dto/content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  getContent(@Req() req: any, @Query() query: GetContentQueryDto) {
    return this.contentService.getContent(req.user.tenantId, query);
  }

  @Get(':id')
  getContentItem(@Req() req: any, @Param('id') id: string) {
    return this.contentService.getContentItem(req.user.tenantId, id);
  }

  @Patch(':id')
  updateContent(@Req() req: any, @Param('id') id: string, @Body() dto: { caption?: string; callToAction?: string; hashtags?: string[]; hookSentence?: string }) {
    return this.contentService.updateContent(req.user.tenantId, id, dto);
  }

  @Patch(':id/approve')
  approveContent(@Req() req: any, @Param('id') id: string) {
    return this.contentService.approveContent(req.user.tenantId, id, req.user.userId);
  }

  @Patch(':id/reject')
  rejectContent(@Req() req: any, @Param('id') id: string) {
    return this.contentService.rejectContent(req.user.tenantId, id);
  }

  @Post(':id/select-option')
  selectOption(@Req() req: any, @Param('id') id: string, @Body() dto: { optionIndex: number }) {
    return this.contentService.selectOption(req.user.tenantId, id, dto);
  }

  @Post(':id/rate')
  rateContent(@Req() req: any, @Param('id') id: string, @Body() dto: RateContentDto) {
    return this.contentService.rateContent(req.user.tenantId, id, dto);
  }

  @Post(':id/export-pack')
  exportPack(@Req() req: any, @Param('id') id: string) {
    return this.contentService.exportPack(req.user.tenantId, id);
  }

  @Get(':id/export-pack/download')
  getExportPackDownload(@Req() req: any, @Param('id') id: string) {
    return this.contentService.getExportPackDownload(req.user.tenantId, id);
  }

  @Delete(':id')
  deleteContent(@Req() req: any, @Param('id') id: string) {
    return this.contentService.deleteContent(req.user.tenantId, id);
  }
}
