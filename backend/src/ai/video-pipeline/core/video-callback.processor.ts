// Shotstack webhook callback job. No LLM. Never polls. Idempotent.

import { parseVideoPlan } from '../contract';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { persistPlan, type VideoJobRecord, type VideoRenderStore } from './video-render.processor';
import { withPlanStatus } from './plan-status';

export interface VideoCallbackPayload {
  renderId: string;
  status: 'done' | 'failed';
  url?: string | null;
  error?: string | null;
}

export interface VideoOutputStore {
  storeRenderedVideo: (sourceUrl: string, tenantId: string, videoJobId: string) => Promise<string>;
}

export class VideoCallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoCallbackError';
  }
}

const ALREADY_DONE = new Set(['RENDERED', 'PUBLISHED', 'FAILED']);

export async function processVideoCallbackJob(
  deps: {
    prisma: VideoRenderStore & {
      videoJob: VideoRenderStore['videoJob'] & {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<VideoJobRecord | null>;
      };
      contentItem?: {
        update: (args: { where: { id: string }; data: { finalVideoUrl: string } }) => Promise<unknown>;
      };
    };
    outputStore?: VideoOutputStore;
    isEnabled?: () => boolean;
  },
  payload: VideoCallbackPayload,
): Promise<{ videoJobId: string; status: string } | null> {
  if (!(deps.isEnabled ?? isGrowthStudioVideoEnabled)()) {
    throw new VideoCallbackError('GROWTH_STUDIO_VIDEO is off');
  }

  const row = await deps.prisma.videoJob.findFirst({
    where: { shotstackRenderId: payload.renderId },
  });
  if (!row) {
    throw new VideoCallbackError(`No VideoJob for Shotstack render ${payload.renderId}`);
  }

  if (ALREADY_DONE.has(row.status)) {
    return { videoJobId: row.id, status: row.status };
  }

  const plan = parseVideoPlan(row.plan);

  if (payload.status === 'failed') {
    await persistPlan(deps.prisma, row.id, withPlanStatus(plan, 'FAILED'));
    return { videoJobId: row.id, status: 'FAILED' };
  }

  if (!payload.url) {
    throw new VideoCallbackError(`Shotstack done callback missing url for ${payload.renderId}`);
  }

  const outputUrl = deps.outputStore
    ? await deps.outputStore.storeRenderedVideo(payload.url, row.tenantId, row.id)
    : payload.url;

  await persistPlan(
    deps.prisma,
    row.id,
    withPlanStatus(plan, 'RENDERED', { renderId: payload.renderId, outputUrl, provider: 'shotstack' }),
  );

  if (row.contentItemId && deps.prisma.contentItem) {
    await deps.prisma.contentItem.update({
      where: { id: row.contentItemId },
      data: { finalVideoUrl: outputUrl },
    });
  }

  return { videoJobId: row.id, status: 'RENDERED' };
}

export function parseShotstackWebhookBody(body: unknown): VideoCallbackPayload | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const nested = record['response'] && typeof record['response'] === 'object'
    ? record['response'] as Record<string, unknown>
    : record;
  const renderId = typeof nested['id'] === 'string' ? nested['id']
    : typeof record['id'] === 'string' ? record['id'] : null;
  const status = typeof nested['status'] === 'string' ? nested['status']
    : typeof record['status'] === 'string' ? record['status'] : null;
  if (!renderId || (status !== 'done' && status !== 'failed')) return null;
  return {
    renderId,
    status,
    url: typeof nested['url'] === 'string' ? nested['url'] : null,
    error: typeof nested['error'] === 'string' ? nested['error'] : null,
  };
}
