// ============================================================================
// content-generation.worker.ts â€” Primary BullMQ Worker
// Handles the main AI pipeline: vision â†’ prompt â†’ caption â†’ variants â†’ script
// Concurrency: 10 | Rate: 50/min | Retry: 3x exponential
// ============================================================================

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Server as SocketServer } from 'socket.io';
import { AI_CONFIG } from '../../config/ai.config';
import { GenerationOrchestrator } from '../orchestrator/generation-orchestrator';
import { ModelRouter } from '../orchestrator/model-router';
import { PromptBuilder } from '../orchestrator/prompt-builder';
import { PromptCache } from '../orchestrator/prompt-cache';
import { ConsentGuard } from '../guards/consent.guard';
import { JobProgressEmitter } from '../emitters/job-progress.emitter';
import { deadLetterQueue } from '../queues/queue.definitions';
import type { GenerationJobPayload } from '../types/job-payload.types';
import type { DLQJobPayload } from '../queues/queue.definitions';
import { USER_ERROR_MESSAGES } from '../types/generation-result.types';
import { ConsentBlockedError } from '../orchestrator/generation-orchestrator';
import { getRedisClient } from '../../config/redis.client';
import { notificationsQueue } from '../../notifications/notification-queue';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

type NotifyFn = (dto: { tenantId: string; type: string; title: string; body: string; data?: Record<string, unknown> }) => Promise<void>;

export function startContentGenerationWorker(io: SocketServer, notifyFn?: NotifyFn): Worker<GenerationJobPayload> {
  const prisma = new PrismaClient();
  const redis = getRedisClient();

  const progressEmitter = new JobProgressEmitter(io);
  const consentGuard = new ConsentGuard(prisma, io);
  const promptCache = new PromptCache(redis);
  const modelRouter = new ModelRouter();
  const promptBuilder = new PromptBuilder(promptCache);

  // Fallback if notifyFn not injected (queue-only path)
  const notify: NotifyFn = notifyFn ?? (async (dto) => {
    try {
      const notif = await prisma.notification.create({
        data: { tenantId: dto.tenantId, type: dto.type, title: dto.title, body: dto.body, data: (dto.data ?? {}) as any },
      });
      await notificationsQueue.add('deliver', { notificationId: notif.id });
    } catch (e) {
    }
  });

  const orchestrator = new GenerationOrchestrator(
    prisma,
    consentGuard,
    progressEmitter,
    modelRouter,
    promptBuilder,
    notify,
  );

  const worker = new Worker<GenerationJobPayload>(
    AI_CONFIG.queues.contentGeneration.name,
    async (job: Job<GenerationJobPayload>) => {
      const payload = job.data;
      const { jobId, tenantId } = payload;


      try {
        // Check job TTL â€” discard silently if job is too old (no retry)
        const ageMs = Date.now() - new Date(payload.createdAt).getTime();
        if (ageMs > AI_CONFIG.queues.contentGeneration.jobTTLMs) {
          await progressEmitter.emit(jobId, tenantId, 'failed');
          return; // return instead of throw â€” BullMQ won't retry
        }

        const result = await orchestrator.run(payload);


        return result;
      } catch (err) {
        const error = err as Error;

        // Consent block â†’ BLOCKED state, not FAILED
        if (err instanceof ConsentBlockedError) {
          await progressEmitter.emitBlocked(jobId, tenantId);
          // Don't rethrow â€” BullMQ would retry. Mark as blocked and swallow.
          return; // Job "succeeds" from BullMQ's perspective â€” it just terminates cleanly
        }

        // All other errors â€” emit user-friendly message
        const userMessage = mapErrorToUserMessage(error);
        await progressEmitter.emitError(jobId, tenantId, error.name, userMessage);

        // Notify tenant of failure (fire-and-forget)
        notify({ tenantId, type: 'content_generation_failed', title: 'Content generation failed', body: 'Something went wrong while generating your post. Please try again.', data: { jobId } }).catch(() => {});

        // Rethrow so BullMQ handles retry logic
        throw err;
      }
    },
    {
      connection: bullMQConnection,
      concurrency: AI_CONFIG.queues.contentGeneration.concurrency,
      limiter: AI_CONFIG.queues.contentGeneration.rateLimit,
    }
  );

  // Decrement concurrent job counter whenever a job finishes (success or fail)
  const decrementConcurrent = async (tenantId: string) => {
    try {
      const key = AI_CONFIG.redisKeys.rateLimitConcurrent(tenantId);
      const val = await redis.decr(key);
      if (val <= 0) await redis.del(key); // clean up if at zero
    } catch { /* non-fatal */ }
  };

  worker.on('completed', async (job) => {
    if (job?.data?.tenantId) await decrementConcurrent(job.data.tenantId);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;

    const maxAttempts = AI_CONFIG.queues.contentGeneration.defaultJobOptions.attempts;
    if (job.attemptsMade >= maxAttempts) {

      const dlqPayload: DLQJobPayload = {
        originalJobId: job.data.jobId,
        originalQueue: AI_CONFIG.queues.contentGeneration.name,
        tenantId: job.data.tenantId,
        failedAtStep: 'UNKNOWN', // Orchestrator updates this in DB
        errorMessage: err.message,
        errorStack: err.stack ?? '',
        fullPayload: JSON.stringify(job.data),
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      };

      await deadLetterQueue.add(`dlq:${job.data.jobId}`, dlqPayload);

      // Save to failed_jobs table
      const prisma = new PrismaClient();
      try {
        await prisma.$executeRaw`
          INSERT INTO platform.failed_jobs (
            original_job_id, tenant_id, failed_at_step,
            error_message, error_stack, job_payload
          ) VALUES (
            ${job.data.jobId}::uuid,
            ${job.data.tenantId}::uuid,
            'PROCESSING',
            ${err.message},
            ${err.stack ?? ''},
            ${JSON.stringify(job.data)}::jsonb
          )
          ON CONFLICT DO NOTHING
        `;
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  worker.on('error', (err) => {
  });


  return worker;
}

// ---------------------------------------------------------------------------
// Error â†’ User Message Mapping
// ---------------------------------------------------------------------------

function mapErrorToUserMessage(error: Error): string {
  if (error.name === 'JobTTLExceededError') return USER_ERROR_MESSAGES['GENERIC_FAILURE']!;
  if (error.name === 'VisionParseError') return USER_ERROR_MESSAGES['VISION_FAILED']!;
  if (error.name === 'CaptionParseError') return USER_ERROR_MESSAGES['AI_TIMEOUT']!;
  if (error.name === 'BlacklistViolationError') return USER_ERROR_MESSAGES['AI_TIMEOUT']!;
  if (error.message.includes('timeout')) return USER_ERROR_MESSAGES['AI_TIMEOUT']!;
  return USER_ERROR_MESSAGES['GENERIC_FAILURE']!;
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

class JobTTLExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobTTLExceededError';
  }
}
