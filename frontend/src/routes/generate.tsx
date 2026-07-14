import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Sparkles, BookOpen, TrendingUp, Clock, Heart, Layers, Play, Zap, Image, ChevronRight, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useAppointments, type Appointment } from "@/lib/providers/appointments-provider";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { useProfile } from "@/lib/providers/profile-provider";
import { useConsentRequest } from "@/lib/providers/consent-request-provider";
import { z } from "zod";
import { toast } from "sonner";

const searchSchema = z.object({
  appointment: z.string().optional(),
  templateGoal: z.string().optional(),
  templateFormat: z.string().optional(),
  templateCategories: z.string().optional(),
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
type Format = "Carousel" | "Reel" | "Story" | "Caption";
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

  const initialGoal = (GOALS.find((g) => g.id === search.templateGoal)?.id ?? "showcase") as Goal;
  const initialFormat = (FORMATS.find((f) => f.id === search.templateFormat)?.id ?? "Carousel") as Format;
  const templateCategories = search.templateCategories
    ? search.templateCategories.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const [appointment, setAppointment] = useState<Appointment | null>(requestedMatch);
  const [step, setStep] = useState<Step>(requestedMatch ? "consent" : "select");
  const [goal, setGoal] = useState<Goal>(initialGoal);
  const [format, setFormat] = useState<Format>(initialFormat);
  
  const [showPaywall, setShowPaywall] = useState(false);
  const [showTrialPaywall, setShowTrialPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"TRIAL_EXHAUSTED" | "PLAN_EXHAUSTED">("TRIAL_EXHAUSTED");
  const [pendingFormat, setPendingFormat] = useState<Format | null>(null);

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
  
  const [promptPreview, setPromptPreview] = useState<{ systemPrompt: string; userPrompt: string } | null>(null);

  useEffect(() => {
    if (appointment?.id) {
      const formatMap: Record<Format, string> = {
        'Carousel': 'carousel',
        'Reel': 'reel',
        'Story': 'story',
        'Caption': 'feed',
      };
      const goalMap: Record<Goal, string> = {
        'showcase': 'attract_new_clients',
        'educate': 'build_brand_authority',
        'convert': 'promote_high_margin_services',
        'availability': 'fill_quiet_days',
        'trust': 'retain_existing_clients'
      };
      api.post('/generation/preview-prompts', {
        appointmentId: appointment.id,
        platforms: ['instagram'],
        outputFormats: [formatMap[format]],
        goal: goalMap[goal],
        includeVoiceover: false,
        includeMusic: false,
      }).then(res => {
        if (res.data?.data) {
          setPromptPreview(res.data.data);
        }
      }).catch(err => {
        console.error('Failed to load prompt preview:', err);
      });
    } else {
      setPromptPreview(null);
    }
  }, [appointment?.id, format, goal]);

  useEffect(() => {
    if (requestedMatch && !appointment) {
        setAppointment(requestedMatch);
        setStep("consent");
    }
  }, [requestedMatch]);

  // Auto-trigger generation after returning from payment
  useEffect(() => {
    if (loading || !appointments.length) return;
    const raw = localStorage.getItem("pendingGeneration");
    if (!raw) return;
    try {
      const { appointmentId, format: savedFormat, goal: savedGoal } = JSON.parse(raw);
      const match = appointments.find((a) => a.id === appointmentId);
      if (!match) return;
      localStorage.removeItem("pendingGeneration");
      setAppointment(match);
      setFormat(savedFormat as Format);
      setGoal(savedGoal as Goal);
      setStep("review");
      // Small delay so state settles before generating
      setTimeout(() => handleGenerate(savedFormat as Format), 300);
    } catch {
      localStorage.removeItem("pendingGeneration");
    }
  }, [loading, appointments]);

  useEffect(() => {
    if (!jobId || !generating) return;
    let pollCount = 0;
    let errorCount = 0;
    const MAX_POLLS = 150; // 5 minutes at 2s intervals
    const MAX_ERRORS = 5;

    pollRef.current = window.setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(pollRef.current!);
        setGenerating(false);
        toast.error("Generation timed out. Please try again.");
        return;
      }
      try {
        const res = await api.get(`/generation/jobs/${jobId}`);
        const status = res.data.data.state;
        errorCount = 0;
        setJobStatus(status);

        if (status === 'completed') {
          clearInterval(pollRef.current!);
          const contentRes = await api.get(`/content?jobId=${jobId}`);
          const contentBody = contentRes.data.data;
          const items = Array.isArray(contentBody) ? contentBody : (contentBody?.data ?? []);
          setBackendVariants(items);
          setGenerating(false);
        } else if (status === 'failed') {
          clearInterval(pollRef.current!);
          setGenerating(false);
          toast.error("Generation failed. Please try again.");
        }
      } catch (e) {
        errorCount++;
        if (errorCount >= MAX_ERRORS) {
          clearInterval(pollRef.current!);
          setGenerating(false);
          toast.error("Lost connection during generation. Please check your content library.");
        }
      }
    }, 2000);

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
    };

    const goalMap: Record<Goal, string> = {
      'showcase': 'attract_new_clients',       // Lead with transformation → attract via the result
      'educate': 'build_brand_authority',      // Technique/aftercare → establish expertise
      'convert': 'promote_high_margin_services', // Direct CTA → position service as premium, worth booking
      'availability': 'fill_quiet_days',       // Fill open slots → urgency/availability
      'trust': 'retain_existing_clients'       // Client story/quote → community, loyalty
    };

    const platformMap: Record<Format, string[]> = {
      'Carousel': ['instagram'],
      'Reel': ['instagram'],
      'Story': ['instagram'],
      'Caption': ['instagram'],
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
      const errorCode = e.response?.data?.error?.code;
      if (errorCode === "TRIAL_EXHAUSTED" || errorCode === "PLAN_EXHAUSTED") {
        setPaywallReason(errorCode);
        setPendingFormat(activeFormat);
        setShowTrialPaywall(true);
      } else {
        toast.error(e.response?.data?.message || e.response?.data?.error?.message || "Failed to start generation");
      }
    }
  };

  if (loading || profileLoading) return <div className="p-20 text-center text-taupe italic">Loading...</div>;

  return (
    <div className="relative">
      {showPaywall && (
        <div className="fixed inset-0 z-50 flex">
          {/* Left — decorative */}
          <div className="hidden lg:flex lg:w-1/2 bg-foreground flex-col justify-between p-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 30% 70%, white 1px, transparent 1px), radial-gradient(circle at 70% 30%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-nude/60 mb-8">Elle.Be.O · Growth Studio</p>
              <h2 className="font-serif text-5xl xl:text-6xl leading-[1.05] text-offwhite">
                Your brand.<br /><span className="italic text-nude">Amplified.</span>
              </h2>
            </div>
            <div className="space-y-4">
              {["AI-generated captions shaped by your Brand DNA", "Reels, carousels, stories — every format", "Auto-hashtags, hooks & CTAs included"].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-nude shrink-0" />
                  <p className="text-sm text-offwhite/70">{f}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Right — CTA */}
          <div className="flex-1 bg-background flex flex-col justify-center px-8 sm:px-16 lg:px-20 relative">
            <Link to="/" className="absolute top-6 right-6 text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
              ← Back
            </Link>
            <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-taupe mb-6">Access required</p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight mb-4 text-foreground">
              Unlock Growth Studio
            </h2>
            <p className="text-taupe text-base leading-relaxed mb-10 max-w-sm">
              Upgrade to start turning every appointment into polished, on-brand content — automatically.
            </p>
            <button className="bg-foreground text-offwhite px-8 py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors w-full sm:w-auto">
              Unlock Now →
            </button>
          </div>
        </div>
      )}

      {showTrialPaywall && (
        <div className="fixed inset-0 z-50 flex">
          {/* Left — decorative */}
          <div className="hidden lg:flex lg:w-1/2 bg-foreground flex-col justify-between p-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 30% 70%, white 1px, transparent 1px), radial-gradient(circle at 70% 30%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-nude/60 mb-8">Elle.Be.O · Growth Studio</p>
              {paywallReason === "PLAN_EXHAUSTED" ? (
                <h2 className="font-serif text-5xl xl:text-6xl leading-[1.05] text-offwhite">
                  You're on a<br /><span className="italic text-nude">roll.</span>
                </h2>
              ) : (
                <h2 className="font-serif text-5xl xl:text-6xl leading-[1.05] text-offwhite">
                  Your 2 free<br /><span className="italic text-nude">are done.</span>
                </h2>
              )}
            </div>
            <div className="space-y-4">
              {["Unlimited content generation", "Every format — reels, carousels, stories", "Shaped by your Brand DNA, every time"].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-nude shrink-0" />
                  <p className="text-sm text-offwhite/70">{f}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — CTA */}
          <div className="flex-1 bg-background flex flex-col justify-center px-8 sm:px-16 lg:px-20 relative">
            <Link to="/" className="absolute top-6 right-6 text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
              ← Back
            </Link>

            {paywallReason === "PLAN_EXHAUSTED" ? (
              <>
                <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-taupe mb-6">Generations used up</p>
                <h2 className="font-serif text-4xl sm:text-5xl leading-tight mb-4 text-foreground">
                  Ready for more?
                </h2>
                <p className="text-taupe text-base leading-relaxed mb-10 max-w-sm">
                  You've used all your purchased generations. Top up to keep the momentum going.
                </p>
                <button
                  onClick={() => {
                    if (appointment) {
                      localStorage.setItem("postPurchaseReturn", `/generate?appointment=${appointment.id}`);
                      localStorage.setItem("pendingGeneration", JSON.stringify({ appointmentId: appointment.id, format: pendingFormat ?? format, goal }));
                    } else {
                      localStorage.setItem("postPurchaseReturn", window.location.pathname + window.location.search);
                    }
                    navigate({ to: "/plans" });
                  }}
                  className="bg-foreground text-offwhite px-8 py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors w-full sm:w-auto"
                >
                  Buy More Generations →
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-8">
                  <div className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-foreground" />
                    <span className="size-2.5 rounded-full bg-foreground" />
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="size-2.5 rounded-full bg-border" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-taupe">2 of 2 free generations used</p>
                </div>
                <h2 className="font-serif text-4xl sm:text-5xl leading-tight mb-4 text-foreground">
                  Keep creating.<br />Choose a plan.
                </h2>
                <p className="text-taupe text-base leading-relaxed mb-10 max-w-sm">
                  Your free trial is complete. Unlock unlimited AI content generation with a Silver or Gold plan.
                </p>
                <button
                  onClick={() => {
                    if (appointment) {
                      localStorage.setItem("postPurchaseReturn", `/generate?appointment=${appointment.id}`);
                      localStorage.setItem("pendingGeneration", JSON.stringify({ appointmentId: appointment.id, format: pendingFormat ?? format, goal }));
                    } else {
                      localStorage.setItem("postPurchaseReturn", window.location.pathname + window.location.search);
                    }
                    navigate({ to: "/plans" });
                  }}
                  className="bg-foreground text-offwhite px-8 py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors w-full sm:w-auto"
                >
                  Choose a Plan →
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">AI generation</span>
          <span className="text-taupe/30">·</span>
          {!generating ? (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-sage animate-pulse" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-taupe bg-muted border border-border px-2.5 py-1 rounded-full">
              <span className="size-3 border border-taupe/40 border-t-foreground rounded-full animate-spin" />
              {jobStatus || "Processing"}
            </span>
          )}
        </div>
        <h1 className="page-title max-w-[20ch]">
          Turn this appointment into <span className="italic text-taupe">content.</span>
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
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
                  templateCategories={templateCategories}
                  onPick={(a) => {
                    setAppointment(a);
                    setStep("consent");
                  }}
                />
              )}
              {step === "consent" && appointment && (
                <ConsentStep
                  appointment={appointment}
                  onContinue={() => {
                    // If coming from a template, goal + format are already set — skip both steps
                    if (search.templateGoal && search.templateFormat) {
                      handleGenerate(initialFormat);
                    } else {
                      setStep("goal");
                    }
                  }}
                  onBack={() => setStep("select")}
                  fromTemplate={!!(search.templateGoal && search.templateFormat)}
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
                  onChangeStep={(s: Step) => setStep(s)}
                  onRefineComplete={(items: any[]) => setBackendVariants(items)}
                  promptPreview={promptPreview}
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
    { id: "consent", label: "Consent",     sub: "Confirm permissions" },
    { id: "goal",   label: "Goal",         sub: "Choose the angle" },
    { id: "format", label: "Format",       sub: "Pick the surface" },
    { id: "review", label: "Review",       sub: "Refine & schedule" },
  ];
  const idx = steps.findIndex((s) => s.id === step);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-5">
      {/* Progress bar + counter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-taupe to-foreground rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(((idx + 1) / steps.length) * 100)}%` }}
          />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-taupe tabular-nums shrink-0">
          {idx + 1} of {steps.length}
        </span>
      </div>

      {/* Step indicators */}
      <div className="relative flex items-start justify-between">
        {/* Connecting line behind circles */}
        <div className="absolute left-0 right-0 top-[14px] h-px bg-border z-0" />
        <div
          className="absolute left-0 top-[14px] h-px bg-foreground z-0 transition-all duration-500 ease-out"
          style={{ width: idx === 0 ? "0%" : `${(idx / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((s, i) => {
          const active    = i === idx;
          const done      = i < idx;
          const clickable = hasAppointment || s.id === "select";

          return (
            <button
              key={s.id}
              onClick={() => clickable && onJump(s.id)}
              disabled={!clickable}
              className="relative z-10 flex flex-col items-center gap-2 disabled:cursor-not-allowed group"
              style={{ width: `${100 / steps.length}%` }}
            >
              {/* Circle */}
              <div className={
                "size-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 " +
                (done
                  ? "bg-foreground border-foreground"
                  : active
                    ? "bg-foreground border-foreground ring-4 ring-foreground/10"
                    : "bg-card border-border group-hover:border-foreground/30")
              }>
                {done ? (
                  <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span className={
                    "text-[9px] font-bold tabular-nums " +
                    (active ? "text-offwhite" : "text-taupe")
                  }>
                    {i + 1}
                  </span>
                )}
              </div>

              {/* Labels */}
              <div className="text-center px-1">
                <p className={
                  "text-[10px] font-semibold uppercase tracking-widest leading-tight transition-colors " +
                  (active ? "text-foreground" : done ? "text-taupe" : "text-taupe/50")
                }>
                  {s.label}
                </p>
                <p className={
                  "text-[9px] mt-0.5 leading-tight hidden sm:block transition-colors " +
                  (active ? "text-taupe" : "text-taupe/40")
                }>
                  {s.sub}
                </p>
              </div>
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

function normalizeTplCategory(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower === 'injector') return 'medical aesthetics';
  return lower;
}

function appointmentMatchesCategories(apptCategory: string, templateCategories: string[]): boolean {
  if (templateCategories.length === 0) return true;
  const apptNorm = apptCategory.toLowerCase();
  return templateCategories.some((tc) => normalizeTplCategory(tc) === apptNorm);
}

function SelectAppointment({
  appointments,
  templateCategories = [],
  onPick,
}: {
  appointments: Appointment[];
  templateCategories?: string[];
  onPick: (a: Appointment) => void;
}) {
  const hasFilter = templateCategories.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-taupe mb-2">Step 1 · Appointment</p>
        <h2 className="font-serif text-3xl leading-tight">Which appointment are we working with?</h2>
        <p className="text-sm text-taupe mt-2 leading-relaxed">
          Pick a session to turn into content. Only appointments with client photos are shown.
        </p>
      </div>

      {/* Template category filter notice */}
      {hasFilter && (
        <div className="mb-4 flex items-start gap-3 bg-card border hairline px-4 py-3">
          <span className="size-1.5 rounded-full bg-taupe shrink-0 mt-1.5" />
          <p className="text-[11px] text-taupe leading-relaxed">
            This template is designed for{" "}
            <span className="text-foreground font-medium">{templateCategories.join(", ")}</span>.
            {" "}Appointments from a different category are disabled.
          </p>
        </div>
      )}

      {/* Appointment cards */}
      <div className="space-y-2">
        {appointments.map((a) => {
          const matches = appointmentMatchesCategories(a.category, templateCategories);
          const initials = a.clientName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          const consentColor =
            a.consent === "granted"  ? "bg-sage/10 text-sage border-sage/20" :
            a.consent === "declined" ? "bg-destructive/10 text-destructive border-destructive/20" :
            a.consent === "pending"  ? "bg-taupe/10 text-taupe border-taupe/20" :
                                       "bg-border text-taupe/50 border-border";
          const consentLabel =
            a.consent === "granted"  ? "Consent granted" :
            a.consent === "declined" ? "Declined" :
            a.consent === "pending"  ? "Pending" : "No consent";

          return (
            <button
              key={a.id}
              onClick={() => matches ? onPick(a) : undefined}
              disabled={!matches}
              title={!matches ? `This template is for ${templateCategories.join(", ")} — not compatible with ${a.category}` : undefined}
              className={
                "w-full text-left group rounded-2xl border-2 p-4 flex items-center gap-4 transition-all duration-200 " +
                (matches
                  ? "border-border bg-card hover:border-foreground/30 hover:bg-nude/20 hover:shadow-sm cursor-pointer"
                  : "border-border bg-muted/30 opacity-50 cursor-not-allowed")
              }
            >
              {/* Initials avatar */}
              <div className={"size-10 rounded-xl flex items-center justify-center shrink-0 transition-colors " + (matches ? "bg-muted group-hover:bg-nude/40" : "bg-muted")}>
                <span className={"text-[11px] font-semibold tracking-wide transition-colors " + (matches ? "text-taupe group-hover:text-foreground" : "text-taupe/50")}>
                  {initials}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="font-serif text-base leading-tight truncate">{a.clientName}</p>
                <p className="text-[11px] text-taupe truncate mt-0.5">{a.service}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Calendar className="size-3 text-taupe/60 shrink-0" />
                  <span className="text-[10px] text-taupe">{a.date}</span>
                  {a.category && (
                    <>
                      <span className="text-taupe/30">·</span>
                      <span className="text-[10px] text-taupe">{a.category}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Category mismatch badge or consent badge */}
              {!matches ? (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border bg-border text-taupe/50 border-border">
                  Wrong category
                </span>
              ) : (
                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${consentColor}`}>
                  {consentLabel}
                </span>
              )}

              {/* Arrow */}
              {matches && <ChevronRight className="size-4 text-taupe/40 group-hover:text-foreground shrink-0 transition-colors" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CONSENT_PERMISSIONS = [
  { key: "allowMarketingContent", label: "Use photos in posts" },
  { key: "allowShowFace",         label: "Show client's face" },
  { key: "allowTagSocial",        label: "Tag client account" },
  { key: "allowUseName",          label: "Use first name in caption" },
  { key: "allowPlatformPromotion",label: "Allow Elle.Be.O to feature this content" },
  { key: "allowInternalUse",      label: "Internal use (AI training)" },
] as const;

function ConsentStep({
  appointment,
  onContinue,
  onBack,
  fromTemplate = false,
}: {
  appointment: Appointment;
  onContinue: () => void;
  onBack: () => void;
  fromTemplate?: boolean;
}) {
  const { data: consentData, loading: consentLoading } = useConsentRequest(appointment.id);
  const granted = appointment.consent === "granted";

  return (
    <div className="space-y-4">

      {/* Template context banner */}
      {fromTemplate && (
        <div className="flex items-center gap-3 bg-foreground text-offwhite px-5 py-3">
          <span className="text-[10px] uppercase tracking-widest">Template selected</span>
          <span className="text-taupe/60 text-[10px]">·</span>
          <span className="text-[10px] text-nude/80 uppercase tracking-widest">Goal &amp; format pre-set — confirm consent to generate</span>
        </div>
      )}

      {/* Status banner */}
      {granted ? (
        <div className="flex items-start gap-3 bg-card border hairline px-5 py-4">
          <span className="size-2 rounded-full bg-sage shrink-0 mt-1" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-0.5">Cleared to publish</p>
            <p className="text-sm text-foreground">
              {appointment.clientName} has granted consent. You can draft, review and schedule content from this appointment.
            </p>
          </div>
        </div>
      ) : appointment.consent === "pending" ? (
        <div className="flex items-start gap-3 bg-card border hairline px-5 py-4">
          <span className="size-2 rounded-full bg-foreground shrink-0 mt-1" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-0.5">Awaiting client reply</p>
            <p className="text-sm text-foreground">Consent request sent — waiting for {appointment.clientName} to respond.</p>
          </div>
        </div>
      ) : appointment.consent === "declined" ? (
        <div className="flex items-start gap-3 bg-card border hairline border-destructive/30 px-5 py-4">
          <span className="size-2 rounded-full bg-destructive shrink-0 mt-1" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-destructive mb-0.5">Consent declined</p>
            <p className="text-sm text-taupe">{appointment.clientName} has declined. Content cannot be generated.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-card border hairline px-5 py-4">
          <span className="size-2 rounded-full bg-taupe shrink-0 mt-1" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-0.5">Consent required</p>
            <p className="text-sm text-taupe">
              You need client consent before generating content.{" "}
              <Link to="/consent/$id" params={{ id: appointment.id }} className="text-foreground underline underline-offset-2">
                Request consent →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="artifact">
        {/* Client header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-5 border-b hairline">
          <div>
            <p className="font-serif text-3xl mb-1">{appointment.clientName}</p>
            <p className="text-xs text-taupe">{appointment.service} · {appointment.date}</p>
          </div>
          <span className={
            "text-[10px] uppercase tracking-widest shrink-0 mt-1 " +
            (granted ? "text-sage" : appointment.consent === "declined" ? "text-destructive" : "text-taupe")
          }>
            {granted ? "Consent granted" : appointment.consent === "declined" ? "Consent declined" : appointment.consent === "pending" ? "Pending" : "Not requested"}
          </span>
        </div>

        {/* Permissions list */}
        <div className="px-8 py-5">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-4">Permissions on file</p>
          {consentLoading ? (
            <p className="text-xs text-taupe italic">Loading permissions...</p>
          ) : consentData?.permissions ? (
            <div className="divide-y divide-border">
              {CONSENT_PERMISSIONS.map(({ key, label }) => {
                const isGranted = consentData.permissions[key];
                return (
                  <div key={key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-foreground">{label}</span>
                    <span className={
                      "text-[10px] uppercase tracking-widest shrink-0 ml-4 " +
                      (isGranted ? "text-taupe" : "text-taupe/40")
                    }>
                      {isGranted ? "Granted" : "Not granted"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-taupe italic">No consent record on file.</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        {granted && (
          <button
            onClick={onContinue}
            className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
          >
            {fromTemplate ? "Generate now →" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}

const GOAL_ICONS: Record<Goal, React.ComponentType<{ className?: string }>> = {
  showcase:     Sparkles,
  educate:      BookOpen,
  convert:      TrendingUp,
  availability: Clock,
  trust:        Heart,
};

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
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-taupe mb-2">Step 3 · Goal</p>
        <h2 className="font-serif text-3xl leading-tight">What's the goal of this post?</h2>
        <p className="text-sm text-taupe mt-2 leading-relaxed">
          Your Brand DNA shapes the tone — pick the angle that fits this appointment.
        </p>
      </div>

      {/* Goal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {GOALS.map((g) => {
          const selected = g.id === goal;
          const Icon = GOAL_ICONS[g.id];
          return (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={
                "relative group p-4 text-left rounded-2xl border-2 transition-all duration-200 " +
                (selected
                  ? "border-foreground bg-foreground text-offwhite shadow-md scale-[1.01]"
                  : "border-border bg-card hover:border-foreground/30 hover:bg-nude/20 hover:shadow-sm")
              }
            >
              {/* Check indicator */}
              <span className={
                "absolute top-3 right-3 size-4 rounded-full flex items-center justify-center transition-all duration-200 " +
                (selected ? "bg-white/20 opacity-100" : "opacity-0")
              }>
                <svg width="8" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>

              {/* Icon badge */}
              <div className={
                "size-7 rounded-lg flex items-center justify-center mb-3 transition-colors " +
                (selected ? "bg-white/15" : "bg-muted group-hover:bg-nude/40")
              }>
                <Icon className={"size-3.5 transition-colors " + (selected ? "text-nude" : "text-taupe group-hover:text-foreground")} />
              </div>

              <p className="font-serif text-base leading-tight mb-0.5">{g.name}</p>
              <p className={"text-[11px] leading-relaxed " + (selected ? "text-nude" : "text-taupe")}>{g.help}</p>
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onContinue}
          className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors rounded-xl"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

const FORMAT_ICONS: Record<Format, React.ComponentType<{ className?: string }>> = {
  Carousel: Layers,
  Reel:     Play,
  Story:    Zap,
  Caption:  Image,
};

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
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-taupe mb-2">Step 4 · Format</p>
        <h2 className="font-serif text-3xl leading-tight">Pick a content format.</h2>
        <p className="text-sm text-taupe mt-2 leading-relaxed">
          Choose how your content will be delivered — each format is optimised for reach and engagement.
        </p>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {FORMATS.map((f) => {
          const selected = f.id === format;
          const Icon = FORMAT_ICONS[f.id];
          return (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={
                "relative group p-4 text-left rounded-2xl border-2 transition-all duration-200 " +
                (selected
                  ? "border-foreground bg-foreground text-offwhite shadow-md scale-[1.01]"
                  : "border-border bg-card hover:border-foreground/30 hover:bg-nude/20 hover:shadow-sm")
              }
            >
              {/* Check indicator */}
              <span className={
                "absolute top-3 right-3 size-4 rounded-full flex items-center justify-center transition-all duration-200 " +
                (selected ? "bg-white/20 opacity-100" : "opacity-0")
              }>
                <svg width="8" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>

              {/* Icon badge */}
              <div className={
                "size-7 rounded-lg flex items-center justify-center mb-3 transition-colors " +
                (selected ? "bg-white/15" : "bg-muted group-hover:bg-nude/40")
              }>
                <Icon className={"size-3.5 transition-colors " + (selected ? "text-nude" : "text-taupe group-hover:text-foreground")} />
              </div>

              <p className="font-serif text-base leading-tight mb-0.5">{f.name}</p>
              <p className={"text-[11px] leading-relaxed " + (selected ? "text-nude" : "text-taupe")}>{f.help}</p>
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => onContinue(format)}
          className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors rounded-xl"
        >
          Generate →
        </button>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  created: "Starting job...",
  queued: "Queued...",
  processing_image: "Analysing your photo...",
  processing_vision: "Reading the details in your photo...",
  building_prompt: "Loading your Brand DNA...",
  generating_text: "Writing your caption...",
  generating_reel: "Assembling reel...",
};

const STATUS_STEPS = [
  { key: "processing_vision",  label: "Analysing photo" },
  { key: "building_prompt",    label: "Loading Brand DNA" },
  { key: "generating_text",    label: "Writing caption" },
  { key: "completed",          label: "Designing images" },
];

const BEAUTY_TIPS = [
  "Posts with before & after photos get 3× more saves on Instagram.",
  "Replying to comments within the first hour boosts your reach by up to 30%.",
  "Reels under 15 seconds have the highest completion rate for beauty content.",
  "A consistent brand colour palette makes your grid 40% more recognisable.",
  "Posting behind-the-chair content builds trust faster than any promotion.",
  "Clients who follow you on Instagram are 2× more likely to rebook.",
  "Educational posts — 'why I use this technique' — outperform promotional posts every time.",
  "Your bio is your best SEO tool. Include your suburb and specialty.",
  "Stories with polls get 20% more profile visits than standard stories.",
  "Tagging your location on every post puts you in local discovery search.",
];

const REFINE_OPTIONS = [
  "Make more premium",
  "Make more educational",
  "Make more direct",
  "Make softer",
  "Remove emojis",
  "Shorten",
  "+ Create alternate version",
];

// Turns a stored snake_case value (contentPillar, layoutType) into a readable label.
function humanizeSlug(value?: string | null): string {
  if (!value) return "";
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Maps the backend `generatedBy` tag to a friendly label. Unknown models fall
// back to the raw tag, so labels always reflect what actually produced the option.
const MODEL_LABELS: Record<string, string> = {
  ChatGPT: "ChatGPT · OpenAI",
  "GPT-4o": "GPT-4o · OpenAI",
  Gemini: "Gemini · Google",
  "GPT-4o-Strategist (Technical)": "GPT-4o · Technical",
  "GPT-4o-Strategist (Empathetic)": "Gemini · Empathetic",
};

function GeneratingScreen({ jobStatus }: { jobStatus: string }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTipIndex(i => (i + 1) % BEAUTY_TIPS.length);
        setFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === jobStatus);
  const activeStep = currentStepIndex === -1 ? 0 : currentStepIndex;

  return (
    <div className="artifact p-10 flex flex-col items-center gap-10">

      {/* Top — spinner + current status */}
      <div className="text-center">
        <div className="flex justify-center mb-5">
          <span className="size-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
        </div>
        <p className="font-serif text-2xl italic mb-1">AI is crafting your content...</p>
        <p className="text-sm text-taupe">{STATUS_LABELS[jobStatus] ?? "Processing..."}</p>
      </div>

      {/* Progress steps */}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between relative">
          {/* connecting line */}
          <div className="absolute top-3 left-0 right-0 h-px bg-border z-0" />
          <div
            className="absolute top-3 left-0 h-px bg-foreground z-0 transition-all duration-700"
            style={{ width: `${(activeStep / (STATUS_STEPS.length - 1)) * 100}%` }}
          />
          {STATUS_STEPS.map((step, i) => (
            <div key={step.key} className="flex flex-col items-center gap-2 z-10">
              <div className={
                "size-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 " +
                (i < activeStep ? "bg-foreground border-foreground" :
                 i === activeStep ? "bg-foreground border-foreground animate-pulse" :
                 "bg-card border-border")
              }>
                {i < activeStep && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <p className={"text-[9px] uppercase tracking-widest text-center max-w-[70px] " +
                (i <= activeStep ? "text-foreground" : "text-taupe/50")}>
                {step.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full max-w-md h-px bg-border" />

      {/* Beauty tip */}
      <div className="w-full max-w-md text-center">
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">While you wait · Beauty business tip</p>
        <p
          className="font-serif text-lg leading-relaxed text-foreground transition-opacity duration-400"
          style={{ opacity: fade ? 1 : 0 }}
        >
          "{BEAUTY_TIPS[tipIndex]}"
        </p>
        {/* Tip dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {BEAUTY_TIPS.map((_, i) => (
            <div key={i} className={"size-1 rounded-full transition-all " + (i === tipIndex ? "bg-foreground" : "bg-border")} />
          ))}
        </div>
      </div>

    </div>
  );
}

function ReviewStep({ generating, jobStatus, backendVariants, onChangeStep, onRefineComplete, promptPreview }: any) {
  const [activeVariant, setActiveVariant] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [refineStatus, setRefineStatus] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const refinePollRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<'visual' | 'copywriting' | 'prompt'>('visual');

  if (generating) {
    return <GeneratingScreen jobStatus={jobStatus} />;
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
    : [{ caption: contentItem.caption, hashtags: contentItem.hashtags, hookSentence: contentItem.hookSentence, callToAction: contentItem.callToAction }];

  const opt = variants[activeVariant] ?? variants[0];
  const isCarousel = contentItem.platformVariants?.type === 'carousel';
  const isStory = contentItem.platformVariants?.type === 'story';
  const isReel = contentItem.platformVariants?.type === 'reel';
  const carouselSlides: any[] = isCarousel ? (contentItem.platformVariants?.slides ?? []) : [];
  const storyFrames: any[] = isStory ? (contentItem.platformVariants?.frames ?? []) : [];
  const reelShots: any[] = isReel ? (contentItem.platformVariants?.shots ?? []) : [];
  const reelPostingTime: string = isReel ? (contentItem.platformVariants?.suggestedPostingTime ?? '') : '';
  const reelHookOverlay: string = isReel ? (contentItem.platformVariants?.hookOverlayText ?? '') : '';
  const safeSlide = Math.min(activeSlide, Math.max(0, carouselSlides.length - 1));
  const safeFrame = Math.min(activeSlide, Math.max(0, storyFrames.length - 1));

  // Determine active image URL based on selected text variant
  const getVariantUrl = (slideData: any) => {
    if (!slideData) return null;
    const isGeminiText = opt?.generatedBy?.toLowerCase().includes('gemini');
    if (slideData.variants) {
      if (isGeminiText && slideData.variants.gemini) return slideData.variants.gemini;
      if (!isGeminiText && slideData.variants.dalle) return slideData.variants.dalle;
    }
    return slideData.url;
  };

  // For single-image posts: primary processed image or first frame url
  const singleImageUrl: string | null =
    contentItem.processedImageUrlFeed ||
    (isCarousel ? getVariantUrl(carouselSlides[0]) : undefined) ||
    (isStory ? getVariantUrl(storyFrames[0]) : undefined) ||
    null;

  const charCount = (opt.caption ?? "").length;
  const tagCount = (opt.hashtags ?? []).length;

  const copyCaption = () => {
    const text = [opt.hookSentence, opt.caption, (opt.hashtags ?? []).map((h: string) => `#${h}`).join(" ")]
      .filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2000);
    });
  };

  const downloadImage = async () => {
    const url = isCarousel
      ? (carouselSlides[safeSlide]?.url ?? null)
      : isStory
        ? (storyFrames[safeFrame]?.url ?? null)
        : singleImageUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `ellebeo-${isStory ? `frame-${safeFrame + 1}` : isCarousel ? `slide-${safeSlide + 1}` : isReel ? 'reel-preview' : 'content'}-${contentItem.id ?? Date.now()}.jpg`;
    a.target = "_blank";
    a.click();
  };

  const handleAction = async (action: "draft" | "approve") => {
    try {
      await api.post(`/content/${contentItem.id}/select-option`, { optionIndex: activeVariant });
      if (action === "draft") {
        await api.patch(`/content/${contentItem.id}/reject`);
        setActionDone("Saved as draft");
        toast.success("Saved as draft");
      } else {
        await api.patch(`/content/${contentItem.id}/approve`);
        setActionDone("Approved");
        toast.success("Approved");
      }
    } catch {
      toast.error("Action failed. Try again.");
    }
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleDateTime) return;
    setScheduling(true);
    try {
      await api.post(`/content/${contentItem.id}/select-option`, { optionIndex: activeVariant });
      await api.patch(`/content/${contentItem.id}/approve`);

      const accountsRes = await api.get('/social-accounts');
      const accounts: any[] = accountsRes.data?.data ?? accountsRes.data ?? [];
      const connected = accounts.find((a: any) => a.status === 'connected');

      const postFormat = isCarousel ? 'carousel' : isStory ? 'story' : isReel ? 'reel' : 'feed';

      if (connected) {
        await api.post('/schedule', {
          contentItemId: contentItem.id,
          socialAccountId: connected.id,
          platform: connected.platform,
          postFormat,
          scheduledFor: new Date(scheduleDateTime).toISOString(),
        });
        const label = new Date(scheduleDateTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        toast.success(`Scheduled for ${label}`);
        setActionDone(`Scheduled · ${label}`);
      } else {
        toast.success("Approved — connect a social account in Settings to publish");
        setActionDone("Approved — no account connected");
      }
      setShowScheduleModal(false);
    } catch {
      toast.error("Schedule failed. Try again.");
    } finally {
      setScheduling(false);
    }
  };

  const handleRefine = async (refinement: string) => {
    if (!contentItem.id) return;
    if (refinePollRef.current) clearInterval(refinePollRef.current);
    setRefining(refinement);
    setRefineStatus("Starting…");
    try {
      const res = await api.post("/generation/tweak", {
        contentItemId: contentItem.id,
        tweakInstruction: refinement,
        component: 'all',
      });
      const refineJobId = res.data.data?.jobId;
      if (!refineJobId) throw new Error("No job ID returned");

      setRefineStatus("Refining…");

      const timeout = window.setTimeout(() => {
        clearInterval(refinePollRef.current!);
        setRefining(null);
        setRefineStatus(null);
        toast.info("Refine is taking longer than expected — check Content library for the result.");
      }, 60_000);

      refinePollRef.current = window.setInterval(async () => {
        try {
          const statusRes = await api.get(`/generation/jobs/${refineJobId}`);
          const state = statusRes.data.data?.state;
          setRefineStatus(state === 'generating_text' ? "Writing…" : state === 'completed' ? "Done" : "Refining…");

          if (state === 'completed') {
            clearInterval(refinePollRef.current!);
            clearTimeout(timeout);
            const contentRes = await api.get(`/content?jobId=${refineJobId}`);
            const body = contentRes.data.data;
            const items = Array.isArray(body) ? body : (body?.data ?? []);
            if (items.length > 0) {
              onRefineComplete?.(items);
              toast.success(`"${refinement}" applied — preview updated.`);
            } else {
              toast.success("Refined — check Content library.");
            }
            setRefining(null);
            setRefineStatus(null);
          } else if (state === 'failed') {
            clearInterval(refinePollRef.current!);
            clearTimeout(timeout);
            setRefining(null);
            setRefineStatus(null);
            toast.error("Refine failed. Try again.");
          }
        } catch {
          clearInterval(refinePollRef.current!);
          clearTimeout(timeout);
          setRefining(null);
          setRefineStatus(null);
        }
      }, 2000);
    } catch {
      setRefining(null);
      setRefineStatus(null);
      toast.error("Refine failed.");
    }
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow mb-1">Content Studio · {variants.length} draft{variants.length > 1 ? "s" : ""}</p>
          <p className="text-xs text-taupe">Shaped by your Brand DNA. Compare, refine, then schedule.</p>
        </div>
        <button
          onClick={() => onChangeStep?.("format")}
          className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground whitespace-nowrap"
        >
          ← Change goal or format
        </button>
      </div>

      {/* Pillar / layout — shows why the Grid Analyzer picked this shape */}
      {(contentItem.contentPillar || contentItem.layoutType) && (
        <div className="flex flex-wrap gap-2">
          {contentItem.contentPillar && (
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-taupe border hairline px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-sage shrink-0" />
              Pillar&nbsp;<span className="text-foreground font-semibold">{humanizeSlug(contentItem.contentPillar)}</span>
            </span>
          )}
          {contentItem.layoutType && (
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-taupe border hairline px-2.5 py-1">
              Layout&nbsp;<span className="text-foreground font-semibold">{humanizeSlug(contentItem.layoutType)}</span>
            </span>
          )}
        </div>
      )}

      {/* Option tabs */}
      {variants.length > 1 && (
        <div className="grid gap-px bg-border border hairline" style={{ gridTemplateColumns: `repeat(${variants.length}, 1fr)` }}>
          {variants.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => setActiveVariant(i)}
              className={"p-4 text-left transition-colors " + (i === activeVariant ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/20")}
            >
              <p className={"text-[9px] uppercase tracking-widest mb-1 " + (i === activeVariant ? "text-nude" : "text-taupe")}>
                Option {i + 1}
              </p>
              <p className="text-xs font-medium">{MODEL_LABELS[variants[i]?.generatedBy] ?? variants[i]?.generatedBy ?? `Option ${i + 1}`}</p>
            </button>
          ))}
        </div>
      )}

      {/* Draft preview card */}
      <div className="border border-border bg-card shadow-sm overflow-hidden">

        {/* Card header / Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted px-4 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border-b-2 transition-all ${
                activeTab === 'visual'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-taupe hover:text-foreground'
              }`}
            >
              Visual Presentation
            </button>
            <button
              onClick={() => setActiveTab('copywriting')}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border-b-2 transition-all ${
                activeTab === 'copywriting'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-taupe hover:text-foreground'
              }`}
            >
              Polished Copywriting
            </button>
            <button
              onClick={() => setActiveTab('prompt')}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border-b-2 transition-all ${
                activeTab === 'prompt'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-taupe hover:text-foreground'
              }`}
            >
              Live System Prompt
            </button>
          </div>
          <span className="text-[9px] uppercase tracking-widest font-bold text-taupe/40 pr-2 hidden sm:inline">
            Output Canvas
          </span>
        </div>

        {activeTab === 'visual' ? (
          <>
            {isStory && storyFrames.length > 0 ? (
          /* ── STORY LAYOUT ────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* LEFT — story preview */}
            <div className="flex flex-col bg-card">

              {/* Thumbnail strip */}
              <div className="grid grid-cols-4 gap-1.5 p-3 border-b hairline">
                {storyFrames.map((frame: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActiveSlide(i)}
                    className={"overflow-hidden border transition-all " +
                      (i === safeFrame ? "border-foreground" : "border-transparent opacity-50 hover:opacity-80")}
                  >
                    <img src={frame.url} alt={frame.label} className="w-full aspect-[9/16] object-cover" />
                  </button>
                ))}
              </div>

              {/* Main image — 9:16 story ratio, styled as an actual phone/story mockup */}
              <div className="relative flex-1 flex items-center justify-center bg-nude/10 p-6">
                <div
                  className="relative overflow-hidden rounded-[22px] shadow-lg"
                  style={{ maxWidth: '220px', width: '100%', border: '6px solid var(--foreground)' }}
                >
                  <div className="aspect-[9/16] relative overflow-hidden bg-foreground">
                    <img
                      src={getVariantUrl(storyFrames[safeFrame])}
                      alt={storyFrames[safeFrame]?.label}
                      className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Instagram-style segmented progress bar */}
                    <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
                      {storyFrames.map((_: any, i: number) => (
                        <span key={i} className="flex-1 h-[2.5px] rounded-full bg-white/35 overflow-hidden">
                          <span
                            className="block h-full bg-white transition-all duration-300"
                            style={{ width: i <= safeFrame ? '100%' : '0%' }}
                          />
                        </span>
                      ))}
                    </div>

                    {/* Bottom scrim + frame label, like a story caption sticker */}
                    <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-[8px] uppercase tracking-widest text-nude/80 mb-0.5">
                        Frame {safeFrame + 1} of {storyFrames.length}
                      </p>
                      <p className="text-xs font-medium text-offwhite leading-snug">
                        {storyFrames[safeFrame]?.label}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nav + download */}
              <div className="flex items-center justify-between px-4 py-3 border-t hairline">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveSlide(Math.max(0, safeFrame - 1))} disabled={safeFrame === 0} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground disabled:opacity-30">← Prev</button>
                  <button onClick={() => setActiveSlide(Math.min(storyFrames.length - 1, safeFrame + 1))} disabled={safeFrame === storyFrames.length - 1} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground disabled:opacity-30">Next →</button>
                </div>
                <button onClick={downloadImage} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v6M2 7l3 2 3-2M1 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download frame
                </button>
              </div>
            </div>

            {/* RIGHT — story sequence + caption */}
            <div className="flex flex-col divide-y divide-border">

              {/* Story sequence */}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Story sequence</p>
                <div className="space-y-px bg-border">
                  {storyFrames.map((frame: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setActiveSlide(i)}
                      className={"w-full text-left px-4 py-3 flex items-center gap-3 transition-colors " + (i === safeFrame ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/20")}
                    >
                      <span className={"text-[9px] tabular-nums shrink-0 " + (i === safeFrame ? "text-nude" : "text-taupe")}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {frame.title ?? frame.label ?? `Frame ${i + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-taupe">Caption</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-taupe">{charCount} chars · {tagCount} tags</span>
                    <button onClick={copyCaption} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                      {captionCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{opt.caption}</p>
              </div>

              {/* CTA */}
              {opt.callToAction && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Call to action</p>
                  <p className="text-sm text-foreground">{opt.callToAction}</p>
                </div>
              )}

              {/* Hashtags */}
              {opt.hashtags?.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Suggested hashtags</p>
                  <div className="flex flex-wrap gap-2">
                    {opt.hashtags.map((h: string) => (
                      <span key={h} className="text-[10px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">#{h}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isReel && reelShots.length > 0 ? (
          /* ── REEL / TIKTOK LAYOUT ────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* LEFT — full-width image preview + storyboard strip */}
            <div className="bg-[#0d0d0d] flex flex-col">

              {/* Main image — 9:16 reel ratio */}
              <div className="relative aspect-[9/16] max-h-[480px] overflow-hidden">
                {singleImageUrl ? (
                  <img src={singleImageUrl} alt="Reel preview" className="absolute inset-0 w-full h-full object-cover object-center" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a]" />
                )}

                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

                {/* SIMULATED badge — top right */}
                <div className="absolute top-3 right-3 bg-black/70 border border-white/20 px-2 py-0.5">
                  <p className="text-[8px] uppercase tracking-widest text-white/70">Simulated</p>
                </div>

                {/* Play button — centre */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="size-12 rounded-full bg-white/15 border border-white/40 flex items-center justify-center backdrop-blur-sm">
                    <svg width="14" height="16" viewBox="0 0 18 20" fill="none">
                      <path d="M2 2l14 8-14 8V2z" fill="white" fillOpacity="0.9"/>
                    </svg>
                  </div>
                </div>

                {/* Hook overlay — bottom */}
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
                  <p className="text-[8px] uppercase tracking-widest text-white/50 mb-1">Hook · Shot 1</p>
                  {reelHookOverlay && (
                    <p className="text-xs font-medium text-white leading-snug italic">"{reelHookOverlay}"</p>
                  )}
                </div>
              </div>

              {/* Storyboard strip */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[8px] uppercase tracking-widest text-white/30 mb-2">Storyboard · {reelShots.length} shots</p>
                <div className="flex gap-1.5 overflow-x-auto pb-2">
                  {reelShots.map((shot: any, i: number) => (
                    <div key={i} className="shrink-0 flex flex-col gap-1" style={{ width: 60 }}>
                      <div className="relative bg-[#1c1c1c] border border-white/10 flex flex-col items-center justify-center gap-0.5 px-1 py-2">
                        <p className="text-[9px] text-white/60 tabular-nums font-mono">{shot.timestamp}</p>
                        {i === 0 && <div className="absolute top-1 right-1 size-1.5 rounded-full bg-white/50" />}
                      </div>
                      <p className="text-[7px] text-white/40 leading-tight truncate" title={shot.description}>
                        {shot.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom bar */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-white/10 mt-1">
                <p className="text-[8px] uppercase tracking-widest text-white/30">TikTok · Reel</p>
                <button onClick={downloadImage} className="text-[8px] uppercase tracking-widest text-white/30 hover:text-white/70 flex items-center gap-1 transition-colors">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M5 1v6M2 7l3 2 3-2M1 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download
                </button>
              </div>
            </div>

            {/* RIGHT — reel script + metadata */}
            <div className="flex flex-col divide-y divide-border">

              {/* Caption */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-taupe">Caption</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-taupe">{charCount} chars · {tagCount} tags</span>
                    <button onClick={copyCaption} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                      {captionCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{opt.caption}</p>
              </div>

              {/* Reel script */}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Reel script</p>
                <div className="space-y-px bg-border">
                  {reelShots.map((shot: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 bg-card px-4 py-3">
                      <span className="text-[9px] tabular-nums font-mono text-taupe shrink-0 mt-px">{shot.timestamp}</span>
                      <span className="text-xs text-foreground leading-snug">{shot.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              {opt.callToAction && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Call to action</p>
                  <p className="text-sm text-foreground">{opt.callToAction}</p>
                </div>
              )}

              {/* Suggested posting time */}
              {reelPostingTime && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Suggested posting time</p>
                  <p className="text-sm text-foreground">{reelPostingTime}</p>
                </div>
              )}

              {/* Hashtags as pills */}
              {opt.hashtags?.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Suggested hashtags</p>
                  <div className="flex flex-wrap gap-2">
                    {opt.hashtags.map((h: string) => (
                      <span key={h} className="text-[10px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">#{h}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isCarousel && carouselSlides.length > 0 ? (
          /* ── CAROUSEL LAYOUT ─────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* LEFT — main slide viewer + thumbnail strip */}
            <div className="bg-nude/10 flex flex-col">

              {/* Main slide — 1:1 square carousel ratio */}
              <div className="relative aspect-square overflow-hidden">
                <img
                  src={getVariantUrl(carouselSlides[safeSlide])}
                  alt={carouselSlides[safeSlide]?.label ?? `Slide ${safeSlide + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Slide counter badge */}
                <div className="absolute top-3 left-3 bg-foreground/80 px-2 py-1">
                  <p className="text-[9px] uppercase tracking-widest text-offwhite tabular-nums">
                    {safeSlide + 1}/{carouselSlides.length}
                  </p>
                </div>

                {/* Slide label badge */}
                <div className="absolute top-3 right-3 bg-foreground/80 px-2 py-1">
                  <p className="text-[9px] uppercase tracking-widest text-nude">
                    {carouselSlides[safeSlide]?.label ?? `SLIDE ${safeSlide + 1}`}
                  </p>
                </div>

                {/* Prev / Next arrows */}
                {safeSlide > 0 && (
                  <button
                    onClick={() => setActiveSlide(safeSlide - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center bg-foreground/70 hover:bg-foreground transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M6.5 2L3.5 5l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                {safeSlide < carouselSlides.length - 1 && (
                  <button
                    onClick={() => setActiveSlide(safeSlide + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center bg-foreground/70 hover:bg-foreground transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3.5 2L6.5 5l-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Thumbnail strip */}
              <div className="flex gap-1.5 overflow-x-auto p-3 bg-card border-t hairline">
                {carouselSlides.map((slide: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActiveSlide(i)}
                    className={"shrink-0 relative overflow-hidden transition-all " + (i === safeSlide ? "ring-2 ring-foreground" : "opacity-60 hover:opacity-90")}
                  >
                    <img
                      src={slide.url}
                      alt={slide.label ?? `Slide ${i + 1}`}
                      className="w-14 h-14 object-cover"
                    />
                    <p className="text-[7px] uppercase tracking-widest text-center py-0.5 bg-card text-taupe">
                      {String(i + 1).padStart(2, '0')}
                    </p>
                  </button>
                ))}
              </div>

              {/* Image actions */}
              <div className="flex items-center justify-between px-4 py-3 border-t hairline bg-card">
                <p className="text-[9px] uppercase tracking-widest text-taupe">
                  Carousel · {carouselSlides.length} slides
                </p>
                <button
                  onClick={downloadImage}
                  className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground flex items-center gap-1.5 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v6M2 7l3 2 3-2M1 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download slide
                </button>
              </div>
            </div>

            {/* RIGHT — slide list + caption */}
            <div className="flex flex-col divide-y divide-border">

              {/* Carousel slide list */}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Carousel slides</p>
                <div className="space-y-px bg-border">
                  {carouselSlides.map((slide: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setActiveSlide(i)}
                      className={"w-full text-left px-4 py-3 flex items-center gap-3 transition-colors " + (i === safeSlide ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/20")}
                    >
                      <span className={"text-[9px] tabular-nums shrink-0 " + (i === safeSlide ? "text-nude" : "text-taupe")}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {slide.title ?? slide.label ?? `Slide ${i + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-taupe">Caption</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-taupe">{charCount} chars · {tagCount} tags</span>
                    <button onClick={copyCaption} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                      {captionCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{opt.caption}</p>
              </div>

              {/* Hashtags */}
              {opt.hashtags && opt.hashtags.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Suggested hashtags</p>
                  <p className="text-xs text-taupe leading-relaxed">
                    {opt.hashtags.map((h: string) => `#${h}`).join("  ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── SINGLE IMAGE LAYOUT ─────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* LEFT — image */}
            <div className="relative bg-nude/10 flex flex-col">
              {singleImageUrl ? (
                <>
                  <div className="relative">
                    <img
                      src={singleImageUrl}
                      alt="Generated content"
                      className="w-full object-cover max-h-[400px]"
                    />
                    {opt.hookSentence && (
                      <div className="absolute bottom-0 left-0 right-0 bg-foreground/80 px-4 py-3">
                        <p className="text-[9px] uppercase tracking-widest text-nude mb-1">On-image text</p>
                        <p className="text-xs text-offwhite italic leading-snug">"{opt.hookSentence}"</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t hairline bg-card">
                    <p className="text-[9px] uppercase tracking-widest text-taupe">
                      Caption · {contentItem.serviceCategory ?? "Post"}
                    </p>
                    <button
                      onClick={downloadImage}
                      className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground flex items-center gap-1.5 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 1v6M2 7l3 2 3-2M1 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Download image
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center min-h-[200px]">
                  <p className="text-xs text-taupe italic">No image generated</p>
                </div>
              )}
            </div>

            {/* RIGHT — caption details */}
            <div className="flex flex-col divide-y divide-border">
              <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-taupe">Caption</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-taupe">{charCount} chars · {tagCount} tags</span>
                    <button onClick={copyCaption} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                      {captionCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{opt.caption}</p>
              </div>
              {opt.callToAction && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Call to action</p>
                  <p className="text-sm text-foreground">{opt.callToAction}</p>
                </div>
              )}
              {opt.hashtags && opt.hashtags.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Suggested hashtags</p>
                  <p className="text-xs text-taupe leading-relaxed">
                    {opt.hashtags.map((h: string) => `#${h}`).join("  ")}
                  </p>
                </div>
              )}
            </div>
          </div>
            )}
          </>
        ) : activeTab === 'copywriting' ? (
          /* ── POLISHED COPYWRITING TAB ────────────────────────────────── */
          <div className="p-6 bg-card text-foreground divide-y divide-border space-y-6">
            <div className="pb-4">
              <h4 className="text-[10px] uppercase tracking-[0.2em] text-taupe font-bold mb-2">On-Image Hook Text</h4>
              <p className="text-lg font-serif italic text-foreground leading-relaxed">
                {opt.hookSentence ? `"${opt.hookSentence}"` : "No hook sentence generated."}
              </p>
            </div>
            
            <div className="py-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-taupe font-bold">Instagram Caption</h4>
                <button onClick={copyCaption} className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                  {captionCopied ? "Copied!" : "Copy Caption"}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{opt.caption}</p>
            </div>
            
            {opt.callToAction && (
              <div className="py-4">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-taupe font-bold mb-1">Call to Action</h4>
                <p className="text-sm text-foreground leading-relaxed">{opt.callToAction}</p>
              </div>
            )}
            
            {opt.hashtags && opt.hashtags.length > 0 && (
              <div className="py-4">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-taupe font-bold mb-3">Suggested Hashtags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {opt.hashtags.map((h: string) => (
                    <span key={h} className="text-[10px] uppercase tracking-widest border border-border px-2.5 py-1 text-taupe bg-muted font-mono">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── LIVE SYSTEM PROMPT TAB ──────────────────────────────────── */
          <div className="p-6 bg-card text-foreground">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5 pb-4 border-b border-border">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-taupe">
                  Current Active System Instructions Passed to the Engine
                </h4>
                <p className="text-[11px] text-taupe mt-1">
                  Below is the core system architecture. It enforces absolute work truthfulness, incorporates your Brand DNA, and dynamically implements compliance standards.
                </p>
              </div>
              <button
                onClick={() => {
                  const fullText = `SYSTEM PROMPT:\n${promptPreview?.systemPrompt ?? ''}\n\nUSER PROMPT:\n${promptPreview?.userPrompt ?? ''}`;
                  navigator.clipboard.writeText(fullText);
                  toast.success("Full prompt copied to clipboard");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-muted hover:bg-nude/20 text-[10px] uppercase tracking-widest font-semibold transition-all"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy Full Prompt
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-taupe mb-1.5">System Prompt & Brand DNA Rules</p>
                <pre className="w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[11px] p-4 overflow-auto max-h-[300px] border border-border whitespace-pre-wrap leading-relaxed">
                  {promptPreview?.systemPrompt || 'No system prompt compiled.'}
                </pre>
              </div>
              
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-taupe mb-1.5">User Appointment Context Brief</p>
                <pre className="w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[11px] p-4 overflow-auto max-h-[250px] border border-border whitespace-pre-wrap leading-relaxed">
                  {promptPreview?.userPrompt || 'No user prompt compiled.'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Refine this option */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Refine this option</p>
        <div className="flex flex-wrap gap-2">
          {REFINE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => handleRefine(r)}
              disabled={!!refining}
              className={
                "px-3 py-1.5 text-[10px] uppercase tracking-widest border hairline transition-colors " +
                (refining === r
                  ? "bg-foreground text-offwhite border-foreground"
                  : "bg-card text-taupe hover:text-foreground hover:border-foreground disabled:opacity-40")
              }
            >
              {refining === r ? (refineStatus ?? "Refining…") : r}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between border-t hairline pt-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-sage shrink-0" />
          <span className="text-[10px] uppercase tracking-widest text-taupe">
            {actionDone ?? "Ready to schedule"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleAction("draft")}
            className="border hairline px-5 py-2.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground hover:border-foreground transition-colors"
          >
            Save as draft
          </button>
          <button
            onClick={() => handleAction("approve")}
            className="border hairline px-5 py-2.5 text-[10px] uppercase tracking-widest text-foreground hover:bg-nude/20 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="bg-foreground text-offwhite px-5 py-2.5 text-[10px] uppercase tracking-widest hover:bg-taupe transition-colors"
          >
            Approve & schedule
          </button>
        </div>
      </div>

      {/* Schedule modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border hairline p-8 w-full max-w-sm shadow-xl">
            <p className="eyebrow mb-2">Schedule post</p>
            <p className="text-sm text-taupe mb-6 leading-relaxed">
              Pick a date and time to publish. The post will be approved and added to your calendar.
            </p>

            <div className="space-y-1 mb-6">
              <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">Date & Time</label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={e => setScheduleDateTime(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full bg-transparent border-b hairline py-2 text-sm outline-none focus:border-foreground text-foreground"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowScheduleModal(false); setScheduleDateTime(''); }}
                className="flex-1 border hairline px-4 py-3 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground hover:border-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleSubmit}
                disabled={!scheduleDateTime || scheduling}
                className="flex-1 bg-foreground text-offwhite px-4 py-3 text-[10px] uppercase tracking-widest hover:bg-taupe transition-colors disabled:opacity-50"
              >
                {scheduling ? "Scheduling..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function BrandDNAInfluence({ brandDna }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-muted border-b border-border px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Brand DNA Influence</p>
      </div>
      {brandDna ? (
        <div className="divide-y divide-border">
          {brandDna.voice?.summary && (
            <div className="px-5 py-4">
              <p className="text-[9px] uppercase tracking-widest text-taupe mb-1.5">Voice</p>
              <div className="flex flex-wrap gap-1.5">
                {brandDna.voice.summary.split(/[·,]/).map((v: string) => v.trim()).filter(Boolean).map((v: string) => (
                  <span key={v} className="text-[10px] uppercase tracking-widest border border-border bg-muted px-2.5 py-1 rounded-full text-foreground">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {brandDna.archetype && (
            <div className="px-5 py-4">
              <p className="text-[9px] uppercase tracking-widest text-taupe mb-1.5">Archetype</p>
              <p className="text-sm font-medium leading-snug">{brandDna.archetype}</p>
            </div>
          )}
          {brandDna.idealClient && (
            <div className="px-5 py-4">
              <p className="text-[9px] uppercase tracking-widest text-taupe mb-1.5">Ideal client</p>
              {typeof brandDna.idealClient === "string" ? (
                <p className="text-xs text-taupe leading-relaxed">{brandDna.idealClient}</p>
              ) : (
                <div className="space-y-1">
                  {brandDna.idealClient.age && (
                    <p className="text-xs text-taupe"><span className="text-foreground">Age:</span> {brandDna.idealClient.age}</p>
                  )}
                  {brandDna.idealClient.cities && (
                    <p className="text-xs text-taupe"><span className="text-foreground">Location:</span> {Array.isArray(brandDna.idealClient.cities) ? brandDna.idealClient.cities.join(", ") : brandDna.idealClient.cities}</p>
                  )}
                  {brandDna.idealClient.looksFor && (
                    <p className="text-xs text-taupe"><span className="text-foreground">Wants:</span> {brandDna.idealClient.looksFor}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {brandDna.pillars?.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[9px] uppercase tracking-widest text-taupe mb-1.5">Content pillars</p>
              <div className="flex flex-wrap gap-1.5">
                {brandDna.pillars.map((p: any, i: number) => {
                  const label = typeof p === "string" ? p : (p.name ?? p.description ?? `Pillar ${i + 1}`);
                  return (
                    <span key={i} className="text-[10px] uppercase tracking-widest border border-sage/30 bg-sage/10 text-sage px-2.5 py-1 rounded-full">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-taupe italic">Loading brand influence…</p>
        </div>
      )}
    </div>
  );
}
