# Video pipeline — PROGRESS

Durable memory for the agentic build. One line per checkpoint.

| Date | Phase | What changed | Tests | Result | Next |
|---|---|---|---|---|---|
| 2026-08-13 | 0 | Discovery only. Mapped generation, Shotstack (poll, disconnected), ElevenLabs, Pixabay music, IG/FB publish, BullMQ, Brand DNA / AHPRA, Firebase+Cloudinary. No feature code. | none (read-only) | GATE: findings in PLAN.md + chat. Several brief assumptions are false (no tool-use wrapper, no Shotstack webhook, no TikTok publish, no Pixabay images, no GROWTH_STUDIO_VIDEO). | Await GATE acceptance, then Phase 1 contract |
| 2026-08-13 | 1 | Video Plan contract: Prisma enums + `VideoJob`/`VideoPlanRevision`; Zod schema + constants; `GROWTH_STUDIO_VIDEO` default off. | `prisma validate`; `nest build`; jest `video-pipeline` (26) | green | Phase 2 deterministic slideshow core (Shotstack map + webhook). Needs staging webhook URL + key for the real-MP4 GATE. |
| 2026-08-13 | 2 | Deterministic slideshow core: rule-based plan builder, Shotstack mapper, render/callback/publish jobs, webhook. No LLM. Flag-gated. | `nest build`; jest `video-pipeline` (37) | green (mocked E2E). Real MP4 not run — needs staging key + public webhook URL. | Phase 3 agent runtime + Director + Script |
