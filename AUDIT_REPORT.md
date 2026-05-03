# Elle.Be.O Growth Studio — Initial Production Audit Report

Date: 2026-05-03
Scope: Entire repository (`backend/`, `frontend/`, root docs/config)
Status: **Audit only (no code fixes in this pass)**

## 1.1 Security Vulnerabilities

### Critical

1) **JWT secrets fallback hardcoded in WebSocket auth path**
- File: `backend/src/events/events.gateway.ts`
- Finding: Uses `JWT_SECRET` with fallback `'fallback_secret_for_dev_only'`, allowing predictable token verification secret if env missing.
- Risk: Full auth bypass potential for socket channels.
- Fix required: Remove fallback and fail startup when secret missing.

2) **Refresh tokens stored in plaintext, not hashed**
- File: `backend/src/auth/auth.service.ts`
- Finding: `refreshTokenValue` stored directly in `refreshToken.tokenHash` and queried by exact plaintext.
- Risk: DB leak immediately compromises all active sessions.
- Fix required: Hash refresh tokens (e.g., SHA-256 + pepper), compare via hash, implement reuse detection.

3) **Firebase Admin SDK initialized in multiple places**
- Files: `backend/src/config/firebase.client.ts`, `backend/src/common/firebase/firebase.module.ts`
- Finding: Two separate initialization paths with different credential strategies.
- Risk: Duplicate app init, inconsistent credentials, runtime faults, unintended privilege model.
- Fix required: Central singleton config file and only one initialization path.

4) **No CSRF protection on cookie-authenticated flows**
- Files: `backend/src/main.ts`, `backend/src/auth/auth.controller.ts` (flow-level)
- Finding: Cookies enabled (`cookieParser`, credentialed CORS) but no CSRF token or same-site strict strategy documented/enforced.
- Risk: State-changing requests can be forged.

5) **WebSocket CORS configured as wildcard**
- File: `backend/src/events/events.gateway.ts`
- Finding: `origin: '*'`.
- Risk: Cross-origin unauthorized client connections.

6) **Sensitive logging via console and raw exception handling**
- Files: multiple backend files (`events.gateway.ts`, `main.ts`, seed scripts).
- Risk: Token/user metadata and internals can leak in logs.

7) **Upload confirmation trusts client metadata without server-side file existence verification**
- File: `backend/src/appointment/appointment.service.ts`
- Finding: `confirmUpload` writes DB record from client-provided `s3Key/s3ObjectHash` without checking file exists in bucket.
- Risk: phantom file records, workflow breakage, spoofing.

### High

8) **Rate limiting not tiered and insufficient for auth abuse control**
- Files: `backend/src/app.module.ts`, auth controllers
- Finding: global throttling present, but no strict auth endpoint policy and no tenant-tier limits for generation/upload endpoints.

9) **Missing request body size caps**
- File: `backend/src/main.ts`
- Finding: no explicit JSON/form limits configured.

10) **Insecure social token storage**
- File: `backend/src/schedule/schedule.service.ts` (+ schema)
- Finding: access/refresh tokens handled as plain strings.

11) **Potential IDOR checks inconsistent across modules**
- Findings: many services do check tenant ownership, but no global tenant middleware for Prisma; safety relies on manual patterns.

12) **Auth lockout state in DB only, not Redis**
- File: `backend/src/auth/auth.service.ts`
- Finding: lockout mutable counters in user row only; missing distributed lockout for horizontal scale.

13) **Error-surface risks**
- File: `backend/src/common/filters/http-exception.filter.ts`
- Finding: structured errors present, but requires review to ensure no internal details leak for unknown exceptions.

## 1.2 Business Logic Violations

1) **Consent enforcement not globally guaranteed for generation/schedule/publish flows**
- Files: generation/schedule/content services.
- Finding: consent guard exists in AI layer, but API-level hard rejection path is not consistently enforced across all entry points.

2) **Generation suspension/restriction handling incomplete**
- Files: `backend/src/common/guards/generation-restriction.guard.ts`, generation endpoints.
- Finding: restriction guard exists; suspension and warning behavior requires explicit coverage and test confirmation.

3) **Appointment cancellation cascade incomplete**
- File: `backend/src/appointment/appointment.service.ts`
- Finding: marks appointment cancelled but does not archive related draft/approved content in same transaction.

4) **Dead-letter user notification not guaranteed**
- Files: queue dead-letter handling/events
- Finding: DLQ handler exists, but no guaranteed tenant websocket emission with human-readable failure for every DLQ transition.

5) **Upload confirm pipeline doesn’t verify object before DB registration**
- File: `backend/src/appointment/appointment.service.ts`
- Same as security item; also business-logic violation.

## 1.3 Performance Issues

1) **Dashboard caching missing/insufficient for strict 5-minute tenant cache objective**
- Files: `backend/src/dashboard/dashboard.service.ts`, redis layer.

2) **Unbounded/weakly bounded list queries likely in several endpoints**
- Files: service `findMany` callsites across modules.
- Finding: pagination inconsistent; some routes return full lists.

3) **No explicit DB query timeout middleware**
- Files: Prisma service/config
- Finding: no global 10s timeout guard.

4) **No Redis cache-aside service abstraction with typed key strategy**
- Files: `backend/src/config/redis.client.ts`, AI prompt cache utilities.

5) **Frontend still contains broad eager route tree and non-uniform TanStack Query usage**
- Files: `frontend/src/router.tsx`, `frontend/src/routes/*`, providers.

6) **Heavy `any`-based data mapping in frontend providers increases runtime mismatch risk**
- Files: multiple provider files.

## 1.4 Code Quality Issues

1) **Extensive `any` usage** across frontend and backend controllers/gateways.
2) **Business logic mixed in controllers/services without strong layering in parts of codebase.**
3) **Legacy naming remains (`s3Key`, `s3Bucket`, `s3ObjectHash`) despite Firebase usage** causing semantic drift and migration risk.
4) **Console logging in production paths instead of structured logger.**
5) **Environment validation missing fail-fast contract for required vars.**
6) **Firebase private key newline normalization is inconsistent (`\\n` vs `\n`) and duplicated.**

## Dependency Vulnerability Scan

- `npm audit` has not yet been executed in this audit artifact.
- Required next step before remediation closeout: run audit in `backend/` and `frontend/`, triage all **high/critical** findings, and patch/override with documented rationale.

## Firebase-Specific Findings

- No root `storage.rules` file found in repository.
- Upload path convention partially tenant-prefixed but not aligned to mandatory canonical structure (before/after folder semantics absent in current upload URL generator).
- DB schema and service naming still S3-oriented while behavior uses Firebase Storage.
- Upload confirmation doesn’t verify object existence/metadata prior to DB registration.
- Multiple Firebase initialization patterns detected; singleton requirement not met.

## Immediate Remediation Plan (execution order)

1. Secrets/auth hardening (JWT secret validation, hashed refresh tokens + reuse detection, CSRF, strict CORS).
2. Firebase hardening (singleton config, storage.rules, signed URL + verification service, path canonicalization).
3. DB hardening (tenant middleware + soft-delete middleware + query timeout + indexes + migration for Firebase columns).
4. API guardrails (DTO validation coverage, response sanitization, endpoint-specific rate limits).
5. Worker/queue resilience (DLQ user notification, dedup, health checks).
6. Frontend completion and signed URL-only media handling.
7. Test coverage for all critical paths listed in prompt.

