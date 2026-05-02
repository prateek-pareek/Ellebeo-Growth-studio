// ============================================================================
// prompt-cache.ts — Redis-backed Prompt Fragment Caching
// Caches Brand DNA and Golden Examples fragments independently.
// Each fragment is keyed by tenantId + brandDNAVersion so stale cache
// is automatically bypassed after a Brand DNA update.
// ============================================================================

import type Redis from 'ioredis';
import { AI_CONFIG } from '../../config/ai.config';

export interface CachedFragment {
  content: string;
  builtAt: string;
}

export class PromptCache {
  constructor(private readonly redis: Redis) {}

  // --------------------------------------------------------------------------
  // Brand DNA Fragment
  // --------------------------------------------------------------------------

  async getBrandDNAFragment(
    tenantId: string,
    version: number
  ): Promise<string | null> {
    const key = AI_CONFIG.redisKeys.brandDNAFragment(tenantId, version);
    const cached = await this.redis.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedFragment;
    return parsed.content;
  }

  async setBrandDNAFragment(
    tenantId: string,
    version: number,
    content: string
  ): Promise<void> {
    const key = AI_CONFIG.redisKeys.brandDNAFragment(tenantId, version);
    const value: CachedFragment = { content, builtAt: new Date().toISOString() };
    await this.redis.set(
      key,
      JSON.stringify(value),
      'EX',
      AI_CONFIG.cache.brandDNAFragmentTTL
    );
  }

  // --------------------------------------------------------------------------
  // Golden Examples Fragment
  // --------------------------------------------------------------------------

  async getGoldenExamplesFragment(
    tenantId: string,
    version: number
  ): Promise<string | null> {
    const key = AI_CONFIG.redisKeys.goldenExamplesFragment(tenantId, version);
    const cached = await this.redis.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedFragment;
    return parsed.content;
  }

  async setGoldenExamplesFragment(
    tenantId: string,
    version: number,
    content: string
  ): Promise<void> {
    const key = AI_CONFIG.redisKeys.goldenExamplesFragment(tenantId, version);
    const value: CachedFragment = { content, builtAt: new Date().toISOString() };
    await this.redis.set(
      key,
      JSON.stringify(value),
      'EX',
      AI_CONFIG.cache.goldenExamplesFragmentTTL
    );
  }

  // --------------------------------------------------------------------------
  // Invalidation — called when Brand DNA version is updated
  // Deletes all cached fragments for this tenant (old versions become stale
  // automatically via TTL, but explicit invalidation clears immediately)
  // --------------------------------------------------------------------------

  async invalidateTenantCache(tenantId: string): Promise<void> {
    // Scan for all keys matching this tenant — handles multiple versions
    const pattern = `brandna:fragment:${tenantId}:*`;
    const keys = await this.scanKeys(pattern);
    const goldenPattern = `golden:fragment:${tenantId}:*`;
    const goldenKeys = await this.scanKeys(goldenPattern);

    const allKeys = [...keys, ...goldenKeys];
    if (allKeys.length > 0) {
      await this.redis.del(...allKeys);
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor, 'MATCH', pattern, 'COUNT', '100'
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
