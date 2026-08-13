import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { uploadBrandFile } from "@/lib/brand-dna/storage";
import {
  CLIENT_TYPES,
  ESSENCE_WORDS,
  GENDER_FOCUS,
  LANGUAGE_VARIANTS,
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
  suggestAudience,
  suggestIdentity,
  suggestStrategy,
} from "@/lib/gemini-lab-dna/api";

type Props = {
  applyBrandDna: boolean;
  onApplyChange: (on: boolean) => void;
  editing: boolean;
  onEditingChange: (on: boolean) => void;
  onReady: (ready: boolean) => void;
};

export function GuidedBrandDnaFlow({ applyBrandDna, onApplyChange, editing, onEditingChange, onReady }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<GuidedDnaProfile | null>(null);
  const [completed, setCompleted] = useState<GuidedDnaProfile | null>(null);
  const [seeded, setSeeded] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGuidedDna()
      .then((state) => {
        if (cancelled) return;
        setDraft(state.draft);
        setStep(state.currentStep || 1);
        setCompleted(state.profile);
        setSeeded(state.seededFromLegacy);
        onReady(!!state.profile || !!state.hasProductionDna);
        if (!state.profile && !state.hasProductionDna) onEditingChange(true);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error?.message || "Could not load guided Brand DNA.");
        onReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onEditingChange, onReady]);

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
    const clamped = Math.min(7, Math.max(1, next));
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
      <div className="bg-card rounded-2xl shadow-elevated p-6">
        <p className="text-sm text-taupe italic">Loading guided Brand DNA…</p>
      </div>
    );
  }

  if (!editing) {
    const card = completed || draft;
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">1 · Brand DNA</p>
          <span className="text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2 py-0.5 rounded-full">
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
            <span className="block text-sm font-medium">Use Brand DNA</span>
            <span className="block text-xs text-taupe mt-0.5">
                  {applyBrandDna
                    ? "Logo, palette and voice come from your production Brand DNA. Guided extras are optional."
                    : "Bypassed — generic cream chrome, no logo stamp."}
            </span>
          </span>
        </label>
        <div className={applyBrandDna ? "" : "opacity-40"}>
          <BrandCard draft={card} compact />
        </div>
        <button
          type="button"
          onClick={() => onEditingChange(true)}
          className="text-[11px] uppercase tracking-[0.22em] text-taupe hover:text-foreground"
        >
          {completed ? "Edit guided Brand DNA" : "Continue setup"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {seeded && (
        <p className="text-xs text-taupe">
          Prefilled from your existing Brand DNA. Confirm or swap — nothing is written to the production brand form.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Guided Brand DNA</p>
        <button
          type="button"
          onClick={() => onEditingChange(false)}
          className="text-[11px] uppercase tracking-[0.22em] text-taupe hover:text-foreground"
        >
          Back to Lab
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className={
              "text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border " +
              (step === s.id
                ? "bg-brass text-white border-brass"
                : s.id < step
                  ? "bg-sage/10 text-sage border-sage/25"
                  : "bg-muted text-taupe border-transparent")
            }
          >
            {s.id} · {s.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6">
        <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-5">
          {step === 1 && <StepAutofill draft={draft} update={update} />}
          {step === 2 && <StepIdentity draft={draft} update={update} />}
          {step === 3 && <StepAudience draft={draft} update={update} />}
          {step === 4 && <StepStrategy draft={draft} update={update} />}
          {step === 5 && <StepConfig draft={draft} update={update} />}
          {step === 6 && <StepStory draft={draft} update={update} />}
          {step === 7 && <StepConfirm draft={draft} />}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => go(step - 1)}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-taupe disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" /> Back
            </button>
            {step < 7 ? (
              <button
                type="button"
                onClick={() => go(step + 1)}
                className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] bg-foreground text-background px-5 py-2.5 rounded-full"
              >
                Continue <ChevronRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleComplete}
                className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] bg-foreground text-background px-5 py-2.5 rounded-full disabled:opacity-50"
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
  return (
    <div className="bg-card rounded-2xl shadow-elevated overflow-hidden">
      <div className="h-3 flex">
        {draft.identity.palette.map((hex) => (
          <span key={hex} className="flex-1" style={{ background: hex }} />
        ))}
      </div>
      <div className="p-6 space-y-4" style={{ background: draft.identity.palette[0] }}>
        {draft.identity.logoUrl && (
          <img src={draft.identity.logoUrl} alt="" className="h-8 w-auto object-contain" />
        )}
        <p className="font-serif text-2xl" style={{ color: draft.identity.palette[2] }}>
          {draft.identity.brandName || "Your brand"}
        </p>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: draft.identity.palette[2] }}>
          {mood.label}
          {draft.identity.essence.length ? ` · ${draft.identity.essence.join(" · ")}` : ""}
        </p>
        {!compact && (
          <div className="rounded-xl p-4" style={{ background: "#fff" }}>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-2">Sample post</p>
            <p className="font-serif text-xl leading-tight">{obj.sampleHeadline}</p>
            <p className="mt-2 text-sm text-taupe">
              {draft.story.userWritten || draft.story.aiDrafted || mood.blurb}
            </p>
            <p className="mt-3 text-[10px] uppercase tracking-widest text-taupe">
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
        "text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
        (selected
          ? "bg-brass text-white border-brass"
          : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function StepAutofill({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const category = draft.offering.serviceCategory as ServiceCategory | "";
  const services = category && category in SERVICES_BY_CATEGORY ? SERVICES_BY_CATEGORY[category] : [];

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
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Autofill</p>
      <p className="text-sm text-taupe">Name, logo and palette are locked from your Brand DNA. Confirm category and services only.</p>
      {draft.identity.logoUrl ? (
        <div className="flex items-center gap-3">
          <img src={draft.identity.logoUrl} alt="" className="h-10 w-auto object-contain" />
          <p className="text-xs text-taupe">Logo from Brand DNA</p>
        </div>
      ) : (
        <label className="block cursor-pointer rounded-xl border border-dashed border-border bg-muted/60 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-taupe">Logo</span>
          <p className="mt-2 text-xs text-taupe">No logo on Brand DNA — click to upload for this Lab run</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Category</p>
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
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Services</p>
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

  function shufflePalette() {
    const seed = PALETTE_SEEDS[draft.identity.mood];
    const rotated: [string, string, string, string] = [seed[1], seed[2], seed[3], seed[0]];
    const next = draft.identity.palette[0] === seed[0] ? rotated : seed;
    update((d) => ({ ...d, identity: { ...d.identity, palette: next } }));
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
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Identity</p>
      {busy && <p className="text-xs text-taupe italic">AI is ranking moods…</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {MOODS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => pickMood(id)}
            className={
              "text-left rounded-xl border p-3 transition-all " +
              (draft.identity.mood === id ? "border-brass bg-brass/5" : "border-border bg-muted/40")
            }
          >
            <div className="flex h-2 rounded-full overflow-hidden mb-2">
              {PALETTE_SEEDS[id].map((hex) => (
                <span key={hex} className="flex-1" style={{ background: hex }} />
              ))}
            </div>
            <p className="text-sm font-medium">{MOOD_META[id].label}</p>
            <p className="text-xs text-taupe mt-0.5">{MOOD_META[id].blurb}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-taupe">Palette</p>
        <button type="button" onClick={shufflePalette} className="text-[10px] uppercase tracking-widest text-brass">
          Shuffle swatches
        </button>
      </div>
      <div className="flex gap-2">
        {draft.identity.palette.map((hex) => (
          <span key={hex} className="size-8 rounded-full border border-border" style={{ background: hex }} />
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-widest text-taupe">
        Type · {draft.identity.typography.heading} / {draft.identity.typography.body}
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Essence · pick up to 3</p>
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

function StepAudience({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
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

  return (
    <>
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Audience & reach</p>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">
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
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Gender focus</p>
        <div className="flex flex-wrap gap-2">
          {GENDER_FOCUS.map((g) => (
            <Chip
              key={g}
              selected={draft.audience.genderFocus === g}
              onClick={() => update((d) => ({ ...d, audience: { ...d.audience, genderFocus: g } }))}
            >
              {prettyChip(g)}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Client type</p>
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
    </>
  );
}

function StepStrategy({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    suggestStrategy({ objective: draft.strategy.objective, services: draft.offering.services })
      .then((res) => {
        update((d) => ({
          ...d,
          strategy: {
            objective: (OBJECTIVES as readonly string[]).includes(res.objective)
              ? (res.objective as ObjectiveId)
              : d.strategy.objective,
            postsPerWeek: res.postsPerWeek,
            bookingTargetPerMonth: res.bookingTargetPerMonth,
          },
        }));
      })
      .catch(() => {});
  }, [draft.strategy.objective, draft.offering.services, update]);

  return (
    <>
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Strategy</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {OBJECTIVES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => update((d) => ({ ...d, strategy: { ...d.strategy, objective: id } }))}
            className={
              "text-left rounded-xl border p-3 " +
              (draft.strategy.objective === id ? "border-brass bg-brass/5" : "border-border bg-muted/40")
            }
          >
            <p className="text-sm font-medium">{OBJECTIVE_META[id].label}</p>
            <p className="text-xs text-taupe mt-0.5">{OBJECTIVE_META[id].blurb}</p>
          </button>
        ))}
      </div>
      <Stepper
        label="Posts / week"
        value={draft.strategy.postsPerWeek}
        min={1}
        max={14}
        onChange={(postsPerWeek) => update((d) => ({ ...d, strategy: { ...d.strategy, postsPerWeek } }))}
      />
      <Stepper
        label="Booking target / month"
        value={draft.strategy.bookingTargetPerMonth}
        min={1}
        max={80}
        onChange={(bookingTargetPerMonth) =>
          update((d) => ({ ...d, strategy: { ...d.strategy, bookingTargetPerMonth } }))
        }
      />
    </>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-widest text-taupe">{label}</p>
      <div className="flex items-center gap-3">
        <button type="button" className="size-8 rounded-full border border-border" onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <span className="w-8 text-center font-serif text-xl">{value}</span>
        <button type="button" className="size-8 rounded-full border border-border" onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

function StepConfig({
  draft,
  update,
}: {
  draft: GuidedDnaProfile;
  update: (patch: (d: GuidedDnaProfile) => GuidedDnaProfile) => void;
}) {
  return (
    <>
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Config</p>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Spelling</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_VARIANTS.map((v) => (
            <Chip
              key={v}
              selected={draft.config.languageVariant === v}
              onClick={() => update((d) => ({ ...d, config: { ...d.config, languageVariant: v } }))}
            >
              {v}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {(["instagram", "facebook", "tiktok"] as const).map((p) => (
            <Chip
              key={p}
              selected={draft.config.platforms[p]}
              onClick={() =>
                update((d) => ({
                  ...d,
                  config: { ...d.config, platforms: { ...d.config.platforms, [p]: !d.config.platforms[p] } },
                }))
              }
            >
              {p}
            </Chip>
          ))}
        </div>
      </div>
      <Toggle
        label="Medical-aesthetics compliance"
        hint="Explicit. When on, Lab blocks client before/after photos."
        on={draft.config.medicalAestheticsCompliance}
        onChange={(medicalAestheticsCompliance) =>
          update((d) => ({ ...d, config: { ...d.config, medicalAestheticsCompliance } }))
        }
      />
      <Toggle
        label="Use asset library"
        hint="On if you don’t have much of your own media yet."
        on={draft.config.useAssetLibrary}
        onChange={(useAssetLibrary) => update((d) => ({ ...d, config: { ...d.config, useAssetLibrary } }))}
      />
    </>
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
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-taupe mt-0.5">{hint}</span>
      </span>
    </label>
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
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Your words</p>
      <p className="text-sm text-taupe">Optional. Skip and we’ll draft one line from your selections.</p>
      <textarea
        value={draft.story.userWritten || ""}
        onChange={(e) => update((d) => ({ ...d, story: { ...d.story, userWritten: e.target.value || null } }))}
        rows={4}
        placeholder="What makes your work special?"
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm"
      />
      <button
        type="button"
        onClick={skipToAi}
        disabled={busy}
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-taupe hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Skip — let AI draft it
      </button>
      {draft.story.aiDrafted && (
        <p className="text-sm text-taupe leading-relaxed border border-border rounded-xl p-3">{draft.story.aiDrafted}</p>
      )}
    </>
  );
}

function StepConfirm({ draft }: { draft: GuidedDnaProfile }) {
  return (
    <>
      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Confirm</p>
      <p className="text-sm text-taupe">
        This writes a structured Lab profile only. Your production Brand DNA and /generate pipeline stay as they are.
      </p>
      <ul className="text-sm space-y-1.5">
        <li>{draft.identity.brandName} · {MOOD_META[draft.identity.mood].label}</li>
        <li>{prettyChip(draft.offering.serviceCategory)} · {draft.offering.services.map(prettyChip).join(", ") || "no services"}</li>
        <li>{OBJECTIVE_META[draft.strategy.objective].label} · {draft.strategy.postsPerWeek}/wk</li>
        <li>{draft.config.languageVariant} spelling · compliance {draft.config.medicalAestheticsCompliance ? "on" : "off"}</li>
      </ul>
    </>
  );
}
