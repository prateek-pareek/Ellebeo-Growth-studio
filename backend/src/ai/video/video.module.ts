import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VideoWebhookController } from './video-webhook.controller';
import { VideoPlanController } from './video-plan.controller';
import { VideoRenderService } from './video-render.service';
import { VideoPlanService } from './video-plan.service';

@Module({
  controllers: [VideoWebhookController, VideoPlanController],
  providers: [
    {
      provide: VideoRenderService,
      useFactory: (prisma: PrismaService) => new VideoRenderService(prisma),
      inject: [PrismaService],
    },
    VideoPlanService,
  ],
  exports: [VideoRenderService],
})
export class VideoModule {}
