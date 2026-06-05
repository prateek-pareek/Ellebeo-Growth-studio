import { createFileRoute, Link } from "@tanstack/react-router";
import { useTemplates, type Template } from "@/lib/providers/template-provider";
import { useState } from "react";

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

const PILLARS = ["All", "Transformations", "Education", "Behind the chair", "Client stories"];

function TemplatesPage() {
  const { templates, categories } = useTemplates();
  const [pillar, setPillar] = useState("All");
  const [category, setCategory] = useState("All");

  const filtered = templates.filter((t) => {
    if (pillar !== "All" && t.pillar.toLowerCase() !== pillar.toLowerCase()) return false;
    if (category !== "All" && !t.categories.includes(category)) return false;
    return true;
  });

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">Templates</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Start from a <span className="italic">template</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Each template auto-fills with your Brand DNA, an appointment, or a service.{" "}
          Edit before approving.
        </p>
      </header>

      {/* Category filter */}
      <div className="mb-5">
        <p className="eyebrow mb-3">Category</p>
        <div className="flex flex-wrap gap-2">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                "text-[11px] uppercase tracking-[0.18em] px-3 py-1.5 border hairline transition-colors " +
                (category === c
                  ? "bg-foreground text-offwhite border-foreground"
                  : "text-taupe hover:text-foreground hover:border-foreground")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Pillar filter */}
      <div className="mb-10 border-b hairline pb-1">
        <p className="eyebrow mb-3">Pillar</p>
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

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-taupe py-12 italic">No templates match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t }: { template: Template }) {
  return (
    <article className="group flex flex-col">
      {/* Image */}
      <div className="aspect-[4/5] overflow-hidden bg-nude/30 mb-4">
        <img
          src={t.preview}
          alt={t.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        />
      </div>

      {/* Type · Pillar */}
      <p className="eyebrow mb-2">{t.type} · {t.pillar}</p>

      {/* Title */}
      <h3 className="font-serif text-xl leading-snug mb-2">{t.name}</h3>

      {/* Description */}
      <p className="text-sm text-taupe leading-relaxed mb-3">{t.description}</p>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {t.categories.slice(0, 3).map((c) => (
          <span
            key={c}
            className="text-[9px] uppercase tracking-widest border hairline px-2 py-0.5 text-taupe"
          >
            {c}
          </span>
        ))}
        {t.categories.length > 3 && (
          <span className="text-[9px] uppercase tracking-widest text-taupe py-0.5">
            +{t.categories.length - 3} more
          </span>
        )}
      </div>

      {/* CTA */}
      <Link
        to="/generate"
        search={{ templateGoal: t.goal, templateFormat: t.type }}
        className="mt-auto text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 self-start hover:text-taupe hover:border-taupe transition-colors"
      >
        Use this template →
      </Link>
    </article>
  );
}
