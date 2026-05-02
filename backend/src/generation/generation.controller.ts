import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateContentDto, TweakContentDto } from './dto/generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';
import { GenerationRestrictionGuard } from '../common/guards/generation-restriction.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('generate')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @UseGuards(GenerationRestrictionGuard)
  @Post()
  generate(@Req() req: any, @Body() dto: GenerateContentDto) {
    // In a real scenario we'd need clientId which is linked to appointmentId
    // We assume the service fetches it or we extract from token/client
    return this.generationService.generate(req.user.tenantId, req.user.userId, dto);
  }

  @Get('jobs/:jobId')
  getJobStatus(@Req() req: any, @Param('jobId') jobId: string) {
    return this.generationService.getJobStatus(req.user.tenantId, jobId);
  }

  @UseGuards(GenerationRestrictionGuard)
  @Post('tweak')
  tweakContent(@Req() req: any, @Body() dto: TweakContentDto) {
    return this.generationService.tweakContent(req.user.tenantId, dto);
  }

  @Get('rate-limit-status')
  getRateLimitStatus(@Req() req: any) {
    return this.generationService.getRateLimitStatus(req.user.tenantId);
  }
}
