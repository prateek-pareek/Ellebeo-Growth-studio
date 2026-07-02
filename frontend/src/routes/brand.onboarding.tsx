import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadBrandDnaRecord, saveBrandDnaRecord } from "@/lib/providers/brand-dna-save";
import { EMPTY_BRAND_DNA, SECTIONS, type BrandDnaRecord, type SectionId, type SectionDef } from "@/lib/brand-dna/schema";
import { SectionBody } from "@/lib/brand-dna/sections";
import { computeCompletion } from "@/lib/brand-dna/completion";

export const Route = createFileRoute("/brand/onboarding")({
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

function BrandDnaForm() {
  const [record, setRecord] = useState<BrandDnaRecord>(EMPTY_BRAND_DNA);
  const [openSection, setOpenSection] = useState<string>(SECTIONS[0].id);
  const [activeGroup, setActiveGroup] = useState<GroupName>("Brand");
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadBrandDnaRecord()
      .then((res) => { if (res.kind === "ok") setRecord(res.record); })
      .finally(() => setLoading(false));
  }, []);

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
      <p className="text-xs text-taupe/60 mb-8">
        {loading ? "Loading your saved Brand DNA…" : "Live — changes save to your account."}
      </p>

      {/* Group tabs */}
      <div role="tablist" className="flex flex-wrap gap-px bg-border border hairline mb-8">
        {GROUPS.map((g) => {
          const count = sectionsByGroup[g].length;
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
              className={"px-5 py-3 text-left transition-colors flex-1 min-w-[100px] " + (active ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
            >
              <p className={"text-[10px] uppercase tracking-[0.15em] mb-1 " + (active ? "text-nude/70" : "text-taupe")}>{g}</p>
              <p className={"text-xs font-medium " + (active ? "text-offwhite" : "text-foreground")}>{count} {count === 1 ? "area" : "areas"}</p>
            </button>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-12 gap-8 lg:gap-12">

        {/* Accordion sections */}
        <div className="col-span-12 lg:col-span-8 space-y-3">
          {activeSections.map((s) => {
            const open = openSection === s.id;
            return (
              <section key={s.id} id={`section-${s.id}`} className="artifact scroll-mt-24">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenSection(open ? "" : s.id)}
                  className="w-full text-left flex items-start justify-between gap-4 p-5 sm:p-6 hover:bg-nude/20 transition-colors"
                >
                  <div className="flex-1">
                    <h2 className="font-serif text-2xl leading-snug">{s.title}</h2>
                    <p className="text-xs text-taupe mt-1 leading-relaxed">{s.help}</p>
                  </div>
                  <span className={"text-sm mt-0.5 shrink-0 transition-opacity " + (open ? "text-taupe" : "text-taupe/30")} aria-hidden>
                    {open ? "−" : "+"}
                  </span>
                </button>

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
