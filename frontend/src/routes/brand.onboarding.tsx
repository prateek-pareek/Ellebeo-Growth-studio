import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/providers/auth-provider";
import {
  BRAND_MOODS, BRAND_OBJECTIVES, GENDER_FOCUS_OPTIONS, LANGUAGE_VARIANTS, ESSENCE_WORDS, TYPE_PAIRINGS,
  type BrandDnaV2Contract, type BrandMoodV2,
} from "@/lib/brand-dna/v2-schema";
import { MOOD_META, TYPE_META, OBJECTIVE_META } from "@/lib/brand-dna/v2-presentation";

export const Route = createFileRoute("/brand/onboarding")({
  head: () => ({
    meta: [
      { title: "Brand DNA — Guided Setup — Elle.Be.O Growth" },
      { name: "description", content: "AI proposes, you confirm — build your Brand DNA in minutes." },
    ],
  }),
  component: BrandDnaOnboardingV2,
});

// Real categorisation used elsewhere in the app (service-guardrails.ts ServiceCategory) — not invented for this flow.
const SERVICE_CATEGORIES: { id: string; label: string }[] = [
  { id: "hair_colour", label: "Hair Colour" },
  { id: "hair_cut_style", label: "Hair Cut & Style" },
  { id: "hair_extensions", label: "Hair Extensions" },
  { id: "laser_treatments", label: "Laser Treatments" },
  { id: "injectables_cosmetic", label: "Injectables & Cosmetic" },
  { id: "skin_treatments", label: "Skin Treatments" },
  { id: "nail_services", label: "Nail Services" },
  { id: "makeup", label: "Makeup" },
  { id: "lashes_brows", label: "Lashes & Brows" },
  { id: "massage_body", label: "Massage & Body" },
  { id: "general", label: "General / Other" },
];

const STEPS = [
  { n: 1, label: "Autofill", sub: "Logo, name, category" },
  { n: 2, label: "Identity", sub: "Mood, palette, type" },
  { n: 3, label: "Audience", sub: "Who you're speaking to" },
  { n: 4, label: "Strategy", sub: "Objective & cadence" },
  { n: 5, label: "Config", sub: "Language, platforms" },
  { n: 6, label: "Your words", sub: "One optional line" },
  { n: 7, label: "Confirm", sub: "Review & finish" },
] as const;

const ANNOTATIONS: Record<number, string> = {
  1: "Brand name is pre-filled from your account. Logo has no earlier source today, so this is a real, fresh upload.",
  2: "Palette and essence hints come from the AI suggestion endpoint when available, and fall back to fixed presets if it's offline. Custom is the one escape hatch: a label + explicit hex values, never free text.",
  3: "Sliders and chips instead of a “describe your ideal client” paragraph.",
  4: "5 fixed objective cards instead of a goals paragraph.",
  5: "Compliance is an explicit toggle — never inferred from text. Turning it on enforces AHPRA guardrails in code.",
  6: "The only free-text moment in the whole flow, and it's optional.",
  7: "Saving here writes the fixed schemaVersion: 2 object — enums and hex codes, plus one optional sentence.",
};

function emptyContract(tenantId: string, brandName: string): BrandDnaV2Contract {
  return {
    schemaVersion: 2,
    technicianId: tenantId,
    identity: { brandName, logoAssetId: null, palette: MOOD_META.SOFT_GLAM.palette, mood: "SOFT_GLAM", customMoodLabel: null, typography: { heading: null, body: null }, essence: [] },
    offering: { serviceCategory: "", services: [], signatureHandle: null, serviceAreas: [] },
    audience: { ageMin: 18, ageMax: 65, genderFocus: "ALL", clientTypes: [] },
    strategy: { objective: "PREMIUM_CLIENTS", postsPerWeek: 3, bookingTargetPerMonth: 0 },
    config: { languageVariant: "AU", platforms: { instagram: true, facebook: false, tiktok: false }, medicalAestheticsCompliance: false, useAssetLibrary: true },
    story: { userWritten: null, aiDrafted: null },
    meta: { completedAt: null, source: "guided_v2" },
  };
}

function paletteForMood(contract: BrandDnaV2Contract): string[] {
  if (contract.identity.mood === "CUSTOM") return contract.identity.palette;
  return MOOD_META[contract.identity.mood]?.palette ?? contract.identity.palette;
}

function moodLabel(contract: BrandDnaV2Contract): string {
  return contract.identity.mood === "CUSTOM"
    ? contract.identity.customMoodLabel || "Your custom mood"
    : MOOD_META[contract.identity.mood]?.label ?? contract.identity.mood;
}

type IdentitySuggestion = { moods: { id: string; label: string; palette: string[]; essenceHints: string[] }[]; typePairing: string };

// ── Small presentational pieces ─────────────────────────────────────────────

function Chip({ selected, disabled, onClick, children }: { selected?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        selected ? "bg-brass border-brass text-white" : disabled ? "opacity-40 cursor-not-allowed border-border" : "border-border bg-background hover:border-taupe"
      }`}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="text-xs font-medium mb-2.5 flex items-center gap-2">
      {children}
      {hint && <span className="text-taupe font-normal">{hint}</span>}
    </div>
  );
}

function Stepper({ value, step = 1, onChange }: { value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
      <button type="button" className="w-8 h-8 hover:bg-muted" onClick={() => onChange(Math.max(0, value - step))}>–</button>
      <span className="w-12 text-center text-sm tabular-nums">{value}</span>
      <button type="button" className="w-8 h-8 hover:bg-muted" onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}

function ToggleRow({ name, desc, on, onToggle }: { name: string; desc?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-b-0">
      <div>
        <div className="text-sm">{name}</div>
        {desc && <div className="text-xs text-taupe max-w-[40ch] mt-0.5 leading-relaxed">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-10 h-[23px] rounded-full flex-shrink-0 transition-colors ${on ? "bg-brass" : "bg-border"}`}
      >
        <span className={`absolute top-[2px] left-[2px] w-[19px] h-[19px] rounded-full bg-white shadow transition-transform ${on ? "translate-x-[17px]" : ""}`} />
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function BrandDnaOnboardingV2() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [contract, setContract] = useState<BrandDnaV2Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [identitySuggestion, setIdentitySuggestion] = useState<IdentitySuggestion | null>(null);
  const [suggestLoading, setSuggestLoading] = useState<Record<number, boolean>>({});
  const fetchedFor = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/brand-dna/v2");
        const existing = res.data?.data ?? res.data;
        if (existing) {
          setContract(existing);
        } else {
          setContract(emptyContract(user?.tenant?.id ?? "", user?.tenant?.businessName ?? ""));
        }
      } catch {
        setContract(emptyContract(user?.tenant?.id ?? "", user?.tenant?.businessName ?? ""));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((patch: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => {
    setContract((prev) => (prev ? patch(prev) : prev));
  }, []);

  // Debounced autosave — per-step, resumable.
  useEffect(() => {
    if (!contract || loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.put("/brand-dna/v2", contract);
      } catch {
        // Silent — autosave retries on next change; explicit "Save & finish" on step 7 surfaces errors.
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [contract, loading]);

  const fetchIdentitySuggestion = useCallback(async () => {
    if (!contract || fetchedFor.current.has("identity")) return;
    fetchedFor.current.add("identity");
    setSuggestLoading((s) => ({ ...s, 2: true }));
    try {
      const res = await api.post("/brand-dna/suggest/identity", {
        serviceCategory: contract.offering.serviceCategory, services: contract.offering.services,
      });
      setIdentitySuggestion(res.data?.data ?? res.data);
    } catch {
      // Flag off or offline — fall back to static MOOD_META order, already the default render.
    } finally {
      setSuggestLoading((s) => ({ ...s, 2: false }));
    }
  }, [contract]);

  const fetchEssenceSuggestion = useCallback(async (mood: string) => {
    const key = `essence:${mood}`;
    if (fetchedFor.current.has(key)) return;
    fetchedFor.current.add(key);
    try {
      const res = await api.post("/brand-dna/suggest/essence", { mood, services: contract?.offering.services ?? [] });
      const suggestion = res.data?.data ?? res.data;
      if (suggestion?.essence?.length) {
        update((c) => (c.identity.essence.length === 0 ? { ...c, identity: { ...c.identity, essence: suggestion.essence.slice(0, 3) } } : c));
      }
    } catch { /* keep whatever is selected */ }
  }, [contract, update]);

  const fetchAudienceSuggestion = useCallback(async () => {
    if (!contract || fetchedFor.current.has("audience")) return;
    fetchedFor.current.add("audience");
    try {
      const res = await api.post("/brand-dna/suggest/audience", {
        serviceCategory: contract.offering.serviceCategory, services: contract.offering.services,
      });
      const s = res.data?.data ?? res.data;
      if (s) update((c) => ({ ...c, audience: { ...c.audience, ageMin: s.ageMin ?? c.audience.ageMin, ageMax: s.ageMax ?? c.audience.ageMax, genderFocus: s.genderFocus ?? c.audience.genderFocus, clientTypes: c.audience.clientTypes.length === 0 ? (s.clientTypes ?? []) : c.audience.clientTypes } }));
    } catch { /* keep defaults */ }
  }, [contract, update]);

  const fetchStrategySuggestion = useCallback(async () => {
    if (!contract || fetchedFor.current.has("strategy")) return;
    fetchedFor.current.add("strategy");
    try {
      const res = await api.post("/brand-dna/suggest/strategy", { services: contract.offering.services });
      const s = res.data?.data ?? res.data;
      if (s) update((c) => ({ ...c, strategy: { objective: s.objective ?? c.strategy.objective, postsPerWeek: s.postsPerWeek ?? c.strategy.postsPerWeek, bookingTargetPerMonth: s.bookingTargetPerMonth ?? c.strategy.bookingTargetPerMonth } }));
    } catch { /* keep defaults */ }
  }, [contract, update]);

  useEffect(() => {
    if (loading || !contract) return;
    if (step === 2) fetchIdentitySuggestion();
    if (step === 3) fetchAudienceSuggestion();
    if (step === 4) fetchStrategySuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/brand-dna/upload-logo", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const url = res.data?.data?.url ?? res.data?.url;
      if (url) update((c) => ({ ...c, identity: { ...c.identity, logoAssetId: url } }));
      toast.success("Logo uploaded.");
    } catch {
      toast.error("Logo upload failed. Please try again.");
    } finally {
      setLogoUploading(false);
    }
  };

  const finish = async () => {
    if (!contract) return;
    setSaving(true);
    try {
      await api.put("/brand-dna/v2", { ...contract, meta: { ...contract.meta, completedAt: new Date().toISOString() } });
      toast.success("Brand DNA saved.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !contract) {
    return <div className="max-w-5xl mx-auto px-6 py-16 text-taupe text-sm">Loading your Brand DNA…</div>;
  }

  const palette = paletteForMood(contract);

  return (
    <div className="max-w-[1180px] mx-auto px-6 py-8 pb-16">
      <div className="flex items-baseline justify-between gap-4 mb-7 flex-wrap">
        <h1 className="page-title">Brand DNA <em className="italic text-taupe font-normal">— Guided Setup</em></h1>
        <div className="flex items-center gap-3.5">
          <span className="text-xs text-taupe border border-border rounded-full px-3 py-1 tabular-nums">
            {saving ? "Saving…" : `Step ${step} of 7`}
          </span>
          <Link to="/brand" className="text-sm text-taupe hover:text-foreground border-b border-transparent hover:border-taupe">Save &amp; exit</Link>
        </div>
      </div>

      <div className="grid gap-7 items-start" style={{ gridTemplateColumns: "232px minmax(0,1fr) 320px" }}>
        {/* RAIL */}
        <nav className="flex flex-col gap-0.5 sticky top-6">
          {STEPS.map((s) => (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                s.n === step ? "bg-card border border-border shadow-elevated" : "hover:bg-muted/60"
              }`}
            >
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] tabular-nums flex-shrink-0 ${
                s.n === step ? "bg-brass border-brass text-white" : s.n < step ? "bg-sage border-sage text-white" : "border-border text-taupe"
              }`}>
                {s.n < step ? <Check className="size-3" /> : s.n}
              </span>
              <span className="text-[13.5px] leading-tight">
                {s.label}
                <span className="block text-[11px] text-taupe mt-0.5">{s.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        {/* PANEL */}
        <div>
          <div className="bg-card border border-border rounded-2xl shadow-elevated p-8 min-h-[480px]">

            {step === 1 && (
              <Step1Autofill contract={contract} update={update} onLogoUpload={handleLogoUpload} logoUploading={logoUploading} />
            )}
            {step === 2 && (
              <Step2Identity contract={contract} update={update} suggestion={identitySuggestion} suggestLoading={!!suggestLoading[2]} onMoodChange={(mood) => fetchEssenceSuggestion(mood)} />
            )}
            {step === 3 && <Step3Audience contract={contract} update={update} />}
            {step === 4 && <Step4Strategy contract={contract} update={update} />}
            {step === 5 && <Step5Config contract={contract} update={update} />}
            {step === 6 && <Step6Words contract={contract} update={update} />}
            {step === 7 && <Step7Confirm contract={contract} palette={palette} />}

            <div className="flex justify-between items-center mt-8 pt-5 border-t border-border/60">
              <span className="text-xs text-taupe tabular-nums">Step {step} of 7</span>
              <div className="flex gap-2.5">
                {step > 1 && (
                  <button onClick={() => setStep(step - 1)} className="rounded-full border border-border px-5 py-2.5 text-[13.5px] hover:bg-muted/60">Back</button>
                )}
                {step < 7 ? (
                  <button onClick={() => setStep(step + 1)} className="rounded-full bg-charcoal text-offwhite px-5 py-2.5 text-[13.5px]">Continue</button>
                ) : (
                  <button onClick={finish} className="rounded-full bg-brass text-white px-5 py-2.5 text-[13.5px]">Save &amp; finish</button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 border border-dashed border-border rounded-xl px-4 py-3.5 text-xs text-taupe leading-relaxed">
            <b className="text-foreground">Why this step, this way:</b> {ANNOTATIONS[step]}
          </div>
        </div>

        {/* BRAND CARD */}
        <div className="sticky top-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-taupe mb-2.5 pl-0.5">Live preview</div>
          <BrandCard contract={contract} palette={palette} step={step} />
        </div>
      </div>
    </div>
  );
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

function Step1Autofill({ contract, update, onLogoUpload, logoUploading }: {
  contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; logoUploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">Let's start with what we already know</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">Confirm each one — nothing here needs typing from scratch, except your logo.</p>
      </div>

      <div className="mb-7">
        <FieldLabel>Logo</FieldLabel>
        <div className="flex items-center gap-4 border border-border rounded-xl p-4 bg-background">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-[68px] h-[68px] rounded-xl border-[1.5px] border-dashed border-border bg-muted/60 flex items-center justify-center flex-shrink-0 overflow-hidden hover:border-taupe"
          >
            {logoUploading ? <span className="text-xs text-taupe">…</span> : contract.identity.logoAssetId ? (
              <img src={contract.identity.logoAssetId} className="w-full h-full object-cover" />
            ) : <Upload className="size-5 text-taupe" />}
          </button>
          <div>
            <div className="text-[13.5px] mb-0.5">Upload your logo</div>
            <div className="text-xs text-taupe max-w-[38ch] leading-relaxed">PNG or SVG with a transparent background works best.</div>
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 rounded-full border border-border px-4 py-1.5 text-xs hover:bg-muted/60">Choose file</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoUpload} />
          </div>
        </div>
      </div>

      <div className="mb-7">
        <FieldLabel>Brand name</FieldLabel>
        <input
          type="text"
          value={contract.identity.brandName}
          onChange={(e) => update((c) => ({ ...c, identity: { ...c.identity, brandName: e.target.value } }))}
          className="w-full border border-border rounded-xl px-4 py-3 text-[15px] bg-background outline-none focus:border-brass focus:ring-2 focus:ring-brass/15"
        />
      </div>

      <div>
        <FieldLabel>Service category</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SERVICE_CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              selected={contract.offering.serviceCategory === cat.id}
              onClick={() => update((c) => ({ ...c, offering: { ...c.offering, serviceCategory: cat.id, services: c.offering.services.includes(cat.id) ? c.offering.services : [...c.offering.services, cat.id] } }))}
            >
              {cat.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

function Step2Identity({ contract, update, suggestion, suggestLoading, onMoodChange }: {
  contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void;
  suggestion: IdentitySuggestion | null; suggestLoading: boolean; onMoodChange: (mood: string) => void;
}) {
  const moodOrder = suggestion?.moods?.length ? suggestion.moods.map((m) => m.id) : BRAND_MOODS;
  const hintsById: Record<string, string> = {};
  suggestion?.moods?.forEach((m) => { if (m.essenceHints?.[0]) hintsById[m.id] = m.essenceHints[0]; });

  const selectMood = (mood: BrandMoodV2) => {
    update((c) => {
      const preset = mood !== "CUSTOM" ? (suggestion?.moods.find((m) => m.id === mood)?.palette ?? MOOD_META[mood as (typeof BRAND_MOODS)[number]].palette) : c.identity.palette;
      return { ...c, identity: { ...c.identity, mood, palette: mood === "CUSTOM" ? (c.identity.palette.length === 5 ? c.identity.palette : ["#D9C9B8", "#8A7355", "#FFF8F0", "#5C4A34", "#2A2118"]) : preset } };
    });
    if (mood !== "CUSTOM") onMoodChange(mood);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">Pick the mood that feels like you</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">Each one comes with a starter palette. Swap anything — this is a first guess, not a final answer.{suggestLoading && " Personalising to your category…"}</p>
      </div>

      <div className="mb-6">
        <FieldLabel>Mood</FieldLabel>
        <div className="grid grid-cols-3 gap-3">
          {moodOrder.map((id) => {
            const meta = MOOD_META[id as (typeof BRAND_MOODS)[number]];
            const pal = suggestion?.moods.find((m) => m.id === id)?.palette ?? meta.palette;
            const selected = contract.identity.mood === id;
            return (
              <button
                key={id}
                onClick={() => selectMood(id as BrandMoodV2)}
                className={`text-left rounded-2xl border-2 p-3.5 relative ${selected ? "border-brass shadow-elevated" : "border-border hover:border-taupe/40"}`}
              >
                {selected && <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brass text-white flex items-center justify-center"><Check className="size-3" /></span>}
                <div className="flex h-[30px] rounded-lg overflow-hidden mb-2.5">
                  {pal.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                </div>
                <div className="font-serif text-[15px] mb-0.5">{meta.label}</div>
                <div className="text-[11.5px] text-taupe leading-snug">{hintsById[id] || meta.hint}</div>
              </button>
            );
          })}
          <button
            onClick={() => selectMood("CUSTOM")}
            className={`text-left rounded-2xl border-2 border-dashed p-3.5 flex flex-col ${contract.identity.mood === "CUSTOM" ? "border-brass" : "border-border hover:border-taupe/40"}`}
          >
            <span className={`w-[30px] h-[30px] rounded-full border flex items-center justify-center text-base mb-2.5 ${contract.identity.mood === "CUSTOM" ? "border-brass text-brass" : "border-border text-taupe"}`}>+</span>
            <div className="font-serif text-[15px] mb-0.5">Custom</div>
            <div className="text-[11.5px] text-taupe leading-snug">Not feeling any of these? Name your own and pick 5 colours.</div>
          </button>
        </div>
      </div>

      {contract.identity.mood === "CUSTOM" && (
        <div className="mb-6">
          <FieldLabel>Name your mood</FieldLabel>
          <input
            type="text"
            placeholder="e.g. Coastal Editorial"
            value={contract.identity.customMoodLabel ?? ""}
            onChange={(e) => update((c) => ({ ...c, identity: { ...c.identity, customMoodLabel: e.target.value } }))}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background outline-none focus:border-brass focus:ring-2 focus:ring-brass/15"
          />
        </div>
      )}

      <div className="mb-6">
        <FieldLabel hint={contract.identity.mood === "CUSTOM" ? "— pick your own" : "— from your chosen mood"}>Palette</FieldLabel>
        <div className="flex gap-2.5 items-center">
          {contract.identity.mood === "CUSTOM" ? (
            paletteForMood(contract).map((c, i) => (
              <input
                key={i}
                type="color"
                value={c}
                onChange={(e) => update((prev) => {
                  const next = [...prev.identity.palette];
                  next[i] = e.target.value;
                  return { ...prev, identity: { ...prev.identity, palette: next } };
                })}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0"
              />
            ))
          ) : (
            paletteForMood(contract).map((c, i) => <div key={i} className="w-10 h-10 rounded-lg border border-border" style={{ background: c }} />)
          )}
        </div>
      </div>

      <div className="mb-6">
        <FieldLabel>Type pairing</FieldLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {TYPE_PAIRINGS.map((id) => {
            const meta = TYPE_META[id];
            const selected = contract.identity.typography.heading === id;
            return (
              <button
                key={id}
                onClick={() => update((c) => ({ ...c, identity: { ...c.identity, typography: { heading: id, body: id } } }))}
                className={`text-left rounded-xl border-2 px-4 py-3.5 ${selected ? "border-brass bg-muted/40" : "border-border hover:border-taupe/40"}`}
              >
                <div className={`text-[26px] leading-none mb-1 ${meta.headClass}`}>Aa</div>
                <div className="text-[11px] uppercase tracking-wide text-taupe">{meta.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel hint="— pick up to 3">Essence</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {ESSENCE_WORDS.map((w) => {
            const selected = contract.identity.essence.includes(w);
            const atCap = contract.identity.essence.length >= 3 && !selected;
            return (
              <Chip
                key={w}
                selected={selected}
                disabled={atCap}
                onClick={() => update((c) => ({
                  ...c,
                  identity: {
                    ...c.identity,
                    essence: selected ? c.identity.essence.filter((e) => e !== w) : c.identity.essence.length < 3 ? [...c.identity.essence, w] : c.identity.essence,
                  },
                }))}
              >
                {w}
              </Chip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 ───────────────────────────────────────────────────────────────────

function Step3Audience({ contract, update }: { contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void }) {
  const [newType, setNewType] = useState("");
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">Who are you speaking to?</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">A starting point for how the AI frames your captions and picks example imagery.</p>
      </div>

      <div className="mb-6">
        <FieldLabel>Age range</FieldLabel>
        <div className="flex items-center gap-3.5">
          <span className="text-sm text-taupe w-8 text-right tabular-nums">{contract.audience.ageMin}</span>
          <input type="range" min={13} max={80} value={contract.audience.ageMin} onChange={(e) => update((c) => ({ ...c, audience: { ...c.audience, ageMin: Number(e.target.value) } }))} className="flex-1 accent-brass" />
          <input type="range" min={13} max={80} value={contract.audience.ageMax} onChange={(e) => update((c) => ({ ...c, audience: { ...c.audience, ageMax: Number(e.target.value) } }))} className="flex-1 accent-brass" />
          <span className="text-sm text-taupe w-8 tabular-nums">{contract.audience.ageMax}</span>
        </div>
      </div>

      <div className="mb-6">
        <FieldLabel>Gender focus</FieldLabel>
        <div className="flex gap-2">
          {GENDER_FOCUS_OPTIONS.map((g) => (
            <Chip key={g} selected={contract.audience.genderFocus === g} onClick={() => update((c) => ({ ...c, audience: { ...c.audience, genderFocus: g } }))}>
              {g === "ALL" ? "Everyone" : g === "WOMEN" ? "Women" : "Men"}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel hint="— optional, add a few">Client types</FieldLabel>
        <div className="flex flex-wrap gap-2 mb-2.5">
          {contract.audience.clientTypes.map((t) => (
            <Chip key={t} selected onClick={() => update((c) => ({ ...c, audience: { ...c.audience, clientTypes: c.audience.clientTypes.filter((x) => x !== t) } }))}>{t} ×</Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newType.trim()) {
                update((c) => ({ ...c, audience: { ...c.audience, clientTypes: [...c.audience.clientTypes, newType.trim()] } }));
                setNewType("");
              }
            }}
            placeholder="e.g. Bridal parties"
            className="flex-1 border border-border rounded-full px-4 py-2 text-sm bg-background outline-none focus:border-brass"
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 4 ───────────────────────────────────────────────────────────────────

function Step4Strategy({ contract, update }: { contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">What's this content actually for?</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">Sets the tone and cadence — you can change this anytime from settings.</p>
      </div>

      <div className="mb-6">
        <FieldLabel>Objective</FieldLabel>
        <div className="flex flex-col gap-2">
          {BRAND_OBJECTIVES.map((id) => {
            const meta = OBJECTIVE_META[id];
            const selected = contract.strategy.objective === id;
            return (
              <button
                key={id}
                onClick={() => update((c) => ({ ...c, strategy: { ...c.strategy, objective: id } }))}
                className={`flex items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left ${selected ? "border-brass bg-muted/40" : "border-border hover:border-taupe/40"}`}
              >
                <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex-shrink-0 ${selected ? "bg-brass border-brass" : "border-border"}`} />
                <span>
                  <span className="block text-sm">{meta.name}</span>
                  <span className="block text-xs text-taupe">{meta.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <FieldLabel>Posts per week</FieldLabel>
        <Stepper value={contract.strategy.postsPerWeek} onChange={(v) => update((c) => ({ ...c, strategy: { ...c.strategy, postsPerWeek: Math.max(0, v) } }))} />
      </div>
      <div>
        <FieldLabel>Booking target per month</FieldLabel>
        <Stepper value={contract.strategy.bookingTargetPerMonth} step={5} onChange={(v) => update((c) => ({ ...c, strategy: { ...c.strategy, bookingTargetPerMonth: Math.max(0, v) } }))} />
      </div>
    </div>
  );
}

// ── Step 5 ───────────────────────────────────────────────────────────────────

function Step5Config({ contract, update }: { contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">A few settings</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">Smart defaults based on your profile — flip anything that's not right.</p>
      </div>

      <div className="mb-6">
        <FieldLabel>Spelling &amp; language</FieldLabel>
        <div className="flex gap-2">
          {LANGUAGE_VARIANTS.map((l) => (
            <Chip key={l} selected={contract.config.languageVariant === l} onClick={() => update((c) => ({ ...c, config: { ...c.config, languageVariant: l } }))}>
              {l === "AU" ? "Australian (AU)" : l === "UK" ? "British (UK)" : "American (US)"}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <FieldLabel>Platforms</FieldLabel>
        <ToggleRow name="Instagram" on={contract.config.platforms.instagram} onToggle={() => update((c) => ({ ...c, config: { ...c.config, platforms: { ...c.config.platforms, instagram: !c.config.platforms.instagram } } }))} />
      </div>

      <div>
        <FieldLabel>Medical-aesthetics compliance</FieldLabel>
        <ToggleRow
          name="I'm a regulated practitioner (injectables, laser, etc.)"
          desc="Turns on AHPRA-aware guardrails — no before/after claims, no outcome language."
          on={contract.config.medicalAestheticsCompliance}
          onToggle={() => update((c) => ({ ...c, config: { ...c.config, medicalAestheticsCompliance: !c.config.medicalAestheticsCompliance } }))}
        />
        {contract.config.medicalAestheticsCompliance && (
          <div className="text-[11.5px] text-brass-ink bg-muted/50 rounded-lg px-3 py-2 mt-2 leading-relaxed">
            AHPRA guardrails active: before/after claims and outcome language will be blocked in every generation, in code.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 6 ───────────────────────────────────────────────────────────────────

function Step6Words({ contract, update }: { contract: BrandDnaV2Contract; update: (fn: (c: BrandDnaV2Contract) => BrandDnaV2Contract) => void }) {
  const [drafting, setDrafting] = useState(false);
  const draftForMe = async () => {
    setDrafting(true);
    try {
      const res = await api.post("/brand-dna/draft-story", {
        brandName: contract.identity.brandName, mood: contract.identity.mood, essence: contract.identity.essence,
        serviceCategory: contract.offering.serviceCategory, objective: contract.strategy.objective,
      });
      const s = res.data?.data ?? res.data;
      if (s?.aiDrafted) update((c) => ({ ...c, story: { ...c.story, aiDrafted: s.aiDrafted } }));
    } catch {
      toast.error("Couldn't draft one right now — try again in a moment.");
    } finally {
      setDrafting(false);
    }
  };
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">Your words</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">One optional line, in your own voice. Skip it and we'll draft one from everything you've chosen so far.</p>
      </div>
      <FieldLabel hint="— optional">What makes your work special?</FieldLabel>
      <textarea
        value={contract.story.userWritten ?? ""}
        onChange={(e) => update((c) => ({ ...c, story: { ...c.story, userWritten: e.target.value } }))}
        placeholder="e.g. I map every set to your natural eye shape, not a template."
        className="w-full min-h-[96px] border border-border rounded-xl px-3.5 py-3 text-sm bg-background outline-none focus:border-brass focus:ring-2 focus:ring-brass/15 resize-y"
      />
      <div className="flex gap-2.5 mt-2.5">
        <button onClick={draftForMe} disabled={drafting} className="rounded-full border border-border px-4 py-2 text-[13.5px] hover:bg-muted/60 disabled:opacity-50">
          {drafting ? "Drafting…" : "Skip — draft it for me"}
        </button>
      </div>
      {contract.story.aiDrafted && !contract.story.userWritten && (
        <div className="text-xs text-taupe mt-3 border border-dashed border-border rounded-lg p-3 leading-relaxed">
          <b className="text-foreground">AI draft:</b> {contract.story.aiDrafted}
        </div>
      )}
    </div>
  );
}

// ── Step 7 ───────────────────────────────────────────────────────────────────

function Step7Confirm({ contract, palette }: { contract: BrandDnaV2Contract; palette: string[] }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[1.7rem] mb-1.5">This is your Brand DNA</h2>
        <p className="text-sm text-taupe max-w-[46ch] leading-relaxed">Everything here feeds directly into your content — nothing else to fill in.</p>
      </div>
      <div className="text-xs text-taupe mb-3.5">Your full brand card is on the right. Here's how a real post would look with it applied →</div>
      <div className="max-w-[280px]">
        <SamplePost contract={contract} palette={palette} />
      </div>
    </div>
  );
}

// ── Brand card + sample post ─────────────────────────────────────────────────

function SamplePost({ contract, palette }: { contract: BrandDnaV2Contract; palette: string[] }) {
  const caption = `${contract.identity.brandName} — ${moodLabel(contract).toLowerCase()} sets, crafted around you. ${contract.identity.essence.join(" · ").toLowerCase() || "crafted for you"}.`;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="aspect-square flex items-center justify-center text-center px-4 font-serif italic text-[13px] text-white" style={{ background: `linear-gradient(155deg, ${palette[3]}, ${palette[0]})` }}>
        "{caption.slice(0, 70)}…"
      </div>
      <div className="px-3 py-2.5 text-[11.5px] text-taupe leading-relaxed">
        <b className="text-foreground font-medium">{contract.identity.brandName}</b> — {caption.replace(contract.identity.brandName + " — ", "")}
      </div>
    </div>
  );
}

function BrandCard({ contract, palette, step }: { contract: BrandDnaV2Contract; palette: string[]; step: number }) {
  return (
    <div className="rounded-[18px] overflow-hidden border border-border shadow-elevated bg-card">
      <div className="px-5.5 pt-6.5 pb-5 relative" style={{ background: `linear-gradient(155deg, ${palette[3]}, ${palette[1]})` }}>
        <div className="w-10 h-10 rounded-lg bg-white/85 flex items-center justify-center font-serif text-[17px] mb-3.5 overflow-hidden">
          {contract.identity.logoAssetId ? <img src={contract.identity.logoAssetId} className="w-full h-full object-cover" /> : contract.identity.brandName.charAt(0) || "?"}
        </div>
        <div className="font-serif text-2xl text-white mb-0.5">{contract.identity.brandName || "Your brand"}</div>
        <div className="text-[11px] uppercase tracking-wide text-white/75">{moodLabel(contract)}</div>
      </div>
      <div className="flex h-2.5">
        {palette.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
      </div>
      <div className="px-5.5 py-5">
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-taupe mb-1.5">Essence</div>
          <div className="flex flex-wrap gap-1.5">
            {contract.identity.essence.length
              ? contract.identity.essence.map((w) => <span key={w} className="text-[11px] border border-border rounded-full px-2.5 py-0.5">{w}</span>)
              : <span className="text-[11px] border border-border rounded-full px-2.5 py-0.5 opacity-50">Not chosen yet</span>}
          </div>
        </div>
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-taupe mb-1.5">Sample post</div>
          <SamplePost contract={contract} palette={palette} />
        </div>
        <div className="flex justify-between text-[11.5px] text-taupe mb-3.5">
          <span>Objective</span>
          <span>{OBJECTIVE_META[contract.strategy.objective]?.name ?? contract.strategy.objective}</span>
        </div>
        <div className="h-[5px] rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-brass rounded-full transition-[width]" style={{ width: `${Math.round((step / 7) * 100)}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-taupe mt-1.5">
          <span>Step {step} of 7</span>
          <span>{Math.round((step / 7) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
