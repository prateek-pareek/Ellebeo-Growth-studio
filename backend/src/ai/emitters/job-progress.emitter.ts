// ============================================================================
// job-progress.emitter.ts — Real-Time WebSocket Progress via Socket.io
// Every job state transition emits to the technician's authenticated room.
// Percent/ETA are always sourced from GenerationProgressTracker so the
// websocket event and the REST polling endpoint (GenerationService.
// getJobStatus) never disagree — one live-computed number, two transports.
// ============================================================================

import type { Server as SocketServer } from 'socket.io';
import { AI_CONFIG } from '../../config/ai.config';
import type { JobProgressEvent } from '../types/generation-result.types';
import type { JobState } from '../types/job-payload.types';
import { GenerationProgressTracker } from '../services/generation-progress.tracker';

export class JobProgressEmitter {
  constructor(private readonly io: SocketServer) {}

  // --------------------------------------------------------------------------
  // Emit state transition to technician's room
  // --------------------------------------------------------------------------

  async emit(jobId: string, tenantId: string, state: JobState): Promise<void> {
    const progressConfig = AI_CONFIG.progressMap[state];
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);
    const floor = AI_CONFIG.stateFloorPercent[state] ?? progressConfig.percent;

    GenerationProgressTracker.setStep(jobId, progressConfig.step, floor);
    const live = GenerationProgressTracker.getLive(jobId);

    const event: JobProgressEvent = {
      jobId,
      tenantId,
      state,
      progressPercent: live?.percent ?? progressConfig.percent,
      currentStep: progressConfig.step,
      estimatedSecondsRemaining: live?.estimatedSecondsRemaining ?? AI_CONFIG.stateEtaSeconds[state] ?? 30,
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
    const step = 'Your caption is ready — processing your photo...';

    GenerationProgressTracker.setStep(jobId, step, AI_CONFIG.stateFloorPercent['generating_text'] ?? 16);
    const live = GenerationProgressTracker.getLive(jobId);

    const event: Partial<JobProgressEvent> = {
      jobId,
      tenantId,
      state: 'generating_text',
      progressPercent: live?.percent ?? 70,
      currentStep: step,
      estimatedSecondsRemaining: live?.estimatedSecondsRemaining ?? 12,
      partialResult,
    };

    this.io.to(room).emit('job:progress', event);
  }

  // --------------------------------------------------------------------------
  // Emit fine-grained sub-progress within a single JobState (e.g. inside
  // 'generating_text' while the orchestrator is actually doing image/carousel/
  // story/reel work). Presentation-only — never touches the persisted JobState
  // or its transition table, just raises the tracker's structural floor.
  // --------------------------------------------------------------------------

  async emitSubProgress(
    jobId: string,
    tenantId: string,
    state: JobState,
    floorPercent: number,
    step: string
  ): Promise<void> {
    const room = AI_CONFIG.redisKeys.socketRoom(tenantId);

    GenerationProgressTracker.setStep(jobId, step, floorPercent);
    const live = GenerationProgressTracker.getLive(jobId);

    const event: JobProgressEvent = {
      jobId,
      tenantId,
      state,
      progressPercent: live?.percent ?? floorPercent,
      currentStep: step,
      estimatedSecondsRemaining: live?.estimatedSecondsRemaining ?? 10,
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

    GenerationProgressTracker.clear(jobId);

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

    GenerationProgressTracker.clear(jobId);

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
}
