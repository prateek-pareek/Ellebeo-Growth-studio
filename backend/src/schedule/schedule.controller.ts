import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { SchedulePostDto, UpdateScheduledPostDto } from './dto/schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('calendar')
  getCalendar(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.scheduleService.getCalendar(req.user.tenantId, from, to);
  }

  @Post('schedule')
  schedule(@Req() req: any, @Body() dto: SchedulePostDto) {
    return this.scheduleService.schedule(req.user.tenantId, dto);
  }

  @Patch('schedule/:id')
  updateSchedule(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateScheduledPostDto) {
    return this.scheduleService.updateSchedule(req.user.tenantId, id, dto);
  }

  @Delete('schedule/:id')
  deleteSchedule(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSchedule(req.user.tenantId, id);
  }

  @Post('schedule/:id/publish-now')
  publishNow(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.publishNow(req.user.tenantId, id);
  }

  @Get('social-accounts')
  getSocialAccounts(@Req() req: any) {
    return this.scheduleService.getSocialAccounts(req.user.tenantId);
  }

  @Post('social-accounts/connect/instagram')
  connectInstagram(@Req() req: any) {
    const redirectUrl = this.scheduleService.getInstagramOAuthUrl(req.user.tenantId);
    return { redirectUrl };
  }

  @Post('social-accounts/connect/facebook')
  connectFacebook(@Req() req: any) {
    const redirectUrl = this.scheduleService.getFacebookOAuthUrl(req.user.tenantId);
    return { redirectUrl };
  }

  @Delete('social-accounts/:id')
  disconnectSocialAccount(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.disconnectSocialAccount(req.user.tenantId, id);
  }

  @Post('social-accounts/:id/refresh-token')
  refreshSocialToken(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.refreshInstagramToken(req.user.tenantId, id);
  }
}
