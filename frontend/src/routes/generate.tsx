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
                  onChangeStep={(s: Step) => setStep(s)}
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

const REFINE_OPTIONS = [
  "Make more premium",
  "Make more educational",
  "Make more direct",
  "Make softer",
  "Remove emojis",
  "Shorten",
  "+ Create alternate version",
];

const OPTION_STYLES = ["ChatGPT · OpenAI", "Gemini · Google", "Direct · booking-led"];

function ReviewStep({ generating, jobStatus, backendVariants, onChangeStep }: any) {
  const [activeVariant, setActiveVariant] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [scheduling, setScheduling] = useState(false);

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

  // For single-image posts: primary processed image or first frame url
  const singleImageUrl: string | null =
    contentItem.processedImageUrlFeed ||
    (isCarousel ? carouselSlides[0]?.url : undefined) ||
    (isStory ? storyFrames[0]?.url : undefined) ||
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
    setRefining(refinement);
    try {
      await api.post("/generation/tweak", {
        contentItemId: contentItem.id,
        instruction: refinement,
      });
      toast.success("Refining in background — check Content for the updated version.");
    } catch {
      toast.error("Refine failed.");
    } finally {
      setRefining(null);
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
              <p className="text-xs font-medium">{OPTION_STYLES[i] ?? `Option ${i + 1}`}</p>
            </button>
          ))}
        </div>
      )}

      {/* Draft preview card */}
      <div className="border hairline">

        {/* Card header */}
        <div className="flex items-center justify-between bg-foreground px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-nude shrink-0" />
            <p className="text-[10px] uppercase tracking-widest text-offwhite">Draft preview</p>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-nude">
            {isCarousel ? `Carousel · ${carouselSlides.length} slides` : isStory ? `4-Frame Story · 9:16 · Auto-advance` : isReel ? `TikTok / Reel · ${reelShots.length} shots` : `Option ${activeVariant + 1}`}
          </p>
        </div>

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

              {/* Main image — fills rectangle completely */}
              <div className="relative flex-1 flex items-center justify-center bg-nude/10 p-4">
                <div className="relative w-full overflow-hidden shadow-lg" style={{ maxWidth: '420px' }}>
                  <img
                    src={storyFrames[safeFrame]?.url}
                    alt={storyFrames[safeFrame]?.label}
                    className="w-full h-auto block"
                  />
                  <div className="absolute top-2 left-2 bg-foreground/70 px-2 py-0.5">
                    <p className="text-[9px] uppercase tracking-widest text-offwhite">{safeFrame + 1} / {storyFrames.length}</p>
                  </div>
                  <div className="absolute top-2 right-2 bg-foreground/70 px-2 py-0.5">
                    <p className="text-[9px] uppercase tracking-widest text-nude">{storyFrames[safeFrame]?.label}</p>
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

              {/* Main image — full column width, portrait height */}
              <div className="relative h-80 overflow-hidden">
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

              {/* Main slide */}
              <div className="relative">
                <img
                  src={carouselSlides[safeSlide]?.url}
                  alt={carouselSlides[safeSlide]?.label ?? `Slide ${safeSlide + 1}`}
                  className="w-full object-cover max-h-[360px]"
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
              {refining === r ? "Refining..." : r}
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
