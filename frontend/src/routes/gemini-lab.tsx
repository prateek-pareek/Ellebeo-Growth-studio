import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Download, Sparkles, ChevronLeft, ChevronRight, ChevronDown, Copy, Check, Wand2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { PostKindPicker, missingRequirement } from "@/components/gemini-lab/PostKindPicker";
import { useTemplates } from "@/lib/providers/template-provider";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { downscaleImage } from "@/lib/downscale-image";

export const Route = createFileRoute("/gemini-lab")({
  head: () => ({
    meta: [
      { title: "Gemini Lab — Elle.Be.O Growth" },
      {
        name: "description",
        content: "Experiment: send Brand DNA, a template reference and before/after photos to Gemini and see the image it returns.",
      },
    ],
  }),
  // The Templates browser hands a chosen template over by slug. Without this
  // the link was silently dropped and the picker opened empty, which is why
  // every template card had to dead-end in the legacy /generate flow instead.
  validateSearch: z.object({
    templateSlug: z.string().optional(),
    // The rest of the app links into the studio from an appointment ("make a
    // post from this"), the same way it used to link into /generate.
    appointment: z.string().optional(),
  }),
  component: GeminiLabPage,
});

const PHOTO_FINISHES: Array<{ id: string; label: string; brief: string }> = [
  { id: "off", label: "As shot", brief: "Your photo is composited exactly as uploaded." },
  { id: "natural", label: "Natural", brief: "Gently fixes a dim or colour-cast phone photo. Looks unedited." },
  { id: "polished", label: "Polished", brief: "Brighter, cleaner, a little crisper — the usual studio look." },
  { id: "editorial", label: "Editorial", brief: "More contrast, slightly desaturated. Magazine grade." },
];

const ASPECTS: Array<{ id: "1:1" | "4:5" | "9:16" | "16:9"; label: string }> = [
  { id: "4:5", label: "4:5 feed" },
  { id: "1:1", label: "1:1 square" },
  { id: "9:16", label: "9:16 story" },
  { id: "16:9", label: "16:9 wide" },
];

const PHOTO_KINDS: Array<{ id: "look" | "bts" | "before" | "after" | "detail"; label: string }> = [
  { id: "look", label: "Finished look" },
  { id: "bts", label: "Behind the scenes" },
  { id: "detail", label: "Detail" },
  { id: "before", label: "Before" },
  { id: "after", label: "After" },
];

type PhotoKind = (typeof PHOTO_KINDS)[number]["id"];

type LabSlide = {
  index: number;
  label: string;
  imageDataUrl: string;
  notes: string | null;
};

type PostCaption = {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
};

type QualityGateSummary = { passed: boolean; score: number; reason: string; failures: string[] };

/** What the option actually is, as rendered — the axes the server assigns per option. */
type LabDesign = {
  format: string;
  photoMode: string;
  layout: string;
  photoShape: string;
  decoration: string;
  paletteTreatment?: string;
  typePairing?: string;
  /** The designed layout that carried this post. */
  templateId?: string;
  /** How this option was actually made — see PATH_LABEL. */
  renderPath?: "ai_layout" | "composited" | "poster";
  /** The studio's own reference slide that supplied the arrangement. */
  referenceId?: string | null;
};

/**
 * Tells the server which option the technician actually picked.
 *
 * This is the only genuine preference signal the product gets. Without it the
 * server records the option it PROMOTED and treats that as the brand's taste,
 * so a studio could pick the fourth option every time and the system would
 * keep learning from the first.
 *
 * Deliberately fire-and-forget: a failure here must never interrupt someone
 * choosing a post, and a missed signal costs nothing but a little learning.
 */
function recordSelection(design: LabDesign | undefined) {
  if (!design) return;
  void api.post("/gemini-lab/selection", design).catch(() => {});
}

type LabOption = {
  id: string;
  source: "gemini" | "chatgpt";
  label: string;
  angle: string;
  caption: PostCaption;
  slides: LabSlide[];
  qualityGate?: QualityGateSummary;
  design?: LabDesign;
};

/** Plain-language names for the design axes. A technician does not think in "photoMode". */
const FORMAT_LABEL: Record<string, string> = {
  statement: "Statement",
  proof: "Before / after",
  process: "How it's done",
  myth: "Myth vs fact",
  tips: "Tips & aftercare",
  menu: "Services & prices",
  offer: "Offer or sale",
  availability: "Openings",
  testimonial: "Client words",
  intro: "Meet the artist",
  occasion: "Celebration",
  own: "Your message",
};

/** Layout keys are kebab-case ids from the library; show them as words. */
const LAYOUT_LABEL = (id: string) =>
  id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const PHOTO_MODE_LABEL: Record<string, string> = {
  framed: "Framed photo",
  full_bleed: "Full bleed",
  dual_framed: "Side by side",
  typographic: "Designed poster",
};

type LabResult = {
  model: string;
  aspectRatio: string;
  imageDataUrl: string;
  slides?: LabSlide[];
  options?: LabOption[];
  notes: string | null;
  prompt: string | null;
  used: {
    brand: string | null;
    brandDna?: boolean;
    templateSlug: string | null;
    templateName: string | null;
    format?: string | null;
    slideCount?: number;
    optionCount?: number;
    sources?: string[];
    references: string[];
  };
};

function GeminiLabPage() {
  const { data: brandDna, loading: brandLoading, isEmpty: brandEmpty } = useBrandDna();
  const { templates, loading: templatesLoading } = useTemplates();
  const { data: appointments } = useAppointments();

  const [templateSlug, setTemplateSlug] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [photo1Kind, setPhoto1Kind] = useState<PhotoKind>("look");
  // Set once a photo has been retouched, so the UI never implies the frame
  // is still the one that came off the camera.
  const [photo1Edit, setPhoto1Edit] = useState<string | null>(null);
  const [photo2Edit, setPhoto2Edit] = useState<string | null>(null);
  const [photo2Kind, setPhoto2Kind] = useState<PhotoKind>("look");
  const [overlayText, setOverlayText] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16" | "16:9">("4:5");
  // Which KIND of post. Empty means "surprise me" — the server picks, weighted
  // away from whatever this brand was served recently.
  const [postFormat, setPostFormat] = useState<string>("");
  // Real sale/price/opening facts. Typing anything here unlocks the
  // commercial post kinds, which stay locked otherwise so the generator is
  // never asked to invent a discount.
  const [offerDetails, setOfferDetails] = useState("");
  // Photo finishing. Global tonal correction only — the client is never altered.
  const [photoFinish, setPhotoFinish] = useState("off");
  // A real client review. Unlocks the testimonial kind; never auto-written.
  const [testimonial, setTestimonial] = useState("");
  const [freeSlideCount, setFreeSlideCount] = useState<1 | 3>(1);
  const [applyBrandDna, setApplyBrandDna] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeOption, setActiveOption] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  // Which step of the flow is open. 0 means every step is collapsed to its
  // answer, which is the state after the technician has finished deciding.
  const [step, setStep] = useState(1);

  const templatePreview = useObjectUrl(templateFile);
  const photo1Preview = useObjectUrl(photo1);
  const photo2Preview = useObjectUrl(photo2);

  const selectedAppointment = appointments.find((a) => a.id === appointmentId);
  const apptsWithPhotos = useMemo(
    () => appointments.filter((a) => a.hasBefore || a.hasAfter),
    [appointments],
  );

  const galleryTemplates = useMemo(
    () => templates.filter((t) => t.type === "Carousel" || t.type === "Caption" || t.type === "Story"),
    [templates],
  );
  const selectedTemplate = galleryTemplates.find((t) => t.slug === templateSlug);

  // A template arriving from the Templates browser. Applied once the template
  // list has loaded (the slug means nothing before then), and only if the
  // technician has not already chosen one themselves.
  const search = Route.useSearch();
  const handedOverSlug = search.templateSlug;
  const appliedHandover = useRef(false);
  useEffect(() => {
    if (appliedHandover.current || !handedOverSlug || galleryTemplates.length === 0) return;
    appliedHandover.current = true;
    const chosen = galleryTemplates.find((t) => t.slug === handedOverSlug);
    if (!chosen) {
      toast.error("That template is not available in the studio yet. Pick another below.");
      return;
    }
    setTemplateSlug(handedOverSlug);
    // Open the step the template governs, so arriving from the browser shows
    // what was carried over rather than silently setting it four steps down.
    setStep(4);
    toast.success(`Starting from "${chosen.name}".`);
  }, [handedOverSlug, galleryTemplates]);

  // An appointment handed over from Appointments, Content, Home or a consent
  // page. Applied once the list has loaded, and never over a choice the
  // technician has already made themselves.
  const handedOverAppointment = search.appointment;
  const appliedAppointment = useRef(false);
  useEffect(() => {
    if (appliedAppointment.current || !handedOverAppointment || appointments.length === 0) return;
    appliedAppointment.current = true;
    if (!appointments.some((a) => a.id === handedOverAppointment)) return;
    setAppointmentId(handedOverAppointment);
    setPhoto1Kind("before");
    setPhoto2Kind("after");
  }, [handedOverAppointment, appointments]);

  const expectedSlides = selectedTemplate?.type === "Carousel"
    ? Math.max(1, selectedTemplate.slideCount || 3)
    : selectedTemplate?.type === "Story"
      ? Math.max(1, selectedTemplate.slideCount || 1)
      : freeSlideCount;

  const photoCount = (photo1 ? 1 : 0) + (photo2 ? 1 : 0);
  const selectedKindLabel = postFormat
    ? FORMAT_LABEL[postFormat] ?? postFormat
    : "Let the studio choose";
  /**
   * Why the run cannot start yet, in the technician's words.
   *
   * missingRequirement already existed and was exported but never called, so
   * picking "Offer or sale" and leaving the price box empty submitted happily
   * — and the server, which refuses to invent a price, quietly generated some
   * other kind of post instead. The user got a post they did not ask for with
   * nothing to explain why.
   */
  const blocker = useMemo(() => {
    if (applyBrandDna && brandEmpty) return "Set up Brand DNA, or turn Use Brand DNA off.";
    // No blanket photo requirement. A sale, a price list, an openings post or
    // an aftercare list is a designed poster — demanding a client photo before
    // one could be made was asking for a picture the post would not use. Only
    // the kinds that genuinely show a photograph still require one, and
    // missingRequirement already knows which those are.
    return missingRequirement(postFormat, { offerDetails, testimonial, ownMessage: overlayText, photoCount });
  }, [applyBrandDna, brandEmpty, postFormat, offerDetails, testimonial, overlayText, photoCount]);

  async function handleGenerate() {
    if (blocker) {
      toast.error(blocker);
      return;
    }

    const form = new FormData();
    if (templateSlug) form.append("templateSlug", templateSlug);
    if (appointmentId) form.append("appointmentId", appointmentId);
    if (overlayText.trim()) form.append("overlayText", overlayText.trim());
    if (extraNotes.trim()) form.append("extraNotes", extraNotes.trim());
    form.append("aspectRatio", aspectRatio);
    if (postFormat) form.append("postFormat", postFormat);
    if (offerDetails.trim()) form.append("offerDetails", offerDetails.trim());
    if (photoFinish !== "off") form.append("photoFinish", photoFinish);
    if (testimonial.trim()) form.append("testimonial", testimonial.trim());
    form.append("useBrandDna", applyBrandDna ? "true" : "false");
    if (!templateSlug) form.append("slideCount", String(freeSlideCount));
    if (templateFile) form.append("templateRef", templateFile);
    if (photo1) form.append("photo", photo1);
    if (photo2) form.append("photo2", photo2);
    form.append("photo1Kind", photo1Kind);
    form.append("photo2Kind", photo2Kind);

    setBusy(true);
    setResult(null);
    setActiveSlide(0);
    setActiveOption(0);
    try {
      const res = await api.post("/gemini-lab/generate", form, {
        // The pipeline now renders each option, critiques the render with a
        // vision pass and re-renders the revision, and can run a second
        // regeneration round if every option fails the quality gate. Measured
        // end to end that exceeded the old 4-minute ceiling, so the browser
        // gave up while the server was still working and the user saw nothing.
        timeout: 480_000,
      });
      const data = res.data.data as LabResult;
      setResult(data);
      setActiveSlide(0);
      setActiveOption(0);
      const opts = data.options?.length || 1;
      toast.success(opts > 1 ? `${opts} post options from Gemini and ChatGPT.` : "Post option ready.");
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Gemini Lab failed.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/*
        Dark hero on Deep Teal — the design system's one full-bleed editorial
        moment. Full-bleed is achieved by breaking out of the page gutter with
        a negative margin, so the surface reaches the viewport edge while the
        content stays on the 1200px measure.
      */}
      {/* A working page, not a landing page.
          The hero ran 80px type and four lines of prose over a full screen
          before a single control appeared — you had to scroll past the pitch
          every time you made a post. The promise it made still matters, so it
          stays, but at the size of a page title. */}
      <header className="-mx-4 sm:-mx-6 lg:-mx-8 mb-8 bg-deep-teal text-warm-parchment">
        <div className="page-shell px-6 lg:px-10 py-8 lg:py-10">
          <span className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] text-warm-parchment/70">
            <span className="size-1.5 rounded-full bg-signal-orange" aria-hidden="true" />
            Studio
          </span>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h1 className="font-serif font-light text-[32px] lg:text-[40px] leading-[1.05] tracking-[-0.007em]">
              Posts your salon could have made.
            </h1>
            <p className="text-[14px] leading-snug tracking-[0.01em] text-warm-parchment/70 max-w-[46ch]">
              Four options a run. Your photographs are composited unchanged and never sent to an image
              model, and no price, date or client quote appears unless you supplied it.
            </p>
          </div>
        </div>
      </header>

      {brandEmpty && !brandLoading && applyBrandDna && (
        <div className="bg-card rounded-[8px] border border-border p-8 mb-6">
          <p className="text-[16px] tracking-[0.01em] text-graphite-warm">
            Brand DNA is on for this run but not set up.{" "}
            <Link to="/brand/onboarding" className="text-foreground underline underline-offset-4">
              Set it up
            </Link>{" "}
            or turn Use Brand DNA off below.
          </p>
        </div>
      )}

      {/* Decisions left, the run right and pinned.
          Everything used to stack in a ~550px column with the whole right half
          of the page empty, and the run summary sat wherever the scroll left
          it. Now the choices read down one side and what they add up to stays
          in view beside them. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-3 min-w-0">
          {/*
            A status strip, not the whole wizard. The full guided Brand DNA now
            lives on the Brand page, where identity belongs — having it open
            above the flow made the first thing a technician saw a form about
            who they are, when they came here to make a post.
          */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[8px] border border-border bg-soft-linen/50 px-6 py-4">
            <span className="flex items-center gap-2 text-[14px] tracking-[0.01em] text-ink">
              <span
                className={"size-1.5 rounded-full " + (brandEmpty ? "bg-signal-orange" : "bg-ink")}
                aria-hidden="true"
              />
              {brandEmpty ? "Brand not set up yet" : brandDna?.category || "Your brand"}
            </span>
            {!brandEmpty && brandDna?.palette?.length ? (
              <span className="flex items-center gap-1" aria-hidden="true">
                {brandDna.palette.slice(0, 5).map((hex) => (
                  <span
                    key={hex}
                    className="size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
            ) : null}
            <span className="text-[14px] tracking-[0.01em] text-graphite-warm">
              {applyBrandDna ? "Colours, type and voice applied" : "Not applied to this run"}
            </span>
            <div className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => setApplyBrandDna(!applyBrandDna)}
                className="text-[14px] tracking-[0.01em] text-graphite-warm underline underline-offset-4 hover:text-ink transition-colors"
              >
                {applyBrandDna ? "Turn off" : "Turn on"}
              </button>
              <Link
                to="/brand"
                className="text-[14px] tracking-[0.01em] text-ink underline underline-offset-4"
              >
                Edit brand
              </Link>
            </div>
          </div>

          <Step
            index={1}
            title="What are you posting?"
            summary={selectedKindLabel}
            open={step === 1}
            done={step > 1}
            onToggle={() => setStep(step === 1 ? 0 : 1)}
          >
            <PostKindPicker
                          value={postFormat}
                          onChange={(id) => {
                            setPostFormat(id);
                            // Carry the flow to wherever the choice is actually
                            // finished. A kind needing a PHOTO sends you to the
                            // photo step — it used to be disabled here instead,
                            // which left "Statement" unclickable in the step
                            // before the one that unlocks it, with no way to act
                            // on it. A kind needing typed facts keeps you here,
                            // because the box for them is on this step.
                            const missing = missingRequirement(id, {
                              offerDetails,
                              testimonial,
                              ownMessage: overlayText,
                              photoCount,
                            });
                            const needsPhoto = !!missing && /photo/i.test(missing);
                            setStep(needsPhoto ? 2 : missing ? 1 : 2);
                          }}
                          photoCount={photoCount}
                          offerDetails={offerDetails}
                          setOfferDetails={setOfferDetails}
                          testimonial={testimonial}
                          setTestimonial={setTestimonial}
                          ownMessage={overlayText}
                          setOwnMessage={setOverlayText}
                        />
          </Step>

          <Step
            index={2}
            title="Photos"
            optional
            summary={photoCount ? `${photoCount} photo${photoCount > 1 ? "s" : ""}` : "No photo — this will be a designed poster"}
            open={step === 2}
            done={step > 2}
            onToggle={() => setStep(step === 2 ? 0 : 2)}
          >
            <div className="flex items-center justify-between gap-3">
                          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">3 · Photos</p>
                        </div>
                        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
                          Skip this for a sale, a price list, openings or an aftercare post — those are designed as
                          posters, in your brand colours and type. Add a shot for the kinds that actually show your
                          work, and tag what it is.
                        </p>
                        <select
                          value={appointmentId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setAppointmentId(id);
                            if (id) {
                              setPhoto1Kind("before");
                              setPhoto2Kind("after");
                            }
                          }}
                          className="field tracking-[0.01em]"
                        >
                          <option value="">Or pull from an appointment (optional)</option>
                          {apptsWithPhotos.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.clientName} · {a.service} · {a.date}
                            </option>
                          ))}
                        </select>
                        {selectedAppointment && (
                          <div className="grid grid-cols-2 gap-3">
                            <Thumb label="Before on file" src={selectedAppointment.beforePhotoUrl} />
                            <Thumb label="After on file" src={selectedAppointment.afterPhotoUrl} />
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <FileDrop
                              label="Photo 1"
                              file={photo1}
                              preview={photo1Preview}
                              onChange={(f) => {
                                setPhoto1(f);
                                setPhoto1Edit(null);
                              }}
                            />
                            <KindChips value={photo1Kind} onChange={setPhoto1Kind} />
                            <PhotoEditor
                              file={photo1}
                              kind={photo1Kind}
                              onEdited={(f, disclosure) => {
                                setPhoto1(f);
                                setPhoto1Edit(disclosure);
                              }}
                            />
                            {photo1Edit && (
                              <p className="text-[14px] tracking-[0.01em] text-graphite-warm">{photo1Edit}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <FileDrop
                              label="Photo 2 (optional)"
                              file={photo2}
                              preview={photo2Preview}
                              onChange={(f) => {
                                setPhoto2(f);
                                setPhoto2Edit(null);
                              }}
                            />
                            <KindChips value={photo2Kind} onChange={setPhoto2Kind} />
                            <PhotoEditor
                              file={photo2}
                              kind={photo2Kind}
                              onEdited={(f, disclosure) => {
                                setPhoto2(f);
                                setPhoto2Edit(disclosure);
                              }}
                            />
                            {photo2Edit && (
                              <p className="text-[14px] tracking-[0.01em] text-graphite-warm">{photo2Edit}</p>
                            )}
                          </div>
                        </div>
          </Step>

          <Step
            index={3}
            title="Shape and finish"
            summary={`${aspectRatio} · ${PHOTO_FINISHES.find((f) => f.id === photoFinish)?.label ?? "As shot"}`}
            open={step === 3}
            done={step > 3}
            onToggle={() => setStep(step === 3 ? 0 : 3)}
          >
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm">4 · Copy & format</p>
                        <textarea
                          value={overlayText}
                          onChange={(e) => setOverlayText(e.target.value)}
                          placeholder="Optional overlay text, e.g. Lived-in blonde · Sydney"
                          rows={2}
                          className="field tracking-[0.01em] resize-y"
                        />
                        {/* The studio's own idea. This was an unlabelled box
                            reading "Optional extra direction for Gemini" —
                            named after the vendor, framed as an afterthought,
                            and appended to the very end of the prompt. It is
                            the one place a technician can say what they
                            actually want, so it is named and explained. */}
                        <div>
                          <label className="text-[14px] tracking-[0.01em] text-ink flex items-center gap-1.5">
                            <Sparkles className="size-3.5" />
                            Have something in mind?
                          </label>
                          <textarea
                            value={extraNotes}
                            onChange={(e) => setExtraNotes(e.target.value)}
                            placeholder="Say it in your own words — “we just took on a curly specialist”, “quiet week, want midweek bookings”, “something for Diwali”"
                            rows={3}
                            className="field mt-1.5 tracking-[0.01em] resize-y"
                          />
                          <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-1.5">
                            Written however you think it. The studio turns it into a post in your
                            colours, type and voice — you don't have to phrase it as a caption.
                          </p>
                        </div>
                        <div>
                          <label className="text-[14px] tracking-[0.01em] text-graphite-warm">
                            Photo finish
                          </label>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {PHOTO_FINISHES.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                title={f.brief}
                                onClick={() => setPhotoFinish(f.id)}
                                className={
                                  "text-[14px] tracking-[0.01em] px-4 py-2 rounded-full border transition-colors " +
                                  (photoFinish === f.id
                                    ? "bg-ink/[0.06] text-ink border-ink"
                                    : "bg-card text-graphite-warm border-pale-stone hover:border-ink hover:text-ink")
                                }
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-2">
                            {PHOTO_FINISHES.find((f) => f.id === photoFinish)?.brief}{" "}
                            {photoFinish !== "off" &&
                              "Exposure and colour only — your client is never altered, and a before/after pair gets one identical grade."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {ASPECTS.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setAspectRatio(a.id)}
                              className={
                                "text-[14px] tracking-[0.01em] px-4 py-2 rounded-full border transition-colors " +
                                (aspectRatio === a.id
                                  ? "bg-ink/[0.06] text-ink border-ink"
                                  : "bg-card text-graphite-warm border-pale-stone hover:border-ink hover:text-ink")
                              }
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
          </Step>

          <Step
            index={4}
            title="One post or a carousel?"
            optional
            summary={selectedTemplate ? `${selectedTemplate.name} · ${expectedSlides} slides` : expectedSlides > 1 ? `${expectedSlides} slides` : "Single post"}
            open={step === 4}
            done={false}
            onToggle={() => setStep(step === 4 ? 0 : 4)}
          >
            <div className="flex items-center justify-between gap-3">
                          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">2 · Template</p>
                        </div>
                        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
                            How many slides, and what each one is for. This does not change how the
                            posts look — every option is set in a layout chosen for it.
                          </p>
                        <select
                          value={templateSlug}
                          onChange={(e) => setTemplateSlug(e.target.value)}
                          disabled={templatesLoading}
                          className="field tracking-[0.01em]"
                          aria-label="Carousel structure"
                        >
                          <option value="">Just a single post</option>
                          {galleryTemplates.map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.name} · {t.type}
                              {t.type === "Carousel" ? ` · ${t.slideCount || 3} slides` : ""}
                            </option>
                          ))}
                        </select>
                        {selectedTemplate?.type === "Carousel" && (
                          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
                            {expectedSlides} slides will be generated from this carousel template
                            {selectedTemplate.zones?.length
                              ? `: ${selectedTemplate.zones.map((z) => z.label).join(" → ")}`
                              : "."}
                          </p>
                        )}
                        {!selectedTemplate && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-[14px] tracking-[0.01em] text-graphite-warm mr-1">
                              Length
                            </span>
                            {([1, 3] as const).map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setFreeSlideCount(n)}
                                className={
                                  "text-[14px] tracking-[0.01em] px-4 py-2 rounded-full border transition-colors " +
                                  (freeSlideCount === n
                                    ? "bg-ink/[0.06] text-ink border-ink"
                                    : "bg-card text-graphite-warm border-pale-stone hover:border-ink hover:text-ink")
                                }
                              >
                                {n === 1 ? "1 image" : "3-slide carousel"}
                              </button>
                            ))}
                          </div>
                        )}
                        <FileDrop
                          label="Layout image (optional)"
                          hint="Only if you have a post whose composition you want Gemini to follow."
                          file={templateFile}
                          preview={templatePreview}
                          onChange={setTemplateFile}
                        />
          </Step>
        </section>

        {/* The run, and the button that starts it.
            Generate used to sit inside step 3, so the steps below it read as
            things that happen after you had already pressed go. It now sits in
            its own column, pinned, where it summarises every decision to its
            left and stays reachable however far down you are. */}
        <aside className="lg:sticky lg:top-6 rounded-[8px] border border-pale-stone bg-soft-linen/50 p-5 space-y-4">
          <RunPlan
            optionCount={4}
            kindLabel={selectedKindLabel}
            photoCount={photoCount}
            slides={expectedSlides}
            aspect={aspectRatio}
            brandOn={applyBrandDna}
            brandName={brandDna?.category || null}
          />
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || !!blocker}
              className="btn btn-primary w-full sm:w-auto text-[14px] tracking-[0.01em] rounded-[24px]"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy
                ? "Writing options…"
                : expectedSlides > 1
                  ? `Generate ${expectedSlides}-slide options`
                  : "Generate options"}
            </button>
            {blocker && !busy && (
              <p className="flex items-start gap-1.5 text-[14px] text-graphite-warm">
                <AlertTriangle className="size-3.5 shrink-0 mt-px text-signal-orange" />
                {blocker}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Results run the full width — four options need the room, and they are
          not a step in the form. */}
      <div className="mt-12">
        <section>
          {(busy || result) && (
            <div className="flex items-baseline justify-between gap-6 mb-7">
              <h2 className="font-serif font-light text-[40px] leading-[1.1] tracking-[-0.007em]">
                {busy ? "Designing" : `${result?.options?.length ?? 1} options`}
              </h2>
              {result && (
                <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
                  Pick one — the studio learns what you choose
                </p>
              )}
            </div>
          )}
          {busy && (
            <div className="bg-card rounded-[8px] border border-border p-8">
              <PipelineProgress />
            </div>
          )}
          {!busy && !result && (
            <div className="rounded-[8px] border border-dashed border-pale-stone px-8 py-20 flex flex-col items-center text-center">
              <ImagePlus className="size-7 mb-5 text-graphite-warm" />
              <p className="text-[18px] leading-[1.35] tracking-[0.01em] max-w-[42ch]">
                Your options will appear here — four of them, each a different kind of post.
              </p>
            </div>
          )}
          {result && (
            <ResultSlides
              result={result}
              activeSlide={activeSlide}
              onActiveSlide={setActiveSlide}
              activeOption={activeOption}
              onActiveOption={(i) => {
                setActiveOption(i);
                setActiveSlide(0);
                recordSelection(result.options?.[i]?.design);
              }}
              showPrompt={showPrompt}
              onTogglePrompt={() => setShowPrompt((v) => !v)}
            />
          )}
        </section>
      </div>
    </div>
  );
}


/**
 * One step of the Studio flow.
 *
 * The page used to present every control at once — brand, template, photos,
 * post kind, copy, format — which reads as a settings screen, not a flow. A
 * technician wants to answer one question at a time and see what they have
 * already decided, so a completed step collapses to its own answer and stays
 * one click from being changed.
 */
function Step({
  index,
  title,
  summary,
  open,
  done,
  optional,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  summary?: string;
  open: boolean;
  done?: boolean;
  optional?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        "bg-card rounded-[8px] border transition-colors " +
        (open ? "border-ink" : "border-border")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-start gap-4 text-left px-8 py-6"
      >
        <span
          className={
            "shrink-0 mt-0.5 size-7 rounded-full grid place-items-center text-[14px] tracking-[0.01em] transition-colors " +
            (done ? "bg-ink text-gallery-white" : open ? "border border-ink text-ink" : "border border-pale-stone text-graphite-warm")
          }
        >
          {done ? <Check className="size-3.5" /> : index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[18px] tracking-[0.01em] text-ink">{title}</span>
            {optional && <span className="text-[14px] text-graphite-warm">Optional</span>}
          </span>
          {!open && summary && (
            <span className="block mt-1 text-[14px] tracking-[0.01em] text-graphite-warm truncate">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={"size-4 shrink-0 mt-1.5 text-graphite-warm transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open && <div className="px-8 pb-8 -mt-1 space-y-5">{children}</div>}
    </section>
  );
}

function formatCaption(caption: PostCaption | undefined): string {
  if (!caption) return "";
  const tags = (caption.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return [caption.hook, caption.body, caption.cta, tags].filter(Boolean).join("\n\n");
}

function ResultSlides({
  result,
  activeSlide,
  onActiveSlide,
  activeOption,
  onActiveOption,
  showPrompt,
  onTogglePrompt,
}: {
  result: LabResult;
  activeSlide: number;
  onActiveSlide: (index: number) => void;
  activeOption: number;
  onActiveOption: (index: number) => void;
  showPrompt: boolean;
  onTogglePrompt: () => void;
}) {
  const options = result.options?.length
    ? result.options
    : [{ id: "one", source: "gemini" as const, label: "Gemini 1", angle: "", caption: { hook: "", body: "", cta: "", hashtags: [] }, slides: result.slides?.length ? result.slides : [{ index: 0, label: "Post", imageDataUrl: result.imageDataUrl, notes: result.notes }] }];
  const option = options[Math.min(activeOption, options.length - 1)] ?? options[0];
  const slides = option.slides?.length ? option.slides : [{ index: 0, label: "Post", imageDataUrl: result.imageDataUrl, notes: result.notes }];
  const current = slides[Math.min(activeSlide, slides.length - 1)] ?? slides[0];
  const canPrev = activeSlide > 0;
  const canNext = activeSlide < slides.length - 1;
  const captionText = formatCaption(option.caption);

  return (
    <div className="space-y-4">
      {/*
        A gallery, not a tab strip. Four options behind four unlabelled pills
        meant the difference between them was invisible until you clicked
        through one at a time — which is what made a genuinely varied set feel
        like "the same template" even when it wasn't. Showing every option at
        once, each labelled with what it actually is, is the whole point of
        generating more than one.
      */}
      {options.length > 1 && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {options.map((opt, i) => (
              <OptionCard
                key={opt.id}
                option={opt}
                active={i === activeOption}
                onSelect={() => onActiveOption(i)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="relative max-w-[560px]">
        <img
          src={current.imageDataUrl}
          alt={current.label}
          className="w-full rounded-[18px] border border-border bg-muted object-contain max-h-[70vh]"
        />
        {slides.length > 1 && (
          <>
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => onActiveSlide(activeSlide - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/90 border border-border flex items-center justify-center disabled:opacity-30"
              aria-label="Previous slide"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => onActiveSlide(activeSlide + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/90 border border-border flex items-center justify-center disabled:opacity-30"
              aria-label="Next slide"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((slide, i) => (
            <button
              key={slide.index}
              type="button"
              onClick={() => onActiveSlide(i)}
              className={
                "shrink-0 w-16 rounded-[8px] overflow-hidden border transition-all " +
                (i === activeSlide ? "border-ink ring-1 ring-ink" : "border-border opacity-70 hover:opacity-100")
              }
            >
              <img src={slide.imageDataUrl} alt={slide.label} className="h-20 w-16 object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-[16px] tracking-[0.01em] font-medium">{option.angle || current.label}</p>
        {option.design && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <Chip>{FORMAT_LABEL[option.design.format] || option.design.format}</Chip>
              <Chip>{PHOTO_MODE_LABEL[option.design.photoMode] || option.design.photoMode}</Chip>
              {option.design.photoShape !== "rect" && <Chip>{option.design.photoShape}</Chip>}
              {option.design.decoration !== "none" && <Chip>{option.design.decoration}</Chip>}
              {option.design.templateId && <Chip>{LAYOUT_LABEL(option.design.templateId)}</Chip>}
            </div>
            {/* Where this one came from. The chips above say what it IS; this
                says what MADE it. Without it there was no way to tell an
                AI-designed page from a composited one, or to know whether the
                studio's own template library had been used at all — which is
                why the templates felt broken even when they had worked. */}
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
              {PATH_LABEL[option.design.renderPath ?? "composited"]}
              {option.design.referenceId ? ` · from your template ${option.design.referenceId}` : ""}
            </p>
          </div>
        )}
      </div>
      {option.qualityGate && !option.qualityGate.passed && (
        <p className="flex items-start gap-1.5 text-[14px] text-graphite-warm">
          <AlertTriangle className="size-3.5 shrink-0 mt-px text-signal-orange" />
          {/* The gate's own words. A score with no reason is not reviewable. */}
          {option.qualityGate.reason}
          {option.qualityGate.failures.length ? ` — ${option.qualityGate.failures.join("; ")}` : ""}
        </p>
      )}
      {captionText && (
        <div className="rounded-[8px] border border-border bg-warm-parchment p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm">Caption</p>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
              onClick={async () => {
                await navigator.clipboard.writeText(captionText);
                toast.success("Caption copied.");
              }}
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
          <p className="text-[16px] tracking-[0.01em] text-foreground leading-relaxed whitespace-pre-wrap">{captionText}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <KeepPostButton option={option} slide={current} result={result} />
        <a
          href={current.imageDataUrl}
          download={`gemini-lab-${option.id}-${activeSlide + 1}.png`}
          // Downloading is a stronger signal than clicking through the
          // options, so it is recorded too.
          onClick={() => recordSelection(option.design)}
          className="btn btn-ghost text-[14px] tracking-[0.01em] border-b pb-1"
        >
          <Download className="size-3.5" />
          {slides.length > 1 ? "Download this slide" : "Download"}
        </a>
        {result.prompt && (
          <button
            type="button"
            onClick={onTogglePrompt}
            className="text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
          >
            {showPrompt ? "Hide prompt" : "Show prompt sent"}
          </button>
        )}
      </div>
      {showPrompt && result.prompt && (
        <pre className="text-[14px] leading-relaxed text-graphite-warm bg-warm-parchment rounded-[8px] p-5 overflow-auto max-h-80 whitespace-pre-wrap">
          {result.prompt}
        </pre>
      )}
      {/*
        Run metadata, collapsed. It answers "what did the pipeline actually
        use" — a debugging question, not the question a technician choosing a
        post is asking — so it no longer sits between the image and the
        caption competing with them.
      */}
      <details className="rounded-[8px] border border-border bg-muted/40 px-4 py-2.5">
        <summary className="cursor-pointer text-[14px] tracking-[0.01em] text-graphite-warm">
          Run details
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-[14px] tracking-[0.01em] text-graphite-warm">
            <span className="border border-border px-2.5 py-1 rounded-full">{result.model}</span>
            <span className="border border-border px-2.5 py-1 rounded-full">{result.aspectRatio}</span>
            <span className="border border-border px-2.5 py-1 rounded-full">
              {slides.length > 1 ? `${activeSlide + 1} / ${slides.length}` : "1 slide"}
            </span>
            {result.used.brandDna === false && (
              <span className="border border-border px-2.5 py-1 rounded-full">DNA bypassed</span>
            )}
            {result.used.templateName && (
              <span className="border border-border px-2.5 py-1 rounded-full">{result.used.templateName}</span>
            )}
          </div>
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
            Refs: {result.used.references.join(" · ") || "none"}
          </p>
          {(current.notes || result.notes) && (
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm leading-relaxed whitespace-pre-wrap">{current.notes || result.notes}</p>
          )}
        </div>
      </details>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[14px] tracking-[0.01em] text-graphite-warm bg-card border border-pale-stone px-3 py-1 rounded-full">
      {children}
    </span>
  );
}

function OptionCard({
  option,
  active,
  onSelect,
}: {
  option: LabOption;
  active: boolean;
  onSelect: () => void;
}) {
  const gate = option.qualityGate;
  const kind = option.design ? FORMAT_LABEL[option.design.format] || option.design.format : option.label;
  const mode = option.design ? PHOTO_MODE_LABEL[option.design.photoMode] || option.design.photoMode : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      title={gate?.reason}
      className={
        "text-left rounded-[8px] border overflow-hidden transition-all " +
        (active ? "border-ink ring-1 ring-ink" : "border-border hover:border-ink/40")
      }
    >
      <div className="relative">
        <img
          src={option.slides[0]?.imageDataUrl}
          alt={kind}
          className="w-full aspect-[4/5] object-cover bg-warm-parchment"
        />
        {gate && (
          <span
            className={
              "absolute top-3 right-3 flex items-center gap-1 text-[14px] tabular-nums px-2.5 py-1 rounded-full " +
              (gate.passed ? "bg-ink text-gallery-white" : "bg-signal-orange text-gallery-white")
            }
          >
            {!gate.passed && <AlertTriangle className="size-3" />}
            {gate.score}
          </span>
        )}
      </div>
      <div className="px-4 py-4 flex flex-col gap-2.5">
        <p className={"text-[16px] tracking-[0.01em] font-medium leading-tight " + (active ? "text-ink" : "text-ink/85")}>
          {kind}
        </p>
        {/* What this option IS, in the two terms that decide how it looks. */}
        <div className="flex flex-wrap gap-1.5">
          {mode && (
            <span className="text-[14px] tracking-[0.01em] text-graphite-warm border border-pale-stone rounded-full px-2.5 py-0.5">
              {mode}
            </span>
          )}
          {option.design?.templateId && (
            <span className="text-[14px] tracking-[0.01em] text-graphite-warm border border-pale-stone rounded-full px-2.5 py-0.5">
              {LAYOUT_LABEL(option.design.templateId)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * What the run is doing, while it does it.
 *
 * The endpoint is a single request with no progress channel, so the stages
 * advance on elapsed time against the pipeline's measured shape rather than
 * on real events. They are named after the steps that genuinely run, and the
 * last one stays lit until the response lands — so it never claims a step has
 * finished, only which one it is likely on.
 */
const PIPELINE_STAGES = [
  { at: 0, label: "Writing post options", detail: "Gemini and ChatGPT each write a different kind of post." },
  { at: 12, label: "Designing the imagery", detail: "On-mood art at your chosen aspect ratio." },
  { at: 30, label: "Compositing your photos", detail: "Your shots are placed unchanged — never re-generated." },
  { at: 48, label: "Reviewing the results", detail: "Each option is scored for brand fit, legibility and compliance." },
];

function PipelineProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const currentIndex = PIPELINE_STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <div className="py-10">
      <ol className="space-y-4 max-w-[38ch] mx-auto">
        {PIPELINE_STAGES.map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={stage.label} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <Check className="size-4 text-ink" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-signal-orange" />
                ) : (
                  <span className="block size-4 rounded-full border border-border" />
                )}
              </span>
              <span>
                <span
                  className={
                    "block text-[16px] tracking-[0.01em] " +
                    (active ? "text-foreground font-medium" : done ? "text-graphite-warm" : "text-graphite-warm/50")
                  }
                >
                  {stage.label}
                </span>
                {active && <span className="block text-[14px] tracking-[0.01em] text-graphite-warm mt-1">{stage.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-[14px] tracking-[0.01em] text-graphite-warm mt-8 tabular-nums">
        {elapsed}s · usually under two minutes
      </p>
    </div>
  );
}


/**
 * Retouching a photo from a written instruction.
 *
 * The edited image replaces the file in place, so everything downstream — the
 * composite, the quality gate, the download — uses it without knowing where it
 * came from. The disclosure is kept visible: once a photo has been edited the
 * studio should never be under the impression it is still the original frame.
 */
function PhotoEditor({
  file,
  kind,
  onEdited,
}: {
  file: File | null;
  kind: PhotoKind;
  onEdited: (file: File, disclosure: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  if (!file) return null;

  async function run() {
    if (!file || !instruction.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("instruction", instruction.trim());
      form.append("kind", kind);
      const res = await api.post("/gemini-lab/photo-edit", form, { timeout: 180_000 });
      const { imageDataUrl, disclosure } = res.data.data as { imageDataUrl: string; disclosure: string };
      const blob = await (await fetch(imageDataUrl)).blob();
      // Take the type from the blob rather than assuming PNG — the server
      // returns JPEG, and mislabelling it left a file whose name, MIME type
      // and actual bytes disagreed.
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const base = file.name.replace(/\.[^.]+$/, "");
      onEdited(
        new File([blob], `edited-${base}.${ext}`, { type: blob.type || "image/jpeg" }),
        disclosure,
      );
      setInstruction("");
      setOpen(false);
      toast.success("Photo edited.");
    } catch (err: any) {
      // The server explains refusals in the technician's own terms — a
      // before/after can only take scenic edits, for instance — so surface
      // its wording rather than a generic failure.
      toast.error(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          "That edit could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
        >
          <Wand2 className="size-3.5" />
          Edit with a prompt
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            placeholder="Remove the clutter behind me and warm the lighting"
            className="field tracking-[0.01em] resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={busy || !instruction.trim()}
              className="btn btn-primary text-[14px] tracking-[0.01em] rounded-[24px]"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              {busy ? "Editing…" : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
          {(kind === "before" || kind === "after") && (
            <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
              On a before or after you can change the room — lighting, background, clutter, crop — but not the
              subject.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * Keeps a post in the studio's library, optionally planning it for a date.
 *
 * The only way out of the Lab used to be a browser download — four options
 * generated, one chosen, and no record anywhere that the studio had made it.
 */
function KeepPostButton({
  option,
  slide,
  result,
}: {
  option: LabOption;
  slide: LabSlide;
  result: LabResult;
}) {
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [when, setWhen] = useState("");

  async function keep() {
    setBusy(true);
    try {
      await api.post("/gemini-lab/posts", {
        imageDataUrl: slide.imageDataUrl,
        format: option.design?.format,
        photoMode: option.design?.photoMode,
        templateId: option.design?.templateId,
        paletteTreatment: option.design?.paletteTreatment,
        typePairing: option.design?.typePairing,
        aspectRatio: result.aspectRatio,
        headline: option.angle,
        caption: option.caption,
        scheduledFor: when || undefined,
      });
      setKept(true);
      toast.success(when ? "Kept and planned." : "Kept in your library.");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          "Could not keep that post.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (kept) {
    return (
      <span className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] text-graphite-warm">
        <Check className="size-4 text-ink" />
        In your library
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={keep}
        disabled={busy}
        className="btn btn-primary text-[14px] tracking-[0.01em] rounded-[24px]"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Keep this post
      </button>
      <label className="inline-flex items-center gap-2 text-[14px] tracking-[0.01em] text-graphite-warm">
        for
        <input
          type="date"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="field tracking-[0.01em]"
        />
      </label>
    </span>
  );
}

/**
 * A plain-language account of what pressing Generate will do.
 *
 * The Studio asked for a series of decisions and then produced four images
 * with no statement of what was about to happen or what had happened. A
 * technician could not tell how many posts were coming, what kind they would
 * be, whether their photo was being composited or a page designed around it,
 * or whether their own templates were involved at all — which is why the
 * templates felt broken even on runs where they had worked.
 */
function RunPlan({
  optionCount,
  kindLabel,
  photoCount,
  slides,
  aspect,
  brandOn,
  brandName,
}: {
  optionCount: number;
  kindLabel: string;
  photoCount: number;
  slides: number;
  aspect: string;
  brandOn: boolean;
  brandName: string | null;
}) {
  // Which path the run will take is decided by the photos, exactly as the
  // server decides it — so this is a statement of fact, not a guess.
  const path =
    photoCount === 0
      ? { name: "Designed from your words", detail: "No photo, so each option is artwork generated around your copy." }
      : photoCount >= 2
        ? { name: "Your two photos, composited", detail: "Both photos are placed unchanged, side by side." }
        : {
            name: "A page designed around your photo",
            detail: "The layout is designed for this post, then your photo is placed into it unchanged.",
          };

  const rows: Array<{ label: string; value: string }> = [
    { label: "You get", value: `${optionCount} options to choose from` },
    { label: "Each one is", value: kindLabel || "a kind picked for you" },
    ...(slides > 1 ? [{ label: "Length", value: `${slides} slides each` }] : []),
    { label: "Shape", value: aspect },
    { label: "How it's made", value: path.name },
    {
      label: "Your brand",
      value: brandOn ? `${brandName || "Your"} colours, type and voice applied` : "Not applied — generic styling",
    },
  ];

  return (
    <div className="rounded-[8px] border border-pale-stone bg-soft-linen/60 p-4">
      <p className="text-[14px] tracking-[0.01em] text-ink mb-2.5">What happens when you press Generate</p>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 text-[14px] tracking-[0.01em]">
            <dt className="w-[104px] shrink-0 text-graphite-warm">{r.label}</dt>
            <dd className="text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-2.5">{path.detail}</p>
    </div>
  );
}

/** How an option was made, in the technician's terms rather than the code's. */
const PATH_LABEL: Record<string, string> = {
  ai_layout: "Layout designed for this post, your photo placed into it unchanged",
  composited: "Composed from a designed layout in your brand",
  poster: "Artwork generated from your words — no photo used",
};

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current) URL.revokeObjectURL(prev.current);
    if (!file) {
      prev.current = null;
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    prev.current = next;
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [file]);
  return url;
}

function FileDrop({
  label,
  hint,
  file,
  preview,
  onChange,
}: {
  label: string;
  hint?: string;
  file: File | null;
  preview: string | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="btn btn-ghost block cursor-pointer rounded-[8px] border-dashed border-pale-stone bg-warm-parchment p-5 hover:border-ink">
      <span className="text-[14px] tracking-[0.01em] text-graphite-warm">{label}</span>
      {hint && <p className="mt-1 text-[14px] tracking-[0.01em] text-graphite-warm">{hint}</p>}
      {preview ? (
        <img src={preview} alt="" className="mt-3 h-32 w-full object-cover rounded-[18px]" />
      ) : (
        <p className="mt-3 text-[14px] tracking-[0.01em] text-graphite-warm">Click to choose an image</p>
      )}
      {file && (
        <button
          type="button"
          className="mt-2 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(null);
          }}
        >
          Remove
        </button>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0] ?? null;
          // Shrunk here, once, so the preview, the edit call and the generate
          // call all carry the same manageable file.
          onChange(picked ? await downscaleImage(picked) : null);
        }}
      />
    </label>
  );
}

function KindChips({ value, onChange }: { value: PhotoKind; onChange: (kind: PhotoKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PHOTO_KINDS.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => onChange(k.id)}
          className={
            "text-[14px] tracking-[0.01em] px-3 py-1.5 rounded-full border transition-colors " +
            (value === k.id
              ? "bg-ink/[0.06] text-ink border-ink"
              : "bg-card text-graphite-warm border-pale-stone hover:border-ink hover:text-ink")
          }
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

function Thumb({ label, src }: { label: string; src: string | null }) {
  return (
    <div className="rounded-[8px] border border-border bg-card overflow-hidden">
      {src ? (
        <img src={src} alt={label} className="h-32 w-full object-cover" />
      ) : (
        <div className="h-32 flex items-center justify-center text-[14px] tracking-[0.01em] text-graphite-warm">
          No {label.toLowerCase()}
        </div>
      )}
      <p className="px-3 py-2 text-[14px] tracking-[0.01em] text-graphite-warm">{label}</p>
    </div>
  );
}
