// The shared Redis client (redis.client.ts) is configured with
// maxRetriesPerRequest: null (required by BullMQ) — commands queue
// indefinitely if Redis is unreachable rather than rejecting. Anything that
// treats Redis as a soft dependency (a cache, a best-effort invalidation)
// must time-box its calls so it can never hang the feature it's supporting.
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
