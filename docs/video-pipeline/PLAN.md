# Video Pipeline — Plan

Feature flag: `GROWTH_STUDIO_VIDEO`. Branch: `dev-prashant` (base: `dev-pavan`).

Tracks the phase gates from the build spec. Check items off as completed; see `PROGRESS.md` for the
narrative log.

## Phase 0 — Discovery
- [x] Map content-generation entry points
- [x] Map Shotstack integration
- [x] Map webhook handling pattern
- [x] Map BullMQ/queue usage
- [x] Map ElevenLabs integration
- [x] Map image-generation service (template for asset providers)
- [x] Map Pixabay/stock media integration
- [x] Map Meta/TikTok publishing flow
- [x] Map Anthropic tool-use wrapper
- [x] Map Brand DNA model
- [x] Map medical-aesthetics compliance flag
- [x] Map Prisma schema (video/job-relevant models)
- [x] Map media storage/CDN
- [x] Map frontend app structure
- [x] Map feature-flag pattern
- [x] **GATE: present findings to user** — DONE, awaiting sign-off before Phase 1

## Phase 1 — Video Plan contract
- [x] Prisma models/enums (VideoType, SceneAssetKind, Motion, Transition, VideoStatus, CriticStatus) + `VideoPlan` model
- [x] Shared TS type + validation schema (single source of truth) — `backend/src/ai/video/video-plan.schema.ts` (zod)
- [x] Constants file (motions/transitions/caption styles) — `backend/src/ai/video/video-plan.constants.ts`
- [x] Self-test: contract compiles, validation rejects off-enum values — `video-plan.schema.spec.ts`, 8/8 passing
- [x] GATE — presented below, awaiting sign-off before Phase 2

**Design notes:**
- Enum values use lowercase snake_case (`ken_burns`, not `KEN_BURNS`) to match this codebase's existing Prisma enum convention (`ContentStatus`, `JobState`, etc.), not the uppercase illustrative casing in the original spec.
- `VideoPlan.plan` is stored as a single `Json` column (mirrors `GenerationJob.jobPayload`) rather than fully normalized scene tables — consistent with how this codebase already handles nested generation payloads. Denormalized columns (`status`, `videoType`, `criticScore`, `renderId`, `outputUrl`, etc.) exist alongside it purely for querying/indexing.
- `objective` is a video-specific CTA concept (`VIDEO_OBJECTIVES` in constants), deliberately kept separate from the existing `BusinessGoalType` Prisma enum, which models the tenant's overall business goal, not a single video's.
- No shared TS package exists between `backend/` and `frontend/` — the zod schema is authoritative in `backend/`. Phase 8 (tweak UI) will need to either duplicate the shape in `frontend/` or the backend will expose it via API responses the UI trusts as source of truth. Flagging now, decide at Phase 8.
- `text.position` (`top|center|bottom`) is validated in the zod schema only, not a Prisma enum — it's nested inside the JSON blob, not a queryable column, so no DB enum was needed for it (spec's list of six enums to add didn't include it either).

## Phase 2 — Deterministic core (slideshow, no agents)
- [x] Confirm reuse plan for existing ShotstackService/ReelAssemblerService vs. new Video Plan → Shotstack mapper — decided: new generic mapper (`video-plan-render.mapper.ts`), `ShotstackService.submitRender()` reused as-is (just added optional `callback`)
- [x] Render job: Video Plan → Shotstack edit JSON → submit → store renderId → RENDERING (`video-render.service.ts` + `video-render.worker.ts` + `video-render` BullMQ queue)
- [x] Webhook: new endpoint + callback queue → RENDERED/outputUrl or FAILED (`video-webhook.controller.ts`, `POST /video/webhooks/shotstack/:videoPlanId?token=`) — replaces polling, never polls
- [x] Publish job: reuse existing Instagram publish flow — done by syncing `outputUrl` → `ContentItem.finalVideoUrl` + `reelStatus` on the webhook callback when `contentItemId` is set, so the existing `publishToInstagram()` path (which already reads `finalVideoUrl`) picks it up unchanged; no new publish code
- [x] Self-test: integration test with Shotstack mocked (submit → simulated webhook → RENDERED) — `video-render.service.spec.ts`, 7/7 passing
- [ ] Staging: one real end-to-end render produces playable MP4 — **not run**, needs real `SHOTSTACK_API_KEY` + a reachable `BACKEND_PUBLIC_URL` for the callback; out of scope for this environment
- [x] GATE: slideshow renders with zero agents (trivial `slideshow-plan-builder.ts`, no LLM calls anywhere in this phase) — presented below, awaiting sign-off before Phase 3

**Design notes:**
- Music: the plan contract only carries `mood`/`trackId` (no URL, per the fixed contract) — `VideoRenderService` resolves an actual CDN url via the existing `PixabayMusicService.selectTrack(tenantId, mood)` at render-submission time. `trackId` in the plan is currently informational; this gets tightened up when the Asset agent (Phase 4) owns audio selection.
- Auth: Shotstack has no HMAC request signing, so the webhook is authenticated by a shared-secret token embedded in the callback URL (`VIDEO_WEBHOOK_SECRET`), not signature verification — documented on the controller.
- Discovered but NOT fixed (out of scope): `ReelAssemblerService.persistReelResult()` and `video-assembly.worker.ts` execute raw SQL against `content_item_id`/`reel_storage_path`/`reel_cdn_url`/etc. — none of those columns exist in `schema.prisma`'s `ContentItem` model (the real PK column is `id`, and the reel fields are named `voiceoverUrl`/`musicUrl`/`finalVideoUrl`/`reelThumbnailUrl`/`reelStatus`). This looks like dead/broken code predating this branch. The new Phase 2 core avoids it entirely — it goes through Prisma's typed client, not raw SQL, and writes to `finalVideoUrl`/`reelStatus` (the fields that actually exist). Flagging for the team; not part of this phase's scope to fix.
- New BullMQ queue `video-render` added alongside (not replacing) the existing `video-assembly` queue, since the job payload shape differs (`videoPlanId` vs. the reel-specific before/after image fields). Worth merging later once the legacy reel flow is retired.
- `VideoPlan` added to `PrismaService.tenantScopedModels` so the existing tenant-isolation guard covers it.

## Phase 3 — Agent runtime + Director + Script agent
- [x] Build Anthropic tool-use wrapper (net new — no existing pattern) — `backend/src/ai/agents/tool-agent-runtime.ts`, forces structured output via a mandatory "output tool" call instead of parsing prose
- [x] Director agent (orchestrator, resumable BullMQ job) — `backend/src/ai/video/agents/director.service.ts` + `video-director.worker.ts` (`video-director` queue)
- [x] Script agent (scenes/hooks/captions JSON) — `backend/src/ai/video/agents/script-agent.ts`
- [x] Bounds: max tool calls/agent, per-video token/cost ceiling — `maxToolCalls`/`tokenBudget` params on `runToolAgent`, enforced (throws `AgentBoundsExceededError`)
- [x] Self-test: valid plan produced + renders; forced-malformed-output repair test — 41/41 tests passing across 5 new spec files, including `director-render-compat.spec.ts` (Director output feeds straight into the Phase 2 `buildShotstackEditFromPlan` mapper with zero changes) and a dedicated malformed-then-corrected repair test in `tool-agent-runtime.spec.ts`
- [x] GATE — presented below, awaiting sign-off before Phase 4

**Design notes:**
- SDK version pinned in this repo (`@anthropic-ai/sdk@0.20.0`) predates tool-use graduating out of beta — the runtime calls `client.beta.tools.messages.create(...)`. Same wire contract as the current non-beta tool-use API; upgrading the SDK later is a drop-in, not a rewrite of this runtime.
- Structured output is enforced by giving the model exactly one "output tool" (e.g. `submit_scenes`) it must call to answer — not by asking it to emit JSON in prose and hoping to parse it. This directly replaces the "plain JSON-in-prompt + manual parsing" pattern every existing LangChain chain uses (Phase 0 finding) for the video pipeline's own agents; existing chains are untouched.
- JSON-repair: exactly one retry. On invalid tool input or a plain-text (non-tool-use) response, the runtime sends the validation errors back as a `tool_result` (or a text nudge) and asks the model to call the output tool again. A second failure throws `AgentOutputValidationError` — no infinite retry loops, no silently-accepted malformed output.
- Script agent is intentionally the only agent this phase builds. It has zero worker tools (`maxToolCalls: 0`) — its only job is producing validated copy, so tool-use here is purely a structured-output mechanism, not agentic tool delegation. Worker-tool delegation (image search, moderation calls, etc.) is exercised for real starting with the Asset agent in Phase 4.
- Director's "loop" this phase is deliberately a single step (draft plan → Script agent → final plan). It persists a placeholder `VideoPlan` row in `draft` status *before* calling the LLM, so a crash mid-call leaves an observable row instead of nothing — but it does not yet resume a stuck row on retry (BullMQ just retries the whole job, which is idempotent enough for a single LLM call). The richer multi-step resumable loop is Phase 5's critic loop, which will extend this same `DirectorService`, not replace it.
- Director never auto-enqueues a render job — the resulting plan lands in `status: in_review`, matching the pipeline's "AI drafts, technician approves before render/publish" principle from the spec. Render is triggered separately (Phase 2's `video-render` queue), by a technician action once the UI exists (Phase 8).

## Phase 4 — Asset agent + strategies (reels)
- [x] AssetProvider strategy interface — `backend/src/ai/video/assets/asset-provider.ts`
- [x] Slideshow strategy (tech images + Pixabay) — `slideshow-asset-provider.ts` (1:1 technician images, gaps filled by the new Asset agent + `PixabayStockImageService`)
- [x] Reels strategy (images/clips + ElevenLabs VO + auto-timed captions) — `reels-asset-provider.ts` (composes the slideshow provider for images, adds VO + `computeCaptionTimings`)
- [x] Self-test: reels renders end-to-end, captions aligned to VO — `reels-render-compat.spec.ts` (Director → Asset agent/provider → Phase 2 render core, asserts scene durations track word-count-weighted VO duration and the mapped Shotstack edit uses the VO as its soundtrack)
- [x] GATE — presented below, awaiting sign-off before Phase 5

**Design notes:**
- First real worker-tool delegation in the pipeline: the Asset agent (`asset-agent.ts`) calls a genuine side-effecting tool (`search_stock_image` → `PixabayStockImageService.search`) and judges the result, rather than tool-use being pure structured-output enforcement (Script agent, Phase 3). Only invoked when a scene has no technician-supplied image — cost discipline over agentic purity, matching the spec's "agentic where it adds value, deterministic where it must be reliable."
- "Auto-timed captions" here means word-count-proportional timing (`computeCaptionTimings`), not true ASR forced alignment — no speech-to-text/alignment tool exists in this codebase. It reuses the same 2.5-words/second assumption `ElevenLabsService` itself already uses to estimate voiceover duration, so the two stay consistent with each other rather than introducing a second, different pacing model.
- Voiceover script is currently the scene's own on-screen caption/headline text concatenated in scene order — there's no separate VO-only script yet (the Phase 1 architecture doc flagged this as a "(later)" addition to the Script agent). Reusing on-screen copy as spoken narration is an intentional Phase 4 simplification; a dedicated VO-script field on the Script agent's output is a clean follow-up whenever on-screen and spoken copy need to diverge.
- `SlideshowAssetProvider` exists and is real (used inside `ReelsAssetProvider` for image resolution) but `DirectorService.draftSlideshowPlan` was **not** refactored to route through it this phase — its current calling pattern always sizes scene count 1:1 from the given images, so there's no gap case to exercise, and rewiring tested Phase 3 code for zero behavior change wasn't worth the regression risk. Wiring it in is a trivial follow-up once slideshow scene count becomes independent of image count.
- New Pixabay integration: `PixabayStockImageService` (images), sibling to the existing `PixabayMusicService` (music) — same provider, same timeout config reused, no Redis caching added yet (deferred; each stock search hits the network directly for now).

## Phase 5 — QA/critic loop
- [ ] Critic agent + rubric (brand fit, objective match, hook strength, pacing, compliance)
- [ ] Bounded revise loop (default N=2), targeted re-runs of weak parts
- [ ] Self-test: weak seeded draft triggers revision + score improves; loop never exceeds N
- [ ] GATE

## Phase 6 — Compliance agent + hard gate
- [ ] Compliance agent (reasoning layer)
- [ ] Code-enforced hard gate reusing `isMedicalAestheticsBrand()` — block client face/before-after imagery, forbid treatment-outcome claims
- [ ] Self-test: flag-on rejection across slideshow/reels/AI-clips
- [ ] GATE

## Phase 7 — AI video clips (opt-in)
- [ ] VideoClipProvider adapter interface
- [ ] Runway Gen-3 implementation
- [ ] AI-clips AssetProvider
- [ ] Rate limits + per-video cost ceiling
- [ ] Self-test: AI-clips renders, provider swappable, cost ceiling enforced
- [ ] GATE

## Phase 8 — Tweak UI + review/publish
- [ ] Structured Video Plan editing (reorder scenes, edit text, swap asset, toggle VO/music) — extend `frontend/src/routes/content.tsx`
- [ ] Preview + approve → publish via existing flow
- [ ] Agent timeline UI
- [ ] Self-test: draft → tweak → approve → publish E2E (slideshow + reels)
- [ ] GATE

## Phase 9 — Flag, observability, rollout
- [ ] `GROWTH_STUDIO_VIDEO` — needs backend-persisted flag system (current frontend stub has no backend table)
- [ ] Trace every agent call (inputs/output/tools/tokens/latency/cost) tied to videoJobId
- [ ] Events: video_started, plan_drafted, assets_ready, critic_scored, revision_requested, render_submitted, render_completed, render_failed, published
- [ ] Staged rollout notes
- [ ] Self-test: full run reconstructable from persisted traces
- [ ] GATE (final)

## Known blocking gaps (from Phase 0)
1. No Anthropic tool-use wrapper — must build from scratch (Phase 3)
2. No webhook receivers for external providers — Shotstack currently polls (Phase 2)
3. No Runway integration (Phase 7)
4. No TikTok publisher — only Instagram/Facebook exist (Phase 8, may need separate follow-up)
5. Feature-flag system is a frontend-only stub, no backend persistence (Phase 9)
