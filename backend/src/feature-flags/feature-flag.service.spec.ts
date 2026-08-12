import { FeatureFlagService, bucketFor } from './feature-flag.service';

function makePrisma(flag: any) {
  return {
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue(flag),
      upsert: jest.fn().mockResolvedValue(flag),
    },
  };
}

describe('FeatureFlagService', () => {
  it('returns false when the flag does not exist', async () => {
    const service = new FeatureFlagService(makePrisma(null) as any);
    expect(await service.isEnabled('GROWTH_STUDIO_VIDEO', 'tenant-1')).toBe(false);
  });

  it('returns false when the flag exists but is disabled, regardless of rollout percentage', async () => {
    const service = new FeatureFlagService(makePrisma({ key: 'x', enabled: false, rolloutPercentage: 100 }) as any);
    expect(await service.isEnabled('x', 'tenant-1')).toBe(false);
  });

  it('returns true for every tenant when rolloutPercentage is 100', async () => {
    const service = new FeatureFlagService(makePrisma({ key: 'x', enabled: true, rolloutPercentage: 100 }) as any);
    expect(await service.isEnabled('x', 'tenant-1')).toBe(true);
    expect(await service.isEnabled('x', 'tenant-2')).toBe(true);
  });

  it('returns false for every tenant when rolloutPercentage is 0, even if enabled', async () => {
    const service = new FeatureFlagService(makePrisma({ key: 'x', enabled: true, rolloutPercentage: 0 }) as any);
    expect(await service.isEnabled('x', 'tenant-1')).toBe(false);
  });

  it('is deterministic — the same tenantId always lands in the same bucket', () => {
    const a = bucketFor('tenant-abc');
    const b = bucketFor('tenant-abc');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it('a tenant enabled at a higher rollout percentage stays enabled at 100%, never flips back off', async () => {
    const tenantId = 'tenant-consistent';
    const bucket = bucketFor(tenantId);
    const justAbove = Math.min(100, bucket + 1);

    const serviceAt = (pct: number) => new FeatureFlagService(makePrisma({ key: 'x', enabled: true, rolloutPercentage: pct }) as any);

    expect(await serviceAt(justAbove).isEnabled('x', tenantId)).toBe(true);
    expect(await serviceAt(100).isEnabled('x', tenantId)).toBe(true);
  });
});
