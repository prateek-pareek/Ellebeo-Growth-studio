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
- [ ] Prisma models/enums (VideoType, SceneAssetKind, Motion, Transition, VideoStatus, CriticStatus)
- [ ] Shared TS type + validation schema (single source of truth)
- [ ] Constants file (motions/transitions/caption styles)
- [ ] Self-test: contract compiles, validation rejects off-enum values
- [ ] GATE

## Phase 2 — Deterministic core (slideshow, no agents)
- [ ] Confirm reuse plan for existing ShotstackService/ReelAssemblerService vs. new Video Plan → Shotstack mapper
- [ ] Render job: Video Plan → Shotstack edit JSON → submit → store renderId → RENDERING
- [ ] Webhook: new endpoint + callback queue → RENDERED/outputUrl or FAILED (replaces/augments polling)
- [ ] Publish job: reuse existing Instagram publish flow
- [ ] Self-test: integration test with Shotstack mocked (submit → simulated webhook → RENDERED)
- [ ] Staging: one real end-to-end render produces playable MP4
- [ ] GATE: slideshow renders with zero agents

## Phase 3 — Agent runtime + Director + Script agent
- [ ] Build Anthropic tool-use wrapper (net new — no existing pattern)
- [ ] Director agent (orchestrator, resumable BullMQ job)
- [ ] Script agent (scenes/hooks/captions JSON)
- [ ] Bounds: max tool calls/agent, per-video token/cost ceiling
- [ ] Self-test: valid plan produced + renders; forced-malformed-output repair test
- [ ] GATE

## Phase 4 — Asset agent + strategies (reels)
- [ ] AssetProvider strategy interface
- [ ] Slideshow strategy (tech images + Pixabay)
- [ ] Reels strategy (images/clips + ElevenLabs VO + auto-timed captions)
- [ ] Self-test: reels renders end-to-end, captions aligned to VO
- [ ] GATE

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
