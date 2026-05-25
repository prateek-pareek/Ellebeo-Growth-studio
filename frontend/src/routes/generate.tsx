import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAppointments, type Appointment } from "@/lib/providers/appointments-provider";
import { useBrandDna, type BrandDnaView } from "@/lib/providers/brand-dna-provider";
import { useProfile } from "@/lib/providers/profile-provider";
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

function GeneratePage() {
  const search = useSearch({ from: "/generate" });
  const navigate = useNavigate();
  const { data: appointments, isEmpty, loading } = useAppointments();
  const { data: brandDna } = useBrandDna();

  const requestedId = search.appointment;
  const requestedMatch = requestedId
    ? appointments.find((a) => a.id === requestedId) ?? null
    : null;
  const idMissing = !!requestedId && !requestedMatch && !loading;

  const { profile, technician, loading: profileLoading } = useProfile();
  
  const [appointment, setAppointment] = useState<Appointment | null>(requestedMatch);
  const [step, setStep] = useState<Step>(requestedMatch ? "consent" : "select");
  const [goal, setGoal] = useState<Goal>("showcase");
  const [format, setFormat] = useState<Format>("Carousel");
  
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (!profileLoading && !technician.hasGrowthStudioAccess) {
      setShowPaywall(true);
    }
  }, [profileLoading, technician.hasGrowthStudioAccess]);
  
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [backendVariants, setBackendVariants] = useState<any[] | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (requestedMatch && !appointment) {
        setAppointment(requestedMatch);
        setStep("consent");
    }
  }, [requestedMatch]);

  useEffect(() => {
    if (jobId && generating) {
      pollRef.current = window.setInterval(async () => {
        try {
          const res = await api.get(`/generation/jobs/${jobId}`);
          const status = res.data.data.state;
          setJobStatus(status);
          
          if (status === 'completed') {
            clearInterval(pollRef.current!);
            const contentRes = await api.get(`/content?jobId=${jobId}`);
            const contentBody = contentRes.data.data;
            // Content service returns { data: items, meta: {...} } — extract the array
            const items = Array.isArray(contentBody) ? contentBody : (contentBody?.data ?? []);
            setBackendVariants(items);
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

  const handleGenerate = async (selectedFormat?: Format) => {
    if (!appointment) return;
    setGenerating(true);
    setStep("review");
    setJobStatus("Queuing job...");

    const formatMap: Record<Format, string> = {
      'Carousel': 'carousel',
      'Reel': 'reel',
      'Story': 'story',
      'Caption': 'feed',
      'TikTok': 'reel'
    };

    const goalMap: Record<Goal, string> = {
      'showcase': 'build_brand_authority',
      'educate': 'build_brand_authority',
      'convert': 'attract_new_clients',
      'availability': 'fill_quiet_days',
      'trust': 'retain_existing_clients'
    };

    const platformMap: Record<Format, string[]> = {
      'Carousel': ['instagram'],
      'Reel': ['instagram'],
      'Story': ['instagram'],
      'Caption': ['instagram'],
      'TikTok': ['instagram', 'tiktok'],
    };

    const activeFormat = selectedFormat ?? format;

    try {
      const res = await api.post('/generation/generate', {
        appointmentId: appointment.id,
        goal: goalMap[goal],
        outputFormats: [formatMap[activeFormat]],
        platforms: platformMap[activeFormat],
        includeVoiceover: false,
        includeMusic: false
      });
      setJobId(res.data.data.jobId);
    } catch (e: any) {
      setGenerating(false);
      setStep("format");
      toast.error(e.response?.data?.message || "Failed to start generation");
    }
  };

  if (loading || profileLoading) return <div className="p-20 text-center text-taupe italic">Loading...</div>;

  return (
    <div className="relative">
      {showPaywall && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border hairline p-8 max-w-md w-full text-center shadow-xl">
            <h2 className="font-serif text-3xl mb-4 text-foreground">Upgrade to Growth Studio</h2>
            <p className="text-taupe mb-8 text-sm leading-relaxed">
              Unlock AI-powered content generation, automated captions, and reels tailored to your exact Brand DNA.
            </p>
            <button className="w-full bg-foreground text-offwhite px-6 py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors mb-4">
              Unlock Now
            </button>
            <Link to="/" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
              Go Back
            </Link>
          </div>
        </div>
      )}
      <header className="mt-6 lg:mt-10 mb-8 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5">
          <p className="eyebrow">AI generation</p>
          {!generating && !loading && (
             <span className="text-[9px] uppercase tracking-widest border border-sage text-sage px-2 py-1">Live</span>
          )}
          {generating && (
            <span className="text-[9px] uppercase tracking-widest text-taupe">
              AI is working: {jobStatus || 'Processing'}...
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
              {step === "goal" && appointment && (
                <GoalStep
                  goal={goal}
                  setGoal={setGoal}
                  onContinue={() => setStep("format")}
                  onBack={() => setStep("consent")}
                />
              )}
              {step === "format" && appointment && (
                <FormatStep
                  format={format}
                  setFormat={setFormat}
                  onContinue={(selectedFormat) => handleGenerate(selectedFormat)}
                  onBack={() => setStep("goal")}
                />
              )}
              {step === "review" && appointment && (
                <ReviewStep
                  generating={generating}
                  jobStatus={jobStatus}
                  backendVariants={backendVariants}
                />
              )}
            </div>

            <aside className="col-span-12 lg:col-span-4">
              <BrandDNAInfluence brandDna={brandDna} goal={goal} format={format} appointment={appointment} />
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
    </div>
  );
}

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
      <div className="space-y-px bg-border">
        {appointments.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a)}
            className="w-full text-left bg-card p-5 flex items-center gap-5 hover:bg-nude/20 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="eyebrow mb-1">{a.date} · {a.category}</p>
              <p className="font-serif text-lg truncate">{a.clientName}</p>
              <p className="text-xs text-taupe truncate">{a.service}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConsentStep({
  appointment,
  onContinue,
  onBack,
}: {
  appointment: Appointment;
  onContinue: () => void;
  onBack: () => void;
}) {
  const granted = appointment.consent === "granted";
  const statusLabel: Record<string, { label: string; cls: string }> = {
    granted: { label: "Consent granted", cls: "text-sage" },
    pending: { label: "Consent pending — awaiting client response", cls: "text-foreground" },
    declined: { label: "Consent declined — cannot generate public content", cls: "text-destructive" },
    not_requested: { label: "Consent not yet requested", cls: "text-taupe" },
  };
  const status = statusLabel[appointment.consent] ?? statusLabel.not_requested;

  return (
    <div>
      <h2 className="eyebrow mb-4">Confirm client consent</h2>
      <div className="artifact p-8 sm:p-10">
        <p className="font-serif text-3xl mb-2">{appointment.clientName}</p>
        <p className="text-xs text-taupe mb-6">{appointment.service} · {appointment.date}</p>

        <div className={`flex items-center gap-2 mb-8 text-sm font-medium ${status.cls}`}>
          <span className={`size-2 rounded-full ${granted ? "bg-sage" : "bg-current opacity-60"}`} />
          {status.label}
        </div>

        {!granted && (
          <div className="border hairline border-foreground/20 bg-nude/30 p-4 text-sm text-taupe mb-8">
            You need client consent before generating content that may include their likeness or service details.
            Go to <strong className="text-foreground">Appointments</strong> to send a consent request.
          </div>
        )}

        <div className="flex gap-4">
          {granted && (
            <button
              onClick={onContinue}
              className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            >
              Continue →
            </button>
          )}
          <button onClick={onBack} className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border hairline">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => { setGoal(g.id); onContinue(); }}
            className={"p-5 text-left " + (g.id === goal ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
          >
            <p className="font-serif text-xl mb-1">{g.name}</p>
            <p className="text-xs text-taupe">{g.help}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function FormatStep({
  format,
  setFormat,
  onContinue,
  onBack,
}: {
  format: Format;
  setFormat: (f: Format) => void;
  onContinue: (selectedFormat: Format) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-4">Choose a format</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFormat(f.id); onContinue(f.id); }}
            className={"p-5 text-left " + (f.id === format ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
          >
            <p className="font-serif text-xl mb-1">{f.name}</p>
            <p className="text-xs text-taupe">{f.help}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewStep({ generating, jobStatus, backendVariants }: any) {
  const [copied, setCopied] = useState<number | null>(null);

  if (generating) {
    const statusLabel: Record<string, string> = {
      created: "Starting job...",
      queued: "Queued...",
      processing_image: "Analysing image...",
      processing_vision: "Reading the photo...",
      building_prompt: "Building your prompt...",
      generating_text: "Writing your caption...",
      generating_reel: "Assembling reel...",
    };
    return (
      <div className="artifact p-12 text-center">
        <div className="flex justify-center mb-6">
          <span className="size-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
        </div>
        <p className="font-serif text-2xl mb-2 italic">AI is drafting your posts...</p>
        <p className="text-sm text-taupe">{statusLabel[jobStatus] ?? jobStatus ?? "Processing..."}</p>
      </div>
    );
  }

  if (!backendVariants || backendVariants.length === 0) {
    return (
      <div className="artifact p-12 text-center">
        <p className="eyebrow mb-3">No content generated</p>
        <p className="text-sm text-taupe">The job completed but returned no content. Try again.</p>
      </div>
    );
  }

  const contentItem = backendVariants[0];
  const variants: any[] = Array.isArray(contentItem.generationOptions) && contentItem.generationOptions.length > 0
    ? contentItem.generationOptions
    : [{ caption: contentItem.caption, hashtags: contentItem.hashtags, hookSentence: contentItem.hookSentence }];

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{variants.length} variant{variants.length > 1 ? "s" : ""} generated</p>
        <a
          href="/content"
          className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground border-b border-taupe pb-0.5"
        >
          View in Content →
        </a>
      </div>

      {variants.map((opt: any, i: number) => (
        <article key={i} className="artifact p-8">
          <div className="flex items-center justify-between mb-5">
            <p className="eyebrow">Option {i + 1}</p>
            <button
              onClick={() => copyToClipboard(
                [opt.hookSentence, opt.caption, (opt.hashtags ?? []).map((h: string) => `#${h}`).join(" ")].filter(Boolean).join("\n\n"),
                i
              )}
              className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
            >
              {copied === i ? "Copied!" : "Copy"}
            </button>
          </div>

          {opt.hookSentence && (
            <div className="mb-4 pb-4 border-b hairline">
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Hook</p>
              <p className="text-base font-medium leading-snug">{opt.hookSentence}</p>
            </div>
          )}

          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Caption</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{opt.caption}</p>
          </div>

          {opt.hashtags && opt.hashtags.length > 0 && (
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Hashtags</p>
              <p className="text-xs text-taupe leading-relaxed">
                {opt.hashtags.map((h: string) => `#${h}`).join(" ")}
              </p>
            </div>
          )}

          <button
            onClick={async () => {
              try {
                await api.post(`/content/${contentItem.id}/select-option`, { optionIndex: i });
                toast.success("Version selected and saved to Content.");
              } catch {
                toast.error("Failed to select version.");
              }
            }}
            className="bg-foreground text-offwhite px-5 py-2.5 text-[10px] uppercase tracking-widest hover:bg-taupe transition-colors"
          >
            Use This Version
          </button>
        </article>
      ))}
    </div>
  );
}

function BrandDNAInfluence({ brandDna }: any) {
  return (
    <div className="artifact p-6">
      <p className="eyebrow mb-4">Brand DNA Influence</p>
      {brandDna ? (
        <div className="space-y-4">
            <p className="text-xs text-taupe uppercase tracking-widest">Voice: {brandDna.voice.summary}</p>
            <p className="text-xs text-taupe uppercase tracking-widest">Archetype: {brandDna.archetype}</p>
        </div>
      ) : (
        <p className="text-xs text-taupe">Loading brand influence...</p>
      )}
    </div>
  );
}
