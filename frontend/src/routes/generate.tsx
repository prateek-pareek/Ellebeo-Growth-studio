import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import {
  type Appointment,
  type Category,
} from "@/lib/sample-data";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { useBrandDna, type BrandDnaView } from "@/lib/providers/brand-dna-provider";
import { z } from "zod";
import { toast } from "sonner";

const searchSchema = z.object({
  appointment: z.string().optional(),
});

export const Route = createFileRoute("/generate")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Generate from appointment — Elle.Be.O Growth" },
      { name: "description", content: "Turn an appointment into a post: pick the goal, the format, and let your Brand DNA shape the content." },
      { property: "og:title", content: "Turn appointments into posts — Elle.Be.O Growth" },
    ],
  }),
  component: GeneratePage,
});

// ---- types ----

type Goal = "showcase" | "educate" | "convert" | "availability" | "trust";
type Format = "Carousel" | "Reel" | "Story" | "Caption" | "TikTok";
type Step = "select" | "consent" | "goal" | "format" | "review";

const GOALS: { id: Goal; name: string; help: string }[] = [
  { id: "showcase", name: "Showcase a result", help: "Lead with the before-and-after." },
  { id: "educate", name: "Educate", help: "Explain a technique or aftercare." },
  { id: "convert", name: "Convert to a booking", help: "Direct CTA to book a service." },
  { id: "availability", name: "Promote availability", help: "Fill open slots this week." },
  { id: "trust", name: "Build trust", help: "Share a client story or quote." },
];

const FORMATS: { id: Format; name: string; help: string }[] = [
  { id: "Carousel", name: "Carousel", help: "3–5 slides, swipeable." },
  { id: "Reel", name: "Reel", help: "15–30s vertical video." },
  { id: "Story", name: "Story", help: "4-frame sequence, 24h." },
  { id: "Caption", name: "Caption", help: "Single image + caption." },
  { id: "TikTok", name: "TikTok", help: "Short vertical video." },
];

// ---- page ----

function GeneratePage() {
  const search = useSearch({ from: "/generate" });
  const navigate = useNavigate();
  const { data: appointments, source, error, isEmpty, loading } = useAppointments();
  const { data: brandDna, source: brandSource } = useBrandDna();

  const requestedId = search.appointment;
  const requestedMatch = requestedId
    ? appointments.find((a) => a.id === requestedId) ?? null
    : null;
  const idMissing = !!requestedId && !requestedMatch;

  const [appointment, setAppointment] = useState<Appointment | null>(requestedMatch);
  const [step, setStep] = useState<Step>(requestedMatch ? "consent" : "select");
  const [goal, setGoal] = useState<Goal>("showcase");
  const [format, setFormat] = useState<Format>("Carousel");
  
  // New state for API integration
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [backendVariants, setBackendVariants] = useState<Variant[] | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (appointment?.consent === "declined" && step !== "consent" && step !== "select") {
      setStep("consent");
    }
  }, [appointment, step]);

  useEffect(() => {
    if (appointment && !appointments.find((a) => a.id === appointment.id)) {
      setAppointment(null);
      setStep("select");
    }
  }, [appointments, appointment]);

  // Polling logic
  useEffect(() => {
    if (jobId && generating) {
      pollRef.current = window.setInterval(async () => {
        try {
          const res = await api.get(`/generation/jobs/${jobId}`);
          const status = res.data.data.state;
          setJobStatus(status);
          
          if (status === 'completed') {
            clearInterval(pollRef.current!);
            // Fetch the generated content
            const contentRes = await api.get(`/content?jobId=${jobId}`);
            const items = contentRes.data.data;
            
            // Map items to variants
            const mapped: Variant[] = items.map((item: any, i: number) => ({
              id: item.id,
              vibe: `Option ${i + 1}`,
              caption: item.caption || "",
              onImageText: item.hookSentence || "",
              slides: item.reelScript ? [item.reelScript] : [], // Simplified for now
              reelScript: item.reelScript ? [item.reelScript] : [],
              storySequence: [],
              cta: item.callToAction || "",
              hashtags: item.hashtags || [],
              bestTime: "Mon 08:15",
              qualityScore: 90 - i * 5,
            }));
            
            setBackendVariants(mapped);
            setGenerating(false);
          } else if (status === 'failed') {
            clearInterval(pollRef.current!);
            setGenerating(false);
            toast.error("Generation failed. Please try again.");
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, generating]);

  const handleGenerate = async () => {
    if (!appointment) return;
    setGenerating(true);
    setStep("review");
    setJobStatus("Queuing job...");
    
    try {
      const res = await api.post('/generation/generate', {
        appointmentId: appointment.id,
        goal: goal,
        formats: [format.toLowerCase()],
        platforms: ['instagram']
      });
      setJobId(res.data.data.jobId);
    } catch (e: any) {
      setGenerating(false);
      setStep("format");
      toast.error(e.response?.data?.message || "Failed to start generation");
    }
  };

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-8 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5">
          <p className="eyebrow">AI generation</p>
          {source === "cloud" && !error && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-sage">Live</span>
          )}
          {error && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">Showing sample preview</span>
          )}
          {(loading || (generating && step === 'review')) && (
            <span className="text-[9px] uppercase tracking-widest text-taupe">
              {generating ? `AI is working: ${jobStatus || 'Processing'}...` : 'Loading…'}
            </span>
          )}
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Turn this appointment into <span className="italic">content</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Every step is shaped by your Brand DNA — tone, pillar mix, ideal client, CTA style and visual direction.
        </p>
      </header>

      {idMissing ? (
        <NotFoundState requestedId={requestedId!} />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <Stepper step={step} onJump={(s) => setStep(s)} hasAppointment={!!appointment} />
          {appointment && step !== "select" && <ContextStrip appointment={appointment} />}

          <div className="mt-10 grid grid-cols-12 gap-8 lg:gap-12">
            <div className="col-span-12 lg:col-span-8">
              {step === "select" && (
                <SelectAppointment
                  appointments={appointments}
                  onPick={(a) => {
                    setAppointment(a);
                    setStep("consent");
                  }}
                />
              )}
              {step === "consent" && appointment && (
                <ConsentStep
                  appointment={appointment}
                  onContinue={() => setStep("goal")}
                  onBack={() => setStep("select")}
                />
              )}
              {step === "goal" && appointment?.consent !== "declined" && (
                <GoalStep
                  goal={goal}
                  setGoal={setGoal}
                  onContinue={() => setStep("format")}
                  onBack={() => setStep("consent")}
                />
              )}
              {step === "format" && appointment?.consent !== "declined" && (
                <FormatStep
                  format={format}
                  setFormat={setFormat}
                  onContinue={handleGenerate}
                  onBack={() => setStep("goal")}
                />
              )}
              {step === "review" && appointment && appointment.consent !== "declined" && (
                <ReviewStep
                  appointment={appointment}
                  goal={goal}
                  format={format}
                  onBack={() => setStep("format")}
                  generating={generating}
                  jobStatus={jobStatus}
                  backendVariants={backendVariants}
                />
              )}
            </div>

            <aside className="col-span-12 lg:col-span-4">
              <BrandDNAInfluence brandDna={brandDna} brandSource={brandSource} goal={goal} format={format} appointment={appointment} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="artifact p-10 text-center">
      <p className="eyebrow mb-3">No appointments yet</p>
      <p className="text-sm text-taupe leading-relaxed max-w-md mx-auto mb-6">
        Add your first appointment to start turning sessions into content.
      </p>
      <Link
        to="/appointments"
        className="inline-block bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
      >
        Go to appointments
      </Link>
    </div>
  );
}

function NotFoundState({ requestedId }: { requestedId: string }) {
  return (
    <div className="artifact p-10 text-center">
      <p className="eyebrow mb-3">Appointment not found</p>
      <p className="text-sm text-taupe leading-relaxed max-w-md mx-auto mb-6">
        We couldn't find appointment <span className="font-mono">{requestedId}</span> in your account.
      </p>
      <Link
        to="/appointments"
        className="inline-block bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
      >
        Back to appointments
      </Link>
    </div>
  );
}

// ---- stepper ----

function Stepper({
  step,
  onJump,
  hasAppointment,
}: {
  step: Step;
  onJump: (s: Step) => void;
  hasAppointment: boolean;
}) {
  const steps: { id: Step; label: string; sub: string }[] = [
    { id: "select", label: "Appointment", sub: "Pick the visit" },
    { id: "consent", label: "Consent", sub: "Confirm permissions" },
    { id: "goal", label: "Goal", sub: "Choose the angle" },
    { id: "format", label: "Format", sub: "Pick the surface" },
    { id: "review", label: "Review", sub: "Refine & schedule" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  const progress = Math.round(((idx + 1) / steps.length) * 100);
  return (
    <div>
      {/* Progress meter */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-border relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-foreground transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-taupe tabular-nums shrink-0">
          {idx + 1} of {steps.length}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-px bg-border border hairline">
        {steps.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          const clickable = hasAppointment || s.id === "select";
          return (
            <button
              key={s.id}
              onClick={() => clickable && onJump(s.id)}
              disabled={!clickable}
              aria-current={active ? "step" : undefined}
              className={
                "p-4 text-left transition-colors group " +
                (active
                  ? "bg-foreground text-offwhite"
                  : done
                    ? "bg-card hover:bg-nude/30"
                    : "bg-card text-taupe disabled:cursor-not-allowed")
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={
                    "inline-flex items-center justify-center size-4 rounded-full text-[9px] tabular-nums font-medium transition-colors " +
                    (active
                      ? "bg-nude text-foreground"
                      : done
                        ? "bg-sage text-offwhite"
                        : "bg-border text-taupe")
                  }
                >
                  {done ? "✓" : i + 1}
                </span>
                <p className={"text-[10px] uppercase tracking-widest " + (active ? "text-nude" : "text-taupe")}>
                  Step
                </p>
              </div>
              <p className="text-xs sm:text-sm font-medium leading-tight">{s.label}</p>
              <p
                className={
                  "hidden sm:block text-[10px] mt-1 leading-tight " +
                  (active ? "text-nude/80" : "text-taupe/80")
                }
              >
                {s.sub}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- persistent context strip (shown from consent step onward) ----

function ContextStrip({ appointment }: { appointment: Appointment }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-card border hairline">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[9px] uppercase tracking-widest text-taupe shrink-0">Working on</span>
        <span className="text-sm font-medium truncate">{appointment.clientName}</span>
      </div>
      <span className="text-taupe/50">·</span>
      <span className="text-xs text-taupe truncate">{appointment.service}</span>
      <span className="text-taupe/50">·</span>
      <span className="text-xs text-taupe shrink-0">{appointment.date}</span>
      <span className="ml-auto"><ConsentChip status={appointment.consent} /></span>
    </div>
  );
}

// ---- step 1: select appointment ----

function SelectAppointment({
  appointments,
  onPick,
}: {
  appointments: Appointment[];
  onPick: (a: Appointment) => void;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-4">Pick an appointment</h2>
      <p className="text-sm text-taupe mb-6 max-w-[60ch]">
        Choose the appointment to turn into a post. We'll check consent next.
      </p>
      <div className="space-y-px bg-border">
        {appointments.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a)}
            className="w-full text-left bg-card p-5 flex items-center gap-5 hover:bg-nude/20 transition-colors"
          >
            <div className="size-16 shrink-0 overflow-hidden bg-nude/30 ring-1 ring-border">
              {a.afterImage || a.beforeImage ? (
                <img src={a.afterImage ?? a.beforeImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[9px] uppercase tracking-widest text-taupe">No photo</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="eyebrow mb-1">{a.date} · {a.category}</p>
              <p className="font-serif text-lg truncate">{a.clientName}</p>
              <p className="text-xs text-taupe truncate">{a.service}</p>
            </div>
            <ConsentChip status={a.consent} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- step 2: consent ----

function ConsentStep({
  appointment,
  onContinue,
  onBack,
}: {
  appointment: Appointment;
  onContinue: () => void;
  onBack: () => void;
}) {
  const blocked = appointment.consent === "declined";
  const needsRequest = appointment.consent === "not_requested";
  const pending = appointment.consent === "pending";
  const granted = appointment.consent === "granted";

  // Declined: replace the entire body with a dedicated blocked state.
  if (blocked) {
    return <DeclinedBlock appointment={appointment} onBack={onBack} />;
  }

  return (
    <div>
      <h2 className="eyebrow mb-4">Confirm client consent</h2>
      <p className="text-sm text-taupe mb-6 max-w-[60ch]">
        Before AI drafts anything, confirm what {appointment.clientName} has agreed to. We will not generate content without consent.
      </p>

      {/* Status banner — large, scannable */}
      <div
        className={
          "mb-6 border hairline p-4 sm:p-5 flex items-start gap-4 " +
          (granted
            ? "bg-sage/10"
            : pending
              ? "bg-nude/30"
              : "bg-card")
        }
      >
        <span
          className={
            "size-2 rounded-full mt-2 shrink-0 " +
            (granted ? "bg-sage" : pending ? "bg-foreground" : "bg-taupe")
          }
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">
            {granted ? "Cleared to publish" : pending ? "Awaiting client response" : "Consent required"}
          </p>
          <p className="text-sm leading-relaxed">
            {granted
              ? `${appointment.clientName} has granted consent. You can draft, review and schedule content from this appointment.`
              : pending
                ? `${appointment.clientName} has been asked but hasn't replied yet. You can prepare a draft now — publishing is held until they approve.`
                : `No consent has been requested yet. Send a request to ${appointment.clientName} before publishing anything from this visit.`}
          </p>
        </div>
      </div>

      <div className="artifact p-6 sm:p-8">
        <div className="flex items-baseline justify-between mb-5">
          <p className="font-serif text-2xl">{appointment.clientName}</p>
          <ConsentChip status={appointment.consent} />
        </div>
        <p className="text-xs text-taupe mb-6">{appointment.service} · {appointment.date}</p>

        <p className="eyebrow mb-3">Permissions on file</p>
        <ul className="space-y-2.5 mb-6">
          <Permission label="Use photos in posts" granted={granted} />
          <Permission label="Show client's face" granted={granted} />
          <Permission label="Tag client account" granted={false} />
          <Permission label="Use first name in caption" granted={granted} />
          <Permission label="Use anonymously only" granted={pending} />
          <Permission label="Allow Elle.Be.O to feature this content" granted={granted} />
        </ul>

        {needsRequest && (
          <div className="border hairline p-4">
            <p className="text-sm mb-3">No consent on file. Send a request to the client now — we'll generate the post once they reply.</p>
            <Link
              to="/consent/$id"
              params={{ id: appointment.id }}
              className="inline-block text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
            >
              Send consent request
            </Link>
          </div>
        )}

        {pending && (
          <div className="border hairline p-4">
            <p className="text-sm mb-3">Consent is pending. You can prepare drafts now and publish only after the client approves.</p>
            <Link
              to="/consent/$id"
              params={{ id: appointment.id }}
              className="inline-block text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card"
            >
              Resend request
            </Link>
          </div>
        )}
      </div>

      <StepNav
        onBack={onBack}
        onContinue={onContinue}
        continueLabel={pending || needsRequest ? "Continue (will hold for consent)" : "Continue"}
      />
    </div>
  );
}

// ---- declined consent: dedicated blocked state, no draft, no preview ----

function DeclinedBlock({
  appointment,
  onBack,
}: {
  appointment: Appointment;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-4">Content generation</h2>
      <div className="artifact p-8 sm:p-10 border-l-2 border-l-destructive">
        <div className="flex items-start gap-5">
          {/* Lock glyph */}
          <div className="shrink-0 size-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-5 text-destructive"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="9" rx="1.5" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-destructive mb-2">
              Consent declined · generation blocked
            </p>
            <h3 className="font-serif text-2xl sm:text-3xl leading-tight mb-3">
              Content generation is blocked for this appointment
            </h3>
            <p className="text-sm leading-relaxed text-foreground/90 max-w-[60ch] mb-2">
              The client declined consent, so we won't draft, preview, or publish content tied to this visit.
            </p>
            <p className="text-sm leading-relaxed text-taupe max-w-[60ch] mb-6">
              You can still review the appointment, or revisit the consent record if {appointment.clientName.split(" ")[0]} changes their mind.
            </p>

            <div className="flex flex-wrap gap-2">
              <Link
                to="/appointments"
                className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2.5 hover:bg-card transition-colors"
              >
                Back to appointments
              </Link>
              <Link
                to="/consent/$id"
                params={{ id: appointment.id }}
                className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2.5 hover:bg-taupe transition-colors"
              >
                Open consent record
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button onClick={onBack} className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
          ← Choose a different appointment
        </button>
      </div>
    </div>
  );
}

function Permission({ label, granted }: { label: string; granted: boolean }) {
  return (
    <li className="flex items-center justify-between border-b hairline pb-2 last:border-0 last:pb-0">
      <span className="text-sm">{label}</span>
      <span className={"text-[10px] uppercase tracking-widest " + (granted ? "text-sage" : "text-taupe")}>
        {granted ? "Granted" : "Not granted"}
      </span>
    </li>
  );
}

// ---- step 3: goal ----

function GoalStep({
  goal,
  setGoal,
  onContinue,
  onBack,
}: {
  goal: Goal;
  setGoal: (g: Goal) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-4">Choose a content goal</h2>
      <p className="text-sm text-taupe mb-6 max-w-[60ch]">
        The goal shapes the angle, the structure and the call to action.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border hairline">
        {GOALS.map((g) => {
          const active = g.id === goal;
          return (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={"p-5 text-left transition-colors " + (active ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
            >
              <p className={"text-[10px] uppercase tracking-widest mb-2 " + (active ? "text-nude" : "text-taupe")}>Goal</p>
              <p className="font-serif text-xl mb-1">{g.name}</p>
              <p className={"text-xs " + (active ? "text-nude/80" : "text-taupe")}>{g.help}</p>
            </button>
          );
        })}
      </div>
      <StepNav onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

// ---- step 4: format ----

function FormatStep({
  format,
  setFormat,
  onContinue,
  onBack,
}: {
  format: Format;
  setFormat: (f: Format) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-4">Choose a format</h2>
      <p className="text-sm text-taupe mb-6 max-w-[60ch]">
        Pick how this should appear. Carousel is best for transformations; reels for movement; stories for behind-the-chair.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={"p-5 text-left transition-colors " + (active ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
            >
              <p className={"text-[10px] uppercase tracking-widest mb-2 " + (active ? "text-nude" : "text-taupe")}>Format</p>
              <p className="font-serif text-xl mb-1">{f.name}</p>
              <p className={"text-xs " + (active ? "text-nude/80" : "text-taupe")}>{f.help}</p>
            </button>
          );
        })}
      </div>
      <StepNav onBack={onBack} onContinue={onContinue} continueLabel="Generate 3 options" />
    </div>
  );
}

// ---- step 5: review (the AI output) ----

type Variant = {
  id: string;
  vibe: string;
  caption: string;
  onImageText: string;
  slides: string[];
  reelScript: string[];
  storySequence: string[];
  cta: string;
  hashtags: string[];
  bestTime: string;
  qualityScore: number;
};

// ---- category vocabulary (keeps copy specific, not generic) ----

type CategoryVocab = {
  noun: string;             // "the colour", "the lashes"
  craft: string;            // "lived-in colour", "lash mapping"
  verb: string;             // what we did
  resultWord: string;       // "tone", "shape", "lift"
  longevity: string;        // "six weeks", "three weeks"
  maintenance: string;      // a real aftercare line
  hashtag: string;          // category-specific tag
  serviceLabel: string;     // for availability copy
};

const CATEGORY_VOCAB: Record<Category, CategoryVocab> = {
  Hairdresser: {
    noun: "the cut", craft: "the cut",
    verb: "shaped", resultWord: "shape",
    longevity: "ten weeks",
    maintenance: "Air-dry on the diagonal. Trim every ten weeks to hold the line.",
    hashtag: "#precisioncut", serviceLabel: "cut",
  },
  Colourist: {
    noun: "the colour", craft: "lived-in colour",
    verb: "painted", resultWord: "tone",
    longevity: "twelve to fourteen weeks",
    maintenance: "Sulphate-free wash. Gloss refresh at week eight to keep the depth.",
    hashtag: "#livedincolour", serviceLabel: "colour appointment",
  },
  "Bridal makeup": {
    noun: "the look", craft: "bridal makeup",
    verb: "built", resultWord: "finish",
    longevity: "twelve hours of wear",
    maintenance: "Blot, don't powder. Carry the lip and one cotton bud.",
    hashtag: "#bridalmakeup", serviceLabel: "bridal trial",
  },
  "Lash & brow": {
    noun: "the lashes", craft: "lash mapping",
    verb: "mapped", resultWord: "shape",
    longevity: "three to four weeks",
    maintenance: "Lash brush in the morning. No oil cleansers near the lash line.",
    hashtag: "#lashmapping", serviceLabel: "lash refill",
  },
  "Nail artist": {
    noun: "the nails", craft: "the set",
    verb: "shaped", resultWord: "finish",
    longevity: "three weeks",
    maintenance: "Cuticle oil twice a day. Gloves for dishes — yes, really.",
    hashtag: "#nailset", serviceLabel: "nail appointment",
  },
  Injector: {
    noun: "the treatment", craft: "the treatment",
    verb: "treated", resultWord: "result",
    longevity: "three to four months",
    maintenance: "No heat or pressure for 24 hours. Sleep on your back tonight.",
    hashtag: "#aestheticmedicine", serviceLabel: "consultation",
  },
  "Skin therapist": {
    noun: "the skin", craft: "the protocol",
    verb: "treated", resultWord: "clarity",
    longevity: "four weeks of visible change",
    maintenance: "SPF 50 every morning. Hold actives for 48 hours after.",
    hashtag: "#skintherapy", serviceLabel: "skin consultation",
  },
  Barber: {
    noun: "the cut", craft: "the cut",
    verb: "shaped", resultWord: "shape",
    longevity: "four weeks",
    maintenance: "Pre-shampoo oil twice a week. Book the next at week three.",
    hashtag: "#barbering", serviceLabel: "cut",
  },
};

// ---- tone derivation from Brand DNA voice ----

function deriveTone(): { register: "warm" | "neutral" | "bold"; ban: RegExp[] } {
  const v = sampleBrandDNA.voice.summary.toLowerCase();
  const ban: RegExp[] = [];
  if (sampleBrandDNA.voice.dont.some((d) => /emoji|hype/i.test(d))) {
    ban.push(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu);
  }
  if (sampleBrandDNA.voice.dont.some((d) => /discount/i.test(d))) {
    ban.push(/discount|deal|sale/gi);
  }
  const register = /bold|direct/.test(v) ? "bold" : /calm|warm|quiet/.test(v) ? "warm" : "neutral";
  return { register, ban };
}

function applyTone(text: string): string {
  const { ban } = deriveTone();
  let t = text;
  ban.forEach((r) => (t = t.replace(r, "")));
  return t.replace(/\s+/g, " ").trim();
}

// ---- CTAs — specific, never "book now" / "link in bio" ----

function ctaFor(goal: Goal, v: CategoryVocab, a: Appointment): { short: string; long: string } {
  const first = a.clientName.split(" ")[0];
  switch (goal) {
    case "showcase":
      return {
        short: `Open a 15-minute ${v.serviceLabel} consult`,
        long: `If you'd like ${v.noun} considered like ${first}'s, open a 15-minute consult — DM the word "consult" and I'll send three times.`,
      };
    case "educate":
      return {
        short: "Save this for your next appointment",
        long: `Save this so you can show me at your next ${v.serviceLabel} — it makes the brief faster and the result sharper.`,
      };
    case "convert":
      return {
        short: `Hold a ${v.serviceLabel} this month`,
        long: `Two ${v.serviceLabel}s left this month. Reply with a date that works and I'll hold it for 24 hours.`,
      };
    case "availability":
      return {
        short: "Take a Tuesday or Thursday slot",
        long: `Tuesday 11:00 and Thursday 14:30 are open this week. Reply with the time and it's yours.`,
      };
    case "trust":
      return {
        short: `Hear it from ${first}`,
        long: `${first}'s words, not mine. If that sounds like the kind of room you'd want to sit in, the consult form is in my profile.`,
      };
  }
}

// ---- hashtag composer — category + craft, no spray-and-pray ----

function hashtagsFor(goal: Goal, v: CategoryVocab, a: Appointment): string[] {
  const city = sampleBrandDNA.idealClient.cities.split("·")[0].trim().toLowerCase();
  const base = [v.hashtag, `#${city}${a.category.toLowerCase().replace(/\s|&/g, "")}`];
  const byGoal: Record<Goal, string[]> = {
    showcase: ["#beforeafter", "#realclient"],
    educate: ["#consultnotes", "#aftercare"],
    convert: ["#nowbooking", `#${city}studio`],
    availability: ["#thisweek", `#${city}studio`],
    trust: ["#clientwords", "#repeatclient"],
  };
  return [...base, ...byGoal[goal]].slice(0, 5);
}

// ---- format-specific structure builders ----

function slidesFor(goal: Goal, v: CategoryVocab, a: Appointment): string[] {
  const first = a.clientName.split(" ")[0];
  switch (goal) {
    case "showcase":
      return [
        `01 · ${first}'s brief, in her words`,
        `02 · Before — natural light, no filter`,
        `03 · The choice: why ${v.craft}, not the obvious option`,
        `04 · The reveal — same window, same light`,
        `05 · Built to hold for ${v.longevity}`,
        `06 · How to book a 15-minute consult`,
      ];
    case "educate":
      return [
        `01 · The question I get every week`,
        `02 · What I look at first on ${v.noun}`,
        `03 · What I won't do, and why`,
        `04 · The one thing that changes the result`,
        `05 · Aftercare in two lines`,
        `06 · Save this for your next visit`,
      ];
    case "convert":
      return [
        `01 · A result from this week`,
        `02 · What's included in a ${v.serviceLabel}`,
        `03 · How long it takes, what it costs`,
        `04 · How to hold a slot`,
      ];
    case "availability":
      return [
        `01 · Two times open this week`,
        `02 · What we can do in that window`,
        `03 · How to claim it`,
      ];
    case "trust":
      return [
        `01 · ${first}, in her own words`,
        `02 · What she came in asking for`,
        `03 · What she walked out with`,
        `04 · One year later`,
      ];
  }
}

function reelFor(goal: Goal, v: CategoryVocab, a: Appointment): string[] {
  const first = a.clientName.split(" ")[0];
  if (goal === "educate") {
    return [
      `0:00 · Hook — "The thing I wish more clients asked about ${v.noun}."`,
      `0:04 · Cut to hands on ${v.noun}, close`,
      `0:10 · Voiceover: the one decision that changes everything`,
      `0:18 · Show the wrong way, then the right way`,
      `0:26 · End card — "Save this for your next ${v.serviceLabel}."`,
    ];
  }
  if (goal === "availability" || goal === "convert") {
    return [
      `0:00 · Result on screen, no text yet`,
      `0:03 · Cut: "Two ${v.serviceLabel}s open this week."`,
      `0:08 · Quick cut of the studio, calm`,
      `0:14 · How to reply — DM the word "yes"`,
      `0:20 · End card — name, suburb, response time`,
    ];
  }
  if (goal === "trust") {
    return [
      `0:00 · ${first} on camera, mid-sentence`,
      `0:06 · B-roll of her finished ${v.noun}`,
      `0:14 · Back to ${first} — the line that lands`,
      `0:22 · Cut to your hands working`,
      `0:28 · End card — "Real client. Two years in."`,
    ];
  }
  // showcase
  return [
    `0:00 · Before, hands moving in`,
    `0:05 · The technique — one detailed shot`,
    `0:14 · The reveal — slow pan, natural light`,
    `0:22 · ${first}'s reaction — quiet, not staged`,
    `0:28 · End card — "Built to hold for ${v.longevity}."`,
  ];
}

function storyFor(goal: Goal, v: CategoryVocab): string[] {
  switch (goal) {
    case "showcase":
      return ["Frame 1 · The chair, empty", "Frame 2 · Mid-process, hands only", "Frame 3 · The reveal", "Frame 4 · Tap for a consult"];
    case "educate":
      return ["Frame 1 · The question (poll sticker)", "Frame 2 · Short answer, on-image text", "Frame 3 · Show the proof", "Frame 4 · Tap to save"];
    case "convert":
      return ["Frame 1 · This week's result", "Frame 2 · What a " + v.serviceLabel + " includes", "Frame 3 · Two times left", "Frame 4 · DM to hold"];
    case "availability":
      return ["Frame 1 · Tuesday 11:00", "Frame 2 · Thursday 14:30", "Frame 3 · What we can do", "Frame 4 · Reply with the time"];
    case "trust":
      return ["Frame 1 · Client quote, on linen", "Frame 2 · Her result", "Frame 3 · Year-on-year photo", "Frame 4 · Read more"];
  }
}

function buildVariants(goal: Goal, format: Format, a: Appointment): Variant[] {
  const v = CATEGORY_VOCAB[a.category];
  const first = a.clientName.split(" ")[0];
  const cta = ctaFor(goal, v, a);
  const hashtags = hashtagsFor(goal, v, a);
  const note = a.notes ? a.notes.replace(/[.\s]+$/, "") + ". " : "";

  // Captions are written per goal × category so they read specific, not templated.
  const captions: Record<Goal, [string, string, string]> = {
    showcase: [
      `${first} asked for ${v.noun} that wouldn't fight her on a Wednesday morning. We ${v.verb} around how she actually wears it — parted to one side, air-dried, no tools. ${note}It's built to hold its ${v.resultWord} for ${v.longevity}, and to grow out without a hard line. ${cta.long}`,
      `Three things shaped ${first}'s ${v.craft} today: the way the light hits her desk at 9am, a job that doesn't allow weekly upkeep, and a quiet preference for "expensive but not noticed." Everything else followed from that. ${cta.long}`,
      `Most of the work on ${first}'s ${v.noun} happened before I picked anything up — fifteen minutes of looking, a conversation about her last six months, and one honest question about how much time she actually has. ${cta.long}`,
    ],
    educate: [
      `The question I'm asked most about ${v.noun}: how do you make it last? Three honest answers, none of them about a product. ${note}${cta.long}`,
      `What I look at before I touch ${v.noun}: the way you part it, the way light falls on your face at the time of day you most need to look like yourself, and what your last appointment didn't quite get right. ${cta.long}`,
      `${v.maintenance} That's the whole aftercare conversation for a ${v.serviceLabel}. Anything more is usually selling you something. ${cta.long}`,
    ],
    convert: [
      `Two ${v.serviceLabel}s left this month, both midweek. If you've been holding off because the diary's been quiet on your side, this is the easy week to come in. ${cta.long}`,
      `A ${v.serviceLabel} this month would put you in clean ${v.noun} for the holidays without a rush appointment in December. Reply with a weekday that works. ${cta.long}`,
      `${first} sat in the chair on a Tuesday lunch break and was back at her desk by 2pm. Two of those windows are open next week. ${cta.long}`,
    ],
    availability: [
      `Tuesday 11:00 and Thursday 14:30 are open this week. Both are full ${v.serviceLabel}s — not a rushed slot, not a junior. Reply with the time and it's yours. ${cta.long}`,
      `Quiet midweek windows tend to be the best appointments of the month: more light in the studio, more time for the consult. Two are open this week. ${cta.long}`,
      `If your week is lighter than usual, mine is too. Two ${v.serviceLabel}s open Tuesday and Thursday — same care, calmer room. ${cta.long}`,
    ],
    trust: [
      `${first} has been coming in for two years. What she said today, almost word for word: "I stopped thinking about my ${v.noun}." That's the brief, every time. ${cta.long}`,
      `A note from ${first} after her ${v.serviceLabel}: "I didn't realise how much mental space the upkeep was taking until it was gone." ${cta.long}`,
      `Repeat clients tell you what new ones can't yet: whether the work holds, whether you listened, whether they'd send their sister. ${first}, two years in, did all three. ${cta.long}`,
    ],
  };

  const onImageByGoal: Record<Goal, [string, string, string]> = {
    showcase: [
      `Built to hold for ${v.longevity}.`,
      `${v.craft}, not the obvious option.`,
      `Same light. Same window. ${v.longevity} apart.`,
    ],
    educate: [
      `What I look at first on ${v.noun}.`,
      `The decision that changes the result.`,
      `Two-line aftercare. That's it.`,
    ],
    convert: [
      `Two ${v.serviceLabel}s left this month.`,
      `Midweek, full appointment, not a rush.`,
      `Reply with a weekday.`,
    ],
    availability: [
      `Tuesday 11:00 · Thursday 14:30.`,
      `Quiet week, calmer room.`,
      `Two windows, same care.`,
    ],
    trust: [
      `"I stopped thinking about my ${v.noun}."`,
      `Two years. Same chair.`,
      `What repeat clients know.`,
    ],
  };

  const vibes: [string, string, string] =
    deriveTone().register === "bold"
      ? ["Direct · result-led", "Editorial · considered", "Conversational · plainspoken"]
      : ["Editorial · considered", "Plainspoken · educational", "Direct · booking-led"];

  const slides = slidesFor(goal, v, a);
  const reelScript = reelFor(goal, v, a);
  const storySequence = storyFor(goal, v);

  // Posting time tuned to goal & format
  const bestTime =
    goal === "availability"
      ? "Mon 08:15 — when this week's diary check happens"
      : goal === "convert"
        ? "Thu 12:40 — lunch-break booking window"
        : goal === "educate"
          ? "Sun 19:20 — highest save rate in your audience"
          : goal === "trust"
            ? "Wed 21:05 — long-form attention window"
            : format === "Reel" || format === "TikTok"
              ? "Tue 18:30 — peak watch-through for your followers"
              : "Wed 09:10 — when carousels in your niche outperform";

  const scoreBase = goal === "showcase" ? 94 : goal === "trust" ? 92 : goal === "educate" ? 90 : 87;

  return ([0, 1, 2] as const).map((i) => ({
    id: `v${i + 1}`,
    vibe: vibes[i],
    caption: applyTone(captions[goal][i]),
    onImageText: applyTone(onImageByGoal[goal][i]),
    slides,
    reelScript,
    storySequence,
    cta: cta.short,
    hashtags,
    bestTime,
    qualityScore: scoreBase - i * 2,
  }));
}

function ReviewStep({
  appointment,
  goal,
  format,
  onBack,
  generating,
  jobStatus,
  backendVariants,
}: {
  appointment: Appointment;
  goal: Goal;
  format: Format;
  onBack: () => void;
  generating: boolean;
  jobStatus: string | null;
  backendVariants: Variant[] | null;
}) {
  const sampleVariants = useMemo(() => buildVariants(goal, format, appointment), [goal, format, appointment]);
  const variants = backendVariants || sampleVariants;
  const [activeId, setActiveId] = useState(variants[0].id);
  
  // Sync activeId when variants change
  useEffect(() => {
    if (variants.length > 0) setActiveId(variants[0].id);
  }, [variants]);

  const [edits, setEdits] = useState<string[]>([]);
  const active = variants.find((v) => v.id === activeId) || variants[0];

  const editedCaption = useMemo(() => {
    let c = active.caption;
    if (edits.includes("premium")) {
      c = c
        .replace(/\bbook(ing|ed)?\b/gi, (m) => (m.toLowerCase().startsWith("booking") ? "reservation" : "reserve"))
        .replace(/\bappointment\b/gi, "session")
        .replace(/\bDM\b/g, "Message")
        .replace(/\breply\b/gi, "write");
    }
    if (edits.includes("educational")) {
      c = "Quick note on why this works — " + c.charAt(0).toLowerCase() + c.slice(1);
    }
    if (edits.includes("direct")) {
      c = c
        .replace(/—.*?—/g, "")
        .replace(/\b(quietly|honestly|gently|softly)\b/gi, "")
        .replace(/\b(if you'd like|if you've been|if your week)\b/gi, "When you're ready,");
    }
    if (edits.includes("softer")) {
      c = "A small note from the studio. " + c;
    }
    if (edits.includes("noemoji")) {
      c = c.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
    }
    if (edits.includes("shorten")) {
      const sentences = c.split(/(?<=[.?!])\s+/).filter(Boolean);
      c = sentences.slice(0, 2).join(" ");
    }
    return c.replace(/\s+/g, " ").trim();
  }, [active, edits]);

  const toggleEdit = (id: string) => {
    setEdits((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };

  const captionLength = editedCaption.length;
  const hashtagCount = active.hashtags.length;

  if (generating && !backendVariants) {
    return (
      <div className="artifact p-12 text-center animate-pulse">
        <div className="flex flex-col items-center gap-6">
          <div className="size-12 rounded-full border-2 border-taupe border-t-foreground animate-spin" />
          <div className="space-y-2">
            <p className="eyebrow">AI is crafting your drafts</p>
            <p className="text-sm text-taupe">{jobStatus || 'Initializing agent...'}</p>
          </div>
          <p className="text-[10px] text-taupe max-w-[40ch] leading-relaxed">
            We're applying your Brand DNA, pillar mix, and tone rules to {appointment.clientName.split(" ")[0]}'s appointment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Studio header */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="eyebrow">Content studio · 3 drafts</h2>
          <button onClick={onBack} className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            ← Change goal or format
          </button>
        </div>
        <p className="text-sm text-taupe max-w-[60ch]">
          Three drafts shaped by your Brand DNA. Compare, refine, then schedule.
        </p>
      </div>

      {/* Variant tabs */}
      <div className="grid grid-cols-3 gap-px bg-border border hairline mb-8">
        {variants.map((v) => {
          const isActive = v.id === activeId;
          return (
            <button
              key={v.id}
              onClick={() => {
                setActiveId(v.id);
                setEdits([]);
              }}
              className={"p-4 text-left transition-colors " + (isActive ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
            >
              <p className={"text-[10px] uppercase tracking-widest mb-1 " + (isActive ? "text-nude" : "text-taupe")}>
                Option {v.id.replace("v", "")}
              </p>
              <p className="text-sm font-medium leading-tight mb-2">{v.vibe}</p>
              <p className={"text-[10px] tabular-nums " + (isActive ? "text-nude/80" : "text-taupe")}>
                Quality {v.qualityScore}
              </p>
            </button>
          );
        })}
      </div>

      {/* The output — premium content studio frame */}
      <div className="artifact mb-8 overflow-hidden">
        {/* Studio header bar */}
        <div className="px-6 sm:px-8 py-3 bg-foreground text-offwhite flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-sage" />
            <p className="text-[10px] uppercase tracking-widest text-nude">Draft preview</p>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-nude/70 tabular-nums">
            Option {active.id.replace("v", "")} · Quality {active.qualityScore}
          </p>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Visual preview — format-responsive */}
          <div className="lg:col-span-5">
            <FormatPreview
              format={format}
              appointment={appointment}
              onImageText={active.onImageText}
              slides={active.slides}
              reelScript={active.reelScript}
              storySequence={active.storySequence}
            />
            <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-taupe">
              <span>{format} · {appointment.category}</span>
              <span className="tabular-nums">Quality {active.qualityScore}</span>
            </div>
          </div>

          {/* Text output */}
          <div className="lg:col-span-7 space-y-6">
            <Section
              label="Caption"
              meta={
                <span className="tabular-nums">
                  {captionLength} chars · {hashtagCount} tags
                </span>
              }
              action={
                <button
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(editedCaption).catch(() => {});
                    }
                  }}
                  className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
                  title="Copy caption to clipboard"
                >
                  Copy
                </button>
              }
            >
              <p className="text-sm leading-relaxed whitespace-pre-line max-w-[62ch]">{editedCaption}</p>
            </Section>

            {format === "Carousel" && (
              <Section label="Carousel slides">
                <ol className="space-y-1.5 text-sm">
                  {active.slides.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-taupe tabular-nums w-6">{String(i + 1).padStart(2, "0")}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {(format === "Reel" || format === "TikTok") && (
              <Section label="Reel script">
                <ol className="space-y-1.5 text-sm">
                  {active.reelScript.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-taupe tabular-nums w-10">{s.split(" · ")[0]}</span>
                      <span>{s.split(" · ").slice(1).join(" · ")}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {format === "Story" && (
              <Section label="Story sequence">
                <ol className="space-y-1.5 text-sm">
                  {active.storySequence.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-taupe tabular-nums w-6">{String(i + 1).padStart(2, "0")}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Section label="Call to action">
                <p className="text-sm font-medium">{active.cta}</p>
              </Section>
              <Section label="Suggested posting time">
                <p className="text-sm">{active.bestTime}</p>
              </Section>
            </div>

            <Section label="Suggested hashtags">
              <div className="flex flex-wrap gap-1.5">
                {active.hashtags.map((h) => (
                  <span key={h} className="text-[11px] border hairline px-2 py-1 text-foreground">{h}</span>
                ))}
              </div>
            </Section>
          </div>
        </div>

        {/* Footer meta strip */}
        <div className="px-6 sm:px-8 py-3 border-t hairline bg-card flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-widest text-taupe">
          <span>{appointment.clientName}</span>
          <span className="text-taupe/40">·</span>
          <span>{appointment.service}</span>
          <span className="text-taupe/40">·</span>
          <span>{appointment.date}</span>
          <span className="ml-auto"><ConsentChip status={appointment.consent} /></span>
        </div>
      </div>

      {/* Edit controls */}
      <div className="mb-8">
        <p className="eyebrow mb-3">Refine this option</p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "premium", label: "Make more premium" },
            { id: "educational", label: "Make more educational" },
            { id: "direct", label: "Make more direct" },
            { id: "softer", label: "Make softer" },
            { id: "noemoji", label: "Remove emojis" },
            { id: "shorten", label: "Shorten" },
          ].map((c) => {
            const on = edits.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleEdit(c.id)}
                className={
                  "text-[11px] uppercase tracking-[0.18em] px-3 py-2 border hairline transition-colors " +
                  (on ? "bg-foreground text-offwhite" : "text-taupe hover:bg-card")
                }
              >
                {c.label}
              </button>
            );
          })}
          <button className="text-[11px] uppercase tracking-[0.18em] px-3 py-2 border hairline text-taupe hover:bg-card">
            + Create alternate version
          </button>
        </div>
      </div>

      {/* Final actions */}
      <div className="border-t hairline pt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-taupe">
          <span className="size-1.5 rounded-full bg-sage" />
          <span>Ready to schedule</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2.5 hover:bg-card">
            Save as draft
          </button>
          <Link
            to="/content"
            className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2.5 hover:bg-card"
          >
            Approve
          </Link>
          <Link
            to="/calendar"
            className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2.5"
          >
            Approve & schedule
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  meta,
  action,
  children,
}: {
  label: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[10px] uppercase tracking-widest text-taupe">{label}</p>
        {(meta || action) && (
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-taupe">
            {meta}
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ---- Brand DNA influence sidebar ----

function BrandDNAInfluence({
  brandDna,
  brandSource,
  goal,
  format,
  appointment,
}: {
  brandDna: BrandDnaView | null;
  brandSource: "sample" | "cloud";
  goal: Goal;
  format: Format;
  appointment: Appointment | null;
}) {
  const dna = brandDna ?? sampleBrandDNA;
  const ctaStyle =
    goal === "convert" || goal === "availability"
      ? "Direct booking-led"
      : goal === "educate"
        ? "Save / read more"
        : "Soft consultation";
  const visualStyle =
    format === "Reel" || format === "TikTok"
      ? "Slow pans · natural light"
      : "Editorial stills · linen tones";

  // Voice descriptors derived from the DNA voice summary
  const voiceWords = dna.voice.summary
    .split(/[,·.]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const pillar = appointment ? matchPillar(goal) : null;

  return (
    <div className="lg:sticky lg:top-6">
      <div className="flex items-baseline justify-between mb-4">
        <p className="eyebrow">Shaped by your Brand DNA</p>
        <Link to="/brand" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
          Open →
        </Link>
      </div>

      <div className="artifact p-5">
        {/* Header: provenance + archetype */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-sage" />
            <span className="text-[10px] uppercase tracking-widest text-sage">Active</span>
          </div>
          <span
            className={
              "text-[9px] uppercase tracking-widest border hairline px-2 py-0.5 " +
              (brandSource === "cloud" ? "text-sage" : "text-taupe")
            }
            title={brandSource === "cloud" ? "Live Brand DNA" : "Sample Brand DNA"}
          >
            {brandSource === "cloud" ? "Live" : "Sample"}
          </span>
        </div>

        <p className="font-serif text-xl mb-1">{dna.archetype}</p>
        <p className="text-xs text-taupe mb-4">{dna.oneLiner}</p>

        {/* Why this matters helper */}
        <p className="text-[11px] text-taupe leading-relaxed mb-5 pb-5 border-b hairline">
          Your Brand DNA shapes every line below — tone, hashtags, CTA style, even the suggested posting time.
        </p>

        {/* SECTION: Voice */}
        <BrandSection label="Voice" hint="How it reads">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {voiceWords.map((w) => (
              <span key={w} className="text-[10px] uppercase tracking-widest border hairline px-2 py-1 text-foreground">
                {w}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-taupe leading-relaxed">CTA style · {ctaStyle}</p>
        </BrandSection>

        {/* SECTION: Visual */}
        <BrandSection label="Visual" hint="How it looks">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              {dna.palette.map((c) => (
                <div
                  key={c}
                  className="size-5 rounded-sm ring-1 ring-border/40"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-widest text-taupe ml-1">Palette</span>
          </div>
          <p className="text-[11px] text-taupe leading-relaxed">{visualStyle}</p>
        </BrandSection>

        {/* SECTION: Signals */}
        <BrandSection label="Signals" hint="Who it's for" last>
          <ul className="space-y-1.5 text-[12px]">
            <li className="flex justify-between gap-3">
              <span className="text-taupe">Category</span>
              <span className="text-right">{dna.category}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-taupe">Ideal client</span>
              <span className="text-right">{dna.idealClient.age} · {dna.idealClient.cities.split("·")[0].trim()}</span>
            </li>
            {pillar && (
              <li className="flex justify-between gap-3">
                <span className="text-taupe">Pillar</span>
                <span className="text-right">{pillar}</span>
              </li>
            )}
          </ul>
        </BrandSection>
      </div>
    </div>
  );
}

function BrandSection({
  label,
  hint,
  children,
  last,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "pb-4 mb-4 border-b hairline"}>
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="text-[10px] uppercase tracking-widest text-foreground font-medium">{label}</p>
        <p className="text-[9px] uppercase tracking-widest text-taupe">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function matchPillar(goal: Goal) {
  switch (goal) {
    case "showcase":
      return "Transformations";
    case "educate":
      return "Education";
    case "convert":
    case "availability":
      return "Behind the chair";
    case "trust":
      return "Client stories";
  }
}

// ---- shared bits ----

function ConsentChip({ status }: { status: Appointment["consent"] }) {
  const map: Record<Appointment["consent"], { label: string; cls: string }> = {
    granted: { label: "Consent granted", cls: "text-sage" },
    pending: { label: "Consent pending", cls: "text-foreground" },
    declined: { label: "Consent declined", cls: "text-destructive" },
    not_requested: { label: "Consent required", cls: "text-taupe" },
  };
  const m = map[status];
  return <span className={"text-[10px] uppercase tracking-widest " + m.cls}>{m.label}</span>;
}

function StepNav({
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <button onClick={onBack} className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
        ← Back
      </button>
      <button
        onClick={onContinue}
        disabled={continueDisabled}
        className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {continueLabel}
      </button>
    </div>
  );
}

// ---- format-responsive review preview ----
function FormatPreview({
  format,
  appointment,
  onImageText,
  slides,
  reelScript,
  storySequence,
}: {
  format: Format;
  appointment: Appointment;
  onImageText: string;
  slides: string[];
  reelScript: string[];
  storySequence: string[];
}) {
  const hero = appointment.afterImage ?? appointment.beforeImage ?? "";
  const before = appointment.beforeImage ?? hero;

  const Watermark = () => (
    <span className="absolute top-2 right-2 z-10 bg-foreground/85 text-offwhite text-[8px] uppercase tracking-widest px-1.5 py-0.5 backdrop-blur">
      Simulated
    </span>
  );

  // ---- Caption: single image preview (unchanged behavior) ----
  if (format === "Caption") {
    return (
      <div className="aspect-[4/5] overflow-hidden bg-nude/30 ring-1 ring-border relative shadow-[var(--shadow-artifact)]">
        <img src={hero} alt="" className="w-full h-full object-cover" />
        <span className="absolute top-3 right-3 bg-foreground/85 text-offwhite text-[9px] uppercase tracking-widest px-2 py-1 backdrop-blur">
          Simulated preview
        </span>
        <div className="absolute bottom-4 left-4 right-4 bg-offwhite/95 backdrop-blur p-3">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">On-image text</p>
          <p className="font-serif text-base leading-snug">"{onImageText}"</p>
        </div>
      </div>
    );
  }

  // ---- Carousel: contact sheet of all slides ----
  if (format === "Carousel") {
    const slideImages = [hero, before, hero, hero, before];
    const items = slides.length ? slides : ["01", "02", "03", "04", "05"];
    return (
      <div className="space-y-3">
        <div className="relative">
          <span className="absolute top-3 right-3 z-10 bg-foreground/85 text-offwhite text-[9px] uppercase tracking-widest px-2 py-1 backdrop-blur">
            Simulated preview
          </span>
          <div className="aspect-[4/5] overflow-hidden bg-nude/30 ring-1 ring-border relative shadow-[var(--shadow-artifact)]">
            <img src={hero} alt="" className="w-full h-full object-cover" />
            <div className="absolute bottom-4 left-4 right-4 bg-offwhite/95 backdrop-blur p-3">
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Slide 01 · Cover</p>
              <p className="font-serif text-base leading-snug">"{onImageText}"</p>
            </div>
            <div className="absolute top-3 left-3 bg-offwhite/90 text-foreground text-[9px] uppercase tracking-widest px-2 py-1">
              1 / {items.length}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {items.map((s, i) => (
            <div key={i} className="relative aspect-[4/5] overflow-hidden bg-nude/30 ring-1 ring-border">
              <img src={slideImages[i % slideImages.length]} alt="" className="w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-foreground/10" />
              <span className="absolute top-1 left-1 bg-offwhite/95 text-foreground text-[8px] uppercase tracking-widest px-1 py-0.5 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="absolute bottom-1 left-1 right-1 text-[8px] leading-tight text-offwhite drop-shadow line-clamp-2">
                {s.replace(/^\d+\s*·\s*/, "")}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[9px] uppercase tracking-widest text-taupe text-center">
          Contact sheet · {items.length} slides · swipe in feed
        </p>
      </div>
    );
  }

  // ---- Story: 4-frame vertical sequence ----
  if (format === "Story") {
    const frames = (storySequence.length ? storySequence : ["Hook", "Context", "Reveal", "CTA"]).slice(0, 4);
    const frameImages = [before, hero, hero, hero];
    while (frames.length < 4) frames.push("…");
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {frames.map((f, i) => (
            <div key={i} className="relative aspect-[9/16] overflow-hidden bg-nude/30 ring-1 ring-border shadow-[var(--shadow-artifact)]">
              <img src={frameImages[i % frameImages.length]} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-x-1 top-1 flex gap-0.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={j}
                    className={`h-0.5 flex-1 ${j <= i ? "bg-offwhite" : "bg-offwhite/40"}`}
                  />
                ))}
              </div>
              {i === 0 && <Watermark />}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-foreground/80 to-transparent">
                <p className="text-[9px] uppercase tracking-widest text-offwhite/80 mb-0.5 tabular-nums">
                  {i + 1} / 4
                </p>
                <p className="text-[10px] leading-tight text-offwhite font-serif line-clamp-3">
                  {f.replace(/^\d+\s*·\s*/, "")}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] uppercase tracking-widest text-taupe text-center">
          4-frame story · 9:16 · auto-advance
        </p>
      </div>
    );
  }

  // ---- Reel / TikTok: storyboard / shot sequence ----
  const beats = reelScript.length
    ? reelScript
    : ["00:00 · Hook", "00:03 · Setup", "00:08 · Payoff", "00:14 · CTA"];
  const beatImages = [hero, before, hero, hero, before, hero];
  return (
    <div className="space-y-3">
      <div className="relative aspect-[9/16] overflow-hidden bg-nude/30 ring-1 ring-border shadow-[var(--shadow-artifact)] max-h-[420px] mx-auto">
        <img src={hero} alt="" className="w-full h-full object-cover" />
        <Watermark />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-12 rounded-full bg-offwhite/90 flex items-center justify-center">
            <div className="size-0 border-l-[10px] border-l-foreground border-y-[7px] border-y-transparent ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 bg-offwhite/95 backdrop-blur p-2">
          <p className="text-[9px] uppercase tracking-widest text-taupe mb-0.5">Hook · Shot 1</p>
          <p className="font-serif text-sm leading-snug line-clamp-2">"{onImageText}"</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[9px] uppercase tracking-widest text-taupe">Storyboard · {beats.length} shots</p>
        <div className="grid grid-cols-4 gap-1.5">
          {beats.slice(0, 4).map((b, i) => {
            const [time, ...rest] = b.split(" · ");
            const line = rest.join(" · ");
            return (
              <div key={i} className="ring-1 ring-border bg-offwhite">
                <div className="relative aspect-video overflow-hidden bg-nude/30">
                  <img src={beatImages[i % beatImages.length]} alt="" className="w-full h-full object-cover" />
                  <span className="absolute top-1 left-1 bg-foreground/85 text-offwhite text-[8px] uppercase tracking-widest px-1 py-0.5 tabular-nums">
                    {time || `Shot ${i + 1}`}
                  </span>
                </div>
                <p className="p-1.5 text-[9px] leading-tight text-foreground line-clamp-2">{line || b}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
