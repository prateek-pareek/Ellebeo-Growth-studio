import { Module } from '@nestjs/common';
import { GenerationRestrictionGuard } from '../../common/guards/generation-restriction.guard';
import { GrowthStudioVideoGuard } from './growth-studio-video.guard';
import { VideoPipelineService } from './video-pipeline.service';
import { VideoQueueService } from './video-queue.service';
import { VideoWebhookController } from './video-webhook.controller';

@Module({
  controllers: [VideoWebhookController],
  providers: [VideoPipelineService, VideoQueueService, GrowthStudioVideoGuard, GenerationRestrictionGuard],
  exports: [VideoPipelineService, VideoQueueService],
})
export class VideoPipelineModule {}
