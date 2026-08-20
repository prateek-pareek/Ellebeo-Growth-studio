import { VideoTraceService } from './video-trace.service';

describe('VideoTraceService', () => {
  it('persists an event with the given fields', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { videoPipelineEvent: { create } };
    const service = new VideoTraceService(prisma as any);

    await service.record({ videoPlanId: 'plan-1', tenantId: 'tenant-1', eventType: 'video_started', payload: { videoType: 'slideshow' } });

    expect(create).toHaveBeenCalledWith({
      data: {
        videoPlanId: 'plan-1',
        tenantId: 'tenant-1',
        eventType: 'video_started',
        agentName: undefined,
        tokensUsed: undefined,
        latencyMs: undefined,
        costUsd: undefined,
        payload: { videoType: 'slideshow' },
      },
    });
  });

  it('never throws, even if the underlying write fails — tracing must not break the pipeline it observes', async () => {
    const prisma = { videoPipelineEvent: { create: jest.fn().mockRejectedValue(new Error('db down')) } };
    const service = new VideoTraceService(prisma as any);

    await expect(service.record({ videoPlanId: 'plan-1', tenantId: 'tenant-1', eventType: 'video_started' })).resolves.toBeUndefined();
  });

  it('getRunHistory returns events ordered oldest first', async () => {
    const findMany = jest.fn().mockResolvedValue([{ eventType: 'video_started' }, { eventType: 'plan_drafted' }]);
    const prisma = { videoPipelineEvent: { findMany } };
    const service = new VideoTraceService(prisma as any);

    const history = await service.getRunHistory('plan-1');

    expect(findMany).toHaveBeenCalledWith({ where: { videoPlanId: 'plan-1' }, orderBy: { createdAt: 'asc' } });
    expect(history).toHaveLength(2);
  });
});
