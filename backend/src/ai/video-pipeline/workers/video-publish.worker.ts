import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../../config/ai.config';
import { bullMQConnection } from '../../queues/queue.definitions';
import type { VideoPublishJobPayload } from '../../queues/queue.definitions';
import { publishScheduledPost } from '../../../schedule/publish-post.helper';
import { processVideoPublishJob } from '../core/video-publish.processor';
import { isGrowthStudioVideoEnabled } from '../feature-flag';

export function startVideoPublishWorker(prisma: PrismaClient): Worker<VideoPublishJobPayload> {
  return new Worker<VideoPublishJobPayload>(
    AI_CONFIG.queues.videoPublish.name,
    async (job) => {
      return processVideoPublishJob(
        {
          prisma,
          publishScheduledPost,
          isEnabled: isGrowthStudioVideoEnabled,
        },
        job.data,
      );
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoPublish.concurrency,
    },
  );
}
