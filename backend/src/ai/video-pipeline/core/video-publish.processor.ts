// Publish job: reuse existing Instagram/Facebook scheduled-post flow. No LLM.

import { parseVideoPlan } from '../contract';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { persistPlan, type VideoRenderStore } from './video-render.processor';
import { withPlanStatus } from './plan-status';

export interface VideoPublishPayload {
  videoJobId: string;
  tenantId: string;
  scheduledPostId: string;
}

export class VideoPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoPublishError';
  }
}

export async function processVideoPublishJob(
  deps: {
    prisma: VideoRenderStore & {
      contentItem?: {
        update: (args: { where: { id: string }; data: { finalVideoUrl: string } }) => Promise<unknown>;
      };
      videoJob: VideoRenderStore['videoJob'];
    };
    publishScheduledPost: (prisma: unknown, scheduledPostId: string) => Promise<void>;
    isEnabled?: () => boolean;
  },
  payload: VideoPublishPayload,
): Promise<{ status: string }> {
  if (!(deps.isEnabled ?? isGrowthStudioVideoEnabled)()) {
    throw new VideoPublishError('GROWTH_STUDIO_VIDEO is off');
  }

  const row = await deps.prisma.videoJob.findUnique({ where: { id: payload.videoJobId } });
  if (!row || row.tenantId !== payload.tenantId) {
    throw new VideoPublishError(`VideoJob ${payload.videoJobId} not found`);
  }

  if (row.status === 'PUBLISHED') {
    return { status: 'PUBLISHED' };
  }
  if (row.status !== 'RENDERED') {
    throw new VideoPublishError(`VideoJob ${payload.videoJobId} must be RENDERED before publish (was ${row.status})`);
  }

  const plan = parseVideoPlan(row.plan);
  const videoUrl = plan.render.outputUrl ?? row.outputUrl;
  if (!videoUrl) {
    throw new VideoPublishError(`VideoJob ${payload.videoJobId} has no outputUrl`);
  }

  const contentItemId = row.contentItemId;
  if (contentItemId && deps.prisma.contentItem) {
    await deps.prisma.contentItem.update({
      where: { id: contentItemId },
      data: { finalVideoUrl: videoUrl },
    });
  }

  await deps.publishScheduledPost(deps.prisma, payload.scheduledPostId);
  await persistPlan(deps.prisma, payload.videoJobId, withPlanStatus(plan, 'PUBLISHED'));
  return { status: 'PUBLISHED' };
}
