import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VideoWebhookController } from './video-webhook.controller';
import { VideoRenderService } from './video-render.service';

@Module({
  controllers: [VideoWebhookController],
  providers: [
    {
      provide: VideoRenderService,
      useFactory: (prisma: PrismaService) => new VideoRenderService(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [VideoRenderService],
})
export class VideoModule {}
