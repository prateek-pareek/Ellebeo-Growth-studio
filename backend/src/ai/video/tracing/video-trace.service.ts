// ============================================================================
// video-trace.service.ts — persists the event stream a run is reconstructed
// from: both the coarse lifecycle events the spec names (video_started
// through published) and per-agent-call detail (tokens/latency/cost). Tracing
// is best-effort — a failure to write a trace row must never fail the
// pipeline step it's observing, so every write is wrapped and swallowed with
// a console.error, same posture as the existing worker `.on('failed')`
// handlers that log rather than throw.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export type VideoEventType =
  | 'video_started'
  | 'plan_drafted'
  | 'agent_call'
  | 'critic_scored'
  | 'revision_requested'
  | 'compliance_reviewed'
  | 'assets_ready'
  | 'render_submitted'
  | 'render_completed'
  | 'render_failed'
  | 'published';

export interface RecordEventParams {
  videoPlanId: string;
  tenantId: string;
  eventType: VideoEventType;
  agentName?: string;
  tokensUsed?: number;
  latencyMs?: number;
  costUsd?: number;
  payload?: Record<string, unknown>;
}

export class VideoTraceService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(params: RecordEventParams): Promise<void> {
    try {
      await this.prisma.videoPipelineEvent.create({
        data: {
          videoPlanId: params.videoPlanId,
          tenantId: params.tenantId,
          eventType: params.eventType,
          agentName: params.agentName,
          tokensUsed: params.tokensUsed,
          latencyMs: params.latencyMs,
          costUsd: params.costUsd,
          payload: params.payload as any,
        },
      });
    } catch (err) {
      console.error('[VideoTraceService] Failed to persist trace event:', err);
    }
  }

  /** Reconstructs a run as an ordered narrative — the Phase 9 self-test's contract. */
  async getRunHistory(videoPlanId: string) {
    return this.prisma.videoPipelineEvent.findMany({
      where: { videoPlanId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
