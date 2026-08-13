import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../../config/ai.config';
import { bullMQConnection, videoRenderQueue } from '../../queues/queue.definitions';
import type { VideoDirectorJobPayload } from '../../queues/queue.definitions';
import { createElevenLabsVoiceoverPort } from '../assets/elevenlabs-voiceover.adapter';
import { createPixabayImageAdapter } from '../assets/pixabay-image.adapter';
import { createStudioAssetProvider } from '../assets/studio-assets';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { createAnthropicLlmPort } from './anthropic-llm.adapter';
import { processDirectorJob, type DirectorStore } from './director.processor';

export function startVideoDirectorWorker(prisma: PrismaClient): Worker<VideoDirectorJobPayload> {
  const llm = createAnthropicLlmPort();
  const assetProvider = createStudioAssetProvider(createPixabayImageAdapter());
  const voiceover = createElevenLabsVoiceoverPort();

  return new Worker<VideoDirectorJobPayload>(
    AI_CONFIG.queues.videoDirector.name,
    async (job) => {
      return processDirectorJob(
        {
          prisma: prisma as unknown as DirectorStore,
          llm,
          assetProvider,
          voiceover,
          runComplianceAgent: true,
          enqueueRender: (videoJobId, tenantId) =>
            videoRenderQueue.add(
              'render',
              { videoJobId, tenantId },
              { jobId: `video-render:${videoJobId}` },
            ),
          isEnabled: isGrowthStudioVideoEnabled,
        },
        job.data,
      );
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoDirector.concurrency,
    },
  );
}
