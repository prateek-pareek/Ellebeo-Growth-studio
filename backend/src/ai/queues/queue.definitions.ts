// ============================================================================
// queue.definitions.ts — BullMQ Queue Instantiation
// All 4 queues defined here. Workers and the Job Factory import from here.
// ============================================================================

import { Queue, QueueEvents } from 'bullmq';
import { AI_CONFIG } from '../../config/ai.config';
import type { GenerationJobPayload } from '../types/job-payload.types';

// ---------------------------------------------------------------------------
// Connection config for BullMQ (separate from general Redis client)
// ---------------------------------------------------------------------------

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

// ---------------------------------------------------------------------------
// Queue: content-generation
// Primary queue — LLM text generation, prompt building, vision analysis
// Concurrency: 10 | Rate limit: 50/min | Retry: 3x exponential
// ---------------------------------------------------------------------------

export const contentGenerationQueue = new Queue<GenerationJobPayload>(
  AI_CONFIG.queues.contentGeneration.name,
  {
    connection: bullMQConnection,
    defaultJobOptions: {
      ...AI_CONFIG.queues.contentGeneration.defaultJobOptions,
    },
  }
);

// ---------------------------------------------------------------------------
// Queue: image-processing
// Cloudinary transformations — faster than LLM, higher concurrency
// Concurrency: 20 | Rate limit: 100/min | Retry: 3x
// ---------------------------------------------------------------------------

export interface ImageProcessingJobPayload {
  jobId: string;
  tenantId: string;
  clientId: string;
  contentItemId: string;
  rawStoragePath: string;
  cloudinaryPublicId?: string;
  consentShowFace: boolean;
  brandPrimaryColour: string;
  brandSecondaryColour: string;
  outputFormats: ('feed' | 'story' | 'reel')[];
}

export const imageProcessingQueue = new Queue<ImageProcessingJobPayload>(
  AI_CONFIG.queues.imageProcessing.name,
  {
    connection: bullMQConnection,
    defaultJobOptions: {
      ...AI_CONFIG.queues.imageProcessing.defaultJobOptions,
    },
  }
);

// ---------------------------------------------------------------------------
// Queue: video-assembly
// Shotstack Reel generation — slow and expensive, low concurrency
// Concurrency: 5 | Rate limit: 10/min | Retry: 2x
// ---------------------------------------------------------------------------

export interface VideoAssemblyJobPayload {
  jobId: string;
  tenantId: string;
  contentItemId: string;
  beforeImageCloudinaryUrl: string;
  afterImageCloudinaryUrl: string;
  hookSentence: string;
  brandPrimaryColour: string;
  brandSecondaryColour: string;
  includeVoiceover: boolean;
  voiceoverScript: string | null;
  voiceId: string | null;
  includeMusic: boolean;
  brandMoodTag: string;
}

export const videoAssemblyQueue = new Queue<VideoAssemblyJobPayload>(
  AI_CONFIG.queues.videoAssembly.name,
  {
    connection: bullMQConnection,
    defaultJobOptions: {
      ...AI_CONFIG.queues.videoAssembly.defaultJobOptions,
    },
  }
);

// ---------------------------------------------------------------------------
// Queue: dead-letter-queue
// No workers — jobs land here for manual review + alerting
// ---------------------------------------------------------------------------

export interface DLQJobPayload {
  originalJobId: string;
  originalQueue: string;
  tenantId: string;
  failedAtStep: string;
  errorMessage: string;
  errorStack: string;
  fullPayload: string;           // JSON stringified original payload
  attemptsMade: number;
  failedAt: string;
}

export const deadLetterQueue = new Queue<DLQJobPayload>(
  AI_CONFIG.queues.deadLetter.name,
  {
    connection: bullMQConnection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);

// ---------------------------------------------------------------------------
// Queue Events (for monitoring and WebSocket progress triggers)
// ---------------------------------------------------------------------------

export const contentGenerationQueueEvents = new QueueEvents(
  AI_CONFIG.queues.contentGeneration.name,
  { connection: bullMQConnection }
);

export const imageProcessingQueueEvents = new QueueEvents(
  AI_CONFIG.queues.imageProcessing.name,
  { connection: bullMQConnection }
);

export const videoAssemblyQueueEvents = new QueueEvents(
  AI_CONFIG.queues.videoAssembly.name,
  { connection: bullMQConnection }
);

// ---------------------------------------------------------------------------
// Helper: graceful shutdown of all queues
// ---------------------------------------------------------------------------

export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    contentGenerationQueue.close(),
    imageProcessingQueue.close(),
    videoAssemblyQueue.close(),
    deadLetterQueue.close(),
    contentGenerationQueueEvents.close(),
    imageProcessingQueueEvents.close(),
    videoAssemblyQueueEvents.close(),
  ]);
}
