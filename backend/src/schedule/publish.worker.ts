// ============================================================================
// publish.worker.ts — BullMQ Worker for delayed scheduled-post publishing.
// Each job fires at exactly the post's scheduledFor time (BullMQ delayed job).
// Retries: 3x exponential (30s / 60s / 120s) for transient API failures.
// On final failure: marks publishStatus = 'failed' so the UI can show it.
// ============================================================================

import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { bullMQConnection, PUBLISH_SCHEDULED_QUEUE, type PublishScheduledJobPayload } from '../ai/queues/queue.definitions';
import { publishScheduledPost } from './publish-post.helper';

export function startPublishWorker(prisma: PrismaClient) {
  const worker = new Worker<PublishScheduledJobPayload>(
    PUBLISH_SCHEDULED_QUEUE,
    async (job) => {
      await publishScheduledPost(prisma, job.data.scheduledPostId);
    },
    {
      connection: bullMQConnection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[PublishWorker] ✓ Post ${job.data.scheduledPostId} published (tenant: ${job.data.tenantId})`);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
    console.error(
      `[PublishWorker] ✗ Post ${job.data.scheduledPostId} failed (attempt ${job.attemptsMade}, ${attemptsLeft} left): ${err.message}`,
    );
    // Only mark as failed after all retries are exhausted.
    if (attemptsLeft <= 0) {
      try {
        await prisma.scheduledPost.update({
          where: { id: job.data.scheduledPostId },
          data: { publishStatus: 'failed' },
        });
      } catch (e) {
        console.error('[PublishWorker] Could not update publishStatus to failed:', e);
      }
    }
  });

  return worker;
}
