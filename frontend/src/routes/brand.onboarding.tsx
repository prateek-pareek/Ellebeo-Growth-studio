import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { saveBrandDna, fetchBrandDnaForEditing, type OnboardingPayload } from "@/lib/providers/brand-dna-save";
import { api } from "@/lib/api";

export const Route = createFileRoute("/brand/onboarding")({
  head: () => ({
    meta: [
      { title: "Brand DNA — Elle.Be.O Growth" },
      { name: "description", content: "Your brand bible, built for AI." },
    ],
  }),
  component: OnboardingPage,
});

// ── Constants ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "brand",      label: "BRAND",      areas: 3 },
  { id: "visual",     label: "VISUAL",     areas: 6 },
  { id: "voice",      label: "VOICE",      areas: 2 },
  { id: "commercial", label: "COMMERCIAL", areas: 3 },
  { id: "compliance", label: "COMPLIANCE", areas: 1 },
  { id: "output",     label: "OUTPUT",     areas: 1 },
];

const SERVICE_CATEGORIES = ["Hair", "Makeup", "Nails", "Eyelashes", "Medical Aesthetics", "Skin", "Eyebrows"];

const IMAGE_ENERGY_OPTIONS = [
  { value: "",                  label: "Select…" },
  { value: "still_considered",  label: "Still and considered — quiet, unhurried, intentional" },
  { value: "warm_sensory",      label: "Warm and sensory — golden, tactile, intimate" },
  { value: "bold_editorial",    label: "Bold and editorial — high-contrast, magazine-quality" },
  { value: "clean_precise",     label: "Clean and precise — clinical, ordered, trustworthy" },
  { value: "soft_romantic",     label: "Soft and romantic — diffused light, gentle, feminine" },
  { value: "elevated_luxe",     label: "Elevated and luxe — restrained, expensive-feeling" },
];

const EMPTY: OnboardingPayload = {
  // Brand Foundations
  displayName: "",
  serviceCategories: [],
  signature: "",
  city: "",
  serviceArea: "",
  reputationAsset: "",
  knownFor: "",
  workDifferentiation: "",
  // Brand Essence
  brandEssenceSentence: "",
  brandWorldAnchor: "",
  imageEnergy: "",
  // Legacy fields
  niche: "",
  primaryColor: "",
  secondaryColor: "",
  backgroundColor: "",
  accentColor: "",
  depthColor: "",
  signatureService: "",
  otherServices: "",
  aestheticDirection: "",
  brandTier: "",
  voiceWords: "",
  alwaysDo: "",
  neverDo: "",
  emojiPolicy: "minimal",
  captionLength: "medium",
  ageRange: "",
  cities: "",
  idealClient: "",
  bookingsPerWeek: "",
  postsPerWeek: "",
  pillars: "",
  logoUrl: "",
  logoPosition: "bottom_right",
  moodboardUrls: Array(8).fill(""),
  moodboardLabels: Array(8).fill(""),
  visualRanking: [],
  lightingPreference: "",
  texturePreference: "",
  compositionStyle: "",
  environmentPreference: "",
  finishPreference: "",
  audienceLifestyle: "",
  commercialObjective: "",
  clientFears: "",
  clientTrustTriggers: "",
  clientVisualTaste: "",
  clientBuyingTriggers: "",
  clientEmotionalOutcome: "",
  brandPerceptionGoal: "",
  brandProofStatement: "",
  brandNeverLooksLike: "",
};

// ── Strength scoring ───────────────────────────────────────────────────────

type StrengthItem = {
  key: string;
  label: string;
  description: string;
  score: number;
  max: number;
};

function calcStrengthItems(form: OnboardingPayload): StrengthItem[] {
  const filled = (v?: string) => !!v?.trim();
  const filledArr = (v?: string[]) => (v?.filter(Boolean).length ?? 0) > 0;

  const basicScore =
    (filled(form.displayName) ? 5 : 0) +
    (filledArr(form.serviceCategories) ? 5 : 0) +
    (filled(form.city) ? 3 : 0) +
    (filled(form.brandEssenceSentence) ? 4 : 0) +
    (filled(form.imageEnergy) ? 3 : 0);

  const visualScore =
    (filledArr(form.moodboardUrls) ? 8 : 0) +
    (form.visualRanking.length >= 3 ? 5 : form.visualRanking.length > 0 ? 2 : 0) +
    (filled(form.primaryColor) && filled(form.secondaryColor) ? 5 : 0) +
    (filled(form.lightingPreference) ? 3 : 0) +
    (filled(form.compositionStyle) ? 3 : 0) +
    (filled(form.finishPreference) ? 3 : 0);

  const moodboardCount = form.moodboardUrls.filter(Boolean).length;
  const moodboardScore = moodboardCount >= 8 ? 15 : moodboardCount >= 5 ? 10 : moodboardCount > 0 ? 5 : 0;

  const idealClientScore =
    (filled(form.idealClient) ? 3 : 0) +
    (filled(form.clientFears) ? 3 : 0) +
    (filled(form.clientTrustTriggers) ? 3 : 0) +
    (filled(form.clientVisualTaste) ? 3 : 0) +
    (filled(form.clientEmotionalOutcome) ? 3 : 0);

  const contentScore =
    (form.pillars.split(",").filter(Boolean).length >= 3 ? 5 : 0) +
    (filled(form.bookingsPerWeek) ? 2 : 0) +
    (filled(form.postsPerWeek) ? 3 : 0);

  const complianceScore = filledArr(form.serviceCategories) ? 6 : 0;

  const signatureScore =
    (filled(form.brandPerceptionGoal) ? 2 : 0) +
    (filled(form.brandProofStatement) ? 2 : 0) +
    (filled(form.brandNeverLooksLike) ? 1 : 0);

  return [
    {
      key: "basic",
      label: "Basic profile",
      description: "Name, at least one category, location, one-sentence essence and image energy.",
      score: basicScore,
      max: 20,
    },
    {
      key: "visual",
      label: "Visual system",
      description: "Five-colour palette, three ranked styles, typography and image direction.",
      score: Math.min(visualScore, 15),
      max: 15,
    },
    {
      key: "moodboard",
      label: "Moodboard",
      description: "Add references the AI can lean on. 5 labelled is the working minimum; 8 is the recommended depth.",
      score: moodboardScore,
      max: 15,
    },
    {
      key: "assets",
      label: "Asset library",
      description: "Add 5+ of your own files — headshots, work, space — so the AI can reference real material.",
      score: 0,
      max: 10,
    },
    {
      key: "client",
      label: "Ideal client",
      description: "Add detail on who they are, what they want to feel, and what makes them trust someone.",
      score: Math.min(idealClientScore, 15),
      max: 15,
    },
    {
      key: "content",
      label: "Content strategy",
      description: "Rank 3+ pillars, set weekly targets, choose a format and an objective.",
      score: Math.min(contentScore, 10),
      max: 10,
    },
    {
      key: "compliance",
      label: "Compliance",
      description: "Optional — tick the Medical Aesthetics practitioner box if AHPRA rules apply to you.",
      score: complianceScore,
      max: 10,
    },
    {
      key: "signature",
      label: "Signature system",
      description: "Fill at least 5 of 7 signature rules so every output feels recognisable.",
      score: Math.min(signatureScore, 5),
      max: 5,
    },
  ];
}

function calcTotalStrength(form: OnboardingPayload): number {
  const items = calcStrengthItems(form);
  const total = items.reduce((s, i) => s + i.score, 0);
  const max = items.reduce((s, i) => s + i.max, 0);
  return Math.round((total / max) * 100);
}

function strengthLabel(pct: number): string {
  if (pct < 10) return "Foundation started";
  if (pct < 30) return "Taking shape";
  if (pct < 60) return "Getting strong";
  if (pct < 80) return "Nearly complete";
  return "Brand bible ready";
}

// ── Main page ──────────────────────────────────────────────────────────────

function OnboardingPage() {
  const [activeTab, setActiveTab] = useState("brand");
  const [open, setOpen] = useState<Record<string, boolean>>({ foundations: true });
  const [form, setForm] = useState<OnboardingPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBrandDnaForEditing()
      .then((data) => { if (data) setForm(data); })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof OnboardingPayload>(k: K) =>
    (v: OnboardingPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggle = (id: string) =>
    setOpen((o) => ({ ...o, [id]: !o[id] }));

  async function handleSave(publish: boolean) {
    setSaving(true);
    setError(null);
    const res = await saveBrandDna(form);
    setSaving(false);
    if (res.kind === "ok") {
      setSaveStatus(publish ? "published" : "draft");
      setTimeout(() => setSaveStatus(null), 3000);
    } else if (res.kind === "anon") {
      setError("Please sign in to save your Brand DNA.");
    } else {
      setError(res.message);
    }
  }

  const strength = calcTotalStrength(form);
  const strengthItems = calcStrengthItems(form);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading your Brand DNA…
      </div>
    );
  }

  return (
    <div className="mt-6 lg:mt-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link to="/brand" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
          Brand DNA
        </Link>
        <span className="text-taupe/40 text-[10px]">/</span>
        <span className="text-[10px] uppercase tracking-widest text-foreground font-medium">Full Brand DNA</span>
      </div>

      {/* Heading */}
      <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        Your <span className="italic">brand bible</span>, built for AI.
      </h1>
      <p className="text-base text-taupe leading-relaxed max-w-[60ch] mb-2">
        Complete your Brand DNA so Elle.Be.O can create content that looks, sounds and feels like your brand. Save a draft any time — nothing is lost between sessions.
      </p>
      <p className="text-[11px] text-taupe/60 mb-8">
        Sample preview — drafts stay in this browser session.
      </p>

      {/* Tab bar */}
      <div className="grid border hairline mb-8" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              "px-4 py-3 text-left border-r hairline last:border-r-0 transition-colors " +
              (tab.id === activeTab ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/20")
            }
          >
            <p className={`text-[9px] uppercase tracking-[0.2em] mb-0.5 ${tab.id === activeTab ? "text-nude/70" : "text-taupe"}`}>
              {tab.label}
            </p>
            <p className={`text-xs font-medium ${tab.id === activeTab ? "text-offwhite" : "text-foreground"}`}>
              {tab.areas} {tab.areas === 1 ? "area" : "areas"}
            </p>
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-12 gap-8 lg:gap-10">

        {/* ── Left: accordion sections ──────────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-3">

          {activeTab === "brand" && (
            <>
              {/* Brand Foundations */}
              <AccordionSection
                title="Brand Foundations"
                subtitle="Name, categories, location and what you want to be known for."
                isOpen={!!open.foundations}
                onToggle={() => toggle("foundations")}
              >
                <BrandFoundationsSection form={form} set={set} />
              </AccordionSection>

              {/* Brand Essence */}
              <AccordionSection
                title="Brand Essence"
                subtitle="Your brand world and the feeling your imagery should give."
                isOpen={!!open.essence}
                onToggle={() => toggle("essence")}
              >
                <BrandEssenceSection form={form} set={set} />
              </AccordionSection>

              {/* Brand DNA Strength */}
              <AccordionSection
                title="Brand DNA Strength"
                subtitle="How rich your Brand DNA is — encouraging, not blocking."
                isOpen={!!open.strength}
                onToggle={() => toggle("strength")}
              >
                <BrandStrengthSection strength={strength} items={strengthItems} />
              </AccordionSection>
            </>
          )}

          {activeTab !== "brand" && (
            <div className="border hairline bg-card p-12 text-center">
              <p className="text-taupe italic text-sm">
                {TABS.find(t => t.id === activeTab)?.label} tab coming soon.
              </p>
              <p className="text-[11px] text-taupe/60 mt-2">Complete the Brand tab first to unlock the rest.</p>
            </div>
          )}
        </div>

        {/* ── Right: sticky sidebar ─────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-4">
          <div className="lg:sticky lg:top-8 space-y-4">

            {/* Strength score */}
            <div className="border hairline bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold">Brand DNA Strength</p>
                <button className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                  View Detail →
                </button>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-serif text-4xl">{strength}</span>
                <span className="text-xl text-taupe font-serif">%</span>
                <span className="ml-auto text-[10px] text-taupe">{strengthLabel(strength)}</span>
              </div>
              <div className="h-px bg-border mt-2 mb-3 relative">
                <div
                  className="absolute inset-y-0 left-0 bg-foreground transition-all duration-500"
                  style={{ width: `${strength}%`, height: "2px", top: "-0.5px" }}
                />
              </div>
              <p className="text-[11px] text-taupe leading-relaxed">
                {strength < 20
                  ? "Name, at least one category, location, one-sentence essence and image energy."
                  : strength < 50
                  ? "Add your visual system and moodboard references to strengthen your DNA."
                  : "Keep adding depth — the richer the DNA, the more bespoke the output."}
              </p>
            </div>

            {/* Save */}
            <div className="border hairline bg-card p-5">
              <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold mb-2">Save</p>
              <p className="text-[11px] text-taupe leading-relaxed mb-4">
                Save a draft any time, or publish to make this version the source of truth for generated content.
              </p>
              {error && (
                <p className="text-[11px] text-destructive mb-3">{error}</p>
              )}
              {saveStatus && (
                <p className="text-[11px] text-sage mb-3">
                  {saveStatus === "published" ? "Published successfully." : "Draft saved."}
                </p>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="w-full border hairline text-[10px] uppercase tracking-[0.2em] py-3 mb-2 hover:bg-nude/20 transition-colors disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save as Draft"}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="w-full bg-foreground text-offwhite text-[10px] uppercase tracking-[0.2em] py-3 hover:bg-taupe transition-colors disabled:opacity-50"
              >
                Publish Brand DNA
              </button>
            </div>

            {/* What this powers */}
            <div className="border hairline bg-card p-5">
              <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold mb-2">What this powers</p>
              <p className="text-[11px] text-taupe leading-relaxed">
                Elle.Be.O will use these details to shape your content style, captions and visual direction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Accordion wrapper ──────────────────────────────────────────────────────

function AccordionSection({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border hairline bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between p-6 text-left hover:bg-nude/10 transition-colors"
      >
        <div>
          <h2 className="font-serif text-xl mb-1">{title}</h2>
          <p className="text-[11px] text-taupe leading-relaxed">{subtitle}</p>
        </div>
        <span className="text-taupe text-lg ml-4 mt-0.5 flex-shrink-0">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="border-t hairline px-6 pb-6 pt-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Brand Foundations ──────────────────────────────────────────────────────

function BrandFoundationsSection({
  form,
  set,
}: {
  form: OnboardingPayload;
  set: <K extends keyof OnboardingPayload>(k: K) => (v: OnboardingPayload[K]) => void;
}) {
  const toggleCategory = (cat: string) => {
    const current = form.serviceCategories || [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    set("serviceCategories")(next);
  };

  return (
    <div className="space-y-6">
      {/* Brand Name */}
      <FormField label="Professional / Brand Name" required>
        <input
          type="text"
          value={form.displayName}
          onChange={(e) => set("displayName")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
        />
      </FormField>

      {/* Categories */}
      <FormField
        label="Categories"
        required
        hint="Select all that apply. Medical Aesthetics applies stricter AHPRA-aware rules to generated content automatically."
      >
        <div className="flex flex-wrap gap-2 mt-2">
          {SERVICE_CATEGORIES.map((cat) => {
            const selected = form.serviceCategories?.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={
                  "px-4 py-1.5 text-[11px] uppercase tracking-widest border hairline transition-colors " +
                  (selected
                    ? "bg-foreground text-offwhite border-foreground"
                    : "bg-transparent text-foreground hover:bg-nude/30")
                }
              >
                {cat}
              </button>
            );
          })}
        </div>
      </FormField>

      {/* Signature + Location */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="What is your signature?" hint="The specific thing clients book you for.">
          <input
            type="text"
            placeholder="e.g. Blonde specialist, tape extensions, editorial makeup"
            value={form.signature}
            onChange={(e) => set("signature")(e.target.value)}
            className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
          />
        </FormField>
        <FormField label="Location">
          <input
            type="text"
            placeholder="City or suburb"
            value={form.city}
            onChange={(e) => set("city")(e.target.value)}
            className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
          />
        </FormField>
      </div>

      {/* Service Area + Reputation Asset */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Service Area">
          <input
            type="text"
            placeholder="Mobile / clinic / studio…"
            value={form.serviceArea}
            onChange={(e) => set("serviceArea")(e.target.value)}
            className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
          />
        </FormField>
        <FormField label="Strongest Reputation Asset">
          <input
            type="text"
            placeholder="Technique, taste, discretion…"
            value={form.reputationAsset}
            onChange={(e) => set("reputationAsset")(e.target.value)}
            className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
          />
        </FormField>
      </div>

      {/* Known For */}
      <FormField label="What do you want to be known for?">
        <textarea
          rows={3}
          placeholder="Natural-looking skin, calm expertise and meticulous prep."
          value={form.knownFor}
          onChange={(e) => set("knownFor")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors resize-none"
        />
      </FormField>

      {/* Work Different */}
      <FormField label="What makes your work different?">
        <textarea
          rows={3}
          placeholder="I focus on skin that still looks like skin, not heavy coverage."
          value={form.workDifferentiation}
          onChange={(e) => set("workDifferentiation")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors resize-none"
        />
      </FormField>
    </div>
  );
}

// ── Brand Essence ──────────────────────────────────────────────────────────

function BrandEssenceSection({
  form,
  set,
}: {
  form: OnboardingPayload;
  set: <K extends keyof OnboardingPayload>(k: K) => (v: OnboardingPayload[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <FormField label="Brand Essence in One Sentence" required>
        <textarea
          rows={3}
          placeholder="Give clients the calm confidence that they look like the best version of themselves."
          value={form.brandEssenceSentence}
          onChange={(e) => set("brandEssenceSentence")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors resize-none"
        />
      </FormField>

      <FormField label="Brand World Anchor">
        <textarea
          rows={3}
          placeholder="A quiet Aesop store, a Sofia Coppola interior, the pages of Cereal."
          value={form.brandWorldAnchor}
          onChange={(e) => set("brandWorldAnchor")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors resize-none"
        />
      </FormField>

      <FormField label="Image Energy" required hint="The feeling every image you generate should give.">
        <select
          value={form.imageEnergy}
          onChange={(e) => set("imageEnergy")(e.target.value)}
          className="w-full border hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors appearance-none cursor-pointer"
        >
          {IMAGE_ENERGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FormField>
    </div>
  );
}

// ── Brand DNA Strength section ─────────────────────────────────────────────

function BrandStrengthSection({
  strength,
  items,
}: {
  strength: number;
  items: ReturnType<typeof calcStrengthItems>;
}) {
  return (
    <div>
      {/* Score header */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold">Brand DNA Strength</p>
        <p className="text-[9px] uppercase tracking-[0.2em] text-taupe/50">Guidance only — saving is never blocked</p>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-serif text-5xl">{strength}</span>
        <span className="font-serif text-2xl text-taupe">%</span>
        <span className="ml-3 text-sm text-taupe">{strengthLabel(strength)}.</span>
      </div>
      <div className="h-0.5 bg-border mb-4 relative">
        <div className="absolute inset-y-0 left-0 bg-foreground transition-all duration-500" style={{ width: `${strength}%` }} />
      </div>
      <p className="text-sm text-taupe mb-6">
        Your Brand DNA is being shaped. Add a few core fields to unlock basic content.
      </p>

      {/* Suggestions */}
      <div className="border hairline bg-nude/20 p-4 mb-6">
        <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold mb-3">What would make your Brand DNA stronger</p>
        <ul className="space-y-2">
          {items.filter(i => i.score < i.max).slice(0, 3).map(i => (
            <li key={i.key} className="flex items-start gap-2 text-[11px] text-taupe leading-relaxed">
              <span className="mt-0.5 size-1.5 rounded-full bg-taupe/40 flex-shrink-0" />
              {i.description}
            </li>
          ))}
        </ul>
      </div>

      {/* Checklist */}
      <p className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold mb-3">What we look for</p>
      <div className="space-y-0 border hairline divide-y divide-border">
        {items.map((item) => {
          const pct = Math.round((item.score / item.max) * 100);
          const status = pct === 0 ? "NOT STARTED" : pct >= 100 ? "COMPLETE" : "IN PROGRESS";
          const statusColor = pct === 0 ? "text-taupe" : pct >= 100 ? "text-sage" : "text-amber-600";
          return (
            <div key={item.key} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`size-1.5 rounded-full flex-shrink-0 ${pct >= 100 ? "bg-sage" : pct > 0 ? "bg-amber-500" : "bg-border"}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] uppercase tracking-[0.15em] ${statusColor}`}>{status}</span>
                  <span className="text-[10px] text-taupe tabular-nums w-7 text-right">{pct}%</span>
                </div>
              </div>
              <p className="text-[11px] text-taupe leading-relaxed ml-3.5">{item.description}</p>
              <div className="h-px bg-border mt-2 ml-3.5 relative">
                <div className="absolute inset-y-0 left-0 bg-foreground/30 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared field wrapper ───────────────────────────────────────────────────

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-[0.2em] text-taupe font-semibold block mb-1">
        {label}{required && " *"}
      </label>
      {hint && <p className="text-[11px] text-taupe/70 mb-2 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}
