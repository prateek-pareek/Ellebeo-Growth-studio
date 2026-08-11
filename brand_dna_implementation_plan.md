# Brand DNA Rebuild — Implementation Plan

**Project:** Elle.Be.O · Growth Studio
**Feature:** Replace the Brand DNA form with a guided, selection-first onboarding
**Owner:** Prateek Pareek (PM) · **Prepared for:** Development team / implementing agent
**Status:** Draft for implementation · **Version:** 1.0 · **Date:** _____________
**Feature flag:** `BRAND_DNA_GUIDED_V2`

---

## 1. Context & Problem

### 1.1 What Brand DNA is
Brand DNA is the per-technician profile that feeds Growth Studio's AI content pipeline. It defines a
professional's identity (name, logo, colours, tone), offering, audience and content goals, and is
injected into every generation prompt so output reflects that professional's brand.

### 1.2 Why we're rebuilding it
The current implementation is a long free-text form. It fails on three fronts:

- **Low usage / high drop-off.** It's a boring, high-effort wall of fields; technicians don't finish it,
  and those who do rarely fill it well.
- **Poor data quality → hallucination.** Long, inconsistent free-text answers enter the pipeline. The
  model over-weights rambling input and hallucinates. Many collected fields add noise, not signal.
- **Bad UX.** Everything must be typed. There is no guidance, no preview, no sense of progress or payoff.

### 1.3 The core insight
The root cause of *both* the boredom and the hallucination is the same: **we ask people to write what
should be selected, and we collect fields the model can't use.** The fix is to capture *signal, not text*.

### 1.4 Goals
- A technician completes Brand DNA making **zero required free-text entries** (one optional free-text at the end).
- The pipeline receives a **clean, structured, enum-constrained object** instead of free text.
- The experience feels modern and guided — AI proposes, the user confirms.
- Drop the junk fields entirely so nothing noisy enters the pipeline.

### 1.5 Non-goals (this phase)
- Mobile app implementation (web first).
- Re-architecting the generation pipeline beyond its Brand DNA input contract.
- Changing subscription/paywall behaviour.

---

## 2. Design Overview

### 2.1 Guiding model: "AI proposes, user confirms"
Every step follows one rhythm: **AI shows its best guess → user reacts (keep / swap / adjust) → it locks
in as structured data.** The user almost never types; they edit a brand that is already ~80% built. Each
confirmation is a clean signal. The only free writing is one optional line at the end, when the user has
enough context to be fluent.

### 2.2 Why per-step AI (not one upfront generation)
Each step makes its own small, scoped AI call returning **options to choose from** — never final saved
text. Benefits: cheaper, faster, easier to debug, and a bad suggestion just means the user taps a
different chip. The model's output is always a menu; the user's confirmation is what gets saved.

### 2.3 The 15 inputs, regrouped
The old form dumped ~15 fields in one list. We regroup them so perceived effort collapses to ~5 real decisions.

| Group | Fields (original) | Capture method |
|---|---|---|
| **A · Identity** | Logo, brand name, colour palette, moodboard/intent, brand essence, typography | Autofill + selection (mood cards, swatches, type pairings, essence chips) |
| **B · Offering** | Service category + services, technician signature, service area | Prefilled from profile, confirmed |
| **C · Strategy** | Content objective, ideal client, posts/week + booking target | Objective cards, sliders, steppers |
| **D · Config** | Voice/spelling variant, SM platforms, medical-aesthetics compliance, asset library | Toggles + smart defaults |

### 2.4 UX pattern: stepped canvas with a live Brand Card
A 7-step flow. Left = the current decision; right = a live **Brand Card** that updates on every choice
(logo, palette, type, essence, sample post). Watching the brand assemble is what makes it not boring.
Not a chatbot (slow, error-prone for structured data) and not a form.

### 2.5 The 7 steps
1. **Autofill** — logo (upload/extract), brand name, category + services (prefilled; confirm).
2. **Identity** — mood cards, palette swatches (shuffle), type pairing, essence chips (max 3).
3. **Audience & reach** — age slider, gender chips, service-area tags (optional), signature handle.
4. **Strategy** — objective cards, posts/week stepper, booking-target stepper.
5. **Config** — language variant (smart AU default), platform toggles (OAuth), compliance toggle, asset-library toggle.
6. **Your words** — one optional free-text ("what makes your work special?"); skip → AI drafts it.
7. **Confirm** — final Brand Card + sample post; save writes the structured object.

### 2.6 Why this fixes hallucination
The pipeline stops receiving a wall of inconsistent free text and instead receives a clean object:
`mood: "SOFT_GLAM"`, `essence: ["WARM","FEMININE","PREMIUM"]`, `palette: [hex...]`,
`objective: "PREMIUM_CLIENTS"`, `compliance: true`, plus one short optional human sentence.
**Structured enums don't hallucinate; paragraphs do.** Junk fields are dropped, so noise never enters.

---

## 3. Field Reference (the 15 inputs → new capture)

| # | Field | New capture | Stored as |
|---|---|---|---|
| 1 | Brand logo | Upload; auto-extract palette; or generated wordmark | `identity.logoAssetId` |
| 2 | Brand / professional name | Prefilled from account | `identity.brandName` |
| 3 | Service category + services | Prefilled from profile, confirmed | `offering.serviceCategory`, `offering.services[]` |
| 4 | About + colour palette | Palette = swatches (from logo/mood); "about" = step 6 | `identity.palette[]` / `story.userWritten` |
| 5 | Technician signature | Prefilled bookable handle, confirmed | `offering.signatureHandle` |
| 6 | Service area | Suburb tags / radius (optional; needed for CTA slides) | `offering.serviceAreas[]` |
| 7 | Moodboard (intent) + asset library | Mood cards; asset library auto-on if no media | `identity.mood` / `config.useAssetLibrary` |
| 8 | Brand essence | Select up to 3 essence words (controlled vocab) | `identity.essence[]` |
| 9 | Typography | Pick a font pairing matched to mood | `identity.typography` |
| 10 | Voice / spelling variant | Smart default AU from area; override chip | `config.languageVariant` |
| 11 | Content objective | Objective cards | `strategy.objective` |
| 12 | Ideal client (age, gender) | Age slider + gender chips + client-type tags | `audience.*` |
| 13 | Posts/week + booking target | Steppers | `strategy.postsPerWeek`, `strategy.bookingTargetPerMonth` |
| 14 | SM platforms | Platform toggles + OAuth connect | `config.platforms.*` |
| 15 | Medical-aesthetics compliance | Explicit toggle → hard gate | `config.medicalAestheticsCompliance` |

**Dropped:** any current fields not mapped above are dropped as noise. During migration they are logged
to a report so nothing is lost silently (see §6).

---

## 4. Data Contract

The pipeline consumes this fixed logical contract (`schemaVersion: 2`). Enums are the single source of
truth, shared by UI, API, and pipeline.

```jsonc
{
  "schemaVersion": 2,
  "technicianId": "uuid",
  "identity": {
    "brandName": "string",
    "logoAssetId": "string|null",
    "palette": ["#hex","#hex","#hex","#hex"],
    "mood": "SOFT_GLAM|CLEAN_CLINICAL|EDITORIAL_MINIMAL|NATURAL_ORGANIC|BOLD_LUXE|PLAYFUL_FRESH",
    "typography": { "heading": "string", "body": "string" },
    "essence": ["WARM","FEMININE","PREMIUM"]        // 1–3 from controlled vocab
  },
  "offering": {
    "serviceCategory": "string",
    "services": ["string"],
    "signatureHandle": "string|null",
    "serviceAreas": ["string"]
  },
  "audience": {
    "ageMin": 18, "ageMax": 65,
    "genderFocus": "WOMEN|MEN|ALL",
    "clientTypes": ["string"]
  },
  "strategy": {
    "objective": "PREMIUM_CLIENTS|FILL_QUIET_DAYS|EDUCATE_TRUST|PROMOTE_BRIDAL|LAUNCH_PRODUCT",
    "postsPerWeek": 4,
    "bookingTargetPerMonth": 20
  },
  "config": {
    "languageVariant": "AU|UK|US",
    "platforms": { "instagram": true, "facebook": true, "tiktok": false },
    "medicalAestheticsCompliance": false,
    "useAssetLibrary": true
  },
  "story": { "userWritten": "string|null", "aiDrafted": "string|null" },
  "meta": { "completedAt": "iso", "source": "guided_v2" }
}
```

**Controlled vocabularies** (mood, essence, objective, gender, language, type pairings, palette seeds)
live in one shared constants file imported everywhere. *These enum values are provisional — confirm
against real Elle.Be.O categories before build.*

---

## 5. AI Suggestion Endpoints

All in `growth-studio-api`, reusing the existing AI wrapper, rate limiting and caching. Each returns
**options**, never final text. Output is validated against the controlled vocabularies; anything off-list
is dropped/repaired. Malformed JSON triggers a repair/fallback. Cache by hashed input.

| Endpoint | In | Out |
|---|---|---|
| `POST /brand-dna/suggest/identity` | `serviceCategory, services[], logoAssetId?` | `moods[{id,label,palette[],essenceHints[]}], typePairings[], paletteSeeds[]` |
| `POST /brand-dna/suggest/essence` | `mood, services[]` | `essence[]` (ranked subset of vocab) |
| `POST /brand-dna/suggest/audience` | `serviceCategory, services[]` | `ageMin, ageMax, genderFocus, clientTypes[]` |
| `POST /brand-dna/suggest/strategy` | `objective?, services[]` | `objective, postsPerWeek, bookingTargetPerMonth, rationale` |
| `POST /brand-dna/draft-story` | assembled selections | `aiDrafted` (1–2 sentence brand story) |

**Hallucination controls (core):** the model may only choose from known enums; every response is
schema-validated before return; add a repair path; feature-flag the service.

---

## 6. Migration Strategy (non-destructive)

The old→new storage decision is deliberately safe: **add the new model alongside the old; do not drop the
old table.**

1. New model (`BrandDnaProfile`, `schemaVersion=2`) added; old table remains readable.
2. Migration script maps existing rows via the §3 table:
   - Direct fields (name, category, services, logo) copy across.
   - Free-text → controlled-vocab fields (e.g. old "essence" paragraph) classified via the AI util into
     enum values, stored with `needsReview: true` so meaning never changes silently.
   - Dropped junk fields logged to a report file.
3. Pipeline reads new-shape when present, else falls back to old-shape → gradual migration.
4. **Dry-run mode** reports what *would* change without writing.
5. Rollback: keep the old table intact; revert by toggling the flag off.

---

## 7. Compliance Hard Gate (critical)

`config.medicalAestheticsCompliance` is a **boolean the user sets explicitly** — never inferred from text.
When true, the pipeline MUST enforce in code (not prompt text alone):

- Block client face / before-after images; allow only permitted/education/product imagery.
- Constrain output to educational framing; forbid treatment-outcome / medical claims.
- Apply the stricter AHPRA-aware moderation path.

Tests must assert: with the flag on, client-image inputs are rejected and claim-like outputs are filtered.
This protects the technician and the platform legally, and must not depend on the model "remembering" a
sentence in the prompt.

---

## 8. Phased Execution Plan

### Phase 0 — Discovery (no code)
Locate and report: current Brand DNA model & fields; all read/write endpoints & DTOs; the frontend form
location; the pipeline injection point & expected shape; existing AI-call utilities. Output the old→new
field-mapping table and flag any DROP the pipeline depends on. **Gate: review before Phase 1.**

### Phase 1 — Data contract
Prisma model + enums; shared TS type + validation schema (single source of truth); controlled-vocab
constants file. **Exit:** contract compiles and is importable by backend + pipeline.

### Phase 2 — Migration
New model alongside old; migration script with dry-run + report; pipeline dual-read (new else old);
rollback path. **Exit:** dry-run passes on a copy of prod data.

### Phase 3 — AI suggestion endpoints
Five endpoints with constrained output, JSON-repair, caching, rate limits, feature flag. **Exit:** each
returns only on-vocab options; malformed-JSON test passes.

### Phase 4 — Compliance hard gate
Enforce in code + tests. **Exit:** gate tests pass.

### Phase 5 — Frontend 7-step flow
Stepped canvas + live Brand Card; each step a component; single flow store; per-step autosave; resumable;
replace old form route; match existing design system; accessible. **Exit:** end-to-end completion with
zero required free-text.

### Phase 6 — Wire-up, flag, rollout
`BRAND_DNA_GUIDED_V2` flag; analytics per step; staging verification; follow-up PR to deprecate old form
and (on explicit approval only) drop the old table. **Exit:** metrics show completion vs old form.

### Suggested sequencing
0 → 1 → 2 (start) → 3 → 4 → 5 → 6. Phases 3 and 5 can partly parallelise once the contract (1) is frozen.

---

## 9. Testing Strategy

- **Contract validation:** saved object matches `schemaVersion 2`; all enums constrained; no free text
  except `story`.
- **Migration:** mapping correctness; dry-run vs write parity; `needsReview` flags set; junk logged.
- **Endpoints:** each returns on-vocab options; malformed-JSON repair; cache hit behaviour; rate limits.
- **Compliance gate:** client-image rejection and claim filtering with the flag on.
- **E2E:** a technician completes all 7 steps with zero required typing; resume after leaving mid-flow.
- **Regression:** with the flag OFF, the old form and old pipeline path still work.

---

## 10. Rollout & Analytics

- Ship behind `BRAND_DNA_GUIDED_V2`; enable in staging, then a small % of technicians.
- Track: `started`, `step_completed{n}`, `suggestion_accepted`, `suggestion_modified`, `story_skipped`,
  `completed`. Compare completion rate and time-to-complete against the old form.
- Success signals: higher completion, lower time-to-complete, and — downstream — fewer hallucination/
  regeneration events and better content-acceptance rates.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pipeline breaks on new shape | Dual-read (new else old); flag; keep old table |
| AI suggestions off-brand or off-vocab | Constrain to enums; validate + repair; user can always swap |
| Data loss in migration | Non-destructive; dry-run; report; rollback via flag |
| Compliance bypassed | Enforce in code, not prompt; explicit boolean; tests |
| Enum vocab wrong for real categories | Confirm vocab with product before Phase 1 freeze |
| Scope creep (mobile, pipeline rework) | Explicit non-goals (§1.5); web first |

---

## 12. Acceptance Criteria

- Technician completes Brand DNA with **zero required free-text** (one optional line).
- Saved object validates against the contract; enums constrained; only `story` is free text.
- Pipeline consumes the new object and produces on-brand content; with compliance ON, the hard gate is
  enforced in code and tested.
- Existing data migrated non-destructively, with dry-run report and rollback.
- Everything behind `BRAND_DNA_GUIDED_V2`; old path works with the flag off.
- All §9 tests pass.

---

## 13. Open Questions (confirm before/at Phase 0)

- Which app under `apps/` holds the current Brand DNA form?
- Final controlled vocabularies (moods, essences, objectives) for real Elle.Be.O categories.
- Store new shape as JSON column(s) or normalised tables? (team preference)
- Which analytics system to emit events to?
- Confirm the AHPRA-aware moderation path already exists and is reusable.
