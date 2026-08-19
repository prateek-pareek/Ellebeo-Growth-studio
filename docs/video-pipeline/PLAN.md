# Agentic Video Pipeline — PLAN

Feature flag: `GROWTH_STUDIO_VIDEO` (+ `GROWTH_STUDIO_VIDEO_AI_CLIPS` for Phase 7)
Status: **Phase 7 GATE — mocked Gemini/Veo AI-clip provider green**
Last updated: 2026-08-20

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

GATE decisions accepted 2026-08-13: IG Reels only for v1 publish; new agent runtime later; env+AI_CONFIG (no AdminConfig); new `VideoJob`/`VideoPlanRevision` tables; webhook in Phase 2; stock images are a new adapter.

- [x] Prisma enums: `VideoType`, `SceneAssetKind`, `VideoMotion`, `VideoTransition`, `VideoStatus`, `CriticStatus` (+ `VideoObjective`, `CaptionStyle`, `TextPosition`)
- [x] Prisma models: `VideoJob` (plan JSON, optional appointmentId) + `VideoPlanRevision`
- [x] Shared TS type + Zod schema at `backend/src/ai/video-pipeline/contract/` (UI re-export: `frontend/src/lib/video-plan.ts`)
- [x] Constants: motions / transitions / caption styles / objectives
- [x] `GROWTH_STUDIO_VIDEO` env flag (default off) + `isGrowthStudioVideoEnabled()`
- [x] Self-test: `npx prisma validate`; `npx nest build`; jest `video-pipeline` 26 passed (valid plan + off-enum rejection + Prisma/Zod lockstep)
- [x] GATE — present before Phase 2

SQL: `backend/prisma/migrations/20260813_add_video_pipeline/migration.sql` (not applied to staging in this phase).

---

## Phase 2 — Deterministic core FIRST (slideshow, no agents)

- [x] Rule-based slideshow plan builder (no LLM) — `core/slideshow-plan-builder.ts`
- [x] Render job: Video Plan → Shotstack edit JSON → submit → store `renderId` → `RENDERING`
- [x] Webhook `POST /api/v1/video/webhook?token=` + `video-callback` queue → `RENDERED` + `outputUrl` (or `FAILED`). Never poll.
- [x] Publish job reuses `publishScheduledPost` and writes `ContentItem.finalVideoUrl`
- [x] Integration test with Shotstack mocked (submit → simulated webhook → RENDERED); idempotent duplicate webhook; flag-off refusal
- [x] Behind `GROWTH_STUDIO_VIDEO` (404 when off)
- [x] GATE — mocked path green. Real staging MP4 not run (needs `SHOTSTACK_API_KEY` + public `API_PUBLIC_URL` + `VIDEO_WEBHOOK_SECRET`).

HTTP (flag on, JWT): `POST /api/v1/video/slideshow/render`, `GET /api/v1/video/jobs/:id`.

---

## Phase 3 — Agent runtime + Director + Script

- [x] Agent runtime: system prompt + tools + JSON contract + schema validation + JSON-repair (`agents/runtime.ts`, `@anthropic-ai/sdk` beta tools via `LlmPort`)
- [x] Director (orchestrator job, persist after each step: scripted → assembled → render_queued)
- [x] Script agent (`submit_script` → hook/scenes/captions)
- [x] Bounds: `maxToolCallsPerAgent`, `maxTokensPerVideo`, `maxCostUsdPerVideo` in `AI_CONFIG.video`
- [x] Self-test: valid slideshow plan handoff to Phase 2 mapper/render; malformed-output repair; resume; cost ceiling
- [ ] GATE

HTTP (flag on, JWT): `POST /api/v1/video/slideshow/agentic` (Director + Script, then enqueue render). Rule-based `POST .../slideshow/render` unchanged.

Director is a resumable BullMQ orchestrator (not a free-form LLM). Script is the Phase 3 reasoning agent. Assembly + Shotstack remain LLM-free.

---

## Phase 4 — Asset agent + reels

- [x] `AssetProvider` interface (`assets/asset-provider.ts`) + studio resolver
- [x] Slideshow strategy: technician images first, stock fills missing scenes. New Pixabay **photo** adapter (`pixabay-image.adapter.ts`) — not the music client.
- [x] Reels strategy: images/clips + ElevenLabs `VoiceoverPort` + burned-in captions timed from the VO script
- [x] Self-test: reels E2E through Phase 2 mapper/render (mocked VO); caption cues cover the VO timeline; slideshow stock fallback
- [ ] GATE

HTTP (flag on, JWT): `POST /api/v1/video/reels/agentic`. Slideshow `sceneCount` pads with stock when larger than `imageUrls`.

Director step `assets` runs before Script when an `AssetProvider` is injected. Render/webhook remain LLM-free.

---

## Phase 5 — QA / critic loop

- [x] Critic agent + rubric (`submit_critique`: hook/clarity/brandVoice/pacing/objectiveFit/compliance → score/100)
- [x] Bounded revise loop (default N=2) in Director between `assembled` and `reviewed`
- [x] Persist `critic.score`, `passed`, `revisions`, `notes` on the plan + `VideoPlanRevision` + `VideoJob.criticStatus`
- [x] Self-test: weak draft revises then passes; always-fail stops at N=2 and still enqueues render
- [ ] GATE

Pass threshold is `DEFAULT_CRITIC_PASS_SCORE` (70), computed in code from rubric points (LLM cannot override `passed`). Render/webhook remain LLM-free. Critic failure after N is not a hard block (Phase 6 is).

---

## Phase 6 — Compliance agent + hard gate

- [x] Compliance agent (edge cases via `submit_compliance`; `block=true` refuses render)
- [x] Code hard gate (no LLM) on asset resolve + Shotstack submit + Director enqueue
- [x] Tests: slideshow / reels / AI-clips; medical generated-clip block; people-stock filter
- [ ] GATE

Keyword gate is word-boundary based (does not flag "treatment" as "treats", or "Book in" as "book now"). Medical brands: no `GENERATED_CLIP`, no people-tagged stock. Critic failure is still not a hard block; this gate is.

---

## Phase 7 — AI video clips (opt-in)

Provider is **Gemini/Veo**, not Runway — `GEMINI_API_KEY` was already live in this
repo for Gemini Lab stills, so no new vendor account was needed to get a first
provider working end to end. Runway (or another provider) can be added later
behind the same `VideoClipPort`.

- [x] `VideoClipPort` + `createGeminiVeoClipAdapter` — Gemini `predictLongRunning` /
      operation-poll REST flow (`assets/video-clip.port.ts`, `assets/gemini-veo-clip.adapter.ts`).
      Text-to-video and image-to-video (reference still fetched + base64-encoded).
- [x] AI-clips `AssetProvider` — `createAiClipAssetProvider` (`assets/ai-clip-assets.ts`).
      Same technician → fallback shape as Phase 4's studio provider; missing scenes
      go to the clip provider first only when both true: caller opted in
      (`CreateReelsDto.useAiClips`) and `GROWTH_STUDIO_VIDEO_AI_CLIPS=true`. A failed
      clip generation falls back to stock for that scene rather than failing the reel.
- [x] Rate limits + per-video cost ceiling — `AI_CONFIG.video.aiClips`: `maxClipsPerVideo`
      (4), `costUsdPerClip` (0.50 estimate), `maxCostUsdPerVideo` (2.00) — whichever caps
      first. Poll bounded the same way as Shotstack (`maxPollAttempts` × `pollIntervalMs`).
- [x] Medical-aesthetics: never attempted at the strategy level (`wantsAiClips` checks
      `!medicalAesthetics`) *and* still hard-blocked by the existing Phase 6
      `assertResolvedAssetsHardGate` if it ever were — defense in depth, no new gate needed.
- [x] Self-test: jest `video-pipeline` 93 passed (14 new — adapter poll/timeout/error/
      image-encode paths; asset-strategy opt-in/flag/medical/cap/fallback paths);
      `nest build` clean.
- [ ] GATE

Wired into `director.worker.ts` unconditionally — the provider is a no-op pass-through
to the Phase 4 stock path unless both flags/opt-ins line up, so this ships without
changing behavior for existing slideshow/reels jobs. Not run against the live Gemini
API in this phase (same "mocked E2E, real not run" pattern as Shotstack Phase 2) —
needs a spend-approved `GEMINI_API_KEY` test and `GEMINI_VIDEO_MODEL` confirmed against
the live Veo model catalog before flipping `GROWTH_STUDIO_VIDEO_AI_CLIPS=true` anywhere
real money is at stake.

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
3. ~~**Text-to-video provider + per-video budget.**~~ Answered at Phase 7: Gemini/Veo
   first (reused existing `GEMINI_API_KEY`), budget = min(4 clips, $2.00/video).
4. **Music licensing for IG/TikTok:** Pixabay music is the only library. Platform Content ID risk is unconfirmed.
5. **TikTok publish:** out of scope until OAuth exists, or Instagram Reels only for v1?
6. **Critic pass-threshold and max revisions** (default 2) — product call.
7. **Analytics target:** `GenerationAuditLog` + admin cost report vs new event table vs OTel (wired in config, not live in Nest).
8. **Where Video Plan lives:** new `VideoJob` / `VideoPlan` tables vs JSON on `ContentItem`. Recommend new tables; `ContentItem` is still/caption-shaped and `appointmentId` is required.
