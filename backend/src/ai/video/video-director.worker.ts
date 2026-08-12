// ============================================================================
// video-director.worker.ts — BullMQ worker for the video-director queue.
// Loads the tenant's current Brand DNA, runs the Director's drafting loop,
// and leaves the resulting plan in status=in_review — render is a separate,
// technician-approved step (Phase 2's video-render queue), never automatic.
// ============================================================================

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import { DirectorService } from './agents/director.service';
import { isMedicalAestheticsBrand } from '../config/medical-compliance';
import type { VideoDirectorJobPayload } from '../queues/queue.definitions';
import type { VideoPlan } from './video-plan.schema';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export function startVideoDirectorWorker(prisma: PrismaClient): Worker<VideoDirectorJobPayload> {
  const director = new DirectorService(prisma);

  const worker = new Worker<VideoDirectorJobPayload>(
    AI_CONFIG.queues.videoDirector.name,
    async (job: Job<VideoDirectorJobPayload>) => {
      const { tenantId, appointmentId, clientId, technicianId, brandDnaId, imageUrls, objective, videoType } = job.data;

      const brandDna = await prisma.brandDNA.findUnique({ where: { id: brandDnaId } });
      if (!brandDna || brandDna.tenantId !== tenantId) {
        throw new Error(`BrandDNA ${brandDnaId} not found for tenant ${tenantId}`);
      }

      const brandVoice = {
        businessName: brandDna.businessName,
        primaryTone: brandDna.primaryTone,
        vocabularyBlacklist: brandDna.vocabularyBlacklist,
        doNotSay: brandDna.doNotSay,
      };
      const brandFont = brandDna.brandFont;
      const brandPalette = [brandDna.primaryBrandColor, brandDna.secondaryBrandColor].filter((c): c is string => !!c);
      const medicalAesthetics = isMedicalAestheticsBrand(brandDna);

      if (videoType === 'reels') {
        return director.draftReelsPlan({
          tenantId,
          appointmentId,
          clientId,
          technicianId,
          brandDnaId,
          imageUrls,
          sceneCount: job.data.sceneCount ?? imageUrls.length,
          objective: objective as VideoPlan['objective'],
          brandVoice,
          brandTone: brandDna.primaryTone,
          brandMoodTag: brandDna.moodTag,
          brandFont,
          brandPalette,
          medicalAesthetics,
          voiceoverEnabled: job.data.voiceoverEnabled ?? true,
        });
      }

      return director.draftSlideshowPlan({
        tenantId,
        appointmentId,
        clientId,
        technicianId,
        brandDnaId,
        imageUrls,
        objective: objective as VideoPlan['objective'],
        brandVoice,
        brandFont,
        brandPalette,
        medicalAesthetics,
      });
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.videoDirector.concurrency,
      limiter: AI_CONFIG.queues.videoDirector.rateLimit,
    }
  );

  worker.on('error', () => { });

  return worker;
}

if (require.main === module) {
  const prismaInstance = new PrismaClient();
  startVideoDirectorWorker(prismaInstance);
}
