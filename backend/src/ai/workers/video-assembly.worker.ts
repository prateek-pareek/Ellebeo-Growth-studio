// ============================================================================
// video-assembly.worker.ts — BullMQ Video Assembly Worker
// Concurrency: 5 | Rate: 10/min | Retry: 2x
// Reel failure NEVER fails the entire content pack — caption still delivered
// ============================================================================

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import { ReelAssemblerService } from '../services/reel-assembler.service';
import type { VideoAssemblyJobPayload } from '../queues/queue.definitions';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export function startVideoAssemblyWorker(prisma: PrismaClient): Worker<VideoAssemblyJobPayload> {
  const reelAssembler = new ReelAssemblerService(prisma);

  const worker = new Worker<VideoAssemblyJobPayload>(
    AI_CONFIG.queues.videoAssembly.name,
    async (job: Job<VideoAssemblyJobPayload>) => {
      const {
        jobId, tenantId, contentItemId,
        beforeImageCloudinaryUrl, afterImageCloudinaryUrl,
        hookSentence, brandPrimaryColour, brandSecondaryColour,
        includeVoiceover, voiceoverScript, voiceId,
        includeMusic, brandMoodTag,
      } = job.data;

      // Update reel_status to processing
      await prisma.$executeRaw`
        UPDATE content_items
        SET reel_status = 'processing', updated_at = NOW()
        WHERE content_item_id = ${contentItemId}::uuid
      `;

      const result = await reelAssembler.assemble({
        jobId,
        contentItemId,
        tenantId,
        beforeImageUrl: beforeImageCloudinaryUrl,
        afterImageUrl: afterImageCloudinaryUrl,
        hookSentence,
        brandDNA: {
          moodTag: brandMoodTag,
          primaryBrandColor: brandPrimaryColour,
          secondaryBrandColor: brandSecondaryColour,
        } as unknown as import('../types/job-payload.types').BrandDNARecord,
        reelScript: voiceoverScript && voiceId
          ? {
            script: voiceoverScript,
            wordCount: voiceoverScript.split(/\s+/).length,
            estimatedDurationSeconds: 15,
            elevenLabsVoiceSettings: {
              voiceId,
              voiceName: '',
              stability: AI_CONFIG.elevenLabs.defaultStability,
              similarityBoost: AI_CONFIG.elevenLabs.defaultSimilarityBoost,
              style: AI_CONFIG.elevenLabs.defaultStyle,
            },
          }
          : null,
        includeVoiceover,
        includeMusic,
      });

      return result;
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoAssembly.concurrency,
      limiter: AI_CONFIG.queues.videoAssembly.rateLimit,
    }
  );

  // --------------------------------------------------------------------------
  // CRITICAL: Reel failure marks reel_status failed but does NOT fail content pack
  // --------------------------------------------------------------------------

  worker.on('failed', async (job, _err) => {
    if (!job) return;

    // Mark ONLY reel_status as failed — caption and image remain valid
    try {
      await prisma.$executeRaw`
        UPDATE content_items
        SET reel_status = 'failed', updated_at = NOW()
        WHERE content_item_id = ${job.data.contentItemId}::uuid
      `;
    } catch (logErr) {
      console.error('[Video Assembly Worker] Failed to update content item status:', logErr);
    }
  });

  worker.on('error', () => { });


  return worker;
}

// Start automatically when run as a standalone process (dedicated worker container).
if (require.main === module) {
  const prismaInstance = new PrismaClient();
  startVideoAssemblyWorker(prismaInstance);
}
