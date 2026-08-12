import type Redis from 'ioredis';
import * as crypto from 'crypto';

// Caches AI suggestion responses by a hash of (endpoint name + input), so the
// same onboarding step for the same inputs doesn't re-hit the LLM. Suggestions
// are input-derived and deterministic-enough per plan §5 that a short TTL is
// safe — this is a cost/latency optimisation, not a correctness dependency.
const TTL_SECONDS = 60 * 60 * 6; // 6 hours

// The shared Redis client is configured with maxRetriesPerRequest: null
// (required by BullMQ elsewhere) — commands queue indefinitely if Redis is
// unreachable rather than rejecting. A cache must never be able to hang the
// feature it's caching, so every call here is time-boxed and fails silently.
const CALL_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('cache timeout')), ms)),
  ]);
}

export class BrandDnaSuggestionCache {
  constructor(private readonly redis: Redis) {}

  private key(endpoint: string, input: unknown): string {
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return `branddna:suggest:${endpoint}:${hash}`;
  }

  async get<T>(endpoint: string, input: unknown): Promise<T | null> {
    try {
      const cached = await withTimeout(this.redis.get(this.key(endpoint, input)), CALL_TIMEOUT_MS);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch {
      return null;
    }
  }

  async set(endpoint: string, input: unknown, value: unknown): Promise<void> {
    try {
      await withTimeout(this.redis.set(this.key(endpoint, input), JSON.stringify(value), 'EX', TTL_SECONDS), CALL_TIMEOUT_MS);
    } catch {
      // Best-effort — a failed cache write just means the next identical request re-hits the LLM.
    }
  }
}
