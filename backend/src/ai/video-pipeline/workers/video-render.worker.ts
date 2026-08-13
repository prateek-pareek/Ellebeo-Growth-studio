import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../../config/ai.config';
import { ShotstackService } from '../../services/shotstack.service';
import { bullMQConnection } from '../../queues/queue.definitions';
import type { VideoRenderJobPayload } from '../../queues/queue.definitions';
import { markVideoJobFailed, processVideoRenderJob } from '../core/video-render.processor';
import { buildVideoWebhookCallbackUrl } from '../core/video-webhook.util';
import { isGrowthStudioVideoEnabled } from '../feature-flag';

export function startVideoRenderWorker(prisma: PrismaClient): Worker<VideoRenderJobPayload> {
  const shotstack = new ShotstackService();

  const worker = new Worker<VideoRenderJobPayload>(
    AI_CONFIG.queues.videoRender.name,
    async (job) => {
      return processVideoRenderJob(
        {
          prisma,
          shotstack: { submitRender: (editJson) => shotstack.submitRender(editJson as Parameters<ShotstackService['submitRender']>[0]) },
          callbackUrl: buildVideoWebhookCallbackUrl(),
          isEnabled: isGrowthStudioVideoEnabled,
        },
        job.data,
      );
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoRender.concurrency,
      limiter: AI_CONFIG.queues.videoRender.rateLimit,
    },
  );

  worker.on('failed', async (job) => {
    if (!job) return;
    const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
    if (attemptsLeft <= 0) {
      await markVideoJobFailed(prisma, job.data.videoJobId);
    }
  });

  return worker;
}
