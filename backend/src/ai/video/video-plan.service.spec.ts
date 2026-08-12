jest.mock('../queues/queue.definitions', () => ({
  videoRenderQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

import { VideoPlanService } from './video-plan.service';
import { videoRenderQueue } from '../queues/queue.definitions';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { parseVideoPlan } from './video-plan.schema';

function makePlan(overrides: Record<string, any> = {}) {
  return parseVideoPlan({
    technicianId: '11111111-1111-1111-1111-111111111111',
    brandDnaRef: '22222222-2222-2222-2222-222222222222',
    videoType: 'slideshow',
    durationSeconds: 8,
    objective: 'fill_quiet_days',
    scenes: [
      { index: 0, durationSeconds: 4, asset: { kind: 'image', url: 'https://cdn.example.com/a.jpg' }, motion: 'ken_burns', text: { headline: 'A', caption: null }, transitionOut: 'fade' },
      { index: 1, durationSeconds: 4, asset: { kind: 'image', url: 'https://cdn.example.com/b.jpg' }, motion: 'ken_burns', text: { headline: 'B', caption: null }, transitionOut: 'fade' },
    ],
    audio: { voiceover: { enabled: false }, music: { mood: 'chill' } },
    captions: {},
    branding: {},
    compliance: {},
    critic: {},
    render: {},
    meta: { createdAt: new Date().toISOString() },
    ...overrides,
  } as any);
}

function makeRow(overrides: Record<string, any> = {}) {
  return { id: 'plan-1', tenantId: 'tenant-1', status: 'in_review', plan: makePlan(), ...overrides };
}

function makeMockPrisma(row: ReturnType<typeof makeRow>) {
  let current = row;
  return {
    videoPlan: {
      findMany: jest.fn().mockResolvedValue([row]),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(current)),
      update: jest.fn().mockImplementation((args: any) => {
        current = { ...current, ...args.data };
        return Promise.resolve(current);
      }),
    },
  };
}

describe('VideoPlanService', () => {
  beforeEach(() => {
    (videoRenderQueue.add as jest.Mock).mockClear();
  });

  describe('getVideoPlan', () => {
    it('throws NotFoundException when the plan belongs to a different tenant', async () => {
      const row = makeRow({ tenantId: 'other-tenant' });
      const prisma = makeMockPrisma(row);
      const service = new VideoPlanService(prisma as any);
      await expect(service.getVideoPlan('tenant-1', 'plan-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the plan does not exist', async () => {
      const prisma = { videoPlan: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new VideoPlanService(prisma as any);
      await expect(service.getVideoPlan('tenant-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVideoPlan', () => {
    it('edits a scene headline/caption/assetUrl by index', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);

      const updated: any = await service.updateVideoPlan('tenant-1', 'plan-1', {
        scenes: [{ index: 0, headline: 'New Headline', assetUrl: 'https://cdn.example.com/new.jpg' }],
      });

      expect(updated.plan.scenes[0].text.headline).toBe('New Headline');
      expect(updated.plan.scenes[0].asset.url).toBe('https://cdn.example.com/new.jpg');
      expect(updated.plan.scenes[1].text.headline).toBe('B'); // untouched
      expect(updated.status).toBe('edited');
    });

    it('reorders scenes given the old indices in new order', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);

      const updated: any = await service.updateVideoPlan('tenant-1', 'plan-1', { sceneOrder: [1, 0] });

      expect(updated.plan.scenes[0].text.headline).toBe('B');
      expect(updated.plan.scenes[0].index).toBe(0);
      expect(updated.plan.scenes[1].text.headline).toBe('A');
      expect(updated.plan.scenes[1].index).toBe(1);
    });

    it('throws when sceneOrder does not contain every scene exactly once', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);
      await expect(service.updateVideoPlan('tenant-1', 'plan-1', { sceneOrder: [0, 0] })).rejects.toThrow(BadRequestException);
    });

    it('throws when editing a scene index that does not exist', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);
      await expect(
        service.updateVideoPlan('tenant-1', 'plan-1', { scenes: [{ index: 99, headline: 'x' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('toggles voiceoverEnabled and sets music mood', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);

      const updated: any = await service.updateVideoPlan('tenant-1', 'plan-1', { voiceoverEnabled: true, musicMood: 'upbeat' });

      expect(updated.plan.audio.voiceover.enabled).toBe(true);
      expect(updated.plan.audio.music.mood).toBe('upbeat');
    });

    it('refuses to edit a plan that is already rendering/rendered/published', async () => {
      const prisma = makeMockPrisma(makeRow({ status: 'rendered' }));
      const service = new VideoPlanService(prisma as any);
      await expect(
        service.updateVideoPlan('tenant-1', 'plan-1', { scenes: [{ index: 0, headline: 'x' }] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveVideoPlan', () => {
    it('sets status to edited and enqueues a video-render job', async () => {
      const prisma = makeMockPrisma(makeRow());
      const service = new VideoPlanService(prisma as any);

      await service.approveVideoPlan('tenant-1', 'plan-1');

      expect(videoRenderQueue.add).toHaveBeenCalledWith(
        'video-render:plan-1',
        { videoPlanId: 'plan-1', tenantId: 'tenant-1' },
        expect.objectContaining({ jobId: 'plan-1' }),
      );
    });

    it('refuses to approve a plan that is already rendering', async () => {
      const prisma = makeMockPrisma(makeRow({ status: 'rendering' }));
      const service = new VideoPlanService(prisma as any);
      await expect(service.approveVideoPlan('tenant-1', 'plan-1')).rejects.toThrow(BadRequestException);
      expect(videoRenderQueue.add).not.toHaveBeenCalled();
    });
  });
});
