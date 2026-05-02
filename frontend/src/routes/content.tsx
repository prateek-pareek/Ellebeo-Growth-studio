import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  templates,
  type Appointment,
  type ContentItem,
  type ContentState,
  type ContentGoal,
} from "@/lib/sample-data";
import { useContentItems } from "@/lib/providers/content-provider";
import { useAppointments } from "@/lib/providers/appointments-provider";

export const Route = createFileRoute("/content")({
  head: () => ({
    meta: [
      { title: "Content library — Elle.Be.O Growth" },
      {
        name: "description",
        content:
          "Your generated content library. Filter drafts, scheduled posts, posted work and consent-blocked drafts in one place.",
      },
      { property: "og:title", content: "Content library — Elle.Be.O Growth" },
    ],
  }),
  component: ContentPage,
});

// ---- filter taxonomy ----

type StateFilter = "all" | ContentState;

const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "posted", label: "Posted" },
  { id: "blocked", label: "Blocked" },
];

const FORMAT_FILTERS: Array<ContentItem["type"]> = ["Carousel", "Reel", "Story", "Caption", "TikTok"];

const GOAL_FILTERS: Array<{ id: ContentGoal; label: string }> = [
  { id: "showcase", label: "Showcase" },
  { id: "educate", label: "Educate" },
  { id: "convert", label: "Convert" },
  { id: "availability", label: "Availability" },
  { id: "trust", label: "Trust" },
];

// Local prototype-only overlay applied on top of provider items.
// Never persisted, never sent to the database.
type LocalOverride = Partial<Pick<ContentItem, "caption" | "cta" | "hashtags" | "status" | "state">>;

function ContentPage() {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [formatFilter, setFormatFilter] = useState<ContentItem["type"] | null>(null);
  const [goalFilter, setGoalFilter] = useState<ContentGoal | null>(null);
  const [query, setQuery] = useState("");

  const content = useContentItems();
  const appts = useAppointments();
  const appointmentsById = content.appointmentsById;

  // Local UI-only overrides for prototype interactions (Edit / Approve).
  const [overrides, setOverrides] = useState<Record<string, LocalOverride>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = useMemo(() => {
    if (Object.keys(overrides).length === 0) return content.items;
    return content.items.map((it) => {
      const o = overrides[it.id];
      return o ? { ...it, ...o } : it;
    });
  }, [content.items, overrides]);

  const counts = useMemo(() => {
    const c: Record<StateFilter, number> = { all: items.length, draft: 0, scheduled: 0, posted: 0, blocked: 0 };
    for (const item of items) c[item.state] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (stateFilter !== "all" && c.state !== stateFilter) return false;
      if (formatFilter && c.type !== formatFilter) return false;
      if (goalFilter && c.goal !== goalFilter) return false;
      if (q) {
        const hay = `${c.title} ${c.caption} ${c.pillar} ${c.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, stateFilter, formatFilter, goalFilter, query]);

  const readyAppointments = appts.data.filter(
    (a) => a.consent === "granted" && a.hasBefore && a.hasAfter
  );

  const clearFilters = () => {
    setStateFilter("all");
    setFormatFilter(null);
    setGoalFilter(null);
    setQuery("");
  };

  const hasActiveFilters =
    stateFilter !== "all" || formatFilter !== null || goalFilter !== null || query.trim() !== "";

  const sourceLabel = content.source === "cloud" ? "Live" : "Sample data";
  const sourceCls =
    content.source === "cloud"
      ? "border-sage text-sage"
      : "border-taupe text-taupe";

  const handleApprove = (id: string) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], state: "scheduled", status: "Approved" },
    }));
  };

  const handleEditOpen = (id: string) => setEditingId(id);
  const handleEditClose = () => setEditingId(null);

  const handleEditSave = (id: string, patch: { caption: string; cta: string; hashtags: string[] }) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    setEditingId(null);
  };

  const editingItem = editingId ? items.find((it) => it.id === editingId) ?? null : null;

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5">
          <p className="eyebrow">Content library</p>
          <span className={`text-[9px] uppercase tracking-widest border hairline px-2 py-1 ${sourceCls}`}>
            {sourceLabel}
          </span>
          {content.loading && (
            <span className="text-[9px] uppercase tracking-widest text-taupe">Loading…</span>
          )}
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Every draft, scheduled post and <span className="italic">published</span> piece, in one place.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Generated from real appointments and shaped by your Brand DNA. Filter by state, format or goal — and see exactly which posts are blocked because the client hasn't consented.
        </p>
        {content.error && (
          <p className="mt-4 text-[11px] uppercase tracking-widest border-l-2 border-destructive pl-3 text-destructive">
            Couldn't load from cloud — showing sample data.
          </p>
        )}
      </header>

      {/* Generate hand-off */}
      <section className="mb-12">
        <div className="artifact p-6 lg:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow mb-2">Generate new content</p>
            <p className="font-serif text-2xl mb-2">Turn an appointment into 3 ready-to-review posts</p>
            <p className="text-sm text-taupe leading-relaxed max-w-[60ch]">
              Pick an appointment with consent and visuals on file. Your Brand DNA shapes every variant.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {readyAppointments.slice(0, 3).map((a) => (
                <Link
                  key={a.id}
                  to="/generate"
                  search={{ appointment: a.id }}
                  className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5 hover:bg-card"
                >
                  {a.clientName.split(" ")[0]} · {a.category}
                </Link>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5 flex lg:justify-end">
            <Link
              to="/generate"
              className="inline-block bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            >
              Open generator →
            </Link>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="mb-8 space-y-5">
        {/* State segments */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b hairline">
          {STATE_FILTERS.map((f) => {
            const active = stateFilter === f.id;
            const n = counts[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setStateFilter(f.id)}
                className={
                  "text-[11px] uppercase tracking-[0.2em] px-3 pb-2 -mb-px transition-colors flex items-center gap-2 " +
                  (active
                    ? "text-foreground border-b border-foreground"
                    : "text-taupe hover:text-foreground")
                }
              >
                <span>{f.label}</span>
                <span className="tabular-nums text-[10px] text-taupe">{n}</span>
              </button>
            );
          })}
        </div>

        {/* Format + goal + search */}
        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          <ChipGroup label="Format">
            {FORMAT_FILTERS.map((f) => (
              <FilterChip
                key={f}
                active={formatFilter === f}
                onClick={() => setFormatFilter(formatFilter === f ? null : f)}
              >
                {f}
              </FilterChip>
            ))}
          </ChipGroup>
          <ChipGroup label="Goal">
            {GOAL_FILTERS.map((g) => (
              <FilterChip
                key={g.id}
                active={goalFilter === g.id}
                onClick={() => setGoalFilter(goalFilter === g.id ? null : g.id)}
              >
                {g.label}
              </FilterChip>
            ))}
          </ChipGroup>
          <div className="ml-auto flex items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search captions, clients…"
              className="text-[12px] bg-transparent border-b hairline focus:border-foreground outline-none px-1 py-1 w-48 placeholder:text-taupe"
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mb-16">
        {filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} hasFilters={hasActiveFilters} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c) => (
              <ContentCard
                key={c.id}
                item={c}
                appointment={c.sourceAppointmentId ? appointmentsById.get(c.sourceAppointmentId) : undefined}
                onApprove={() => handleApprove(c.id)}
                onEdit={() => handleEditOpen(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick templates */}
      <section>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="eyebrow">Quick start from a template</h2>
          <Link to="/templates" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            All templates →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.slice(0, 4).map((t) => (
            <Link to="/templates" key={t.id} className="group">
              <div className="aspect-[4/5] overflow-hidden bg-nude/30 mb-3 ring-1 ring-border">
                <img src={t.preview} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <p className="eyebrow mb-1">{t.type} · {t.pillar}</p>
              <p className="font-serif text-base leading-tight">{t.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {editingItem && (
        <EditDrawer item={editingItem} onCancel={handleEditClose} onSave={handleEditSave} />
      )}
    </div>
  );
}

// ---- card ----

function ContentCard({
  item,
  appointment,
  onApprove,
  onEdit,
}: {
  item: ContentItem;
  appointment?: Appointment;
  onApprove: () => void;
  onEdit: () => void;
}) {
  const blocked = item.state === "blocked";
  return (
    <article className="group flex flex-col">
      <div className="aspect-[4/5] overflow-hidden bg-nude/30 mb-4 ring-1 ring-border relative">
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          className={
            "w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02] " +
            (blocked ? "opacity-40 grayscale" : "")
          }
        />
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          <StatePill state={item.state} />
        </div>
        {item.qualityScore !== undefined && !blocked && (
          <div className="absolute top-3 right-3 bg-offwhite/90 backdrop-blur px-2 py-1 text-[9px] uppercase tracking-widest tabular-nums">
            Q {item.qualityScore}
          </div>
        )}
        {blocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-foreground/90 text-offwhite px-3 py-2 text-[10px] uppercase tracking-widest backdrop-blur">
              Locked · consent declined
            </div>
          </div>
        )}
      </div>

      <p className="eyebrow mb-2">{item.type} · {item.pillar}</p>
      <h3 className="font-serif text-xl mb-2 leading-snug">{item.title}</h3>
      {!blocked ? (
        <p className="text-sm text-taupe leading-relaxed line-clamp-3 mb-4">{item.caption}</p>
      ) : (
        <p className="text-sm text-taupe leading-relaxed mb-4">
          The client declined consent. We won't preview, schedule or publish this draft.
        </p>
      )}

      {/* Meta strip */}
      <div className="mt-auto pt-4 border-t hairline space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] uppercase tracking-widest text-taupe">
          {appointment && (
            <span>{appointment.clientName.split(" ")[0]} · {appointment.category}</span>
          )}
          {item.channel && <span>· {item.channel}</span>}
          {item.scheduledFor && <span>· {item.scheduledFor}</span>}
          {item.postedAt && <span>· Posted {item.postedAt}</span>}
          <span className="ml-auto">· Updated {item.updatedAt}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {appointment ? (
            <ConsentChip status={appointment.consent} />
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-taupe">Evergreen · no appointment</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {blocked ? (
            <>
              {item.consentRequestId ? (
                <span className="text-[10px] uppercase tracking-widest text-taupe">
                  Consent record on file
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-taupe">
                  No consent record
                </span>
              )}
              <button
                disabled
                className="text-[10px] uppercase tracking-widest text-taupe/60 cursor-not-allowed"
                title="Locked while consent is declined"
              >
                Open consent record
              </button>
            </>
          ) : item.state === "draft" ? (
            <>
              <span className="text-[10px] uppercase tracking-widest text-taupe">{item.status}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onApprove}
                  className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-1.5 hover:bg-foreground/90"
                  title="Prototype action — not saved yet"
                >
                  Approve
                </button>
                <button
                  onClick={onEdit}
                  className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
                  title="Prototype action — not saved yet"
                >
                  Edit
                </button>
              </div>
            </>
          ) : item.state === "scheduled" ? (
            <>
              <span className="text-[10px] uppercase tracking-widest text-sage">Approved</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onEdit}
                  className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe"
                  title="Prototype action — not saved yet"
                >
                  Review
                </button>
                {!item.scheduledFor && (
                  <button
                    className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
                    title="Prototype action — not saved yet"
                  >
                    Schedule
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-widest text-taupe">Live</span>
              <button
                onClick={onEdit}
                className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe"
                title="Prototype action — not saved yet"
              >
                Review
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- edit drawer ----

function EditDrawer({
  item,
  onCancel,
  onSave,
}: {
  item: ContentItem;
  onCancel: () => void;
  onSave: (id: string, patch: { caption: string; cta: string; hashtags: string[] }) => void;
}) {
  const [caption, setCaption] = useState(item.caption);
  const [cta, setCta] = useState(item.cta);
  const [hashtags, setHashtags] = useState(item.hashtags.join(" "));

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = hashtags
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    onSave(item.id, { caption: caption.trim(), cta: cta.trim(), hashtags: tags });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${item.title}`}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close edit drawer"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-xl bg-background border-l hairline shadow-2xl flex flex-col h-full overflow-hidden"
      >
        <header className="px-6 py-5 border-b hairline">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="eyebrow">Edit draft</p>
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">
              Prototype
            </span>
          </div>
          <h2 className="font-serif text-2xl leading-snug">{item.title}</h2>
          <p className="text-[11px] text-taupe mt-2">
            Prototype only — changes are not saved to the database yet.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <Field label="Status">
            <div className="text-sm">{item.status}</div>
          </Field>

          <Field label="Title">
            <div className="text-sm text-taupe">{item.title}</div>
          </Field>

          <Field label="Caption">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full bg-transparent border hairline focus:border-foreground outline-none px-3 py-2 text-sm leading-relaxed"
            />
          </Field>

          <Field label="Call to action">
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full bg-transparent border hairline focus:border-foreground outline-none px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Hashtags" hint="Space-separated. # is optional.">
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full bg-transparent border hairline focus:border-foreground outline-none px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <footer className="px-6 py-4 border-t hairline flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest text-taupe">
            UI only · no database write
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2 hover:bg-foreground/90"
            >
              Save changes
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-taupe">{label}</span>
        {hint && <span className="text-[10px] text-taupe/70">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

// ---- pieces ----

function StatePill({ state }: { state: ContentState }) {
  const styles: Record<ContentState, string> = {
    draft: "bg-offwhite/95 text-foreground",
    scheduled: "bg-foreground text-offwhite",
    posted: "bg-sage text-offwhite",
    blocked: "bg-destructive text-offwhite",
  };
  const labels: Record<ContentState, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    posted: "Posted",
    blocked: "Blocked",
  };
  return (
    <span className={`backdrop-blur px-2 py-1 text-[9px] uppercase tracking-[0.18em] ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}

function ConsentChip({ status }: { status: Appointment["consent"] }) {
  const map: Record<Appointment["consent"], { label: string; cls: string }> = {
    granted: { label: "Consent granted", cls: "border-sage text-sage" },
    pending: { label: "Consent pending", cls: "border-taupe text-taupe" },
    declined: { label: "Consent declined", cls: "border-destructive text-destructive" },
    not_requested: { label: "Consent not requested", cls: "border-taupe text-taupe" },
  };
  const m = map[status];
  return (
    <span className={`text-[10px] uppercase tracking-widest border hairline px-2 py-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-taupe">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[10px] uppercase tracking-widest border hairline px-2.5 py-1 transition-colors " +
        (active
          ? "bg-foreground text-offwhite border-foreground"
          : "text-taupe hover:text-foreground hover:border-foreground")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="artifact p-12 text-center">
      <p className="eyebrow mb-3">No content matches</p>
      <p className="font-serif text-2xl mb-3">
        {hasFilters ? "Nothing here with those filters." : "Your library is empty."}
      </p>
      <p className="text-sm text-taupe max-w-[48ch] mx-auto mb-6">
        {hasFilters
          ? "Try clearing the filters, or generate a new draft from an appointment."
          : "Generate your first post from an appointment to start building your library."}
      </p>
      <div className="flex items-center justify-center gap-4">
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-[11px] uppercase tracking-[0.2em] border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe"
          >
            Clear filters
          </button>
        )}
        <Link
          to="/generate"
          className="inline-block bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
        >
          Open generator →
        </Link>
      </div>
    </div>
  );
}
