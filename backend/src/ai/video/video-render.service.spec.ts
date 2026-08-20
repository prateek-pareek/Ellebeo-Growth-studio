import { VideoRenderService, VideoRenderError } from './video-render.service';
import { parseVideoPlan } from './video-plan.schema';

function makePlanRow(overrides: Record<string, any> = {}) {
  return {
    id: 'plan-1',
    tenantId: 'tenant-1',
    contentItemId: null,
    renderId: null,
    plan: parseVideoPlan({
      technicianId: '11111111-1111-1111-1111-111111111111',
      brandDnaRef: '22222222-2222-2222-2222-222222222222',
      videoType: 'slideshow',
      durationSeconds: 4,
      objective: 'fill_quiet_days',
      scenes: [{
        index: 0,
        durationSeconds: 4,
        asset: { kind: 'image', url: 'https://cdn.example.com/a.jpg' },
        motion: 'ken_burns',
        text: {},
        transitionOut: 'fade',
      }],
      audio: { voiceover: {}, music: {} },
      captions: {},
      branding: {},
      compliance: {},
      critic: {},
      render: {},
      meta: { createdAt: new Date().toISOString() },
    } as any),
    ...overrides,
  };
}

describe('VideoRenderService', () => {
  function makeMockPrisma(row: ReturnType<typeof makePlanRow>) {
    return {
      videoPlan: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ ...row, ...args.data })),
      },
      contentItem: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  function makeMockShotstack(renderId = 'render-123') {
    return { submitRender: jest.fn().mockResolvedValue(renderId) } as any;
  }

  describe('submitRenderForPlan', () => {
    it('submits to Shotstack and sets status=rendering with the returned renderId', async () => {
      const row = makePlanRow();
      const prisma = makeMockPrisma(row);
      const shotstack = makeMockShotstack('render-123');
      const service = new VideoRenderService(prisma as any, shotstack, null);

      const result = await service.submitRenderForPlan('plan-1', {
        callbackBaseUrl: 'https://api.example.com',
        webhookToken: 'secret-token',
      });

      expect(result.renderId).toBe('render-123');
      expect(shotstack.submitRender).toHaveBeenCalledTimes(1);
      const submittedJson = shotstack.submitRender.mock.calls[0][0];
      expect(submittedJson.callback).toBe('https://api.example.com/video/webhooks/shotstack/plan-1?token=secret-token');
      expect(prisma.videoPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'rendering', renderProvider: 'shotstack', renderId: 'render-123', errorMessage: null },
      });
    });

    it('throws when the VideoPlan does not exist', async () => {
      const prisma = { videoPlan: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);
      await expect(
        service.submitRenderForPlan('missing', { callbackBaseUrl: 'https://x.com', webhookToken: 't' }),
      ).rejects.toThrow(VideoRenderError);
    });
  });

  describe('handleRenderCallback — the simulated webhook, submit → RENDERED', () => {
    it('marks the plan RENDERED and stores the output url on a done callback', async () => {
      const row = makePlanRow({ renderId: 'render-123' });
      const prisma = makeMockPrisma(row);
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);

      await service.handleRenderCallback('plan-1', { id: 'render-123', status: 'done', url: 'https://cdn.example.com/out.mp4' });

      expect(prisma.videoPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'rendered', outputUrl: 'https://cdn.example.com/out.mp4', completedAt: expect.any(Date) },
      });
    });

    it('syncs finalVideoUrl onto the linked ContentItem when present', async () => {
      const row = makePlanRow({ renderId: 'render-123', contentItemId: 'content-1' });
      const prisma = makeMockPrisma(row);
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);

      await service.handleRenderCallback('plan-1', { id: 'render-123', status: 'done', url: 'https://cdn.example.com/out.mp4' });

      expect(prisma.contentItem.update).toHaveBeenCalledWith({
        where: { id: 'content-1' },
        data: { finalVideoUrl: 'https://cdn.example.com/out.mp4', reelStatus: 'completed' },
      });
    });

    it('marks the plan FAILED on a failed callback', async () => {
      const row = makePlanRow({ renderId: 'render-123' });
      const prisma = makeMockPrisma(row);
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);

      await service.handleRenderCallback('plan-1', { id: 'render-123', status: 'failed', error: 'boom' });

      expect(prisma.videoPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'failed', errorMessage: 'boom', completedAt: expect.any(Date) },
      });
    });

    it('is a no-op for non-terminal statuses — never polls, only reacts to done/failed', async () => {
      const row = makePlanRow({ renderId: 'render-123' });
      const prisma = makeMockPrisma(row);
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);

      await service.handleRenderCallback('plan-1', { id: 'render-123', status: 'rendering' });

      expect(prisma.videoPlan.update).not.toHaveBeenCalled();
    });

    it('rejects a callback whose renderId does not match the stored renderId', async () => {
      const row = makePlanRow({ renderId: 'render-123' });
      const prisma = makeMockPrisma(row);
      const service = new VideoRenderService(prisma as any, makeMockShotstack(), null);

      await expect(
        service.handleRenderCallback('plan-1', { id: 'wrong-render-id', status: 'done', url: 'https://x.com/out.mp4' }),
      ).rejects.toThrow(VideoRenderError);
    });
  });
});
