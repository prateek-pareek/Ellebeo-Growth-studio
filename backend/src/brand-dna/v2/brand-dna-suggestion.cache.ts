import type Redis from 'ioredis';
import * as crypto from 'crypto';

// Caches AI suggestion responses by a hash of (endpoint name + input), so the
// same onboarding step for the same inputs doesn't re-hit the LLM. Suggestions
// are input-derived and deterministic-enough per plan §5 that a short TTL is
// safe — this is a cost/latency optimisation, not a correctness dependency.
const TTL_SECONDS = 60 * 60 * 6; // 6 hours

export class BrandDnaSuggestionCache {
  constructor(private readonly redis: Redis) {}

  private key(endpoint: string, input: unknown): string {
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return `branddna:suggest:${endpoint}:${hash}`;
  }

  async get<T>(endpoint: string, input: unknown): Promise<T | null> {
    const cached = await this.redis.get(this.key(endpoint, input));
    return cached ? (JSON.parse(cached) as T) : null;
  }

  async set(endpoint: string, input: unknown, value: unknown): Promise<void> {
    await this.redis.set(this.key(endpoint, input), JSON.stringify(value), 'EX', TTL_SECONDS);
  }
}
