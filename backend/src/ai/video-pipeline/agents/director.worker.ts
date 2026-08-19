import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../../config/ai.config';
import { bullMQConnection, videoRenderQueue } from '../../queues/queue.definitions';
import type { VideoDirectorJobPayload } from '../../queues/queue.definitions';
import { createAiClipAssetProvider } from '../assets/ai-clip-assets';
import { createElevenLabsVoiceoverPort } from '../assets/elevenlabs-voiceover.adapter';
import { createGeminiVeoClipAdapter } from '../assets/gemini-veo-clip.adapter';
import { createPixabayImageAdapter } from '../assets/pixabay-image.adapter';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { createAnthropicLlmPort } from './anthropic-llm.adapter';
import { processDirectorJob, type DirectorStore } from './director.processor';

export function startVideoDirectorWorker(prisma: PrismaClient): Worker<VideoDirectorJobPayload> {
  const llm = createAnthropicLlmPort();
  // Phase 7: always the AI-clip-capable provider — it only ever attempts a
  // clip generation when a job both opts in (CreateReelsDto.useAiClips) and
  // GROWTH_STUDIO_VIDEO_AI_CLIPS is on; otherwise it behaves exactly like the
  // Phase 4 studio provider (technician asset, else stock).
  const assetProvider = createAiClipAssetProvider(
    createGeminiVeoClipAdapter(),
    createPixabayImageAdapter(),
  );
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
