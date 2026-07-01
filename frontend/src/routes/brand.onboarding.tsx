import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useFeatureFlag } from "@/lib/feature-flags";
import { saveBrandDna, fetchBrandDnaForEditing, type OnboardingPayload } from "@/lib/providers/brand-dna-save";
import { api } from "@/lib/api";

export const Route = createFileRoute("/brand/onboarding")({
  head: () => ({
    meta: [
      { title: "Build your Brand DNA — Elle.Be.O Growth" },
      { name: "description", content: "A guided 5-step flow to define your brand voice, pillars and ideal client." },
      { property: "og:title", content: "Build your Brand DNA — Elle.Be.O Growth" },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = [
  { id: 1, name: "About you", help: "Your name, niche, location and brand colours." },
  { id: 2, name: "Services", help: "What you offer, your aesthetic and market tier." },
  { id: 3, name: "Voice", help: "How you sound — tone, do's, don'ts and post style." },
  { id: 4, name: "Ideal client", help: "Who you want to attract." },
  { id: 5, name: "Goals", help: "Bookings per week, posting frequency, content pillars." },
  { id: 6, name: "Visual direction", help: "Moodboard, lighting, texture and finish." },
];

const EMPTY: OnboardingPayload = {
  displayName: "",
  niche: "",
  city: "",
  primaryColor: "",
  secondaryColor: "",
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
  backgroundColor: "",
  accentColor: "",
  depthColor: "",
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

function OnboardingPage() {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.displayName.trim()) e.displayName = "Your name is required.";
      if (!form.niche.trim()) e.niche = "Your niche is required.";
    }
    if (s === 2) {
      if (!form.signatureService.trim()) e.signatureService = "Please enter the service you want to grow.";
    }
    setStepErrors(e);
    return Object.keys(e).length === 0;
  }

  useEffect(() => {
    if (cloudEnabled) {
      fetchBrandDnaForEditing().then(data => {
        if (data) setForm(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [cloudEnabled]);

  const fieldSetter = <K extends keyof OnboardingPayload>(k: K) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setError(null);
    if (!cloudEnabled) {
      setSaved(true);
      return;
    }
    setSaving(true);
    const res = await saveBrandDna(form);
    setSaving(false);
    if (res.kind === "ok") {
      setSaved(true);
    } else if (res.kind === "anon") {
      setError("Please sign in to save your Brand DNA.");
    } else {
      setError(res.message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading your Brand DNA details...
      </div>
    );
  }

  if (saved) {
    return (
      <div>
        <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
          <p className="eyebrow mb-5">Brand DNA · Saved</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Saved to your <span className="italic">Brand DNA</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            Every post we generate from now on will sound like you.
          </p>
        </header>

        <div className="artifact p-6 sm:p-10 max-w-2xl">
          <p className="eyebrow mb-3">What's next</p>
          <p className="text-sm text-taupe leading-relaxed mb-8">
            Review your Brand DNA, or come back and refine your answers any time.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/brand"
              className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            >
              View your Brand DNA
            </Link>
            <button
              onClick={() => setSaved(false)}
              className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground"
            >
              Edit again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">Brand DNA · Step {step} of {STEPS.length}</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Refine your <span className="italic">Brand DNA</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Refining your DNA ensures the AI always speaks in your voice.
        </p>
      </header>

      {/* Stepper */}
      <div className="grid grid-cols-6 gap-px bg-border border hairline mb-12">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={
              "p-4 text-left transition-colors " +
              (s.id === step ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")
            }
          >
            <p className={"text-[10px] uppercase tracking-widest mb-1 " + (s.id === step ? "text-nude" : "text-taupe")}>
              Step {s.id}
            </p>
            <p className="text-xs sm:text-sm font-medium leading-tight">{s.name}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        <div className="col-span-12 lg:col-span-8">
          <div className="artifact p-6 sm:p-10">
            <p className="eyebrow mb-3">{STEPS[step - 1].name}</p>
            <h2 className="font-serif text-2xl sm:text-3xl mb-2">{STEPS[step - 1].help}</h2>

            <div className="mt-8 space-y-6">
              {step === 1 && (
                <>
                  <Field label="Your name" placeholder="Von Glass" value={form.displayName} onChange={fieldSetter("displayName")} error={stepErrors.displayName} />
                  <Field label="Your niche" placeholder="Holistic facialist" value={form.niche} onChange={fieldSetter("niche")} error={stepErrors.niche} />
                  <Field label="City" placeholder="Paris 3e" value={form.city} onChange={fieldSetter("city")} />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Brand colour palette</p>
                    <p className="text-[11px] text-taupe mb-4 leading-relaxed">Define all five colours so the AI knows exactly how to use your palette in every image.</p>
                    <div className="space-y-4">
                      <ColorField label="Primary — your dominant brand colour" value={form.primaryColor} onChange={fieldSetter("primaryColor")} />
                      <ColorField label="Secondary — supports the primary" value={form.secondaryColor} onChange={fieldSetter("secondaryColor")} />
                      <ColorField label="Background — the base of your images and layouts" value={form.backgroundColor} onChange={fieldSetter("backgroundColor")} />
                      <ColorField label="Accent — a highlight or pop colour used sparingly" value={form.accentColor} onChange={fieldSetter("accentColor")} />
                      <ColorField label="Depth — your dark neutral for text or shadow" value={form.depthColor} onChange={fieldSetter("depthColor")} />
                    </div>
                  </div>
                  <LogoUploadField
                    value={form.logoUrl ?? ""}
                    position={form.logoPosition ?? "bottom_right"}
                    onUrlChange={fieldSetter("logoUrl")}
                    onPositionChange={fieldSetter("logoPosition")}
                  />
                </>
              )}
              {step === 2 && (
                <>
                  <Field label="Service you want to grow" placeholder="6-week pigmentation protocol" value={form.signatureService} onChange={fieldSetter("signatureService")} error={stepErrors.signatureService} />
                  <Field label="Other services you offer" placeholder="Signature facial, botanical peel" textarea value={form.otherServices} onChange={fieldSetter("otherServices")} />
                  <SelectField
                    label="Brand aesthetic"
                    value={form.aestheticDirection}
                    onChange={fieldSetter("aestheticDirection")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "minimalist_clean", label: "Minimalist & Clean" },
                      { value: "moody_editorial", label: "Moody Editorial" },
                      { value: "bright_playful", label: "Bright & Playful" },
                      { value: "soft_feminine", label: "Soft & Feminine" },
                      { value: "bold_luxury", label: "Bold Luxury" },
                    ]}
                  />
                  <SelectField
                    label="Market tier"
                    value={form.brandTier}
                    onChange={fieldSetter("brandTier")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "luxury", label: "Luxury" },
                      { value: "mainstream", label: "Mainstream" },
                      { value: "accessible", label: "Accessible" },
                    ]}
                  />
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="Three words that describe how you speak" placeholder="Calm · Expert · Warm" value={form.voiceWords} onChange={fieldSetter("voiceWords")} />
                  <Field
                    label="How do you always want to be perceived?"
                    placeholder="e.g. Quietly expert. Unhurried. The kind of professional clients trust before they even walk in."
                    hint="Think about the feeling — not the service."
                    textarea
                    value={form.brandPerceptionGoal}
                    onChange={fieldSetter("brandPerceptionGoal")}
                  />
                  <Field
                    label="What should every post prove about you?"
                    placeholder="e.g. That I understand hair at a level most people don't. That every decision is intentional."
                    hint="What is the one thing your content must demonstrate, every single time?"
                    textarea
                    value={form.brandProofStatement}
                    onChange={fieldSetter("brandProofStatement")}
                  />
                  <Field
                    label="What should your content never make you look like?"
                    placeholder="e.g. A discounting salon. Desperate for bookings. Generic. Unprofessional."
                    hint="Your hard stops — what the brand must never become."
                    textarea
                    value={form.brandNeverLooksLike}
                    onChange={fieldSetter("brandNeverLooksLike")}
                  />
                  <Field label="Things you never say or do (one per line)" placeholder="mention prices unprompted&#10;use before/after language&#10;use slang" textarea value={form.neverDo} onChange={fieldSetter("neverDo")} />
                  <SelectField
                    label="Emoji usage"
                    value={form.emojiPolicy}
                    onChange={fieldSetter("emojiPolicy")}
                    options={[
                      { value: "none", label: "None — never use emojis" },
                      { value: "minimal", label: "Minimal — 1–2 max" },
                      { value: "moderate", label: "Moderate — occasional" },
                      { value: "expressive", label: "Expressive — use freely" },
                    ]}
                  />
                  <SelectField
                    label="Caption length preference"
                    value={form.captionLength}
                    onChange={fieldSetter("captionLength")}
                    options={[
                      { value: "short", label: "Short (50–80 words)" },
                      { value: "medium", label: "Medium (80–130 words)" },
                      { value: "long", label: "Long (130–200 words)" },
                    ]}
                  />
                </>
              )}
              {step === 4 && (
                <>
                  <Field label="Age range" placeholder="32–48" value={form.ageRange} onChange={fieldSetter("ageRange")} />
                  <Field label="Cities or regions" placeholder="Sydney, Melbourne, Gold Coast" value={form.cities} onChange={fieldSetter("cities")} />
                  <Field
                    label="What is your ideal client looking for?"
                    placeholder="Quiet expertise — not a quick fix. Someone who already knows what they want and trusts you to deliver it."
                    hint="Describe what they want from the experience, not just the service."
                    textarea
                    value={form.idealClient}
                    onChange={fieldSetter("idealClient")}
                  />
                  <Field
                    label="What are they scared of?"
                    placeholder="e.g. Looking overdone. Wasting money on something that doesn't last. Not being taken seriously."
                    hint="Their fears are what your content needs to quietly address."
                    textarea
                    value={form.clientFears}
                    onChange={fieldSetter("clientFears")}
                  />
                  <Field
                    label="What makes them trust a professional?"
                    placeholder="e.g. Consistency across their feed. Evidence of real results. A calm, considered tone. Not overselling."
                    hint="What does your ideal client need to see before they book?"
                    textarea
                    value={form.clientTrustTriggers}
                    onChange={fieldSetter("clientTrustTriggers")}
                  />
                  <Field
                    label="What visual world attracts them?"
                    placeholder="e.g. Quiet luxury. Minimal interiors. Natural light. Uncluttered spaces. Tonal dressing."
                    hint="Think about the Instagram accounts they follow, the brands they buy, the spaces they inhabit."
                    textarea
                    value={form.clientVisualTaste}
                    onChange={fieldSetter("clientVisualTaste")}
                  />
                  <Field
                    label="What language makes them book?"
                    placeholder="e.g. Results-led but not pushy. Expertise without arrogance. The feeling of being looked after."
                    hint="What tone of caption would make them stop scrolling and tap the link?"
                    textarea
                    value={form.clientBuyingTriggers}
                    onChange={fieldSetter("clientBuyingTriggers")}
                  />
                  <Field
                    label="How do they want to feel after their appointment?"
                    placeholder="e.g. Confident walking out. Like themselves, but better. Seen and understood."
                    hint="The emotional outcome is what your content should sell — not the service."
                    textarea
                    value={form.clientEmotionalOutcome}
                    onChange={fieldSetter("clientEmotionalOutcome")}
                  />
                </>
              )}
              {step === 5 && (
                <>
                  <Field label="Bookings per week (target)" placeholder="18" value={form.bookingsPerWeek} onChange={fieldSetter("bookingsPerWeek")} />
                  <Field label="Posts per week" placeholder="4" value={form.postsPerWeek} onChange={fieldSetter("postsPerWeek")} />
                  <Field label="Content pillars (comma separated)" placeholder="Results, Education, Behind the scenes, Client stories" value={form.pillars} onChange={fieldSetter("pillars")} />
                </>
              )}
              {step === 6 && (
                <>
                  <VisualRankingField
                    value={form.visualRanking}
                    onChange={(ranking) => setForm(f => ({ ...f, visualRanking: ranking }))}
                  />
                  <MoodboardField
                    urls={form.moodboardUrls}
                    labels={form.moodboardLabels}
                    onUrlChange={(i, url) => setForm(f => {
                      const urls = [...f.moodboardUrls];
                      urls[i] = url;
                      return { ...f, moodboardUrls: urls };
                    })}
                    onLabelChange={(i, label) => setForm(f => {
                      const labels = [...f.moodboardLabels];
                      labels[i] = label;
                      return { ...f, moodboardLabels: labels };
                    })}
                  />
                  <SelectField
                    label="Lighting preference"
                    value={form.lightingPreference}
                    onChange={fieldSetter("lightingPreference")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "natural_window", label: "Natural window light" },
                      { value: "golden_hour", label: "Golden hour / warm backlight" },
                      { value: "bright_even", label: "Bright even studio light" },
                      { value: "moody_directional", label: "Moody directional light" },
                      { value: "cool_overcast", label: "Cool overcast / diffused" },
                    ]}
                  />
                  <SelectField
                    label="Texture & material preference"
                    value={form.texturePreference}
                    onChange={fieldSetter("texturePreference")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "linen_cotton", label: "Linen & cotton — soft natural" },
                      { value: "marble_stone", label: "Marble & stone — clean luxury" },
                      { value: "concrete_raw", label: "Concrete & raw — contemporary" },
                      { value: "silk_gloss", label: "Silk & gloss — editorial shine" },
                      { value: "timber_clay", label: "Timber & clay — warm organic" },
                    ]}
                  />
                  <SelectField
                    label="Composition style"
                    value={form.compositionStyle}
                    onChange={fieldSetter("compositionStyle")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "close_crop", label: "Close crop — macro detail" },
                      { value: "negative_space", label: "Generous negative space" },
                      { value: "environmental", label: "Environmental — context and setting" },
                      { value: "symmetrical", label: "Clean symmetrical grid" },
                      { value: "off_centre", label: "Off-centre with deliberate tension" },
                    ]}
                  />
                  <SelectField
                    label="Environment preference"
                    value={form.environmentPreference}
                    onChange={fieldSetter("environmentPreference")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "in_salon", label: "In-salon only" },
                      { value: "lifestyle_outdoor", label: "Lifestyle outdoor" },
                      { value: "studio_neutral", label: "Clean studio / neutral backdrop" },
                      { value: "home_intimate", label: "Home — intimate and personal" },
                      { value: "mixed", label: "Mixed — varies by content type" },
                    ]}
                  />
                  <SelectField
                    label="Visual finish"
                    value={form.finishPreference}
                    onChange={fieldSetter("finishPreference")}
                    options={[
                      { value: "", label: "Select…" },
                      { value: "matte_grain", label: "Matte with film grain" },
                      { value: "high_gloss", label: "High gloss editorial" },
                      { value: "warm_retouched", label: "Warm, lightly retouched" },
                      { value: "clean_digital", label: "Clean digital — crisp and precise" },
                      { value: "raw_honest", label: "Raw and honest — minimal editing" },
                    ]}
                  />
                  <Field
                    label="Audience lifestyle (optional)"
                    placeholder="She values slow mornings, shops intentionally, books 6 weeks in advance"
                    textarea
                    value={form.audienceLifestyle}
                    onChange={fieldSetter("audienceLifestyle")}
                  />
                  <Field
                    label="What are you trying to grow? (optional)"
                    placeholder="Fill my books with high-value bridal clients and reduce walk-ins"
                    textarea
                    value={form.commercialObjective}
                    onChange={fieldSetter("commercialObjective")}
                  />
                </>
              )}
            </div>

            {error && (
              <div className="mt-6 border hairline border-foreground/20 bg-nude/30 p-4 text-sm text-foreground">
                {error}
              </div>
            )}

            <div className="mt-10 flex items-center justify-between">
              <button
                disabled={step === 1 || saving}
                onClick={() => { setStepErrors({}); setStep((s) => Math.max(1, s - 1)); }}
                className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground disabled:opacity-30"
              >
                ← Back
              </button>
              {step < STEPS.length ? (
                <button
                  onClick={() => { if (validateStep(step)) setStep((s) => Math.min(STEPS.length, s + 1)); }}
                  className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={() => { if (validateStep(step)) handleSave(); }}
                  disabled={saving}
                  className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Brand DNA"}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <h3 className="eyebrow mb-4">Why this matters</h3>
          <div className="artifact p-6 text-sm text-taupe leading-relaxed space-y-4">
            {step < 6 && (
              <>
                <p>Your Brand DNA is what makes AI-generated posts sound like <em className="not-italic text-foreground">you</em> instead of a generic template.</p>
                <p>Your brand colours appear on your Brand DNA page and may be used in future visual templates.</p>
                <p>You can edit any of these answers later from the Brand DNA page.</p>
              </>
            )}
            {step === 6 && (
              <>
                <p>Visual direction is what moves your content from polished to <em className="not-italic text-foreground">recognisable</em>.</p>
                <p>Upload up to 4 moodboard reference images and label what each one represents — lighting you love, a vibe you want, a composition that feels right.</p>
                <p>The AI will use these references for every image it generates for you.</p>
                <p className="text-[11px]">You can skip any dropdown if you're not sure yet — you can always come back and update these.</p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  textarea,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  placeholder: string;
  textarea?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">{label}</label>
      {hint && <p className="text-[11px] text-taupe/70 mb-2 leading-relaxed">{hint}</p>}
      {textarea ? (
        <textarea
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b hairline text-base py-2 outline-none focus:border-foreground transition-colors resize-none"
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b hairline text-base py-2 outline-none focus:border-foreground transition-colors"
        />
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const displayHex = value || "#888888";
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">{label}</label>
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer flex-shrink-0">
          <div
            className="w-10 h-10 border hairline"
            style={{ backgroundColor: value || "transparent" }}
          />
          <input
            type="color"
            value={displayHex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        <input
          type="text"
          placeholder="#c4a882"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          className="flex-1 bg-transparent border-b hairline text-base py-2 outline-none focus:border-foreground transition-colors"
          maxLength={7}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground flex-shrink-0"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b hairline text-base py-2 outline-none focus:border-foreground transition-colors appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

const MOODBOARD_USAGE_OPTIONS = [
  { value: "", label: "How to use this image…" },
  { value: "overall_mood", label: "Overall mood & feeling" },
  { value: "colour_only", label: "Colour palette only" },
  { value: "lighting_only", label: "Lighting quality only" },
  { value: "composition_only", label: "Composition & framing only" },
  { value: "texture_only", label: "Texture & materials only" },
];

function MoodboardField({
  urls,
  labels,
  onUrlChange,
  onLabelChange,
}: {
  urls: string[];
  labels: string[];
  onUrlChange: (i: number, url: string) => void;
  onLabelChange: (i: number, label: string) => void;
}) {
  const SLOTS = 8;
  const fileRefs = Array.from({ length: SLOTS }, () => useRef<HTMLInputElement>(null));
  const [uploading, setUploading] = useState<Record<number, boolean>>({});

  const handleFile = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(u => ({ ...u, [i]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/brand-dna/upload-moodboard', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUrlChange(i, res.data.data?.url || res.data.url || '');
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(u => ({ ...u, [i]: false }));
    }
  };

  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">
        Moodboard references <span className="text-taupe/50">(up to 8 images)</span>
      </label>
      <p className="text-[11px] text-taupe/70 mb-4 leading-relaxed">
        Upload reference images and tell the AI how to use each one — colour palette, lighting, composition, texture, or overall mood.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: SLOTS }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            {urls[i] ? (
              <div className="relative aspect-square border hairline overflow-hidden bg-nude/10">
                <img src={urls[i]} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onUrlChange(i, '')}
                  className="absolute top-1 right-1 bg-foreground text-offwhite text-[9px] px-1.5 py-0.5"
                >×</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRefs[i].current?.click()}
                disabled={uploading[i]}
                className="aspect-square border hairline border-dashed flex flex-col items-center justify-center text-taupe hover:bg-nude/20 transition-colors disabled:opacity-40 gap-1"
              >
                <span className="text-xl leading-none">+</span>
                <span className="text-[9px] uppercase tracking-widest">
                  {uploading[i] ? "Uploading…" : `Ref ${i + 1}`}
                </span>
              </button>
            )}
            <input ref={fileRefs[i]} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(i, e)} />
            <select
              value={labels[i] || ''}
              onChange={(e) => onLabelChange(i, e.target.value)}
              className="w-full bg-transparent border-b hairline text-[11px] py-1 outline-none focus:border-foreground transition-colors appearance-none cursor-pointer text-taupe"
            >
              {MOODBOARD_USAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

const VISUAL_DIRECTIONS = [
  { value: "quiet_luxury", label: "Quiet Luxury", description: "Restrained, expensive-feeling, warm neutrals and negative space." },
  { value: "editorial_beauty", label: "Editorial Beauty", description: "High-contrast, magazine-quality, skin-first and bold." },
  { value: "warm_lifestyle", label: "Warm Lifestyle", description: "Golden light, organic materials, intimate and personal." },
  { value: "clean_clinical", label: "Clean Clinical", description: "Precise, cool whites, trusted and professional." },
  { value: "bold_social", label: "Bold Social-First", description: "High energy, graphic, colour-forward and scroll-stopping." },
];

function VisualRankingField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ranking: string[]) => void;
}) {
  const ranked = VISUAL_DIRECTIONS.map(d => ({
    ...d,
    rank: value.indexOf(d.value) >= 0 ? value.indexOf(d.value) + 1 : null,
  }));

  const toggleRank = (dirValue: string) => {
    const current = [...value];
    const idx = current.indexOf(dirValue);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else if (current.length < 5) {
      current.push(dirValue);
    }
    onChange(current);
  };

  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">Visual direction ranking</label>
      <p className="text-[11px] text-taupe/70 mb-4 leading-relaxed">
        Select and rank your visual directions from 1 (primary) to 5 (accent). The AI leads with your first choice and uses others as supporting influences.
      </p>
      <div className="space-y-2">
        {ranked.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => toggleRank(d.value)}
            className={
              "w-full flex items-center gap-4 p-4 border hairline text-left transition-colors " +
              (d.rank !== null ? "bg-foreground text-offwhite border-foreground" : "bg-card hover:bg-nude/20")
            }
          >
            <div className={
              "size-7 shrink-0 flex items-center justify-center text-[11px] font-bold border " +
              (d.rank !== null ? "border-offwhite/40 text-offwhite" : "border-border text-taupe")
            }>
              {d.rank ?? "—"}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${d.rank !== null ? "text-offwhite" : "text-foreground"}`}>{d.label}</p>
              <p className={`text-[11px] mt-0.5 ${d.rank !== null ? "text-offwhite/60" : "text-taupe"}`}>{d.description}</p>
            </div>
            {d.rank !== null && (
              <span className="text-[9px] uppercase tracking-widest text-offwhite/60 shrink-0">Tap to remove</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function LogoUploadField({
  value,
  position,
  onUrlChange,
  onPositionChange,
}: {
  value: string;
  position: string;
  onUrlChange: (v: string) => void;
  onPositionChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'logo');
      const res = await api.post('/brand-dna/upload-logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUrlChange(res.data.data?.url || res.data.url || '');
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">
        Logo <span className="text-taupe/50">(optional — added to every post)</span>
      </label>
      <div className="flex items-center gap-4">
        {value ? (
          <div className="relative size-16 border hairline bg-nude/20 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={value} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
            <button
              type="button"
              onClick={() => onUrlChange("")}
              className="absolute top-0.5 right-0.5 text-[9px] bg-foreground text-offwhite px-1"
            >×</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="size-16 border hairline bg-card flex items-center justify-center text-[9px] uppercase tracking-widest text-taupe hover:bg-nude/20 flex-shrink-0 disabled:opacity-50"
          >
            {uploading ? "..." : "Upload"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg" className="hidden" onChange={handleFile} />

        {value && (
          <div className="flex-1">
            <p className="text-[9px] uppercase tracking-widest text-taupe mb-1">Position on post</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                { value: "bottom_right", label: "Bottom right" },
                { value: "bottom_left",  label: "Bottom left" },
                { value: "top_right",    label: "Top right" },
                { value: "top_left",     label: "Top left" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onPositionChange(p.value)}
                  className={"text-[9px] uppercase tracking-widest px-2 py-1 border hairline transition-colors " +
                    (position === p.value ? "bg-foreground text-offwhite" : "text-taupe hover:text-foreground")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
