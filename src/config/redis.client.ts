// ============================================================================
// redis.client.ts — Shared Redis/ioredis Instance
// ============================================================================

import Redis from 'ioredis';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisInstance) return redisInstance;

  const host = process.env['REDIS_HOST'] ?? 'localhost';
  const port = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
  const password = process.env['REDIS_PASSWORD'];
  const tls = process.env['REDIS_TLS'] === 'true';

  redisInstance = new Redis({
    host,
    port,
    password,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: null,   // Required by BullMQ
    enableReadyCheck: false,      // Required by BullMQ
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(times * 500, 5_000),
  });

  redisInstance.on('connect', () => {
    console.log('[Redis] Connected');
  });

  redisInstance.on('error', (err: Error) => {
    console.error('[Redis] Error:', err.message);
  });

  redisInstance.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  return redisInstance;
}

export async function closeRedisClient(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
