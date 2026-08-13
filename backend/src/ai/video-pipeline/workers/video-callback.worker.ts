import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../../config/ai.config';
import { bullMQConnection } from '../../queues/queue.definitions';
import type { VideoCallbackJobPayload } from '../../queues/queue.definitions';
import { processVideoCallbackJob } from '../core/video-callback.processor';
import { FirebaseVideoOutputStore } from '../core/firebase-output.store';
import { isGrowthStudioVideoEnabled } from '../feature-flag';

export function startVideoCallbackWorker(prisma: PrismaClient): Worker<VideoCallbackJobPayload> {
  const outputStore = new FirebaseVideoOutputStore();

  return new Worker<VideoCallbackJobPayload>(
    AI_CONFIG.queues.videoCallback.name,
    async (job) => {
      return processVideoCallbackJob(
        {
          prisma,
          outputStore,
          isEnabled: isGrowthStudioVideoEnabled,
        },
        job.data,
      );
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoCallback.concurrency,
    },
  );
}
