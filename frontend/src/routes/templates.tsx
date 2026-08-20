import { createFileRoute, Link } from "@tanstack/react-router";
import { useTemplates, type Template } from "@/lib/providers/template-provider";
import { useState, useEffect, useRef } from "react";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { Layers, Play, Zap, Image, Music } from "lucide-react";
import { Pagination } from "@/components/Pagination";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Elle.Be.O Growth" },
      { name: "description", content: "Pre-built post templates for hair, colour, makeup, lash, brow, nails, injectables, skin and barbering." },
      { property: "og:title", content: "Templates — Elle.Be.O Growth" },
    ],
  }),
  component: TemplatesPage,
});

// Maps appointment category display names → template category strings (case-matched)
const APPT_TO_TEMPLATE_CATEGORY: Record<string, string> = {
  "Hairdresser":        "Hairdresser",
  "Colourist":          "Colourist",
  "Bridal makeup":      "Bridal Makeup",
  "Lash & brow":        "Lash & Brow",
  "Nail artist":        "Nail Artist",
  "Medical Aesthetics": "Injector",
  "Skin therapist":     "Skin Therapist",
  "Barber":             "Barber",
};

function derivePrimaryCategory(appointments: Array<{ category: string }>): string {
  const counts: Record<string, number> = {};
  for (const apt of appointments) {
    const mapped = APPT_TO_TEMPLATE_CATEGORY[apt.category];
    if (mapped) counts[mapped] = (counts[mapped] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? "All";
}

const PILLARS = ["All", "Transformations", "Education", "Behind the chair", "Client stories"];

const FORMAT_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  Carousel: { icon: Layers, label: "Carousel",  color: "text-taupe",       bg: "bg-nude/80",       border: "border-taupe/20" },
  Reel:     { icon: Play,   label: "Reel",       color: "text-offwhite",    bg: "bg-foreground/80", border: "border-white/10" },
  Story:    { icon: Zap,    label: "Story",      color: "text-sage",        bg: "bg-sage/20",       border: "border-sage/30"  },
  Caption:  { icon: Image,  label: "Caption",    color: "text-taupe",       bg: "bg-nude/80",       border: "border-taupe/20" },
  TikTok:   { icon: Music,  label: "TikTok",     color: "text-offwhite",    bg: "bg-foreground/80", border: "border-white/10" },
};

const FORMAT_FILTERS = ["All", "Carousel", "Reel", "Story", "Caption", "TikTok"];

/** Formats the Gemini Lab studio composes end to end. */
const STUDIO_FORMATS = new Set(["Carousel", "Caption", "Story"]);

const PAGE_SIZE = 12;

function TemplatesPage() {
  const { templates, categories, loading, error } = useTemplates();
  const { data: appointments, loading: apptLoading } = useAppointments();
  const [pillar,   setPillar]   = useState("All");
  const [category, setCategory] = useState("All");
  const [format,   setFormat]   = useState("All");
  const [page,     setPage]     = useState(1);

  // Auto-select the tenant's primary service category on first load
  const initialized = useRef(false);
  useEffect(() => {
    if (apptLoading || appointments.length === 0 || initialized.current) return;
    initialized.current = true;
    const primary = derivePrimaryCategory(appointments);
    if (primary !== "All") setCategory(primary);
  }, [appointments, apptLoading]);

  const filtered = templates.filter((t) => {
    if (pillar   !== "All" && t.pillar.toLowerCase() !== pillar.toLowerCase()) return false;
    if (category !== "All" && !t.categories.includes(category))                return false;
    if (format   !== "All" && t.type !== format)                               return false;
    return true;
  });

  // Reset to page 1 whenever the result set changes shape
  useEffect(() => { setPage(1); }, [pillar, category, format]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Templates</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage" />
            {templates.length} ready
          </span>
        </div>
        <h1 className="page-title max-w-[22ch]">
          Start from a <span className="italic text-brass-ink">template</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Each template auto-fills with your Brand DNA. Pick a format, choose a goal, edit and approve.
        </p>
      </header>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <section className="bg-card rounded-2xl shadow-elevated p-6 mb-6 space-y-5">
        {/* Format filter — most prominent */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-3">Format</p>
          <div className="flex flex-wrap gap-2">
            {FORMAT_FILTERS.map((f) => {
              const meta = FORMAT_META[f];
              const Icon = meta?.icon;
              const active = format === f;
              return (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={
                    "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
                    (active
                      ? "bg-brass text-white border-brass"
                      : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
                  }
                >
                  {Icon && <Icon className="size-3" />}
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category filter */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-3">Category</p>
          <div className="flex flex-wrap gap-2">
            {["All", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  "text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full border transition-all " +
                  (category === c
                    ? "bg-brass text-white border-brass"
                    : "bg-muted text-taupe border-transparent hover:border-brass/40 hover:text-foreground")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Pillar filter */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-3">Pillar</p>
          <div className="flex items-center gap-1 bg-muted rounded-full p-1 flex-wrap w-fit">
            {PILLARS.map((p) => (
              <button
                key={p}
                onClick={() => setPillar(p)}
                className={
                  "px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full transition-colors whitespace-nowrap " +
                  (pillar === p
                    ? "bg-card text-foreground shadow-elevated"
                    : "text-taupe hover:text-foreground")
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {/* Loading and failure are distinct from "your filter matched nothing".
          All three used to render the same "No templates match this filter
          combination", so a slow request looked like an empty library and a
          failed one looked like the technician's own filter was at fault. */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-2xl bg-card shadow-elevated overflow-hidden">
              <div className="aspect-[4/5] bg-muted/40 animate-pulse" />
              <div className="p-5 flex flex-col gap-2">
                <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
                <div className="h-3 w-full rounded bg-muted/30 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-muted/30 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl bg-muted/20 py-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-taupe mb-2">Could not load</p>
          <p className="text-sm text-taupe mb-4">The template library did not load. This is usually a connection problem.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl bg-muted/20 py-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-taupe mb-2">No results</p>
          <p className="text-sm text-taupe mb-4">No templates match this filter combination.</p>
          <button
            type="button"
            onClick={() => { setPillar("All"); setCategory("All"); setFormat("All"); }}
            className="text-sm underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pageItems.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
          {filtered.length > PAGE_SIZE && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

function TemplateCard({ template: t }: { template: Template }) {
  const meta = FORMAT_META[t.type] ?? FORMAT_META["Caption"];
  const Icon = meta.icon;
  const structureLabel = t.zones.length > 0
    ? `${t.slideCount ?? t.zones.length} ${t.slideCount === 1 ? "slide" : "slides"} · ${t.zones.map((z) => z.label).join(" → ")}`
    : null;

  return (
    <article className="group flex flex-col rounded-2xl bg-card shadow-elevated hover:shadow-elevated-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden">

      {/* Preview — the tenant's own moodboard photo + brand palette, never a
          generic stock image.

          The photo well is only reserved when there IS a photo. It is filled
          from the Brand DNA moodboard, which most tenants have not uploaded
          yet, and the empty state used to hold a 4:5 well — over 500px of
          nothing carrying a copy of the template name that the card body
          already prints two lines below. Without an image the card collapses
          to a compact band that keeps the badges and drops the void. */}
      <div
        className={`relative overflow-hidden bg-nude/30 ${t.preview ? "aspect-[4/5]" : "h-12"}`}
        style={t.preview ? undefined : { backgroundColor: t.backgroundColor || undefined }}
      >
        {t.preview && (
          <img
            src={t.preview}
            alt={t.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        )}
        {/* Format badge — top left */}
        <div className={`absolute ${t.preview ? "top-3" : "top-1/2 -translate-y-1/2"} left-3 inline-flex items-center gap-1.5 backdrop-blur-sm border px-2.5 py-1.5 rounded-full ${meta.bg} ${meta.border}`}>
          <Icon className={`size-3 ${meta.color}`} />
          <span className={`text-[9px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        {/* Pillar badge — top right */}
        {t.pillar && (
          <div className={`absolute ${t.preview ? "top-3" : "top-1/2 -translate-y-1/2"} right-3 bg-foreground/70 backdrop-blur-sm px-2 py-1 rounded-full`}>
            <span className="text-[8px] uppercase tracking-widest text-offwhite">{t.pillar}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5">
        {/* Title — rendered in the tenant's own heading font */}
        <h3 className="font-serif text-lg leading-snug mb-1.5" style={{ fontFamily: t.headingFont || undefined }}>
          {t.name}
        </h3>

        {/* Description — rendered in the tenant's own body font */}
        <p className="text-xs text-taupe leading-relaxed mb-2 flex-1" style={{ fontFamily: t.bodyFont || undefined }}>
          {t.description}
        </p>

        {/* Structure pulled from the template's zone data */}
        {structureLabel && (
          <p className="text-[10px] text-taupe/70 leading-snug mb-3">{structureLabel}</p>
        )}

        {/* Brand palette swatches */}
        {t.paletteHexes.length > 0 && (
          <div className="flex items-center gap-1 mb-3">
            {t.paletteHexes.map((hex, i) => (
              <span
                key={`${hex}-${i}`}
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        )}

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {t.categories.slice(0, 3).map((c) => (
            <span key={c} className="text-[9px] font-semibold uppercase tracking-widest bg-muted px-2.5 py-1 rounded-full text-taupe">
              {c}
            </span>
          ))}
          {t.categories.length > 3 && (
            <span className="text-[9px] uppercase tracking-widest text-taupe/50 py-0.5">
              +{t.categories.length - 3}
            </span>
          )}
        </div>

        {/* CTA */}
        {/* Carousel, Caption and Story are what the studio composes today.
            Reel and TikTok are still scripted in the older flow, so those keep
            going there rather than opening a picker that cannot list them. */}
        {STUDIO_FORMATS.has(t.type) ? (
          <Link
            to="/gemini-lab"
            search={{ templateSlug: t.slug }}
            className="bg-foreground text-offwhite px-5 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Icon className="size-3" />
            Use {meta.label} template
          </Link>
        ) : (
        <Link
          to="/generate"
          search={{ templateGoal: t.goal, templateFormat: t.type, templateCategories: t.categories.join(','), templateSlug: t.slug }}
          className="inline-flex items-center justify-center gap-2 bg-brass text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all"
        >
          <Icon className="size-3" />
          Script {meta.label}
        </Link>
        )}
      </div>
    </article>
  );
}
