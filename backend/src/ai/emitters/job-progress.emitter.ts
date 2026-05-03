// ============================================================================
// job-progress.emitter.ts — Real-Time WebSocket Progress via Socket.io
// Every job state transition emits to the technician's authenticated room.
// ============================================================================

import type { Server as SocketServer } from 'socket.io';
import { AI_CONFIG } from '../../config/ai.config';
import type { JobProgressEvent } from '../types/generation-result.types';
import type { JobState } from '../types/job-payload.types';

export class JobProgressEmitter {
  constructor(private readonly io: SocketServer) {}

  // --------------------------------------------------------------------------
  // Emit state transition to technician's room
  // --------------------------------------------------------------------------

  async emit(jobId: string, tenantId: string, state: JobState): Promise<void> {
    const progressConfig = AI_CONFIG.progressMap[state];
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);

    const event: JobProgressEvent = {
      jobId,
      tenantId,
      state,
      progressPercent: progressConfig.percent,
      currentStep: progressConfig.step,
      estimatedSecondsRemaining: this.estimateRemaining(state),
    };

    this.io.to(room).emit('job:progress', event);
  }

  // --------------------------------------------------------------------------
  // Emit partial result — caption sent to frontend before image/reel complete
  // --------------------------------------------------------------------------

  async emitPartialResult(
    jobId: string,
    tenantId: string,
    partialResult: { caption?: string; hashtags?: string[] }
  ): Promise<void> {
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);

    const event: Partial<JobProgressEvent> = {
      jobId,
      tenantId,
      state: 'generating_text',
      progressPercent: 70,
      currentStep: 'Your caption is ready — processing your photo...',
      estimatedSecondsRemaining: this.estimateRemaining('generating_text'),
      partialResult,
    };

    this.io.to(room).emit('job:progress', event);
  }

  // --------------------------------------------------------------------------
  // Emit error to technician's room (user-friendly message)
  // --------------------------------------------------------------------------

  async emitError(
    jobId: string,
    tenantId: string,
    errorCode: string,
    userMessage: string
  ): Promise<void> {
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);

    const event: JobProgressEvent = {
      jobId,
      tenantId,
      state: 'failed',
      progressPercent: 0,
      currentStep: 'Something went wrong',
      estimatedSecondsRemaining: 0,
      error: { code: errorCode, userMessage },
    };

    this.io.to(room).emit('job:progress', event);
  }

  // --------------------------------------------------------------------------
  // Emit blocked state (consent withdrawal)
  // --------------------------------------------------------------------------

  async emitBlocked(jobId: string, tenantId: string): Promise<void> {
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);

    const event: JobProgressEvent = {
      jobId,
      tenantId,
      state: 'blocked',
      progressPercent: 0,
      currentStep: AI_CONFIG.progressMap['blocked'].step,
      estimatedSecondsRemaining: 0,
    };

    this.io.to(room).emit('job:progress', event);
  }

  // --------------------------------------------------------------------------
  // Estimate remaining seconds per state
  // --------------------------------------------------------------------------

  private estimateRemaining(state: JobState): number {
    const estimates: Partial<Record<JobState, number>> = {
      queued: 45,
      processing_image: 35,
      processing_vision: 25,
      building_prompt: 20,
      generating_text: 12,
      generating_reel: 90,
      completed: 0,
      failed: 0,
      blocked: 0,
      dead_letter: 0,
    };
    return estimates[state] ?? 30;
  }
}
