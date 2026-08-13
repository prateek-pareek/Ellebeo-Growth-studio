import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, ImagePlus, Loader2, Download, Sparkles, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { useTemplates } from "@/lib/providers/template-provider";
import { useAppointments } from "@/lib/providers/appointments-provider";

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
  component: GeminiLabPage,
});

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

type LabOption = {
  id: string;
  source: "gemini" | "chatgpt";
  label: string;
  angle: string;
  caption: PostCaption;
  slides: LabSlide[];
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
  const [photo2Kind, setPhoto2Kind] = useState<PhotoKind>("look");
  const [overlayText, setOverlayText] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16" | "16:9">("4:5");
  const [freeSlideCount, setFreeSlideCount] = useState<1 | 3>(1);
  const [applyBrandDna, setApplyBrandDna] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeOption, setActiveOption] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);

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
  const expectedSlides = selectedTemplate?.type === "Carousel"
    ? Math.max(1, selectedTemplate.slideCount || 3)
    : selectedTemplate?.type === "Story"
      ? Math.max(1, selectedTemplate.slideCount || 1)
      : freeSlideCount;

  async function handleGenerate() {
    if (applyBrandDna && brandEmpty) {
      toast.error("Set up Brand DNA, or turn Use Brand DNA off.");
      return;
    }
    if (!photo1 && !photo2 && !appointmentId) {
      toast.error("Add at least one photo — finished look, behind the scenes, detail, or before/after.");
      return;
    }

    const form = new FormData();
    if (templateSlug) form.append("templateSlug", templateSlug);
    if (appointmentId) form.append("appointmentId", appointmentId);
    if (overlayText.trim()) form.append("overlayText", overlayText.trim());
    if (extraNotes.trim()) form.append("extraNotes", extraNotes.trim());
    form.append("aspectRatio", aspectRatio);
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
        timeout: 240_000,
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
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Experiment</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-brass bg-brass/10 border border-brass/25 px-2.5 py-1 rounded-full">
            <FlaskConical className="size-3" />
            Gemini Lab
          </span>
        </div>
        <h1 className="page-title max-w-[24ch]">
          Try a <span className="italic text-brass-ink">simple Gemini</span> pipeline.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[58ch]">
          Original photos are never sent to an image model. Gemini and ChatGPT each write two post options — on-image copy plus the Instagram caption. We composite your shots unchanged. Template is optional. Brand name, logo and palette come from your existing Brand DNA.
        </p>
      </header>

      {brandEmpty && !brandLoading && applyBrandDna && (
        <div className="bg-card rounded-2xl shadow-elevated p-6 mb-6">
          <p className="text-sm text-taupe">
            Brand DNA is on for this run but not set up.{" "}
            <Link to="/brand/onboarding" className="text-foreground underline underline-offset-4">
              Set it up
            </Link>{" "}
            or turn Use Brand DNA off below.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <section className="space-y-6">
          <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">1 · Brand DNA</p>
              <span className="text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2 py-0.5 rounded-full">
                Optional
              </span>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyBrandDna}
                onChange={(e) => setApplyBrandDna(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium">Use Brand DNA</span>
                <span className="block text-xs text-taupe mt-0.5">
                  {applyBrandDna
                    ? "Logo, palette and name are locked on every slide."
                    : "Bypassed — generic cream chrome, no logo stamp, no brand-locked copy."}
                </span>
              </span>
            </label>
            {brandLoading ? (
              <p className="text-sm text-taupe italic">Loading Brand DNA…</p>
            ) : brandDna ? (
              <div className={applyBrandDna ? "" : "opacity-40 pointer-events-none"}>
                <p className="font-serif text-2xl">{brandDna.category || brandDna.archetype}</p>
                {brandDna.oneLiner && <p className="text-sm text-taupe">{brandDna.oneLiner}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {brandDna.paletteLabeled.map((c) => (
                    <span key={c.role} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-taupe">
                      <span className="size-3.5 rounded-full border border-border" style={{ background: c.hex }} />
                      {c.role}
                    </span>
                  ))}
                </div>
                {brandDna.logoUrl && (
                  <div className="flex items-center gap-3 pt-2">
                    <img src={brandDna.logoUrl} alt="Brand logo" className="h-8 w-auto object-contain" />
                    <p className="text-xs text-taupe">
                      {applyBrandDna ? "Stamped identically on every slide." : "Will not be stamped this run."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-taupe">
                No Brand DNA yet.{" "}
                <Link to="/brand/onboarding" className="text-foreground underline underline-offset-4">
                  Set it up
                </Link>{" "}
                or generate without it.
              </p>
            )}
          </div>

          <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">2 · Template</p>
              <span className="text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2 py-0.5 rounded-full">
                Optional
              </span>
            </div>
            <p className="text-xs text-taupe">Skip this if you just want Gemini to design from the photos (and Brand DNA, if it is on).</p>
            <select
              value={templateSlug}
              onChange={(e) => setTemplateSlug(e.target.value)}
              disabled={templatesLoading}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="">No template</option>
              {galleryTemplates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name} · {t.type}
                  {t.type === "Carousel" ? ` · ${t.slideCount || 3} slides` : ""}
                </option>
              ))}
            </select>
            {selectedTemplate?.type === "Carousel" && (
              <p className="text-xs text-taupe">
                {expectedSlides} slides will be generated from this carousel template
                {selectedTemplate.zones?.length
                  ? `: ${selectedTemplate.zones.map((z) => z.label).join(" → ")}`
                  : "."}
              </p>
            )}
            {!selectedTemplate && (
              <div className="flex flex-wrap gap-2">
                {([1, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFreeSlideCount(n)}
                    className={
                      "text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
                      (freeSlideCount === n
                        ? "bg-brass text-white border-brass"
                        : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
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
          </div>

          <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">3 · Photos</p>
            <p className="text-xs text-taupe">
              At least one shot. Tag what it is — before/after is only if you want that pair.
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
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm"
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
                <FileDrop label="Photo 1" file={photo1} preview={photo1Preview} onChange={setPhoto1} />
                <KindChips value={photo1Kind} onChange={setPhoto1Kind} />
              </div>
              <div className="space-y-2">
                <FileDrop label="Photo 2 (optional)" file={photo2} preview={photo2Preview} onChange={setPhoto2} />
                <KindChips value={photo2Kind} onChange={setPhoto2Kind} />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-elevated p-6 space-y-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">4 · Copy & format</p>
            <textarea
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="Optional overlay text, e.g. Lived-in blonde · Sydney"
              rows={2}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm resize-y"
            />
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Optional extra direction for Gemini"
              rows={2}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm resize-y"
            />
            <div className="flex flex-wrap gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspectRatio(a.id)}
                  className={
                    "text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
                    (aspectRatio === a.id
                      ? "bg-brass text-white border-brass"
                      : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || (applyBrandDna && brandEmpty)}
              className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] bg-foreground text-background px-5 py-3 rounded-full hover:bg-taupe transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy
                ? "Writing options…"
                : expectedSlides > 1
                  ? `Generate ${expectedSlides}-slide options`
                  : "Generate options"}
            </button>
          </div>
        </section>

        <section className="bg-card rounded-2xl shadow-elevated p-6 min-h-[28rem]">
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-4">Post options</p>
          {busy && (
            <div className="flex flex-col items-center justify-center py-24 text-taupe">
              <Loader2 className="size-8 animate-spin mb-4" />
              <p className="text-sm text-center max-w-[36ch]">
                Asking Gemini and ChatGPT for distinct post angles, then compositing your original photos.
              </p>
            </div>
          )}
          {!busy && !result && (
            <div className="flex flex-col items-center justify-center py-24 text-taupe">
              <ImagePlus className="size-8 mb-4 opacity-50" />
              <p className="text-sm text-center max-w-[36ch]">
                The generated reference will appear here. Compare it to your template and photos to see if this path is worth using.
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
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onActiveOption(i)}
              className={
                "text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
                (i === activeOption
                  ? "bg-brass text-white border-brass"
                  : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
              }
            >
              {opt.label}
              {opt.angle ? ` · ${opt.angle}` : ""}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <img
          src={current.imageDataUrl}
          alt={current.label}
          className="w-full rounded-xl border border-border bg-muted object-contain max-h-[70vh]"
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
                "shrink-0 w-16 rounded-lg overflow-hidden border transition-all " +
                (i === activeSlide ? "border-brass ring-1 ring-brass" : "border-border opacity-70 hover:opacity-100")
              }
            >
              <img src={slide.imageDataUrl} alt={slide.label} className="h-20 w-16 object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="text-sm font-medium">{current.label}</p>
      {captionText && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe">Caption</p>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
              onClick={async () => {
                await navigator.clipboard.writeText(captionText);
                toast.success("Caption copied.");
              }}
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{captionText}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-taupe">
        <span className="border border-border px-2.5 py-1 rounded-full">{option.source === "chatgpt" ? "ChatGPT" : "Gemini"}</span>
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
      <p className="text-[10px] uppercase tracking-widest text-taupe">
        Refs: {result.used.references.join(" · ") || "none"}
      </p>
      {(current.notes || result.notes) && (
        <p className="text-sm text-taupe leading-relaxed whitespace-pre-wrap">{current.notes || result.notes}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <a
          href={current.imageDataUrl}
          download={`gemini-lab-${activeSlide + 1}.png`}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] border-b border-foreground pb-1"
        >
          <Download className="size-3.5" />
          Download this slide
        </a>
        {result.prompt && (
          <button
            type="button"
            onClick={onTogglePrompt}
            className="text-[11px] uppercase tracking-[0.22em] text-taupe hover:text-foreground"
          >
            {showPrompt ? "Hide prompt" : "Show prompt sent"}
          </button>
        )}
      </div>
      {showPrompt && result.prompt && (
        <pre className="text-[11px] leading-relaxed text-taupe bg-muted rounded-xl p-4 overflow-auto max-h-80 whitespace-pre-wrap">
          {result.prompt}
        </pre>
      )}
    </div>
  );
}

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
    <label className="block cursor-pointer rounded-xl border border-dashed border-border bg-muted/60 p-3 hover:border-brass/40 transition-colors">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-taupe">{label}</span>
      {hint && <p className="mt-1 text-xs text-taupe/80">{hint}</p>}
      {preview ? (
        <img src={preview} alt="" className="mt-3 h-28 w-full object-cover rounded-lg" />
      ) : (
        <p className="mt-3 text-xs text-taupe">Click to choose an image</p>
      )}
      {file && (
        <button
          type="button"
          className="mt-2 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
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
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
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
            "text-[9px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all " +
            (value === k.id
              ? "bg-brass text-white border-brass"
              : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
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
    <div className="rounded-xl border border-border bg-muted overflow-hidden">
      {src ? (
        <img src={src} alt={label} className="h-28 w-full object-cover" />
      ) : (
        <div className="h-28 flex items-center justify-center text-[10px] uppercase tracking-widest text-taupe">
          No {label.toLowerCase()}
        </div>
      )}
      <p className="px-2 py-1.5 text-[9px] uppercase tracking-widest text-taupe">{label}</p>
    </div>
  );
}
