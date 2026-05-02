// ============================================================================
// index.ts — Application Entry Point
// Starts the Express API server, Socket.io, and all BullMQ workers.
// ============================================================================

import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { getRedisClient, closeRedisClient } from './config/redis.client';
import { closeAllQueues } from './ai/queues/queue.definitions';
import { startContentGenerationWorker } from './ai/workers/content-generation.worker';
import { startImageProcessingWorker } from './ai/workers/image-processing.worker';
import { startVideoAssemblyWorker } from './ai/workers/video-assembly.worker';
import { startDLQMonitor } from './ai/queues/dead-letter-handler';
import { JobFactory } from './ai/queues/job-factory';
import { ConsentGuard } from './ai/guards/consent.guard';
import { PromptCache } from './ai/orchestrator/prompt-cache';
import { PromptBuilder } from './ai/orchestrator/prompt-builder';
import { TweakChain } from './ai/chains/tweak.chain';
import { AI_CONFIG } from './config/ai.config';
import type { GenerationOptions } from './ai/types/job-payload.types';
import type { TweakRequest } from './ai/types/job-payload.types';
import type { BrandDNARecord } from './ai/types/job-payload.types';
import client from 'prom-client';
import { InputSanitiser } from './ai/guards/input-sanitiser';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();
  const redis = getRedisClient();

  // ── Express App ────────────────────────────────────────────────────────────
  const app = express();
  const httpServer = createServer(app);
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  app.use(express.json());

  // ── Socket.io ──────────────────────────────────────────────────────────────
  const io = new SocketServer(httpServer, {
    cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    const tenantId = socket.handshake.auth['tenantId'] as string | undefined;
    if (tenantId) {
      const room = AI_CONFIG.redisKeys.socketRoom(tenantId);
      void socket.join(room);
      console.log(`[Socket.io] Tenant ${tenantId} joined room ${room}`);
    }
  });

  // ── Services ───────────────────────────────────────────────────────────────
  const consentGuard = new ConsentGuard(prisma, io);
  const promptCache = new PromptCache(redis);
  const promptBuilder = new PromptBuilder(promptCache);
  const jobFactory = new JobFactory(prisma, redis, consentGuard);
  const tweakChain = new TweakChain(promptBuilder);
  const inputSanitiser = new InputSanitiser();
  const metricsRegistry = new client.Registry();
  client.collectDefaultMetrics({ register: metricsRegistry });

  // ── API Routes ─────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // POST /generate — Full content generation job
  app.post('/generate', async (req, res) => {
    try {
      const { tenantId, appointmentId, clientId, generationOptions } = req.body as {
        tenantId: string;
        appointmentId: string;
        clientId: string;
        generationOptions: GenerationOptions;
      };

      if (!tenantId || !appointmentId || !clientId || !generationOptions) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      const customInstruction = String((req.body as { customInstruction?: string }).customInstruction ?? '');
      if (customInstruction) {
        const s = inputSanitiser.sanitise(customInstruction);
        if (!s.safe) {
          const msg = s.flagReason === 'injection_attempt'
            ? 'That instruction couldn\'t be processed. Please describe what you\'d like in plain terms — for example, \'make it more playful\' or \'keep it under 100 words\'.'
            : s.flagReason === 'off_topic'
              ? 'Growth Studio is designed for beauty and wellness content. Please keep instructions related to your services and brand.'
              : 'Your instruction is too long. Please keep it under 500 characters.';
          res.status(422).json({ error: msg });
          return;
        }
      }

      const result = await jobFactory.createGenerationJob({
        tenantId,
        appointmentId,
        clientId,
        generationOptions,
      });

      res.status(202).json(result);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'ConsentError') {
        res.status(403).json({ error: error.message, code: 'CONSENT_ERROR' });
        return;
      }
      if (error.name === 'RateLimitError') {
        res.status(429).json({ error: error.message, code: (err as { code?: string }).code });
        return;
      }
      console.error('[API] /generate error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /tweak — Lightweight caption tweak (1/10th cost of full generation)
  app.post('/tweak', async (req, res) => {
    try {
      const request = req.body as TweakRequest;

      if (!request.contentItemId || !request.tenantId || !request.tweakInstruction) {
        res.status(400).json({ error: 'Missing required fields for tweak' });
        return;
      }
      const sanitisedTweak = inputSanitiser.sanitise(request.tweakInstruction);
      if (!sanitisedTweak.safe) {
        const msg = sanitisedTweak.flagReason === 'injection_attempt'
          ? 'That instruction couldn\'t be processed. Please describe what you\'d like in plain terms — for example, \'make it more playful\' or \'keep it under 100 words\'.'
          : sanitisedTweak.flagReason === 'off_topic'
            ? 'Growth Studio is designed for beauty and wellness content. Please keep instructions related to your services and brand.'
            : 'Your instruction is too long. Please keep it under 500 characters.';
        res.status(422).json({ error: msg });
        return;
      }
      request.tweakInstruction = sanitisedTweak.sanitisedInput;

      // Rate check and debounce
      await jobFactory.checkTweakAllowed(request.tenantId, request.contentItemId);

      // Fetch Brand DNA and previous hashtags from DB
      const record = await prisma.contentItem.findUnique({
        where: { contentItemId: request.contentItemId },
        select: { hashtags: true },
      });
      if (!record) {
        res.status(404).json({ error: 'Content item not found' });
        return;
      }

      // Fetch full brand DNA
      const brandDNA = await prisma.brandDNA.findUnique({
        where: { tenantId: request.tenantId },
      });
      const mappedBrandDNA = toBrandDNARecord(brandDNA);
      if (!mappedBrandDNA) {
        res.status(404).json({ error: 'Brand DNA not found' });
        return;
      }

      const result = await tweakChain.tweak({
        request,
        brandDNA: mappedBrandDNA,
        previousHashtags: record.hashtags ?? [],
      });

      // Update content_items with tweaked caption
      await prisma.contentItem.update({
        where: { contentItemId: request.contentItemId },
        data: {
          caption: result.tweakedCaption,
          hashtags: result.tweakedHashtags,
          callToAction: result.tweakedCallToAction,
        },
      });

      res.json(result);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'RateLimitError') {
        res.status(429).json({ error: error.message });
        return;
      }
      console.error('[API] /tweak error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /consent/withdraw — Consent withdrawal webhook
  app.post('/consent/withdraw', async (req, res) => {
    try {
      const { clientId } = req.body as { clientId: string };
      if (!clientId) {
        res.status(400).json({ error: 'clientId required' });
        return;
      }
      await consentGuard.handleConsentWithdrawal(clientId);
      res.json({ status: 'ok', message: 'Consent withdrawal processed' });
    } catch (err) {
      console.error('[API] /consent/withdraw error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /metrics — Prometheus metrics endpoint
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  });

  // ── Start Workers ──────────────────────────────────────────────────────────
  startContentGenerationWorker(io);
  startImageProcessingWorker();
  startVideoAssemblyWorker();
  startDLQMonitor(io);

  // ── Start HTTP Server ──────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    console.log(`[Server] Elle.Be.O AI Orchestration Layer running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal} — shutting down gracefully...`);
    httpServer.close();
    await closeAllQueues();
    await closeRedisClient();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

function toBrandDNARecord(record: Awaited<ReturnType<PrismaClient['brandDNA']['findUnique']>>): BrandDNARecord | null {
  if (!record) return null;
  return {
    ...record,
    primaryTone: record.primaryTone as BrandDNARecord['primaryTone'],
    secondaryTone: record.secondaryTone as BrandDNARecord['secondaryTone'],
    moodTag: record.moodTag as BrandDNARecord['moodTag'],
    captionLengthPreference: record.captionLengthPreference as BrandDNARecord['captionLengthPreference'],
    emojiStyle: record.emojiStyle as BrandDNARecord['emojiStyle'],
    lastUpdatedAt: record.lastUpdatedAt.toISOString(),
  };
}

bootstrap().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
