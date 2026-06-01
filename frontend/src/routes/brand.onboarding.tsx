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
};

function OnboardingPage() {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      <div className="grid grid-cols-5 gap-px bg-border border hairline mb-12">
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
                  <Field label="Your name" placeholder="Von Glass" value={form.displayName} onChange={fieldSetter("displayName")} />
                  <Field label="Your niche" placeholder="Holistic facialist" value={form.niche} onChange={fieldSetter("niche")} />
                  <Field label="City" placeholder="Paris 3e" value={form.city} onChange={fieldSetter("city")} />
                  <ColorField label="Primary brand colour" value={form.primaryColor} onChange={fieldSetter("primaryColor")} />
                  <ColorField label="Secondary brand colour" value={form.secondaryColor} onChange={fieldSetter("secondaryColor")} />
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
                  <Field label="Service you want to grow" placeholder="6-week pigmentation protocol" value={form.signatureService} onChange={fieldSetter("signatureService")} />
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
                  <Field label="What you always do in a post" placeholder="Lead with the result the client felt" textarea value={form.alwaysDo} onChange={fieldSetter("alwaysDo")} />
                  <Field label="What you never do (one per line)" placeholder="use emojis&#10;mention discounts&#10;use slang" textarea value={form.neverDo} onChange={fieldSetter("neverDo")} />
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
                  <Field label="Cities" placeholder="Paris, Antwerp, Copenhagen" value={form.cities} onChange={fieldSetter("cities")} />
                  <Field label="What is she looking for?" placeholder="Quiet expertise — not a quick fix" textarea value={form.idealClient} onChange={fieldSetter("idealClient")} />
                </>
              )}
              {step === 5 && (
                <>
                  <Field label="Bookings per week (target)" placeholder="18" value={form.bookingsPerWeek} onChange={fieldSetter("bookingsPerWeek")} />
                  <Field label="Posts per week" placeholder="4" value={form.postsPerWeek} onChange={fieldSetter("postsPerWeek")} />
                  <Field label="Content pillars (comma separated)" placeholder="Results, Education, Behind the scenes, Client stories" value={form.pillars} onChange={fieldSetter("pillars")} />
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
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground disabled:opacity-30"
              >
                ← Back
              </button>
              {step < STEPS.length ? (
                <button
                  onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                  className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleSave}
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
            <p>Your Brand DNA is what makes AI-generated posts sound like <em className="not-italic text-foreground">you</em> instead of a generic template.</p>
            <p>Your brand colours appear on your Brand DNA page and may be used in future visual templates.</p>
            <p>You can edit any of these answers later from the Brand DNA page.</p>
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
}: {
  label: string;
  placeholder: string;
  textarea?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">{label}</label>
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
