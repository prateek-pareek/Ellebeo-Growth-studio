// ============================================================================
// video-render.worker.ts — BullMQ worker for the video-render queue.
// Submits a Video Plan to Shotstack. Never fails the caller synchronously —
// a submit failure is recorded on the VideoPlan row (status=failed) after
// BullMQ's retries are exhausted, same convention as video-assembly.worker.ts.
// ============================================================================

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import { VideoRenderService } from './video-render.service';
import type { VideoRenderJobPayload } from '../queues/queue.definitions';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export function startVideoRenderWorker(prisma: PrismaClient): Worker<VideoRenderJobPayload> {
  const videoRenderService = new VideoRenderService(prisma);
  const callbackBaseUrl = process.env['BACKEND_PUBLIC_URL'] ?? 'http://localhost:3001/api/v1';
  const webhookToken = process.env['VIDEO_WEBHOOK_SECRET'] ?? '';

  const worker = new Worker<VideoRenderJobPayload>(
    AI_CONFIG.queues.videoRender.name,
    async (job: Job<VideoRenderJobPayload>) => {
      return videoRenderService.submitRenderForPlan(job.data.videoPlanId, {
        callbackBaseUrl,
        webhookToken,
      });
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoRender.concurrency,
      limiter: AI_CONFIG.queues.videoRender.rateLimit,
    }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    try {
      await prisma.videoPlan.update({
        where: { id: job.data.videoPlanId },
        data: { status: 'failed', errorMessage: err?.message ?? 'Shotstack submit failed' },
      });
    } catch (logErr) {
      console.error('[Video Render Worker] Failed to update VideoPlan status:', logErr);
    }
  });

  worker.on('error', () => { });

  return worker;
}

// Start automatically when run as a standalone process (dedicated worker container).
if (require.main === module) {
  const prismaInstance = new PrismaClient();
  startVideoRenderWorker(prismaInstance);
}
