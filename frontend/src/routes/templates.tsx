import { createFileRoute, Link } from "@tanstack/react-router";
import { useTemplates, type Template } from "@/lib/providers/template-provider";
import { useState, useEffect, useRef } from "react";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { Layers, Play, Zap, Image, Music } from "lucide-react";

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

function TemplatesPage() {
  const { templates, categories } = useTemplates();
  const { data: appointments, loading: apptLoading } = useAppointments();
  const [pillar,   setPillar]   = useState("All");
  const [category, setCategory] = useState("All");
  const [format,   setFormat]   = useState("All");

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

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Templates</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage" />
            {templates.length} ready
          </span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-[22ch]">
          Start from a <span className="italic text-taupe">template</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Each template auto-fills with your Brand DNA. Pick a format, choose a goal, edit and approve.
        </p>
      </header>

      {/* ── Format filter — most prominent ──────────────────────────────── */}
      <div className="mb-6">
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
                  "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full border-2 transition-all " +
                  (active
                    ? "bg-foreground text-offwhite border-foreground"
                    : "bg-card text-taupe border-border hover:border-foreground/30 hover:bg-nude/20")
                }
              >
                {Icon && <Icon className="size-3" />}
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Category filter ──────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-3">Category</p>
        <div className="flex flex-wrap gap-2">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                "text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors " +
                (category === c
                  ? "bg-foreground text-offwhite border-foreground"
                  : "border-border text-taupe hover:text-foreground hover:border-foreground/30")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pillar filter ────────────────────────────────────────────────── */}
      <div className="mb-10 border-b border-border pb-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-taupe mb-3">Pillar</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {PILLARS.map((p) => (
            <button
              key={p}
              onClick={() => setPillar(p)}
              className={
                "text-[11px] uppercase tracking-[0.2em] pb-2 -mb-px transition-colors " +
                (pillar === p
                  ? "text-foreground border-b border-foreground"
                  : "text-taupe hover:text-foreground")
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">No results</p>
          <p className="text-sm text-taupe">No templates match this filter combination.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t }: { template: Template }) {
  const meta = FORMAT_META[t.type] ?? FORMAT_META["Caption"];
  const Icon = meta.icon;

  return (
    <article className="group flex flex-col rounded-2xl border-2 border-border bg-card overflow-hidden hover:border-foreground/25 hover:shadow-md transition-all duration-200">

      {/* Image with format badge overlay */}
      <div className="relative aspect-[4/5] overflow-hidden bg-nude/30">
        <img
          src={t.preview}
          alt={t.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
        {/* Format badge — top left */}
        <div className={`absolute top-3 left-3 inline-flex items-center gap-1.5 backdrop-blur-sm border px-2.5 py-1.5 rounded-full ${meta.bg} ${meta.border}`}>
          <Icon className={`size-3 ${meta.color}`} />
          <span className={`text-[9px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        {/* Pillar badge — top right */}
        <div className="absolute top-3 right-3 bg-foreground/70 backdrop-blur-sm px-2 py-1 rounded-full">
          <span className="text-[8px] uppercase tracking-widest text-offwhite">{t.pillar}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {/* Title */}
        <h3 className="font-serif text-lg leading-snug mb-1.5">{t.name}</h3>

        {/* Description */}
        <p className="text-xs text-taupe leading-relaxed mb-3 flex-1">{t.description}</p>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {t.categories.slice(0, 3).map((c) => (
            <span key={c} className="text-[9px] uppercase tracking-widest border border-border bg-muted px-2 py-0.5 rounded-full text-taupe">
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
        <Link
          to="/generate"
          search={{ templateGoal: t.goal, templateFormat: t.type, templateCategories: t.categories.join(',') }}
          className="inline-flex items-center justify-center gap-2 bg-foreground text-offwhite text-[10px] font-semibold uppercase tracking-widest px-4 py-2.5 rounded-xl hover:bg-taupe active:scale-[0.97] transition-all"
        >
          <Icon className="size-3" />
          Use {meta.label} template
        </Link>
      </div>
    </article>
  );
}
