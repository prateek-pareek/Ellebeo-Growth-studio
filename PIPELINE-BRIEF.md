# Gemini Lab image pipeline — working brief

Everything here was measured in this repo, against real output. Where a number
appears, it came from a run, not an estimate. **Re-measure before trusting any
of it** — the point of this document is to stop you repeating experiments that
have already been run, not to be believed on faith.

---

## What the product is

A studio (hair / beauty / nails / lashes) uploads a client photo or types a
sale, and gets **four finished Instagram posts** to choose from, in their own
brand's colours, typefaces and voice.

- **Backend** NestJS, `backend/src/gemini-lab/**` — this pipeline only. It must
  not import from the older `/generate` pipeline (`src/ai/**`).
- **Frontend** React + TanStack Router + Vite, `frontend/src/routes/gemini-lab.tsx`.
- **Models** Gemini `2.5-flash` (copy, vision) and `2.5-flash-image` (artwork);
  OpenAI `gpt-4o` writes two of the four copy options.
- **Run it** `npm run start:dev` in `backend/`, `npm run dev` in `frontend/`.
  Tests: `npx jest src/gemini-lab` — **238 passing**, keep them that way.

## The three render paths

A post is made one of three ways. Which one ran is now reported on every option
as `design.renderPath`, and logged.

| path | when | quality |
|---|---|---|
| `poster` | no client photo | **good** — artwork generated directly from the words |
| `ai_layout` | one client photo, flag on | **promising** — model designs the page, we composite the real photo in |
| `composited` | everything else, and every fallback | **weak** — this is where the problems are |

`GEMINI_LAB_AI_LAYOUT=1` in `backend/.env` enables the middle one.

---

## The single biggest defect

**Type lands on the subject's face.** Across every version of the pipeline,
this is *six of ten* distinct design-critic complaints:

> "Type crowds the photo subject's face" · "Type sitting over the face and
> head" · "The main headline block is placed directly over the subject's head"

Four in `framed` layouts, two in `full_bleed`. Critic scores have been flat at
**51–56** the whole time. Fixing this is the highest-value work available.

**Why it happens:** the compositor crops with `sharp.strategy.attention`, which
finds the highest-*entropy* region. On a portrait that is sometimes the face,
and sometimes the patterned scarf or the bright window behind. It is a saliency
heuristic with no concept of a face.

**What exists already:** `src/gemini-lab/subject-box.ts` — one vision call per
photo returning the head-and-face box, cached on the image hash, plus
`keepOutRegion()`, `overlaps()` and `safeBandFor()`. 14 tests. **Verified on a
real photo** by drawing the box back onto the image.

**What is NOT done:** it is not wired into the compositor. That is the job.
`framed` needs the crop centred on the face; `full_bleed` needs text placed in
the safe band. Start here.

---

## The rule that governs this whole pipeline

**Instructing a model not to do something is not a mechanism.** This has now
been proven four separate times, each time costing a day:

1. **"Do not change the photograph."** Given a client photo and an emphatic
   instruction, the returned photo differed from the original by **22%, 36% and
   37%** mean absolute pixel difference — against a **0.2%** noise floor for the
   same image re-encoded. In one run the client gained a nose ring; in another
   she was a different person. *Fix: the model never sees the client. It designs
   around a flat magenta placeholder and we composite the real photo into the
   rectangle it left.*

2. **Hex codes.** Told "these colour values are for you to mix with, never to
   display", it set `#A3B184C` as the visible headline. *Fix: no hex ever enters
   the prompt. `describeColour()` turns `#F3EDE3` into "a warm cream, almost
   white".*

3. **Typeface names.** Told the type character as "a Source Sans 3 feeling", it
   set **"Source Sans 3"** as the headline and dropped the real one. *Fix:
   `describeTypeface()` — names never enter the prompt.*

4. **Clichés.** The prompt names and forbids ~25 phrases. A run with that
   wording in place still produced "bespoke" twice, "effortless", "enhance your
   natural beauty", "experience the" and "radiant" across three of three
   options. *Fix: `src/gemini-lab/cliche.ts` measures the finished copy and
   sends only the failing lines back for one targeted rewrite.*

**If you find yourself adding a sentence to a prompt to prevent something,
stop.** Build the check instead. The prompt raises the floor; only a mechanism
sets the ceiling.

---

## Reference templates — what actually happened

The studio has hundreds of designed slides (Google Slides → export **PDF** →
`pdftoppm -jpeg -r 100`). The idea is to use them as arrangements for new posts.

**What works:** `reference-scan.ts` classifies each slide from its pixels —
continuous tone means a photograph, flat colour and hard edges mean type. It
got all 18 slides of a real deck right. **The model cannot do this
classification** — asked to, it invented photo slots on all four type-only
"STEP" cards and failed to make one on a full-bleed photo. Wrong in both
directions on 5 of 9.

**What failed:**

- **Blurring the reference** to destroy its text. It worked on text, but a
  blurred photograph is still a photograph — the model reproduced its *subject*
  as the background of the finished post (a soft-focus hand holding a tablet,
  behind a hair studio's headline). Replaced by a **diagram**: grey blocks for
  type, one magenta block for the photo, white for space.
- **The diagrams are not faithful.** They produce *a* clean structure, not *the*
  reference's structure. Block detection is too coarse. Merging ink cells into
  real rectangles is the open work.
- **Type-led decks teach small photos.** A deck of big headlines with small
  framed insets produced posts with the client at **12–14% of canvas**, and half
  the options rejected. Fixed by requiring a reference's own photo to be ≥25% of
  its slide — of 18 slides, only **5** qualify — and a hard 16% floor on the
  result.

---

## Other measured findings

- **Never `fit: 'cover'` on finished artwork.** It cropped 135px off each side
  to force 4:5, cutting the studio name to "hing" and an offer box to "0% off …
  efore 30 September". Pad instead.
- **Generated background art must not run behind a client photo.** It produced a
  muddy grey-brown texture under a cream-and-sage brand, with the client a small
  circle floating on it. When there is a photograph, the brand's own paper
  colour is the ground. This one change moved scores from 30–50 to **84–86**.
- **The photo-size floor matters.** Dropping it to 3% "because the reference
  decides" let 12% ship. It is 16% now.
- **Upload limits were the working limit.** 8MB rejected ordinary phone photos
  outright (`413`). Browser downscales to 2048px before upload; server accepts
  30MB as a backstop.
- **Photo edits must return JPEG, not PNG.** PNG was **9.6× larger** for a
  photograph — 2.69MB vs 0.23MB — slow enough that the edit looked like it had
  failed, and it froze a browser tab in testing.

---

## Open problems, in the order I would take them

1. **Wire `subject-box.ts` into the compositor.** Keeps type off faces. Should
   move the 51–56 score band more than anything else here.
2. **Dead space.** Second most common critic complaint — "significant dead space
   at the bottom makes the post look unfinished". Text and photo are both
   vertically centred, so nothing anchors the page.
3. **Low contrast text.** Third complaint. Text colour is chosen without
   measuring what is actually behind it. Deterministic and testable: sample the
   luminance under the text region and pick the ink that passes.
4. **Faithful reference diagrams** (see above).
5. **Verify the cliché repair end to end.** It is wired but I have not confirmed
   a run comes back clean.

## Do not touch without reading first

`prisma migrate diff` wants to **DROP** `brand_dna_profiles` (5 rows) and
`brand_dna_onboarding_events` (48 rows) — their models were removed from
`schema.prisma` but the tables still hold real tenant data. **Any
`prisma db push` or `migrate dev` destroys them.** `video_plans`,
`video_scenes` and `video_renders` are missing and `/video-plans` 500s, but
fixing that needs an additive migration plus an UPPERCASE→lowercase enum
conversion, and a decision about those 53 rows first.

## How to verify anything here

Do not trust the UI, and do not trust a screenshot alone.

```bash
# mint a dev token (never type a password into the login form)
cd backend && node -e "…jwt.sign({sub,role,tenantId}, JWT_ACCESS_SECRET)…"

# generate through the real endpoint
curl -X POST localhost:3002/api/v1/gemini-lab/generate -H "Authorization: Bearer $TOK" \
  -F "photo=@client.jpg" -F "postFormat=statement" -F "aspectRatio=4:5" -F "useBrandDna=true"

# read what the pipeline says it did
grep -E "ai-layout\]|\[poster\]|\[critic\]|\[cliche\]" <backend log>
```

Save the returned images and **look at them**. Every real finding in this
document came from looking at output, and several came from discovering that a
change I was confident about had made things worse.
