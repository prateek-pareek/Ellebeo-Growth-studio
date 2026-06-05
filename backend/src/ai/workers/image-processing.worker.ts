// ============================================================================
// image-processing.worker.ts — Cloudinary Image Processing Worker
// Concurrency: 20 | Rate: 100/min | Retry: 3x
// ============================================================================

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import { ImagePipelineService } from '../services/image-pipeline.service';
import type { ImageProcessingJobPayload } from '../queues/queue.definitions';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export function startImageProcessingWorker(): Worker<ImageProcessingJobPayload> {
  const prisma = new PrismaClient();
  const imagePipeline = new ImagePipelineService(prisma);

  const worker = new Worker<ImageProcessingJobPayload>(
    AI_CONFIG.queues.imageProcessing.name,
    async (job: Job<ImageProcessingJobPayload>) => {
      const { jobId, tenantId, contentItemId, rawStoragePath, consentShowFace,
              brandPrimaryColour, brandSecondaryColour, outputFormats,
              cloudinaryPublicId } = job.data;

      console.log(`[Worker:image] Processing image for job ${jobId}`);

      // Update image_status to processing
      await prisma.$executeRaw`
        UPDATE content_items
        SET image_status = 'processing', updated_at = NOW()
        WHERE content_item_id = ${contentItemId}::uuid
      `;

      const result = await imagePipeline.process({
        rawStoragePath,
        existingCloudinaryId: cloudinaryPublicId,
        consentShowFace,
        brandPrimaryColour,
        brandSecondaryColour,
        outputFormats,
        contentItemId,
        tenantId,
      });

      console.log(`[Worker:image] Image processed for job ${jobId}. Face blurred: ${result.faceBlurred}`);
      return result;
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.imageProcessing.concurrency,
      limiter: AI_CONFIG.queues.imageProcessing.rateLimit,
    }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[Worker:image] Job ${job.id} failed:`, err.message);

    // Mark image_status as failed — does NOT fail the entire content pack
    const prismaInstance = new PrismaClient();
    try {
      await prismaInstance.$executeRaw`
        UPDATE content_items
        SET image_status = 'failed', updated_at = NOW()
        WHERE job_id = ${job.data.jobId}::uuid
      `;
    } finally {
      await prismaInstance.$disconnect();
    }
  });

  worker.on('error', (err) => console.error('[Worker:image] Error:', err));

  console.log(`[Worker:image] Started — concurrency: ${AI_CONFIG.queues.imageProcessing.concurrency}`);
  return worker;
}

// Start automatically when run as a standalone process (dedicated worker container).
if (require.main === module) {
  startImageProcessingWorker();
}
