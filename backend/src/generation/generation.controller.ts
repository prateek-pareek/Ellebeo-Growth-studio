import { Controller, Get, Post, Body, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateContentDto, TweakContentDto } from './dto/generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';
import { GenerationRestrictionGuard } from '../common/guards/generation-restriction.guard';
import { interval, from, of } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs/operators';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('generation')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @UseGuards(GenerationRestrictionGuard)
  @Post('generate')
  generate(@Req() req: any, @Body() dto: GenerateContentDto) {
    // In a real scenario we'd need clientId which is linked to appointmentId
    // We assume the service fetches it or we extract from token/client
    return this.generationService.generate(req.user.tenantId, req.user.userId, dto);
  }

  @Get('jobs/:jobId')
  getJobStatus(@Req() req: any, @Param('jobId') jobId: string) {
    return this.generationService.getJobStatus(req.user.tenantId, jobId);
  }

  @Sse('jobs/:jobId/stream')
  streamJobStatus(@Req() req: any, @Param('jobId') jobId: string) {
    return interval(2000).pipe(
      startWith(0),
      switchMap(() => from(this.generationService.getJobStatus(req.user.tenantId, jobId))),
      switchMap((job) => of({ data: { jobId: job.id, state: job.state } })),
      catchError((error) => of({ data: { jobId, state: 'failed', error: error?.message || 'stream_error' } })),
    );
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

  @Get('plan-info')
  getPlanInfo() {
    return this.generationService.getPlanInfo();
  }
}
