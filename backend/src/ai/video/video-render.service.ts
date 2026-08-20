// ============================================================================
// video-render.service.ts — the deterministic render core for the Video Plan
// pipeline. No LLM calls. Submits a validated Video Plan to Shotstack and
// applies the terminal webhook callback. Shared by the BullMQ worker (submit
// side) and the webhook controller (callback side) so there is exactly one
// place that mutates VideoPlan render state.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { ShotstackService } from '../services/shotstack.service';
import { PixabayMusicService } from '../services/pixabay-music.service';
import { buildShotstackEditFromPlan } from './video-plan-render.mapper';
import { parseVideoPlan, VideoPlan } from './video-plan.schema';
import type { BrandMoodTag } from '../types/job-payload.types';
import { VideoTraceService } from './tracing/video-trace.service';

export class VideoRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoRenderError';
  }
}

export interface SubmitRenderOptions {
  /** Publicly reachable base URL Shotstack can POST its callback to. */
  callbackBaseUrl: string;
  webhookToken: string;
}

export interface ShotstackCallbackPayload {
  id: string;
  status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
  url?: string;
  error?: string;
}

export class VideoRenderService {
  private readonly trace: VideoTraceService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly shotstackService: ShotstackService = new ShotstackService(),
    private readonly pixabayMusicService: PixabayMusicService | null = null,
  ) {
    this.trace = new VideoTraceService(prisma);
  }

  // --------------------------------------------------------------------------
  // Submit: Video Plan → Shotstack. Sets status=rendering, stores renderId.
  // --------------------------------------------------------------------------

  async submitRenderForPlan(videoPlanId: string, options: SubmitRenderOptions): Promise<{ renderId: string }> {
    const row = await this.prisma.videoPlan.findUnique({ where: { id: videoPlanId } });
    if (!row) {
      throw new VideoRenderError(`VideoPlan ${videoPlanId} not found`);
    }

    const plan = parseVideoPlan(row.plan);

    const musicUrl = await this.resolveMusicUrl(plan, row.tenantId);
    const callbackUrl = `${options.callbackBaseUrl.replace(/\/$/, '')}/video/webhooks/shotstack/${videoPlanId}?token=${encodeURIComponent(options.webhookToken)}`;

    const renderJson = buildShotstackEditFromPlan(plan, { musicUrl, callbackUrl });
    const renderId = await this.shotstackService.submitRender(renderJson);

    await this.prisma.videoPlan.update({
      where: { id: videoPlanId },
      data: {
        status: 'rendering',
        renderProvider: 'shotstack',
        renderId,
        errorMessage: null,
      },
    });
    await this.trace.record({ videoPlanId, tenantId: row.tenantId, eventType: 'render_submitted', payload: { renderId, provider: 'shotstack' } });

    return { renderId };
  }

  // --------------------------------------------------------------------------
  // Callback: Shotstack → VideoPlan terminal state. Never polls.
  // --------------------------------------------------------------------------

  async handleRenderCallback(videoPlanId: string, payload: ShotstackCallbackPayload): Promise<void> {
    const row = await this.prisma.videoPlan.findUnique({ where: { id: videoPlanId } });
    if (!row) {
      throw new VideoRenderError(`VideoPlan ${videoPlanId} not found`);
    }

    if (row.renderId && row.renderId !== payload.id) {
      throw new VideoRenderError(
        `Render id mismatch for VideoPlan ${videoPlanId}: expected ${row.renderId}, got ${payload.id}`,
      );
    }

    // Non-terminal statuses (queued/fetching/rendering/saving) — no-op, wait for the terminal callback.
    if (payload.status !== 'done' && payload.status !== 'failed') {
      return;
    }

    if (payload.status === 'done') {
      if (!payload.url) {
        throw new VideoRenderError(`Shotstack reported done with no output url for VideoPlan ${videoPlanId}`);
      }
      await this.prisma.videoPlan.update({
        where: { id: videoPlanId },
        data: { status: 'rendered', outputUrl: payload.url, completedAt: new Date() },
      });
      await this.trace.record({ videoPlanId, tenantId: row.tenantId, eventType: 'render_completed', payload: { outputUrl: payload.url } });
      if (row.contentItemId) {
        await this.prisma.contentItem.update({
          where: { id: row.contentItemId },
          data: { finalVideoUrl: payload.url, reelStatus: 'completed' },
        });
      }
      return;
    }

    await this.prisma.videoPlan.update({
      where: { id: videoPlanId },
      data: { status: 'failed', errorMessage: payload.error ?? 'Shotstack render failed', completedAt: new Date() },
    });
    await this.trace.record({ videoPlanId, tenantId: row.tenantId, eventType: 'render_failed', payload: { error: payload.error ?? null } });
    if (row.contentItemId) {
      await this.prisma.contentItem.update({
        where: { id: row.contentItemId },
        data: { reelStatus: 'failed' },
      });
    }
  }

  // --------------------------------------------------------------------------
  // Music trackId/mood in the plan is not itself a playable url (see
  // video-plan.schema.ts) — resolve it to a CDN url at render time via the
  // same Pixabay integration the Asset agent will use in Phase 4.
  // --------------------------------------------------------------------------

  private async resolveMusicUrl(plan: VideoPlan, tenantId: string): Promise<string | null> {
    if (!this.pixabayMusicService || !plan.audio.music.mood) return null;
    const track = await this.pixabayMusicService.selectTrack(tenantId, plan.audio.music.mood as BrandMoodTag);
    return track?.cdnUrl ?? null;
  }
}
