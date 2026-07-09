import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Lock } from "lucide-react";
import { loadBrandDnaRecord, saveBrandDnaRecord } from "@/lib/providers/brand-dna-save";
import { EMPTY_BRAND_DNA, SECTIONS, type BrandDnaRecord, type SectionId, type SectionDef } from "@/lib/brand-dna/schema";
import { SectionBody } from "@/lib/brand-dna/sections";
import { computeCompletion } from "@/lib/brand-dna/completion";
import { api } from "@/lib/api";

// Hard lock — section is fully blocked below the required tier.
const SECTION_TIER_GATE: Partial<Record<string, { minTier: number; label: string }>> = {
  moodboard:        { minTier: 3, label: "Tier 3 — Premium" },
  asset_library:    { minTier: 3, label: "Tier 3 — Premium" },
  signature_system: { minTier: 3, label: "Tier 3 — Premium" },
};

// Soft note — section is accessible but some fields are locked at the AI level.
const SECTION_TIER_NOTE: Partial<Record<string, { minTier: number; label: string; note: string }>> = {
  essence:          { minTier: 2, label: "Partial — Tier 2+", note: "Brand world anchor requires Tier 2 — your input is saved but won't reach the AI until you upgrade." },
  image_direction:  { minTier: 2, label: "Partial — Tier 2+", note: "Advanced visual direction (composition, finish, environment) requires Tier 2. Basic lighting and texture are active on all tiers." },
  visual_identity:  { minTier: 2, label: "Partial — Tier 2+", note: "Logo usage rules and the full 5-colour palette require Tier 2 — your primary colours and style ranking are active on all tiers." },
  ideal_client:     { minTier: 3, label: "Partial — Tier 3+", note: "Full client psychology (fears, trust triggers, buying motivation, visual taste) requires Tier 3 — these fields are saved but filtered from AI prompts below Tier 3." },
  content_strategy: { minTier: 3, label: "Partial — Tier 3+", note: "Per-pillar content strategy treatment requires Tier 3. Your pillars are still used at all tiers." },
};

const TIER_RANK: Record<string, number> = {
  free: 0, standard: 1, premium: 3,
  tier1: 1, tier2: 2, tier3: 3, tier4: 4, tier5: 5,
};

function tierRank(tier: string): number {
  return TIER_RANK[tier] ?? 0;
}

const searchSchema = z.object({
  section: z.string().optional(),
});

export const Route = createFileRoute("/brand/onboarding")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Brand DNA — Elle.Be.O Growth" },
      { name: "description", content: "Your brand bible, built for AI." },
    ],
  }),
  component: BrandDnaForm,
});

const GROUPS = ["Brand", "Visual", "Voice", "Commercial", "Compliance", "Output"] as const;
type GroupName = (typeof GROUPS)[number];

// ── Section fill count & status helpers ──────────────────────────────────────

const T = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : Boolean(v);

function sectionFill(id: string, r: BrandDnaRecord): { filled: number; total: number } | null {
  switch (id) {
    case "foundations": {
      const f = r.foundations;
      const checks = [
        T(f.professional_name),
        T(f.category) || f.categories.length > 0,
        T(f.location) || T(f.service_area),
        T(f.niche),
        T(f.known_for),
        T(f.reputation_asset),
      ];
      return { filled: checks.filter(Boolean).length, total: 6 };
    }
    case "essence": {
      const f = r.essence;
      return { filled: [f.one_sentence, f.world_anchor, f.image_energy].filter(T).length, total: 3 };
    }
    case "visual_identity": {
      const p = r.visual_identity.palette;
      const checks = [T(p.primary), T(p.background), T(p.accent), r.visual_identity.style_ranking.length > 0, T(r.visual_identity.logo_usage_rules)];
      return { filled: checks.filter(Boolean).length, total: 5 };
    }
    case "moodboard": {
      const n = r.moodboard.filter((m) => m.usage !== "private").length;
      return { filled: Math.min(n, 5), total: 5 };
    }
    case "image_direction": {
      const d = r.image_direction;
      const checks = [
        d.lighting.length > 0,
        d.composition.length > 0,
        d.environments.length > 0 || T(d.environments_other),
        d.textures.length > 0,
        T(d.realism),
        T(d.people),
      ];
      return { filled: checks.filter(Boolean).length, total: 6 };
    }
    case "typography": {
      const ty = r.typography;
      return { filled: [ty.personality, ty.heading_font, ty.body_font, ty.text_placement].filter(T).length, total: 4 };
    }
    case "asset_library": {
      const n = r.asset_library.filter((a) => T(a.consent_status) && a.consent_status !== "no_consent").length;
      return { filled: Math.min(n, 5), total: 5 };
    }
    case "signature_system": {
      const s = r.signature_system;
      return { filled: [s.recurring_motif, s.framing_habit, s.colour_discipline, s.type_rule, s.finish, s.light_signature, s.always_absent].filter(T).length, total: 7 };
    }
    case "voice": {
      const v = r.voice_v2;
      return { filled: [v.three_words, v.perception, v.proof, v.caption_length, v.emoji_usage, v.caption_style].filter(T).length, total: 6 };
    }
    case "written_conventions": {
      const w = r.written_conventions;
      return { filled: [w.always_write, w.avoid_phrases, w.punctuation_rules].filter(T).length, total: 3 };
    }
    case "commercial": {
      const c = r.commercial;
      const checks = [T(c.hero_service), T(c.desired_outcome), T(c.market_tier), c.content_objectives.length > 0, T(c.cta_style)];
      return { filled: checks.filter(Boolean).length, total: 5 };
    }
    case "ideal_client": {
      const ic = r.ideal_client_v2;
      return { filled: [ic.summary, ic.problem, ic.feeling_after_booking, ic.fears_objections, ic.trust_signals, ic.age_range, ic.buying_motivation, ic.visual_taste].filter(T).length, total: 8 };
    }
    case "content_strategy": {
      const cs = r.content_strategy;
      const checks = [cs.pillars_ranked.length > 0, T(cs.targets.bookings_per_week), T(cs.targets.posts_per_week), cs.output_formats.length > 0];
      return { filled: checks.filter(Boolean).length, total: 4 };
    }
    case "compliance": {
      const c = r.compliance;
      const checks = [T(c.before_after_rules), T(c.claims_to_avoid), c.regulated_ack || c.medical_aesthetics_practitioner];
      return { filled: checks.filter(Boolean).length, total: 3 };
    }
    case "output_formats": {
      const o = r.output_formats;
      const checks = [o.platforms.length > 0, o.aspect_ratios.length > 0, o.finish.length > 0];
      return { filled: checks.filter(Boolean).length, total: 3 };
    }
    default:
      return null;
  }
}

function sectionDotStatus(id: string, r: BrandDnaRecord, locked: boolean): "done" | "partial" | "empty" | "locked" {
  if (locked) return "locked";
  const fill = sectionFill(id, r);
  if (!fill || fill.total === 0) return "empty";
  const pct = fill.filled / fill.total;
  if (pct >= 0.99) return "done";
  if (pct >= 0.33) return "partial";
  return "empty";
}

function StatusDot({ status, size = "sm" }: { status: "done" | "partial" | "empty" | "locked"; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-2 h-2" : "w-[5px] h-[5px]";
  const base = `${dim} rounded-full flex-shrink-0 transition-colors`;
  if (status === "done")    return <div className={`${base} bg-sage`} />;
  if (status === "partial") return <div className={`${base} border-2 border-taupe`} />;
  if (status === "locked")  return <div className={`${base} border border-dashed border-taupe/40`} />;
  return <div className={`${base} bg-border`} />;
}

// ─────────────────────────────────────────────────────────────────────────────

function BrandDnaForm() {
  const [record, setRecord] = useState<BrandDnaRecord>(EMPTY_BRAND_DNA);
  const [openSection, setOpenSection] = useState<string>(SECTIONS[0].id);
  const [activeGroup, setActiveGroup] = useState<GroupName>("Brand");
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<string>("free");

  const patch = useCallback(
    (partial: Partial<BrandDnaRecord>) => setRecord((prev) => ({ ...prev, ...partial })),
    [],
  );

  const completion = useMemo(() => computeCompletion(record), [record]);

  const jumpToSection = useCallback((id: SectionId) => {
    const target = SECTIONS.find((s) => s.id === id);
    if (!target) return;
    setActiveGroup(target.group as GroupName);
    setOpenSection(target.id);
    window.setTimeout(() => {
      document.getElementById(`section-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const { section: sectionParam } = useSearch({ from: "/brand/onboarding" });

  useEffect(() => {
    Promise.all([
      loadBrandDnaRecord(),
      api.get("/auth/me").catch(() => null),
    ]).then(([dnaRes, meRes]) => {
      if (dnaRes.kind === "ok") setRecord(dnaRes.record);
      const tier = meRes?.data?.data?.tenant?.subscriptionTier ?? "free";
      setCurrentTier(tier);
      if (sectionParam) {
        window.setTimeout(() => jumpToSection(sectionParam as SectionId), 300);
      }
    }).finally(() => setLoading(false));
  }, [sectionParam]);

  const sectionsByGroup = useMemo(() => {
    const map: Record<GroupName, SectionDef[]> = {
      Brand: [], Visual: [], Voice: [], Commercial: [], Compliance: [], Output: [],
    };
    for (const s of SECTIONS) map[s.group as GroupName].push(s);
    return map;
  }, []);

  async function handleSave(status: "draft" | "published") {
    setError(null);
    setSaving(status);
    const next: BrandDnaRecord = { ...record, draft_status: status };
    const res = await saveBrandDnaRecord(next, status);
    setSaving(null);
    if (res.kind === "ok") {
      setRecord(next);
      setSavedAt(new Date().toLocaleTimeString());
      if (status === "published") setPublished(true);
    } else if (res.kind === "anon") {
      setError("Please sign in to save your Brand DNA.");
    } else {
      setError(res.message);
    }
  }

  if (published) {
    return (
      <div className="mt-6 lg:mt-10">
        <p className="eyebrow mb-5">Brand DNA · Published</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Saved to your <span className="italic">Brand DNA</span>.
        </h1>
        <p className="mt-6 text-base text-taupe leading-relaxed">
          Generation will now read from this version. You can keep refining at any time.
        </p>
        <div className="artifact p-6 sm:p-10 max-w-2xl mt-8 flex flex-wrap items-center gap-4">
          <Link to="/brand" className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors">
            View your Brand DNA
          </Link>
          <button onClick={() => setPublished(false)} className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
            Edit again
          </button>
        </div>
      </div>
    );
  }

  const activeSections = sectionsByGroup[activeGroup];

  return (
    <div className="mt-6 lg:mt-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link to="/brand" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">Brand DNA</Link>
        <span className="text-taupe/40 text-[10px]">/</span>
        <span className="text-[10px] uppercase tracking-widest text-foreground font-medium">Full Brand DNA</span>
      </div>

      {/* Heading */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="eyebrow">Brand DNA</p>
      </div>
      <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.05] tracking-tight mb-5">
        Your <span className="italic">brand bible</span>, built for AI.
      </h1>
      <p className="text-sm text-taupe leading-relaxed max-w-[60ch] mb-2">
        Complete your Brand DNA so Elle.Be.O can create content that looks, sounds and feels like your brand. Save a draft any time — nothing is lost between sessions.
      </p>
      <p className="text-xs text-taupe/60 mb-5">
        {loading ? "Loading your saved Brand DNA…" : "Live — changes save to your account."}
      </p>

      {/* Progress strip */}
      <div className="flex items-center gap-4 sm:gap-5 py-3.5 mb-8 border-t border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.22em] text-taupe/70 whitespace-nowrap shrink-0">Brand DNA strength</p>
        <div className="flex-1 h-px bg-border relative">
          <div
            className="absolute left-0 top-[-0.5px] h-[2px] bg-foreground transition-all duration-500"
            style={{ width: `${Math.max(2, completion.percent)}%` }}
          />
        </div>
        <p className="font-serif text-lg leading-none shrink-0 tabular-nums">
          {completion.percent}<span className="text-sm text-taupe">%</span>
        </p>
        <p className="text-[11px] text-taupe hidden sm:block whitespace-nowrap shrink-0">{completion.tier.label}</p>
      </div>

      {/* Group tabs — underline style with per-section status dots */}
      <div role="tablist" className="flex gap-0 border-b border-border mb-8 overflow-x-auto">
        {GROUPS.map((g) => {
          const tabSections = sectionsByGroup[g].filter((s) => s.id !== "completion");
          const active = g === activeGroup;
          return (
            <button
              key={g}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveGroup(g);
                const first = sectionsByGroup[g][0];
                if (first) setOpenSection(first.id);
              }}
              className={
                "flex flex-col items-start gap-1 px-4 sm:px-5 py-3 pb-[11px] border-b-2 -mb-px transition-colors whitespace-nowrap " +
                (active ? "border-foreground" : "border-transparent hover:border-border/60")
              }
            >
              <div className="flex items-center gap-2">
                <span className={"text-[11px] uppercase tracking-[0.2em] transition-colors " + (active ? "text-foreground font-medium" : "text-taupe")}>
                  {g}
                </span>
                <div className="flex gap-[3px] items-center">
                  {tabSections.map((s) => {
                    const lk = !!(SECTION_TIER_GATE[s.id] && tierRank(currentTier) < SECTION_TIER_GATE[s.id]!.minTier);
                    return <StatusDot key={s.id} status={sectionDotStatus(s.id, record, lk)} size="sm" />;
                  })}
                </div>
              </div>
              <span className="text-[9px] text-taupe/50 tracking-[0.05em]">
                {tabSections.length} {tabSections.length === 1 ? "section" : "sections"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-12 gap-8 lg:gap-12">

        {/* Accordion sections */}
        <div className="col-span-12 lg:col-span-8 space-y-3">
          {activeSections.map((s) => {
            const gate = SECTION_TIER_GATE[s.id];
            const softNote = SECTION_TIER_NOTE[s.id];
            const locked = gate ? tierRank(currentTier) < gate.minTier : false;
            const hasNote = !locked && softNote ? tierRank(currentTier) < softNote.minTier : false;
            const open = !locked && openSection === s.id;
            const dotSt = sectionDotStatus(s.id, record, locked);
            const fill = !locked && !open ? sectionFill(s.id, record) : null;

            return (
              <section key={s.id} id={`section-${s.id}`} className={"artifact scroll-mt-24 " + (locked ? "opacity-60" : "")}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => !locked && setOpenSection(open ? "" : s.id)}
                  className={"w-full text-left flex items-center gap-3.5 px-5 sm:px-6 py-4 transition-colors " + (locked ? "cursor-default" : "hover:bg-nude/10")}
                >
                  {/* Status dot */}
                  <StatusDot status={dotSt} size="md" />

                  {/* Title + badge + help */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-serif text-xl leading-snug">{s.title}</h2>
                      {locked && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.15em] border border-border bg-muted text-taupe px-2 py-0.5 rounded-full">
                          <Lock className="size-2.5" /> {gate?.label}
                        </span>
                      )}
                      {hasNote && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.15em] border border-amber-200 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                          <Lock className="size-2.5" /> {softNote?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-taupe mt-0.5 leading-relaxed">{s.help}</p>
                    {hasNote && (
                      <p className="text-[10px] text-amber-600/80 mt-1 leading-relaxed">{softNote?.note}</p>
                    )}
                  </div>

                  {/* Fill chip — collapsed unlocked only */}
                  {fill && (
                    <span className={"text-[11px] whitespace-nowrap flex-shrink-0 tabular-nums " + (fill.filled > 0 ? "text-sage" : "text-taupe/40")}>
                      {fill.filled} / {fill.total}
                    </span>
                  )}

                  {/* Chevron or lock */}
                  {!locked && (
                    <span
                      className={"text-base flex-shrink-0 leading-none transition-transform duration-200 " + (open ? "rotate-180 text-taupe" : "text-taupe/30")}
                      aria-hidden
                    >
                      ▾
                    </span>
                  )}
                  {locked && <Lock className="size-4 text-taupe/40 flex-shrink-0" aria-hidden />}
                </button>

                {locked && (
                  <div className="border-t hairline px-5 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <Lock className="size-4 text-taupe" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-0.5">Upgrade to unlock this section</p>
                      <p className="text-xs text-taupe leading-relaxed">
                        This section is available on <span className="font-semibold text-foreground">{gate?.label}</span> and above.
                      </p>
                    </div>
                    <Link
                      to="/plans"
                      className="shrink-0 bg-foreground text-offwhite px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-taupe transition-colors inline-flex items-center gap-1.5"
                    >
                      View plans
                    </Link>
                  </div>
                )}

                {open && (
                  <div className="border-t hairline px-5 sm:px-6 py-6">
                    <SectionBody id={s.id} record={record} patch={patch} onJump={jumpToSection} />
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Sticky sidebar */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          {/* Strength score */}
          <button
            type="button"
            onClick={() => jumpToSection("completion")}
            className="artifact p-5 sm:p-6 w-full text-left hover:bg-nude/20 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="eyebrow">Brand DNA strength</p>
              <p className="text-[10px] uppercase tracking-widest text-taupe">View detail →</p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="font-serif text-3xl leading-none tracking-tight">
                {completion.percent}<span className="text-taupe text-xl">%</span>
              </p>
              <p className="text-xs text-foreground text-right max-w-[18ch] leading-snug">{completion.tier.label}</p>
            </div>
            <div className="mt-3 h-px bg-border relative" aria-hidden>
              <div className="absolute left-0 bg-foreground" style={{ width: `${Math.max(2, completion.percent)}%`, height: "2px", top: "-0.5px" }} />
            </div>
            <p className="mt-3 text-xs text-taupe leading-relaxed">
              {completion.nextSteps[0] || "Your Brand DNA is in great shape."}
            </p>
          </button>

          {/* Save */}
          <div className="artifact p-5 sm:p-6">
            <p className="eyebrow mb-3">Save</p>
            <p className="text-sm text-taupe leading-relaxed mb-5">
              Save a draft any time, or publish to make this version the source of truth for generated content.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleSave("draft")}
                disabled={saving !== null}
                className="border hairline px-5 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-nude/30 transition-colors disabled:opacity-40 text-left"
              >
                {saving === "draft" ? "Saving draft…" : "Save as draft"}
              </button>
              <button
                onClick={() => handleSave("published")}
                disabled={saving !== null}
                className="bg-foreground text-offwhite px-5 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50 text-left"
              >
                {saving === "published" ? "Publishing…" : "Publish Brand DNA"}
              </button>
            </div>
            {savedAt && !error && <p className="mt-4 text-xs text-sage">Saved at {savedAt}.</p>}
            {error && (
              <div className="mt-4 border hairline border-foreground/20 bg-nude/30 p-3 text-xs text-foreground">{error}</div>
            )}
          </div>

          {/* What this powers */}
          <div className="artifact p-5 sm:p-6">
            <p className="eyebrow mb-3">What this powers</p>
            <p className="text-sm text-taupe leading-relaxed">
              Elle.Be.O will use these details to shape your content style, captions and visual direction.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
