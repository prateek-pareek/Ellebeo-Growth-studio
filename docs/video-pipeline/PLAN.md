# Agentic Video Pipeline — PLAN

Feature flag: `GROWTH_STUDIO_VIDEO`
Status: **Phase 0 GATE — awaiting go-ahead before Phase 1**
Last updated: 2026-08-13

Work in a plan → act → self-test → self-correct → checkpoint loop.
Do not write feature code until Phase 0 findings are accepted.

---

## Sequencing

`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9`

Deterministic core (2) before agents. Slideshow before reels/clips.

---

## Phase 0 — Discovery

- [x] Map content-generation entry points
- [x] Map Shotstack submit + completion path (poll, not webhook)
- [x] Map ElevenLabs / image-gen / Pixabay
- [x] Map Meta / TikTok publishing
- [x] Map BullMQ + webhook/callback patterns
- [x] Map Anthropic / LLM wrappers (no tool-use runtime exists)
- [x] Map Brand DNA + medical-aesthetics / AHPRA flag
- [x] Map media storage / CDN
- [x] Produce findings + reusable-pieces + blocking gaps
- [x] Present at GATE (this file + chat)

**Exit:** findings accepted. Do not start Prisma models until the contradictions below are acknowledged.

### Reality vs brief (must acknowledge before Phase 1)

| Brief assumption | Reality in this repo |
|---|---|
| Existing Anthropic **tool-use** wrapper to build on | **Does not exist.** `@anthropic-ai/sdk` is a dep; unused for tools. LLM calls are LangChain `ChatAnthropic` / `ChatGoogleGenerativeAI` with JSON-in-prompt + parse. Agent runtime must be **built**, not wrapped. |
| Shotstack webhook + callback queue | Shotstack **polls** (`pollRenderStatus`, 5s × 36). No webhook endpoint. NestJS never starts the video worker and never enqueues `videoAssemblyQueue`. |
| Pixabay stock **images** | Pixabay is **music-only** (`pixabay-music.service.ts`). No stock-image client. |
| TikTok publish reuse | `SocialPlatform` includes `tiktok`; publish helper **throws** for anything but Instagram/Facebook. No TikTok OAuth. |
| `AdminConfig` pattern | **No AdminConfig model.** Config = env (`validateEnv`) + `AI_CONFIG` + Prisma `PlanSettings` / `TierGenerationLimits` via AdminService. |
| `GROWTH_STUDIO_VIDEO` flag | **Does not exist.** Frontend flags: `feature_cloud_backend` only. Comment in `feature-flags.ts`: backend `feature_flags` table “when ready”. |
| Zod as shared contract | `zod` is in `backend/package.json` but **unused** in app code. DTOs use `class-validator`. |
| One existing Video Plan | Current reel is a **hardcoded 2-clip before/after** Shotstack JSON, not a multi-scene plan. Live path generates a **storyboard JSON**, not an MP4. |
| Text-to-video (Runway) | **Absent.** `replicate` is used for still-image enhancement only. |

---

## Phase 1 — Video Plan contract

- [ ] Prisma enums: `VideoType`, `SceneAssetKind`, `Motion`, `Transition`, `VideoStatus`, `CriticStatus`
- [ ] Prisma models for Video Plan / VideoJob (do not overload `ContentItem` blindly)
- [ ] Shared TS type + Zod schema (single source of truth)
- [ ] Constants: motions / transitions / caption styles
- [ ] Self-test: compiles; validation rejects off-enum values
- [ ] GATE

---

## Phase 2 — Deterministic core FIRST (slideshow, no agents)

- [ ] Rule-based slideshow plan builder (no LLM)
- [ ] Render job: Video Plan → Shotstack edit JSON → submit → store `renderId` → `RENDERING`
- [ ] Webhook endpoint + callback queue → `RENDERED` + `outputUrl` (or `FAILED`). Never poll.
- [ ] Publish job reuses `publishScheduledPost`
- [ ] Integration test with Shotstack mocked (submit → simulated webhook → RENDERED)
- [ ] Behind `GROWTH_STUDIO_VIDEO`
- [ ] GATE: slideshow renders with zero agents

**Blocked on:** staging Shotstack key + a reachable webhook URL (see gaps).

---

## Phase 3 — Agent runtime + Director + Script

- [ ] Agent runtime: system prompt + tools + JSON contract + schema validation + JSON-repair
- [ ] Director (orchestrator job, persist after each step)
- [ ] Script agent
- [ ] Bounds: max tool calls, per-video token/cost ceiling
- [ ] Self-test: valid slideshow plan; malformed-output repair test
- [ ] GATE

---

## Phase 4 — Asset agent + reels

- [ ] `AssetProvider` interface
- [ ] Slideshow strategy (tech images + stock fallback — Pixabay images TBD)
- [ ] Reels strategy (images/clips + ElevenLabs VO + burned-in captions)
- [ ] Self-test: reels E2E; captions align to VO
- [ ] GATE

---

## Phase 5 — QA / critic loop

- [ ] Critic agent + rubric
- [ ] Bounded revise loop (default N=2)
- [ ] Persist `critic.score`, `passed`, `revisions`, `notes`
- [ ] Self-test: weak draft revises; loop never exceeds N
- [ ] GATE

---

## Phase 6 — Compliance agent + hard gate

- [ ] Compliance agent (edge cases)
- [ ] Code hard gate (no LLM) in asset + render path
- [ ] Tests across slideshow / reels / AI-clips
- [ ] GATE

---

## Phase 7 — AI video clips (opt-in)

- [ ] `VideoClipProvider` (Runway Gen-3 first)
- [ ] AI-clips `AssetProvider`
- [ ] Rate limits + per-video cost ceiling
- [ ] GATE

---

## Phase 8 — Tweak UI + review/publish

- [ ] Structured Video Plan editor in Growth Studio web (`frontend/`)
- [ ] Preview + approve → existing publish flow
- [ ] Agent timeline UI
- [ ] E2E: slideshow + reels
- [ ] GATE

---

## Phase 9 — Flag, observability, rollout

- [ ] `GROWTH_STUDIO_VIDEO` across pipeline + UI
- [ ] Per-agent traces tied to `videoJobId`
- [ ] Events listed in the brief
- [ ] Staged rollout notes
- [ ] GATE (final)

---

## Open questions (product / infra — confirm before or at Phase 1)

1. **Agent runtime foundation:** build a new Anthropic tool-use loop, or LangChain tools on existing `ChatAnthropic`? Recommend new thin runtime on `@anthropic-ai/sdk` (already a dep) so agents are not coupled to caption chains.
2. **Shotstack webhook URL in staging:** public HTTPS required. Confirm tunnel / ingress.
3. **Text-to-video provider + per-video budget.**
4. **Music licensing for IG/TikTok:** Pixabay music is the only library. Platform Content ID risk is unconfirmed.
5. **TikTok publish:** out of scope until OAuth exists, or Instagram Reels only for v1?
6. **Critic pass-threshold and max revisions** (default 2) — product call.
7. **Analytics target:** `GenerationAuditLog` + admin cost report vs new event table vs OTel (wired in config, not live in Nest).
8. **Where Video Plan lives:** new `VideoJob` / `VideoPlan` tables vs JSON on `ContentItem`. Recommend new tables; `ContentItem` is still/caption-shaped and `appointmentId` is required.
