import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useFeatureFlag } from "@/lib/feature-flags";
import { saveBrandDna, fetchBrandDnaForEditing, type OnboardingPayload } from "@/lib/providers/brand-dna-save";

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
  { id: 1, name: "About you", help: "Your name, niche and where you work." },
  { id: 2, name: "Services", help: "What you offer and which services you want to grow." },
  { id: 3, name: "Voice", help: "How you sound — what you always say, what you never say." },
  { id: 4, name: "Ideal client", help: "Who you want to attract." },
  { id: 5, name: "Goals", help: "Bookings per week, posting frequency, content pillars." },
];

const EMPTY: OnboardingPayload = {
  displayName: "",
  niche: "",
  city: "",
  signatureService: "",
  otherServices: "",
  voiceWords: "",
  alwaysDo: "",
  neverDo: "",
  ageRange: "",
  cities: "",
  idealClient: "",
  bookingsPerWeek: "",
  postsPerWeek: "",
  pillars: "",
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
    setSaving(true); // Keep UI in saving state until result is handled
    if (res.kind === "ok") {
      setSaved(true);
    } else if (res.kind === "anon") {
      setError("Please sign in to save your Brand DNA.");
    } else {
      setError(res.message);
    }
    setSaving(false);
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
                </>
              )}
              {step === 2 && (
                <>
                  <Field label="Service you want to grow" placeholder="6-week pigmentation protocol" value={form.signatureService} onChange={fieldSetter("signatureService")} />
                  <Field label="Other services you offer" placeholder="Signature facial, botanical peel" textarea value={form.otherServices} onChange={fieldSetter("otherServices")} />
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="Three words that describe how you speak" placeholder="Calm · Expert · Warm" value={form.voiceWords} onChange={fieldSetter("voiceWords")} />
                  <Field label="What you always do in a post" placeholder="Lead with the result the client felt" textarea value={form.alwaysDo} onChange={fieldSetter("alwaysDo")} />
                  <Field label="What you never do (one per line)" placeholder="use emojis&#10;mention discounts&#10;use slang" textarea value={form.neverDo} onChange={fieldSetter("neverDo")} />
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
