import { Controller, Get, Post, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UpdateTenantDto, CompleteOnboardingDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.tenantService.getProfile(req.user.tenantId);
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() updateDto: UpdateTenantDto) {
    return this.tenantService.updateProfile(req.user.tenantId, updateDto);
  }

  @Get('onboarding-status')
  getOnboardingStatus(@Req() req: any) {
    return this.tenantService.getOnboardingStatus(req.user.tenantId);
  }

  @Post('complete-onboarding')
  completeOnboarding(@Req() req: any, @Body() dto: CompleteOnboardingDto) {
    return this.tenantService.completeOnboarding(req.user.tenantId, dto);
  }

  @Get('subscription')
  getSubscription(@Req() req: any) {
    return this.tenantService.getSubscription(req.user.tenantId);
  }

  @Get('usage-stats')
  getUsageStats(@Req() req: any) {
    return this.tenantService.getUsageStats(req.user.tenantId);
  }
}
