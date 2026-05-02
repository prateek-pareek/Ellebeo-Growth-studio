import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@Req() req: any) {
    return this.dashboardService.getDashboard(req.user.tenantId);
  }

  @Get('alerts')
  getAlerts(@Req() req: any) {
    return this.dashboardService.getAlerts(req.user.tenantId);
  }

  @Post('alerts/:id/dismiss')
  dismissAlert(@Req() req: any, @Param('id') id: string) {
    return this.dashboardService.dismissAlert(req.user.tenantId, id);
  }
}
