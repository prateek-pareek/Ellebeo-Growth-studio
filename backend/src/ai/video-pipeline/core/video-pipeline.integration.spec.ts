import { parseVideoPlan } from '../contract';
import { VIDEO_PLAN_FIXTURE_BRAND_DNA_ID, VIDEO_PLAN_FIXTURE_TECHNICIAN_ID } from '../contract/fixture';
import { parseShotstackWebhookBody, processVideoCallbackJob } from './video-callback.processor';
import { processVideoPublishJob } from './video-publish.processor';
import { processVideoRenderJob, type VideoJobRecord } from './video-render.processor';
import { buildSlideshowPlan } from './slideshow-plan-builder';

function createMemoryStore(seed: VideoJobRecord) {
  const rows = new Map<string, VideoJobRecord>([[seed.id, { ...seed }]]);
  const contentItems = new Map<string, { finalVideoUrl?: string }>();

  const prisma = {
    videoJob: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of rows.values()) {
          if (where['shotstackRenderId'] && row.shotstackRenderId === where['shotstackRenderId']) {
            return row;
          }
        }
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const next = { ...rows.get(where.id)!, ...data } as VideoJobRecord;
        rows.set(where.id, next);
        return next;
      },
    },
    contentItem: {
      update: async ({ where, data }: { where: { id: string }; data: { finalVideoUrl: string } }) => {
        contentItems.set(where.id, data);
        return data;
      },
    },
  };

  return { prisma, rows, contentItems };
}

describe('deterministic slideshow core (no agents)', () => {
  const enabled = () => true;

  function seedJob(overrides: Partial<VideoJobRecord> = {}) {
    const plan = parseVideoPlan(buildSlideshowPlan({
      technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
      brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
      objective: 'EDUCATE_TRUST',
      images: [
        { url: 'https://cdn.example.com/a.jpg', headline: 'Soft glam' },
        { url: 'https://cdn.example.com/b.jpg', headline: 'Book in' },
      ],
      branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
      medicalAesthetics: false,
      createdAt: '2026-08-13T00:00:00.000Z',
    }));

    return {
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      status: plan.status,
      plan,
      shotstackRenderId: null,
      outputUrl: null,
      contentItemId: '33333333-3333-3333-3333-333333333333',
      ...overrides,
    } satisfies VideoJobRecord;
  }

  it('submit → simulated webhook → RENDERED (Shotstack mocked)', async () => {
    const job = seedJob();
    const { prisma, rows } = createMemoryStore(job);
    const shotstack = {
      submitRender: jest.fn(async (edit: unknown) => {
        expect(JSON.stringify(edit)).toContain('9:16');
        expect(JSON.stringify(edit)).toContain('callback');
        return 'render-abc';
      }),
    };

    const submitted = await processVideoRenderJob(
      {
        prisma,
        shotstack,
        callbackUrl: 'https://api.example.com/api/v1/video/webhook?token=secret',
        isEnabled: enabled,
      },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    expect(submitted).toEqual({ renderId: 'render-abc', status: 'RENDERING' });
    expect(rows.get(job.id)!.status).toBe('RENDERING');
    expect(rows.get(job.id)!.shotstackRenderId).toBe('render-abc');

    const again = await processVideoRenderJob(
      { prisma, shotstack, isEnabled: enabled },
      { videoJobId: job.id, tenantId: job.tenantId },
    );
    expect(again.renderId).toBe('render-abc');
    expect(shotstack.submitRender).toHaveBeenCalledTimes(1);

    const webhook = parseShotstackWebhookBody({
      id: 'render-abc',
      status: 'done',
      url: 'https://shotstack.example.com/out.mp4',
    });
    expect(webhook).toEqual({
      renderId: 'render-abc',
      status: 'done',
      url: 'https://shotstack.example.com/out.mp4',
      error: null,
    });

    const completed = await processVideoCallbackJob(
      { prisma, isEnabled: enabled },
      webhook!,
    );
    expect(completed).toEqual({ videoJobId: job.id, status: 'RENDERED' });
    expect(rows.get(job.id)!.status).toBe('RENDERED');
    expect(rows.get(job.id)!.outputUrl).toBe('https://shotstack.example.com/out.mp4');
    expect(parseVideoPlan(rows.get(job.id)!.plan).render.outputUrl).toBe(
      'https://shotstack.example.com/out.mp4',
    );

    const duplicate = await processVideoCallbackJob(
      { prisma, isEnabled: enabled },
      webhook!,
    );
    expect(duplicate?.status).toBe('RENDERED');
  });

  it('marks FAILED when Shotstack reports failure', async () => {
    const job = seedJob({ status: 'RENDERING', shotstackRenderId: 'render-fail' });
    const { prisma, rows } = createMemoryStore(job);
    (job.plan as { render: { renderId: string | null } }).render.renderId = 'render-fail';

    await processVideoCallbackJob(
      { prisma, isEnabled: enabled },
      { renderId: 'render-fail', status: 'failed', url: null, error: 'boom' },
    );
    expect(rows.get(job.id)!.status).toBe('FAILED');
  });

  it('refuses to run when GROWTH_STUDIO_VIDEO is off', async () => {
    const job = seedJob();
    const { prisma } = createMemoryStore(job);
    await expect(processVideoRenderJob(
      { prisma, shotstack: { submitRender: async () => 'x' }, isEnabled: () => false },
      { videoJobId: job.id, tenantId: job.tenantId },
    )).rejects.toThrow('GROWTH_STUDIO_VIDEO is off');
  });

  it('publish job reuses publishScheduledPost after RENDERED', async () => {
    const plan = parseVideoPlan(buildSlideshowPlan({
      technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
      brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
      objective: 'EDUCATE_TRUST',
      images: [{ url: 'https://cdn.example.com/a.jpg' }],
      branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
      medicalAesthetics: false,
      createdAt: '2026-08-13T00:00:00.000Z',
    }));
    plan.status = 'RENDERED';
    plan.render.outputUrl = 'https://cdn.example.com/out.mp4';
    plan.render.renderId = 'render-abc';

    const job = seedJob({
      status: 'RENDERED',
      plan,
      shotstackRenderId: 'render-abc',
      outputUrl: 'https://cdn.example.com/out.mp4',
    });
    const { prisma, rows, contentItems } = createMemoryStore(job);
    const publishScheduledPost = jest.fn(async () => undefined);

    const result = await processVideoPublishJob(
      { prisma, publishScheduledPost, isEnabled: enabled },
      { videoJobId: job.id, tenantId: job.tenantId, scheduledPostId: 'post-1' },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(publishScheduledPost).toHaveBeenCalledWith(prisma, 'post-1');
    expect(contentItems.get(job.contentItemId!)!.finalVideoUrl).toBe('https://cdn.example.com/out.mp4');
    expect(rows.get(job.id)!.status).toBe('PUBLISHED');
  });
});
