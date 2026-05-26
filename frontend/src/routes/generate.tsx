import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAppointments, type Appointment } from "@/lib/providers/appointments-provider";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { useProfile } from "@/lib/providers/profile-provider";
import { useConsentRequest } from "@/lib/providers/consent-request-provider";
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
}: {
  appointment: Appointment;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { data: consentData, loading: consentLoading } = useConsentRequest(appointment.id);
  const granted = appointment.consent === "granted";

  return (
    <div className="space-y-4">

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
            Continue
          </button>
        )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border hairline mb-6">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGoal(g.id)}
            className={"p-5 text-left transition-colors " + (g.id === goal ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
          >
            <p className="font-serif text-xl mb-1">{g.name}</p>
            <p className={"text-xs " + (g.id === goal ? "text-nude" : "text-taupe")}>{g.help}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground transition-colors">
          ← Back
        </button>
        <button
          onClick={onContinue}
          className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
        >
          Continue
        </button>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline mb-6">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            className={"p-5 text-left transition-colors " + (f.id === format ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")}
          >
            <p className="font-serif text-xl mb-1">{f.name}</p>
            <p className={"text-xs " + (f.id === format ? "text-nude" : "text-taupe")}>{f.help}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground transition-colors">
          ← Back
        </button>
        <button
          onClick={() => onContinue(format)}
          className="bg-foreground text-offwhite px-8 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
        >
          Generate
        </button>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  created: "Starting job...",
  queued: "Queued...",
  processing_image: "Analysing image...",
  processing_vision: "Reading the photo...",
  building_prompt: "Building your prompt...",
  generating_text: "Writing your caption...",
  generating_reel: "Assembling reel...",
};

function ReviewStep({ generating, jobStatus, backendVariants }: any) {
  const [copied, setCopied] = useState<number | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);

  if (generating) {
    return (
      <div className="artifact p-12 text-center">
        <div className="flex justify-center mb-6">
          <span className="size-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
        </div>
        <p className="font-serif text-2xl mb-2 italic">AI is drafting your posts...</p>
        <p className="text-sm text-taupe">{STATUS_LABELS[jobStatus] ?? jobStatus ?? "Processing..."}</p>
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

  const opt = variants[activeVariant] ?? variants[0];
  const isCarousel = contentItem.platformVariants?.type === 'carousel';
  const hasImage = isCarousel || !!contentItem.processedImageUrlFeed;

  const copyToClipboard = (idx: number) => {
    const o = variants[idx];
    const text = [o.hookSentence, o.caption, (o.hashtags ?? []).map((h: string) => `#${h}`).join(" ")]
      .filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="eyebrow">{variants.length} variant{variants.length > 1 ? "s" : ""} generated</p>
        <a
          href="/content"
          className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground border-b border-taupe pb-0.5"
        >
          View all in Content →
        </a>
      </div>

      {/* Two-column post preview */}
      <div className={`artifact overflow-hidden grid ${hasImage ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>

        {/* LEFT — image / carousel */}
        {hasImage && (
          <div className="bg-nude/20 flex flex-col">
            {isCarousel ? (
              <>
                <p className="text-[10px] uppercase tracking-widest text-taupe px-5 pt-4 pb-2">
                  Carousel · {contentItem.platformVariants.slides.length} slides
                </p>
                <div className="flex gap-2 overflow-x-auto px-5 pb-5 flex-1">
                  {contentItem.platformVariants.slides.map((url: string, i: number) => (
                    <div key={i} className="shrink-0">
                      <img
                        src={url}
                        alt={`Slide ${i + 1}`}
                        className="w-44 h-44 object-cover"
                      />
                      <p className="text-[9px] text-taupe text-center mt-1 uppercase tracking-widest">
                        {['Hook', 'Result', 'CTA'][i] ?? `Slide ${i + 1}`}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <img
                src={contentItem.processedImageUrlFeed}
                alt="Processed service photo"
                className="w-full h-full object-cover min-h-[280px] max-h-[480px]"
              />
            )}
          </div>
        )}

        {/* RIGHT — caption panel */}
        <div className="p-6 sm:p-8 flex flex-col gap-5">

          {/* Variant tabs (if multiple) */}
          {variants.length > 1 && (
            <div className="flex gap-1">
              {variants.map((_: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setActiveVariant(i)}
                  className={
                    "px-3 py-1 text-[10px] uppercase tracking-widest border hairline transition-colors " +
                    (i === activeVariant ? "bg-foreground text-offwhite border-foreground" : "text-taupe hover:text-foreground")
                  }
                >
                  Option {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Hook */}
          {opt.hookSentence && (
            <div className="pb-4 border-b hairline">
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Hook</p>
              <p className="text-base font-medium leading-snug">{opt.hookSentence}</p>
            </div>
          )}

          {/* Caption */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Caption</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{opt.caption}</p>
          </div>

          {/* Hashtags */}
          {opt.hashtags && opt.hashtags.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Hashtags</p>
              <p className="text-xs text-taupe leading-relaxed">
                {opt.hashtags.map((h: string) => `#${h}`).join(" ")}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mt-auto pt-2">
            <button
              onClick={async () => {
                try {
                  await api.post(`/content/${contentItem.id}/select-option`, { optionIndex: activeVariant });
                  toast.success("Saved to Content.");
                } catch {
                  toast.error("Failed to save.");
                }
              }}
              className="bg-foreground text-offwhite px-5 py-2.5 text-[10px] uppercase tracking-widest hover:bg-taupe transition-colors"
            >
              Use This Version
            </button>
            <button
              onClick={() => copyToClipboard(activeVariant)}
              className="border hairline px-5 py-2.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
            >
              {copied === activeVariant ? "Copied!" : "Copy Text"}
            </button>
          </div>
        </div>
      </div>
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
