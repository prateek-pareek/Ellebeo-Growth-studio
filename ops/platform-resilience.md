# Platform Resilience & Architecture Strategy

This document outlines the production-grade resilience and hardening strategies implemented for Ellebeo Growth Studio.

## 1. Redis Safety & Hardening
Redis is a critical piece of the infrastructure, serving both as a cache and the backbone for BullMQ. 
**Hardening measures implemented:**
- **No Public Exposure**: Redis is strictly bound to the `internal` Docker network. It is not accessible from the public internet.
- **Authentication**: `requirepass` is enforced via the `REDIS_PASSWORD` environment variable. All backend and worker services must supply this to connect.
- **Persistence Strategy**: We enabled `appendonly yes` (AOF) along with the default RDB snapshots. This ensures minimal data loss in case of a hard crash while maintaining high performance.
- **Memory Management**: `maxmemory` is capped at `2gb` with an `allkeys-lru` policy to prevent the VPS from running out of memory during cache spikes.

## 2. BullMQ & Queue Recovery
Content generation is asynchronous. We rely on BullMQ to maintain state.
**Recovery Strategy:**
- **Worker Restart Policy**: All worker containers (`worker-content`, `worker-image`, `worker-video`) use `restart: always` to ensure they recover immediately if the Node.js process crashes.
- **Dead Letter Queue (DLQ)**: BullMQ is configured to move failed jobs to a `failed` state. You should monitor the `failed` count and implement a UI in the Growth Studio to retry or inspect these jobs.
- **Graceful Shutdown**: The worker scripts must listen for `SIGTERM` and `SIGINT` signals to pause BullMQ queues and finish active jobs before the container shuts down during a deployment.

## 3. AI Platform Resilience
OpenAI and Anthropic APIs can experience latency or outages. 
**Resilience Recommendations:**
- **Circuit Breaker**: Implement `@nestjs/throttler` combined with a circuit breaker pattern (e.g., using `opossum`). If OpenAI fails 5 times in a row, the circuit opens, and we fallback to a secondary provider or fail fast without burning API credits.
- **Exponential Backoff**: BullMQ jobs connecting to external AI APIs should use exponential backoff for retries: `{ attempts: 5, backoff: { type: 'exponential', delay: 1000 } }`.
- **Rate Limiting**: Protect the API layer using rate limiters to prevent malicious actors from triggering expensive AI generation endpoints rapidly.

## 4. Monitoring Architecture
The system uses **Prometheus** and **Grafana** (included in the `docker-compose.yml`).
- **Backend Metrics**: The NestJS backend uses `@opentelemetry/exporter-prometheus` to expose a `/metrics` endpoint.
- **Prometheus**: Scrapes the backend, Traefik, and Node Exporter (if installed on the host) every 15 seconds.
- **Grafana**: Available at `monitor.yourdomain.com`. It provides visual dashboards.

## 5. Disaster Recovery (DR) Strategy
- **Database**: PostgreSQL backups should be scheduled daily using `pg_dump` and pushed to an offsite S3 bucket.
- **State Rollback**: In case of a catastrophic deployment failure, the `rollback.sh` script immediately reverts to the previous immutable SHA tag and restores the Blue/Green routing.
- **Infrastructure as Code**: Everything is containerized. If the VPS dies, a new Ubuntu 24.04 server can be provisioned, Docker installed, and the GitHub Action re-run to restore the entire application stack in minutes.
