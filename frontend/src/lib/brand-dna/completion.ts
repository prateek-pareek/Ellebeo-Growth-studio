/**
 * Brand DNA Completion Score — §17.
 *
 * Computes a milestone-based readiness score from a BrandDnaRecord.
 * Everything is derived client-side; nothing is persisted. The score is
 * guidance only — it never blocks saving, publishing, or generation.
 *
 * Design intent:
 *   · Encouraging, not punishing. Partial credit per milestone.
 *   · Restricted / private / no-consent assets are honoured the same way
 *     the master prompt assembler honours them — they may add internal
 *     depth, but only publicly usable assets count toward the public
 *     readiness measure.
 *   · Stable equal-weight milestones (currently 9). Adding a milestone
 *     in future only requires extending MILESTONES; weights rebalance.
 */
import type { BrandDnaRecord, SectionId } from "./schema";

type Tier = 1 | 2 | 3 | 4;

// Keep this list in sync with REGULATED_CATEGORIES in ./sections.tsx.
// Inlined to avoid a circular import (sections.tsx imports this module
// to render §17 Completion Score).
const REGULATED_CATEGORIES: ReadonlySet<string> = new Set([
  "skin",
  "skin_therapist",
  "cosmetic_medicine",
  "medical_aesthetics",
  "skin_medical_aesthetics",
  "injector",
  "injectables",
]);

export type MilestoneStatus = "complete" | "partial" | "incomplete";

export type MilestoneId =
  | "basic_profile"
  | "visual_system"
  | "moodboard"
  | "asset_library"
  | "ideal_client"
  | "content_strategy"
  | "compliance"
  | "signature_system";


export type Milestone = {
  id: MilestoneId;
  title: string;
  /** Section to jump to when the user clicks the milestone. */
  jumpTo: SectionId;
  /** 0..1 progress within this milestone. */
  progress: number;
  status: MilestoneStatus;
  /** Encouraging line shown under the milestone. */
  hint: string;
};

export type ReadinessTier = {
  label: string;
  helper: string;
  /** Lower bound (inclusive) percent. */
  min: number;
};

export const READINESS_TIERS: ReadinessTier[] = [
  { min: 0,  label: "Foundation started",            helper: "Your Brand DNA is being shaped. Add a few core fields to unlock basic content." },
  { min: 31, label: "Strong enough for basic content", helper: "Your Brand DNA is strong enough for basic content. Add visual references to improve image direction." },
  { min: 56, label: "Good creative direction",       helper: "Add Signature System rules to make outputs more recognisable." },
  { min: 76, label: "High-confidence Brand DNA",     helper: "Your Brand DNA is becoming distinctive. Add Ideal Client detail to make copy and imagery feel more specific." },
  { min: 91, label: "Ready to guide content",        helper: "Your Brand DNA is rich and distinctive — Elle.Be.O has plenty to work with." },
];


export function tierFor(percent: number): ReadinessTier {
  let chosen = READINESS_TIERS[0];
  for (const t of READINESS_TIERS) if (percent >= t.min) chosen = t;
  return chosen;
}

// ─── helpers ──────────────────────────────────────────────────────────

const truthy = (s: unknown): boolean =>
  typeof s === "string" ? s.trim().length > 0 : Array.isArray(s) ? s.length > 0 : Boolean(s);

function fraction(filled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, filled / total));
}

function statusFor(progress: number): MilestoneStatus {
  if (progress >= 0.999) return "complete";
  if (progress >= 0.34) return "partial";
  return "incomplete";
}

// Public-usability filters — must mirror the master prompt assembler.
function isPubliclyUsableAsset(a: BrandDnaRecord["asset_library"][number]): boolean {
  return (
    a.usage_rule !== "private_ref" &&
    a.usage_rule !== "do_not_use_publicly" &&
    a.usage_rule !== "do_not_generate" &&
    a.consent_status !== "no_consent" &&
    a.consent_status !== "pending"
  );
}

function isPubliclyUsableRef(m: BrandDnaRecord["moodboard"][number]): boolean {
  return m.usage !== "private";
}

// ─── milestone computations ───────────────────────────────────────────

function basicProfile(r: BrandDnaRecord): Milestone {
  const hasCategory =
    truthy(r.foundations.category) ||
    (Array.isArray(r.foundations.categories) && r.foundations.categories.length > 0);
  const checks = [
    truthy(r.foundations.professional_name),
    hasCategory,
    truthy(r.foundations.location) || truthy(r.foundations.service_area),
    truthy(r.essence.one_sentence),
    truthy(r.essence.image_energy),
  ];
  const filled = checks.filter(Boolean).length;
  const progress = fraction(filled, checks.length);
  return {
    id: "basic_profile",
    title: "Basic profile",
    jumpTo: "foundations",
    progress,
    status: statusFor(progress),
    hint: progress >= 1
      ? "Your brand has a clear name, place and essence."
      : "Name, at least one category, location, one-sentence essence and image energy.",
  };
}


function visualSystem(r: BrandDnaRecord, tier: Tier): Milestone {
  const p = r.visual_identity.palette;
  // Essential requires only primary / background / accent.
  // Enhanced+ requires the full five-colour palette.
  const paletteEssential =
    truthy(p.primary) && truthy(p.background) && truthy(p.accent);
  const paletteFull = paletteEssential && truthy(p.secondary) && truthy(p.depth);
  const paletteFilled = tier >= 2 ? paletteFull : paletteEssential;

  const t = r.typography;
  const fontsChosen = truthy(t.heading_font) || truthy(t.body_font);
  // Enhanced+ adds typography personality / text placement detail.
  const typographyFilled =
    tier >= 2
      ? truthy(t.personality) && fontsChosen && truthy(t.text_placement)
      : fontsChosen;

  const d = r.image_direction;
  const directionFilled =
    d.lighting.length > 0 &&
    d.composition.length > 0 &&
    (d.environments.length > 0 || truthy(d.environments_other));

  // Style ranking is an Enhanced+ concept.
  const checks =
    tier >= 2
      ? [paletteFilled, r.visual_identity.style_ranking.length >= 3, typographyFilled, directionFilled]
      : [paletteFilled, typographyFilled, directionFilled];
  const progress = fraction(checks.filter(Boolean).length, checks.length);
  return {
    id: "visual_system",
    title: "Visual system",
    jumpTo: "visual_identity",
    progress,
    status: statusFor(progress),
    hint: progress >= 1
      ? "Palette, fonts and image direction all set."
      : tier >= 2
        ? "Five-colour palette, three ranked styles, typography and image direction."
        : "Primary / background / accent colours, heading and body fonts, and image direction.",
  };
}

function moodboard(r: BrandDnaRecord): Milestone {
  const usable = r.moodboard.filter(isPubliclyUsableRef);
  const labelled = usable.filter((m) => truthy(m.usage)).length;
  const priorityCount = usable.filter((m) => m.is_priority).length;

  // Three sub-checks, each scaled 0..1
  const subA = Math.min(1, usable.length / 5);                  // at least 5 usable refs
  const subB = Math.min(1, labelled / 3);                       // at least 3 labelled
  const subC = priorityCount >= 1 ? 1 : 0;                      // at least 1 priority
  const progress = (subA + subB + subC) / 3;

  let hint: string;
  if (usable.length === 0) {
    hint = "Add references the AI can lean on. 5 labelled is the working minimum; 8 is the recommended depth.";
  } else if (usable.length < 5) {
    hint = `The minimum recommended moodboard is 8 references, but your Brand DNA can start improving image direction from 5 labelled references. You have ${usable.length}.`;
  } else if (progress >= 1) {
    hint = `${usable.length} usable references — labelled and weighted. AI has strong visual anchors.`;
  } else if (priorityCount === 0) {
    hint = "Mark 1–3 references as priority so the AI knows which anchors matter most.";
  } else {
    hint = "Add usage labels to more references so the AI knows what each one is for.";
  }
  return {
    id: "moodboard",
    title: "Moodboard",
    jumpTo: "moodboard",
    progress,
    status: statusFor(progress),
    hint,
  };
}

function assetLibrary(r: BrandDnaRecord): Milestone {
  const allItems = r.asset_library;
  const publicItems = allItems.filter(isPubliclyUsableAsset);
  const withConsent = allItems.filter((a) => truthy(a.consent_status)).length;
  const withRule = allItems.filter((a) => truthy(a.usage_rule)).length;

  const subA = Math.min(1, publicItems.length / 5);
  const subB = Math.min(1, withConsent / 3);
  const subC = Math.min(1, withRule / 3);
  const progress = (subA + subB + subC) / 3;

  let hint: string;
  if (allItems.length === 0) {
    hint = "Add 5+ of your own files — headshots, work, space — so the AI can reference real material.";
  } else if (publicItems.length < 5) {
    const restricted = allItems.length - publicItems.length;
    const restrictedNote = restricted > 0 ? ` ${restricted} are kept private / restricted (counted as internal depth, not public references).` : "";
    hint = `${publicItems.length} of your assets are cleared for public use. Aim for 5+ to give the AI strong material to work from.${restrictedNote}`;
  } else if (progress >= 1) {
    hint = `${publicItems.length} cleared assets, with consent and usage rules — generation will favour your real material.`;
  } else if (withConsent < 3) {
    hint = "Set consent status on a few more assets so the prompt respects them automatically.";
  } else {
    hint = "Tag more assets with a usage rule (use often, reference only) to guide the AI.";
  }
  return {
    id: "asset_library",
    title: "Asset library",
    jumpTo: "asset_library",
    progress,
    status: statusFor(progress),
    hint,
  };
}

function idealClient(r: BrandDnaRecord): Milestone {
  const ic = r.ideal_client_v2;
  // 13 possible fields; the 5 below are weighted as "core" (always count).
  const core = [ic.summary, ic.problem, ic.feeling_after_booking, ic.fears_objections, ic.trust_signals];
  const others = [
    ic.age_range, ic.audience_gender, ic.lifestyle, ic.buying_motivation,
    ic.pays_more_for, ic.visual_taste, ic.client_language, ic.language_to_avoid,
  ];
  const coreFilled = core.filter(truthy).length;       // 0..5
  const othersFilled = others.filter(truthy).length;   // 0..8
  const total = coreFilled + othersFilled;             // 0..13
  // Complete = 8 fields including at least 4 core
  const progress = Math.min(1, (total / 8) * (coreFilled >= 4 ? 1 : 0.7));
  return {
    id: "ideal_client",
    title: "Ideal client",
    jumpTo: "ideal_client",
    progress,
    status: statusFor(progress),
    hint: progress >= 1
      ? "AI has a clear, specific person to write and design for."
      : "Add detail on who they are, what they want to feel, and what makes them trust someone.",
  };
}

function contentStrategy(r: BrandDnaRecord): Milestone {
  const cs = r.content_strategy;
  const c = r.commercial;
  const checks = [
    cs.pillars_ranked.length >= 3,
    truthy(cs.targets.bookings_per_week),
    truthy(cs.targets.posts_per_week),
    cs.output_formats.length >= 1 || r.output_formats.platforms.length >= 1,
    c.content_objectives.length >= 1,
  ];
  const progress = fraction(checks.filter(Boolean).length, checks.length);
  return {
    id: "content_strategy",
    title: "Content strategy",
    jumpTo: "content_strategy",
    progress,
    status: statusFor(progress),
    hint: progress >= 1
      ? "Pillars, targets and objectives are set — generation knows the job."
      : "Rank 3+ pillars, set weekly targets, choose a format and an objective.",
  };
}

function compliance(r: BrandDnaRecord): Milestone {
  const c = r.compliance;
  const categoryList = [r.foundations.category, ...(r.foundations.categories || [])];
  const regulatedByCategory = categoryList.some((cat) => REGULATED_CATEGORIES.has(cat));
  const ackd = c.medical_aesthetics_practitioner === true || c.regulated_ack === true;
  // Two possible "complete" states:
  //   · Not a regulated practitioner and category isn't regulated — nothing to confirm.
  //   · Regulated category or self-identified practitioner with the ack toggled on.
  let progress: number;
  let hint: string;
  if (regulatedByCategory || c.medical_aesthetics_practitioner) {
    progress = ackd ? 1 : 0;
    hint = ackd
      ? "Stricter AHPRA-aware rules are applied to your captions and image prompts."
      : "You've selected a regulated category. Confirm you're a Medical Aesthetics practitioner so stricter rules apply.";
  } else {
    // Non-regulated profile — gentle credit either way so it never blocks the score.
    progress = ackd ? 1 : 0.6;
    hint = ackd
      ? "Stricter AHPRA-aware rules are applied to your captions and image prompts."
      : "Optional — tick the Medical Aesthetics practitioner box if AHPRA rules apply to you.";
  }
  return {
    id: "compliance",
    title: "Compliance",
    jumpTo: "compliance",
    progress,
    status: statusFor(progress),
    hint,
  };
}



function signatureSystem(r: BrandDnaRecord): Milestone {
  const sig = r.signature_system;
  const fields = [
    sig.recurring_motif, sig.framing_habit, sig.colour_discipline,
    sig.type_rule, sig.finish, sig.light_signature, sig.always_absent,
  ];
  const filled = fields.filter(truthy).length;
  // Complete = 5 of 7 filled; partial credit scales to 5.
  const progress = Math.min(1, filled / 5);
  return {
    id: "signature_system",
    title: "Signature system",
    jumpTo: "signature_system",
    progress,
    status: statusFor(progress),
    hint: filled >= 5
      ? `${filled} of 7 signature rules set — outputs will feel unmistakably yours.`
      : `Fill at least 5 of 7 signature rules so every output feels recognisable. You have ${filled}.`,
  };
}

// ─── public API ───────────────────────────────────────────────────────

export type CompletionSummary = {
  /** 0..100, rounded. */
  percent: number;
  tier: ReadinessTier;
  milestones: Milestone[];
  /** Short, prioritised next-step suggestions (max 3). */
  nextSteps: string[];
};

export function computeCompletion(
  record: BrandDnaRecord,
  tier: Tier = 3,
): CompletionSummary {
  // Milestone availability mirrors `tierForSection` in subscription/tier.ts:
  // Tier 1 = Essential; Tier 2 = + moodboard; Tier 3+ = + asset library + signature system.
  const all: Milestone[] = [
    basicProfile(record),
    visualSystem(record, tier),
    moodboard(record),
    assetLibrary(record),
    idealClient(record),
    contentStrategy(record),
    compliance(record),
    signatureSystem(record),
  ];
  const allowed = (id: MilestoneId): boolean => {
    if (id === "moodboard") return tier >= 2;
    if (id === "asset_library" || id === "signature_system") return tier >= 3;
    return true;
  };
  const milestones = all.filter((m) => allowed(m.id));

  // Equal weight per included milestone — lower tiers can hit 100%.
  const avg = milestones.reduce((s, m) => s + m.progress, 0) / milestones.length;
  const percent = Math.round(avg * 100);
  const tierLabel = tierFor(percent);

  const nextSteps = [...milestones]
    .filter((m) => m.status !== "complete")
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 3)
    .map((m) => m.hint);

  return { percent, tier: tierLabel, milestones, nextSteps };
}
