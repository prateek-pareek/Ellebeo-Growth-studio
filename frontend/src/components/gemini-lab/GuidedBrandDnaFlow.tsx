import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { BrandPersona } from "./BrandPersona";
import { uploadBrandFile } from "@/lib/brand-dna/storage";
import {
  CLIENT_TYPES,
  ESSENCE_WORDS,
  GENDER_FOCUS,
  MOOD_META,
  MOODS,
  OBJECTIVE_META,
  OBJECTIVES,
  PALETTE_SEEDS,
  SERVICE_CATEGORIES,
  SERVICES_BY_CATEGORY,
  STEPS,
  TYPE_PAIRINGS,
  prettyChip,
  type EssenceWord,
  type GuidedDnaProfile,
  type MoodId,
  type ObjectiveId,
  type ServiceCategory,
} from "@/lib/gemini-lab-dna/contract";
import {
  completeGuidedDna,
  draftStory,
  loadGuidedDna,
  saveGuidedDna,
  scanWebsite,
  suggestAudience,
  suggestIdentity,
  suggestStrategy,
} from "@/lib/gemini-lab-dna/api";

const LAST_STEP = STEPS.length;

type Props = {
  applyBrandDna: boolean;
  onApplyChange: (on: boolean) => void;
  editing: boolean;
  /**
   * Where this is being shown. In the Studio it is one step of a generation
   * run, so it carries a step number and the "use my brand for this run"
   * switch. On the Brand page neither makes sense — of course your brand
   * applies to your brand — and they read as leftover machinery.
   */
  context?: "studio" | "brand";
  onEditingChange: (on: boolean) => void;
  onReady: (ready: boolean) => void;
};

export function GuidedBrandDnaFlow({ applyBrandDna, onApplyChange, editing, onEditingChange, onReady, context = "studio" }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<GuidedDnaProfile | null>(null);
  const [completed, setCompleted] = useState<GuidedDnaProfile | null>(null);
  const [seeded, setSeeded] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // The load below must run ONCE. It used to list the callbacks in its deps,
  // so a caller passing an inline arrow — the ordinary way to write a prop —
  // gave the effect a new identity on every render and it refetched forever.
  // Mounting this on the Brand page did exactly that and the API started
  // answering 429. Holding the callbacks in a ref keeps the latest ones
  // available without making them a reason to re-run.
  const cb = useRef({ onReady, onEditingChange });
  cb.current = { onReady, onEditingChange };

  useEffect(() => {
    let cancelled = false;
    loadGuidedDna()
      .then((state) => {
        if (cancelled) return;
        setDraft(state.draft);
        setStep(Math.min(LAST_STEP, state.currentStep || 1));
        setCompleted(state.profile);
        setSeeded(state.seededFromLegacy);
        cb.current.onReady(!!state.profile || !!state.hasProductionDna);
        if (!state.profile && !state.hasProductionDna) cb.current.onEditingChange(true);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error?.message || "Could not load guided Brand DNA.");
        cb.current.onReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (nextStep: number, nextDraft: GuidedDnaProfile) => {
    try {
      await saveGuidedDna(nextStep, nextDraft);
    } catch {
      /* autosave is best-effort */
    }
  }, []);

  const update = useCallback((patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = patch(prev);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => persist(step, next), 500);
      return next;
    });
  }, [persist, step]);

  async function go(next: number) {
    if (!draft) return;
    const clamped = Math.min(LAST_STEP, Math.max(1, next));
    setStep(clamped);
    await persist(clamped, draft);
  }

  async function handleComplete() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await completeGuidedDna(draft);
      setCompleted(res.profile);
      setDraft(res.profile);
      onReady(true);
      onEditingChange(false);
      toast.success("Guided Brand DNA saved for Gemini Lab.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || "Could not save Brand DNA.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft) {
    return (
      <div className="bg-card rounded-[8px] border border-border p-6">
        <p className="text-[16px] tracking-[0.01em] text-graphite-warm italic">Loading guided Brand DNA…</p>
      </div>
    );
  }

  if (!editing) {
    const card = completed || draft;
    return (
      <div className={context === "brand" ? "space-y-4" : "bg-card rounded-[8px] border border-border p-6 space-y-4"}>
        {context === "studio" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] tracking-[0.01em] text-graphite-warm">1 · Brand DNA</p>
              <span className="text-[14px] tracking-[0.01em] text-sage bg-sage/10 border border-sage/25 px-2 py-0.5 rounded-full">
                Guided
              </span>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyBrandDna}
                onChange={(e) => onApplyChange(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="block text-[16px] tracking-[0.01em] font-medium">Use Brand DNA</span>
                <span className="block text-[14px] tracking-[0.01em] text-graphite-warm mt-0.5">
                  {applyBrandDna
                    ? "Logo, palette and voice come from your production Brand DNA. Guided extras are optional."
                    : "Bypassed — generic cream chrome, no logo stamp."}
                </span>
              </span>
            </label>
          </>
        )}
        {/* The brand shown as a person and changed by describing it, rather
            than as forty fields across five steps. The full form is still
            there behind "Edit every field" — it is just no longer the way in. */}
        <div className={applyBrandDna ? "" : "opacity-40"}>
          <BrandPersona
            draft={card}
            onChange={(next) => {
              setDraft(next);
              void persist(step, next);
            }}
            onOpenFullEditor={() => onEditingChange(true)}
          />
        </div>
      </div>
    );
  }

  const currentLabel = STEPS[step - 1]?.label ?? "";

  return (
    <div className="space-y-6">
      {seeded && (
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
          Prefilled from your existing Brand DNA. Confirm or swap — nothing is written to the production brand form.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">Guided Brand DNA</p>
        <button
          type="button"
          onClick={() => onEditingChange(false)}
          className="text-[14px] tracking-[0.01em] text-graphite-warm hover:text-foreground"
        >
          Back to Lab
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-serif text-lg">{currentLabel}</p>
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">Step {step} of {LAST_STEP}</p>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-label={`Go to ${s.label}`}
              className={
                "h-1.5 flex-1 rounded-full transition-all " +
                (s.id === step ? "bg-ink" : s.id < step ? "bg-sage/50" : "bg-muted")
              }
            />
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6">
        <div className="bg-card rounded-[8px] border border-border p-6 space-y-5">
          {step === 1 && <StepAutofill draft={draft} update={update} />}
          {step === 2 && <StepIdentity draft={draft} update={update} />}
          {step === 3 && <StepAudienceStrategy draft={draft} update={update} />}
          {step === 4 && <StepStory draft={draft} update={update} />}
          {step === 5 && <StepConfirm draft={draft} />}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => go(step - 1)}
              className="inline-flex items-center gap-1 text-[14px] tracking-[0.01em] text-graphite-warm disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" /> Back
            </button>
            {step < LAST_STEP ? (
              <button
                type="button"
                onClick={() => go(step + 1)}
                className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] bg-foreground text-background px-5 py-2.5 rounded-full"
              >
                Continue <ChevronRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleComplete}
                className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] bg-foreground text-background px-5 py-2.5 rounded-full disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Save for Lab
              </button>
            )}
          </div>
        </div>
        <BrandCard draft={draft} />
      </div>
    </div>
  );
}

function BrandCard({ draft, compact }: { draft: GuidedDnaProfile; compact?: boolean }) {
  const mood = MOOD_META[draft.identity.mood];
  const obj = OBJECTIVE_META[draft.strategy.objective];
  // Quoted so multi-word family names resolve, with a category fallback so a
  // font that has not finished loading degrades to the right kind of face.
  const headingFont = `"${draft.identity.typography.heading}", Georgia, serif`;
  const bodyFont = `"${draft.identity.typography.body}", system-ui, sans-serif`;
  return (
    <div className="bg-card rounded-[8px] border border-border overflow-hidden">
      <div className="grid grid-cols-4 gap-px bg-border">
        {draft.identity.palette.map((hex, i) => (
          <div key={hex + i} className="bg-card">
            <span className="block h-16" style={{ background: hex }} />
            <span className="block px-3 py-2 text-[14px] tracking-[0.01em] text-graphite-warm uppercase">
              {hex}
            </span>
          </div>
        ))}
      </div>
      <div className="p-6 space-y-4" style={{ background: draft.identity.palette[0] }}>
        {draft.identity.logoUrl && (
          <img src={draft.identity.logoUrl} alt="" className="h-8 w-auto object-contain" />
        )}
        {/* Set in the studio's OWN faces, not the app's. The preview used to
            print the typeface names in Playfair, so the one decision it existed
            to show was the one thing it did not show. */}
        <p className="text-2xl" style={{ color: draft.identity.palette[2], fontFamily: headingFont }}>
          {draft.identity.brandName || "Your brand"}
        </p>
        <p className="text-[14px] tracking-[0.01em]" style={{ color: draft.identity.palette[2], fontFamily: bodyFont }}>
          {mood.label}
          {draft.identity.essence.length ? ` · ${draft.identity.essence.join(" · ")}` : ""}
        </p>
        {!compact && (
          <div className="rounded-[8px] p-4" style={{ background: draft.identity.palette[1] || "#fff" }}>
            <p className="text-[14px] tracking-[0.01em] mb-2" style={{ color: draft.identity.palette[2], opacity: 0.6, fontFamily: bodyFont }}>
              Sample post
            </p>
            <p className="text-xl leading-tight" style={{ fontFamily: headingFont, color: draft.identity.palette[2] }}>
              {obj.sampleHeadline}
            </p>
            <p className="mt-2 text-[16px] tracking-[0.01em]" style={{ fontFamily: bodyFont, color: draft.identity.palette[2], opacity: 0.8 }}>
              {draft.story.userWritten || draft.story.aiDrafted || mood.blurb}
            </p>
            <p className="mt-3 text-[14px] tracking-[0.01em]" style={{ fontFamily: bodyFont, color: draft.identity.palette[2], opacity: 0.55 }}>
              {draft.identity.typography.heading} / {draft.identity.typography.body}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-[14px] tracking-[0.01em] px-3.5 py-1.5 rounded-full border transition-all " +
        (selected
          ? "bg-ink/[0.06] text-ink border-ink"
          : "bg-muted text-graphite-warm border-transparent hover:border-ink/40 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 rounded border-border" />
      <span>
        <span className="block text-[16px] tracking-[0.01em] font-medium">{label}</span>
        <span className="block text-[14px] tracking-[0.01em] text-graphite-warm mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

const SCAN_STAGES = ["Reading your site…", "Finding your voice…", "Matching a mood…"];

function StepAutofill({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const category = draft.offering.serviceCategory as ServiceCategory | "";
  const services = category && category in SERVICES_BY_CATEGORY ? SERVICES_BY_CATEGORY[category] : [];
  const [scanUrl, setScanUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const stageTimer = useRef<number | null>(null);

  async function onScanWebsite() {
    const url = scanUrl.trim();
    if (!url) return;
    setScanning(true);
    setScanStage(0);
    stageTimer.current = window.setInterval(() => {
      setScanStage((s) => Math.min(SCAN_STAGES.length - 1, s + 1));
    }, 1400);
    try {
      const res = await scanWebsite(url.startsWith("http") ? url : `https://${url}`);
      update((d) => ({
        ...d,
        identity: {
          ...d.identity,
          brandName: res.brandName || d.identity.brandName,
          mood: res.mood,
          essence: res.essence as GuidedDnaProfile["identity"]["essence"],
          palette: (PALETTE_SEEDS[res.mood] as GuidedDnaProfile["identity"]["palette"]) || d.identity.palette,
          typography: TYPE_PAIRINGS[res.mood],
        },
        offering: {
          ...d.offering,
          serviceCategory: res.serviceCategory || d.offering.serviceCategory,
          services: res.services.length ? res.services : d.offering.services,
        },
        audience: {
          ...d.audience,
          ageMin: res.ageMin,
          ageMax: res.ageMax,
          genderFocus: (GENDER_FOCUS as readonly string[]).includes(res.genderFocus)
            ? (res.genderFocus as GuidedDnaProfile["audience"]["genderFocus"])
            : d.audience.genderFocus,
          clientTypes: res.clientTypes,
        },
        strategy: { ...d.strategy, objective: res.objective as ObjectiveId },
        story: { ...d.story, aiDrafted: res.storySentence || d.story.aiDrafted },
      }));
      toast.success("Pulled your brand profile from the site — review each step and adjust anything that's off.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that website.");
    } finally {
      if (stageTimer.current) window.clearInterval(stageTimer.current);
      setScanning(false);
    }
  }

  useEffect(() => () => {
    if (stageTimer.current) window.clearInterval(stageTimer.current);
  }, []);

  async function onLogo(file: File | null) {
    if (!file) {
      update((d) => ({ ...d, identity: { ...d.identity, logoUrl: null, logoAssetId: null } }));
      return;
    }
    const res = await uploadBrandFile(file, "logo");
    if (res.kind !== "ok") {
      toast.error(res.kind === "invalid" || res.kind === "error" ? res.message : "Sign in to upload a logo.");
      return;
    }
    update((d) => ({ ...d, identity: { ...d.identity, logoUrl: res.signedUrl, logoAssetId: res.path } }));
  }

  return (
    <>
      <div className="btn btn-ghost rounded-[8px] border-ink/30 bg-gradient-to-br from-brass/10 via-brass/5 to-transparent p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-ink" />
          <p className="font-serif text-xl">Start from your website</p>
        </div>
        <p className="text-[16px] tracking-[0.01em] text-graphite-warm">
          Paste your site's URL — we'll read it and pre-fill your mood, essence, audience and strategy. You review and adjust everything after.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={scanUrl}
            onChange={(e) => setScanUrl(e.target.value)}
            placeholder="yourstudio.com"
            disabled={scanning}
            className="flex-1 rounded-[8px] border border-border bg-background px-4 py-3 text-[16px] tracking-[0.01em]"
          />
          <button
            type="button"
            onClick={onScanWebsite}
            disabled={scanning || !scanUrl.trim()}
            className="btn btn-primary flex rounded-[24px] text-[14px] tracking-[0.01em]"
          >
            {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {scanning ? SCAN_STAGES[scanStage] : "Auto-fill"}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        <p className="text-[16px] tracking-[0.01em] text-graphite-warm">Your name and logo, just for Gemini Lab — separate from your production Brand DNA.</p>
        <div>
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">Brand name</p>
          <input
            type="text"
            value={draft.identity.brandName}
            onChange={(e) => update((d) => ({ ...d, identity: { ...d.identity, brandName: e.target.value } }))}
            placeholder="Your studio name"
            className="w-full rounded-[8px] border border-border bg-background px-4 py-2.5 text-[16px] tracking-[0.01em]"
          />
        </div>
        {draft.identity.logoUrl ? (
          <div className="flex items-center gap-3">
            <img src={draft.identity.logoUrl} alt="" className="h-10 w-auto object-contain" />
            <button type="button" onClick={() => onLogo(null)} className="text-[14px] tracking-[0.01em] text-graphite-warm underline underline-offset-4 hover:text-foreground">
              Remove
            </button>
          </div>
        ) : (
          <label className="block cursor-pointer rounded-[8px] border border-dashed border-border bg-muted/60 p-3">
            <span className="text-[14px] tracking-[0.01em] text-graphite-warm">Logo</span>
            <p className="mt-2 text-[14px] tracking-[0.01em] text-graphite-warm">Click to upload a logo for Gemini Lab</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <div>
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">Category</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <Chip
                key={c}
                selected={draft.offering.serviceCategory === c}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    offering: { ...d.offering, serviceCategory: c, services: [] },
                    config: {
                      ...d.config,
                      medicalAestheticsCompliance: c === "medical_aesthetics" ? true : d.config.medicalAestheticsCompliance,
                    },
                  }))
                }
              >
                {prettyChip(c)}
              </Chip>
            ))}
          </div>
        </div>
        {services.length > 0 && (
          <div>
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">Services</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const on = draft.offering.services.includes(s);
                return (
                  <Chip
                    key={s}
                    selected={on}
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        offering: {
                          ...d.offering,
                          services: on ? d.offering.services.filter((x) => x !== s) : [...d.offering.services, s],
                        },
                      }))
                    }
                  >
                    {prettyChip(s)}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StepIdentity({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    setBusy(true);
    suggestIdentity({ serviceCategory: draft.offering.serviceCategory, services: draft.offering.services })
      .then((res) => {
        const top = res.moods[0];
        if (top && !draft.identity.essence.length) {
          update((d) => ({
            ...d,
            identity: {
              ...d.identity,
              mood: top.id,
              palette: (top.palette as GuidedDnaProfile["identity"]["palette"]) || PALETTE_SEEDS[top.id],
              typography: top.typePairing || TYPE_PAIRINGS[top.id],
              essence: (top.essenceHints || []).slice(0, 3) as EssenceWord[],
            },
          }));
        }
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [draft.offering.serviceCategory, draft.offering.services, draft.identity.essence.length, update]);

  function pickMood(id: MoodId) {
    update((d) => ({
      ...d,
      identity: {
        ...d.identity,
        mood: id,
        palette: PALETTE_SEEDS[id],
        typography: TYPE_PAIRINGS[id],
        essence: MOOD_META[id].essenceHints.slice(0, 3),
      },
    }));
  }

  function toggleEssence(word: EssenceWord) {
    update((d) => {
      const on = d.identity.essence.includes(word);
      const essence = on ? d.identity.essence.filter((w) => w !== word) : [...d.identity.essence, word].slice(0, 3);
      return { ...d, identity: { ...d.identity, essence } };
    });
  }

  return (
    <>
      <p className="text-[16px] tracking-[0.01em] text-graphite-warm">
        {busy ? "AI is ranking moods for your category…" : "Pick the mood that matches how you want your posts to feel."}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {MOODS.map((id) => {
          const selected = draft.identity.mood === id;
          const palette = PALETTE_SEEDS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => pickMood(id)}
              className={
                "text-left rounded-[8px] border overflow-hidden transition-all " +
                (selected ? "border-ink ring-2 ring-brass/30" : "border-border hover:border-ink/40")
              }
            >
              <div
                className="h-14"
                style={{ background: `linear-gradient(120deg, ${palette[0]}, ${palette[1]} 45%, ${palette[2]} 75%, ${palette[3]})` }}
              />
              <div className="p-3 bg-card">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] tracking-[0.01em] font-medium">{MOOD_META[id].label}</p>
                  {selected && <Check className="size-3.5 text-ink" />}
                </div>
                <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-0.5">{MOOD_META[id].blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
        Type · {draft.identity.typography.heading} / {draft.identity.typography.body}
      </p>
      <div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">Essence · pick up to 3</p>
        <div className="flex flex-wrap gap-2">
          {ESSENCE_WORDS.map((w) => (
            <Chip key={w} selected={draft.identity.essence.includes(w)} onClick={() => toggleEssence(w)}>
              {prettyChip(w)}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );
}

function StepAudienceStrategy({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const askedAudience = useRef(false);
  const askedStrategy = useRef(false);

  useEffect(() => {
    if (askedAudience.current) return;
    askedAudience.current = true;
    suggestAudience({ serviceCategory: draft.offering.serviceCategory, services: draft.offering.services })
      .then((res) => {
        update((d) => ({
          ...d,
          audience: {
            ageMin: res.ageMin,
            ageMax: res.ageMax,
            genderFocus: (GENDER_FOCUS as readonly string[]).includes(res.genderFocus)
              ? (res.genderFocus as GuidedDnaProfile["audience"]["genderFocus"])
              : d.audience.genderFocus,
            clientTypes: res.clientTypes,
          },
        }));
      })
      .catch(() => {});
  }, [draft.offering.serviceCategory, draft.offering.services, update]);

  useEffect(() => {
    if (askedStrategy.current) return;
    askedStrategy.current = true;
    suggestStrategy({ objective: draft.strategy.objective, services: draft.offering.services })
      .then((res) => {
        update((d) => ({
          ...d,
          strategy: {
            ...d.strategy,
            objective: (OBJECTIVES as readonly string[]).includes(res.objective)
              ? (res.objective as ObjectiveId)
              : d.strategy.objective,
          },
        }));
      })
      .catch(() => {});
  }, [draft.strategy.objective, draft.offering.services, update]);

  return (
    <>
      <div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">
          Age {draft.audience.ageMin}–{draft.audience.ageMax}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="range"
            min={18}
            max={65}
            value={draft.audience.ageMin}
            onChange={(e) =>
              update((d) => ({
                ...d,
                audience: { ...d.audience, ageMin: Math.min(Number(e.target.value), d.audience.ageMax) },
              }))
            }
          />
          <input
            type="range"
            min={18}
            max={65}
            value={draft.audience.ageMax}
            onChange={(e) =>
              update((d) => ({
                ...d,
                audience: { ...d.audience, ageMax: Math.max(Number(e.target.value), d.audience.ageMin) },
              }))
            }
          />
        </div>
      </div>
      <div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">Client type</p>
        <div className="flex flex-wrap gap-2">
          {CLIENT_TYPES.map((t) => {
            const on = draft.audience.clientTypes.includes(t);
            return (
              <Chip
                key={t}
                selected={on}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    audience: {
                      ...d.audience,
                      clientTypes: on
                        ? d.audience.clientTypes.filter((x) => x !== t)
                        : [...d.audience.clientTypes, t],
                    },
                  }))
                }
              >
                {prettyChip(t)}
              </Chip>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-2">What are you posting for?</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {OBJECTIVES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => update((d) => ({ ...d, strategy: { ...d.strategy, objective: id } }))}
              className={
                "text-left rounded-[8px] border p-3 " +
                (draft.strategy.objective === id ? "border-ink bg-ink/5" : "border-border bg-muted/40")
              }
            >
              <p className="text-[16px] tracking-[0.01em] font-medium">{OBJECTIVE_META[id].label}</p>
              <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-0.5">{OBJECTIVE_META[id].blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepStory({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function skipToAi() {
    setBusy(true);
    try {
      const res = await draftStory(draft);
      update((d) => ({ ...d, story: { ...d.story, aiDrafted: res.aiDrafted } }));
    } catch {
      toast.error("Could not draft a story. Continue anyway.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-[16px] tracking-[0.01em] text-graphite-warm">Optional. Skip and we'll draft one line from your selections.</p>
      <textarea
        value={draft.story.userWritten || ""}
        onChange={(e) => update((d) => ({ ...d, story: { ...d.story, userWritten: e.target.value || null } }))}
        rows={4}
        placeholder="What makes your work special?"
        className="w-full bg-muted border border-border rounded-[8px] px-3 py-2.5 text-[16px] tracking-[0.01em]"
      />
      <button
        type="button"
        onClick={skipToAi}
        disabled={busy}
        className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Skip — let AI draft it
      </button>
      {draft.story.aiDrafted && (
        <p className="text-[16px] tracking-[0.01em] text-graphite-warm leading-relaxed border border-border rounded-[8px] p-3">{draft.story.aiDrafted}</p>
      )}
      <div className="pt-2 border-t border-border">
        <Toggle
          label="Medical-aesthetics compliance"
          hint="Explicit. When on, Lab blocks client before/after photos."
          on={draft.config.medicalAestheticsCompliance}
          onChange={(medicalAestheticsCompliance) =>
            update((d) => ({ ...d, config: { ...d.config, medicalAestheticsCompliance } }))
          }
        />
      </div>
    </>
  );
}

function StepConfirm({ draft }: { draft: GuidedDnaProfile }) {
  return (
    <>
      <p className="text-[16px] tracking-[0.01em] text-graphite-warm">
        This writes a structured Lab profile only. Your production Brand DNA and /generate pipeline stay as they are.
      </p>
      <ul className="text-[16px] tracking-[0.01em] space-y-1.5">
        <li>{draft.identity.brandName} · {MOOD_META[draft.identity.mood].label}</li>
        <li>{prettyChip(draft.offering.serviceCategory)} · {draft.offering.services.map(prettyChip).join(", ") || "no services"}</li>
        <li>{OBJECTIVE_META[draft.strategy.objective].label}</li>
        <li>Compliance {draft.config.medicalAestheticsCompliance ? "on" : "off"}</li>
      </ul>
    </>
  );
}
