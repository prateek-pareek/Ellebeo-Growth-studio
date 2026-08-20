import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { VideoPlanService } from './video-plan.service';
import { GetVideoPlansQueryDto, UpdateVideoPlanDto } from './dto/video-plan.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('video-plans')
export class VideoPlanController {
  constructor(private readonly videoPlanService: VideoPlanService) {}

  @Get()
  list(@Req() req: any, @Query() query: GetVideoPlansQueryDto) {
    return this.videoPlanService.listVideoPlans(req.user.tenantId, query.status);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.videoPlanService.getVideoPlan(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateVideoPlanDto) {
    return this.videoPlanService.updateVideoPlan(req.user.tenantId, id, dto);
  }

  @Post(':id/approve')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.videoPlanService.approveVideoPlan(req.user.tenantId, id);
  }
}
