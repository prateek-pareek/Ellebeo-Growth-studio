import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('feature-flags')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Get(':key')
  async get(@Req() req: any, @Param('key') key: string) {
    const enabled = await this.featureFlagService.isEnabled(key, req.user.tenantId);
    return { key, enabled };
  }
}
