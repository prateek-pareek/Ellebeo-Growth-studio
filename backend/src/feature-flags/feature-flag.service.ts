// ============================================================================
// feature-flag.service.ts — the backend-persisted feature flag table Phase 0
// found missing (the frontend stub had no backend table at all). Global
// rollout percentage, not per-tenant rows — a deterministic hash of tenantId
// decides whether a given tenant falls under the current percentage, so a
// tenant doesn't flip in and out as the percentage ratchets up during a
// staged rollout (the same tenant is always on the same side of the line).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

export const GROWTH_STUDIO_VIDEO_FLAG = 'GROWTH_STUDIO_VIDEO';

@Injectable()
export class FeatureFlagService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(key: string, tenantId: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag || !flag.enabled) return false;
    if (flag.rolloutPercentage >= 100) return true;
    if (flag.rolloutPercentage <= 0) return false;
    return bucketFor(tenantId) < flag.rolloutPercentage;
  }

  async getFlag(key: string) {
    return this.prisma.featureFlag.findUnique({ where: { key } });
  }

  async setFlag(key: string, enabled: boolean, rolloutPercentage: number) {
    return this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, rolloutPercentage },
      update: { enabled, rolloutPercentage },
    });
  }
}

/** Deterministic 0-99 bucket for a tenantId — stable across calls, no randomness. */
export function bucketFor(tenantId: string): number {
  const hash = createHash('sha256').update(tenantId).digest();
  return hash.readUInt32BE(0) % 100;
}
