// ============================================================================
// dead-letter-handler.ts — DLQ Monitoring and Alerting
// No workers consume from DLQ — jobs here require manual review.
// This handler attaches event listeners to the DLQ queue for alerting only.
// ============================================================================

import { QueueEvents } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { AI_CONFIG } from '../../config/ai.config';
import { USER_ERROR_MESSAGES } from '../types/generation-result.types';

const bullMQConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export function startDLQMonitor(io: SocketServer): QueueEvents {
  const dlqEvents = new QueueEvents(
    AI_CONFIG.queues.deadLetter.name,
    { connection: bullMQConnection }
  );

  dlqEvents.on('added', async ({ jobId }) => {

    // Fetch the job details from the failed_jobs table
    const prismaInstance = new PrismaClient();
    try {
      const records = await prismaInstance.$queryRaw<Array<{
        tenant_id: string;
        appointment_id: string;
        error_message: string;
        failed_at_step: string;
      }>>`
        SELECT tenant_id, appointment_id, error_message, failed_at_step
        FROM failed_jobs
        WHERE original_job_id = ${jobId}::uuid
        LIMIT 1
      `;

      const record = records[0];
      if (!record) return;

      // Emit user-friendly error to the technician's frontend
      const room = AI_CONFIG.redisKeys.socketRoom(record.tenant_id);
      io.to(room).emit('job:progress', {
        jobId,
        tenantId: record.tenant_id,
        state: 'DLQ',
        progressPercent: 0,
        currentStep: 'Your content request could not be completed',
        estimatedSecondsRemaining: 0,
        error: {
          code: 'DLQ',
          userMessage: USER_ERROR_MESSAGES['GENERIC_FAILURE'],
        },
      });

    } finally {
      await prismaInstance.$disconnect();
    }
  });

  dlqEvents.on('error', () => {});

  return dlqEvents;
}
