import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateTenantStatusDto, ResolveFailedJobDto } from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('tenants')
  getTenants() {
    return this.adminService.getTenants();
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.adminService.getTenant(id);
  }

  @Patch('tenants/:id/status')
  updateTenantStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.adminService.updateTenantStatus(id, dto);
  }

  @Post('tenants/:id/restrict-generation')
  restrictGeneration(@Param('id') id: string) {
    return this.adminService.restrictGeneration(id, true);
  }

  @Post('tenants/:id/suspend-generation')
  suspendGeneration(@Param('id') id: string) {
    return this.adminService.suspendGeneration(id, true);
  }

  @Get('flagged-content')
  getFlaggedContent() {
    return this.adminService.getFlaggedContent();
  }

  @Post('content/:id/clear-flag')
  clearFlag(@Param('id') id: string) {
    return this.adminService.clearFlag(id);
  }

  @Post('content/:id/kill')
  killContent(@Param('id') id: string) {
    return this.adminService.killContent(id);
  }

  @Post('content/:id/feature')
  featureContent(@Param('id') id: string) {
    return this.adminService.featureContent(id);
  }

  @Get('failed-jobs')
  getFailedJobs() {
    return this.adminService.getFailedJobs();
  }

  @Post('failed-jobs/:id/resolve')
  resolveFailedJob(@Param('id') id: string, @Req() req: any, @Body() dto: ResolveFailedJobDto) {
    return this.adminService.resolveFailedJob(id, req.user.userId, dto);
  }

  @Post('failed-jobs/:id/retry')
  retryFailedJob(@Param('id') id: string) {
    return this.adminService.retryFailedJob(id);
  }

  @Get('metrics/cost-report')
  getCostReport() {
    return this.adminService.getCostReport();
  }

  @Get('metrics/generation-volume')
  getGenerationVolume() {
    return this.adminService.getGenerationVolume();
  }

  @Get('metrics/abuse-flags')
  getAbuseFlags() {
    return this.adminService.getAbuseFlags();
  }
}
