import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GenerationRestrictionGuard } from '../../common/guards/generation-restriction.guard';
import { TenantStatusGuard } from '../../common/guards/tenant-status.guard';
import { parseShotstackWebhookBody } from './core/video-callback.processor';
import { isValidVideoWebhookToken } from './core/video-webhook.util';
import { CreateSlideshowDto } from './dto/create-slideshow.dto';
import { isGrowthStudioVideoEnabled } from './feature-flag';
import { GrowthStudioVideoGuard } from './growth-studio-video.guard';
import { VideoPipelineService } from './video-pipeline.service';
import { VideoQueueService } from './video-queue.service';

@Controller('video')
export class VideoWebhookController {
  constructor(
    private readonly queues: VideoQueueService,
    private readonly pipeline: VideoPipelineService,
  ) {}

  // Shotstack callback — no JWT. Token is the query secret we put on the callback URL.
  @SkipThrottle()
  @Post('webhook')
  async handleWebhook(@Query('token') token: string | undefined, @Body() body: unknown) {
    if (!isGrowthStudioVideoEnabled()) {
      throw new NotFoundException();
    }
    if (!isValidVideoWebhookToken(token)) {
      throw new ForbiddenException('Invalid webhook token');
    }
    const payload = parseShotstackWebhookBody(body);
    if (!payload) {
      return { received: true, ignored: true };
    }
    await this.queues.enqueueCallback(payload);
    return { received: true };
  }

  @UseGuards(JwtAuthGuard, TenantStatusGuard, GrowthStudioVideoGuard, GenerationRestrictionGuard)
  @Post('slideshow/render')
  createSlideshow(@Req() req: { user: { tenantId: string; userId: string } }, @Body() dto: CreateSlideshowDto) {
    return this.pipeline.createAndRenderSlideshow(req.user.tenantId, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, TenantStatusGuard, GrowthStudioVideoGuard)
  @Get('jobs/:id')
  getJob(@Req() req: { user: { tenantId: string } }, @Param('id') id: string) {
    return this.pipeline.getJob(req.user.tenantId, id);
  }
}
