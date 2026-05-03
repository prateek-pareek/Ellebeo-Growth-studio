// ============================================================================
// redis.client.ts — Shared Redis/ioredis Instance
// ============================================================================

import Redis from 'ioredis';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisInstance) return redisInstance;

  const host = process.env['REDIS_HOST'] ?? 'localhost';
  const port = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
  const password = process.env['REDIS_PASSWORD'] || undefined;
  const tls = process.env['REDIS_TLS'] === 'true';

  redisInstance = new Redis({
    host,
    port,
    password,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: null,   // Required by BullMQ
    enableReadyCheck: false,      // Required by BullMQ
    lazyConnect: true,            // Don't block startup — connect on first use
    connectTimeout: 10_000,       // 10s per attempt
    // Cap retries at 10 (~30s total) to prevent infinite ETIMEDOUT spam.
    retryStrategy: (times: number) => {
      if (times > 10) {
        console.error(`[Redis] Giving up after ${times} attempts. Is Redis reachable at ${host}:${port}?`);
        return null;
      }
      return Math.min(times * 1_000, 5_000);
    },
  });

  redisInstance.on('connect', () => {
    console.log(`[Redis] Connected to ${host}:${port}`);
  });

  redisInstance.on('error', (err: Error) => {
    console.error('[Redis] Error:', err.message);
  });

  redisInstance.on('reconnecting', (delay: number) => {
    console.warn(`[Redis] Reconnecting in ${delay}ms...`);
  });

  return redisInstance;
}

export async function closeRedisClient(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
