// Deterministic render job: Video Plan → Shotstack submit. No LLM. Idempotent.

import { parseVideoPlan, type VideoPlan } from '../contract';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { mapVideoPlanToShotstackEdit } from './shotstack-edit-mapper';
import { videoJobDenormalizedFields, withPlanStatus } from './plan-status';

export interface VideoRenderPayload {
  videoJobId: string;
  tenantId: string;
}

export interface VideoRenderStore {
  videoJob: {
    findUnique: (args: { where: { id: string } }) => Promise<VideoJobRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface VideoJobRecord {
  id: string;
  tenantId: string;
  status: string;
  plan: unknown;
  shotstackRenderId: string | null;
  outputUrl: string | null;
  contentItemId: string | null;
}

export interface ShotstackSubmitPort {
  submitRender: (editJson: unknown) => Promise<string>;
}

export class VideoRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoRenderError';
  }
}

const TERMINAL = new Set(['RENDERED', 'PUBLISHED']);

export async function processVideoRenderJob(
  deps: {
    prisma: VideoRenderStore;
    shotstack: ShotstackSubmitPort;
    callbackUrl?: string;
    isEnabled?: () => boolean;
  },
  payload: VideoRenderPayload,
): Promise<{ renderId: string; status: string }> {
  if (!(deps.isEnabled ?? isGrowthStudioVideoEnabled)()) {
    throw new VideoRenderError('GROWTH_STUDIO_VIDEO is off');
  }

  const row = await deps.prisma.videoJob.findUnique({ where: { id: payload.videoJobId } });
  if (!row || row.tenantId !== payload.tenantId) {
    throw new VideoRenderError(`VideoJob ${payload.videoJobId} not found`);
  }

  if (TERMINAL.has(row.status)) {
    return { renderId: row.shotstackRenderId ?? '', status: row.status };
  }

  if (row.status === 'RENDERING' && row.shotstackRenderId) {
    return { renderId: row.shotstackRenderId, status: 'RENDERING' };
  }

  const plan = parseVideoPlan(row.plan);
  const edit = mapVideoPlanToShotstackEdit(plan, { callbackUrl: deps.callbackUrl });
  const renderId = await deps.shotstack.submitRender(edit);

  const next = withPlanStatus(plan, 'RENDERING', { renderId, provider: 'shotstack' });
  await persistPlan(deps.prisma, payload.videoJobId, next);
  return { renderId, status: 'RENDERING' };
}

export async function persistPlan(
  prisma: VideoRenderStore,
  videoJobId: string,
  plan: VideoPlan,
): Promise<void> {
  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: videoJobDenormalizedFields(plan),
  });
}

export async function markVideoJobFailed(
  prisma: VideoRenderStore,
  videoJobId: string,
): Promise<void> {
  const row = await prisma.videoJob.findUnique({ where: { id: videoJobId } });
  if (!row) return;
  if (TERMINAL.has(row.status) || row.status === 'FAILED') return;
  try {
    const plan = parseVideoPlan(row.plan);
    await persistPlan(prisma, videoJobId, withPlanStatus(plan, 'FAILED'));
  } catch {
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED' },
    });
  }
}
