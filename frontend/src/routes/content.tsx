import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContentItems, type ContentItem } from "@/lib/providers/content-provider";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { useTemplates } from "@/lib/providers/template-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";

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

type StateFilter = "all" | string;

const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

const FORMAT_FILTERS: Array<string> = ["Carousel", "Reel", "Story", "Caption", "TikTok"];

const GOAL_FILTERS: Array<{ id: string; label: string }> = [
  { id: "showcase", label: "Showcase" },
  { id: "educate", label: "Educate" },
  { id: "convert", label: "Convert" },
  { id: "availability", label: "Availability" },
  { id: "trust", label: "Trust" },
];

function ContentPage() {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [goalFilter, setGoalFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);

  const { items, appointmentsById, loading, error, refresh } = useContentItems();
  const { data: appts } = useAppointments();
  const { templates } = useTemplates();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, draft: 0, scheduled: 0, published: 0 };
    for (const item of items) {
        const s = item.state.toLowerCase();
        if (c[s] !== undefined) c[s] += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (stateFilter !== "all" && c.state.toLowerCase() !== stateFilter) return false;
      if (formatFilter && c.type !== formatFilter) return false;
      if (goalFilter && c.goal !== goalFilter) return false;
      if (q) {
        const hay = `${c.title} ${c.caption} ${c.pillar} ${c.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, stateFilter, formatFilter, goalFilter, query]);

  const readyAppointments = appts.filter(
    (a) => a.consent === "granted"
  );

  const clearFilters = () => {
    setStateFilter("all");
    setFormatFilter(null);
    setGoalFilter(null);
    setQuery("");
  };

  const hasActiveFilters =
    stateFilter !== "all" || formatFilter !== null || goalFilter !== null || query.trim() !== "";

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5">
          <p className="eyebrow">Content library</p>
          {!loading && !error && items.length > 0 && (
             <span className="text-[9px] uppercase tracking-widest border border-sage text-sage px-2 py-1">
              Live
            </span>
          )}
          {loading && (
            <span className="text-[9px] uppercase tracking-widest text-taupe">Loading…</span>
          )}
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Every draft, scheduled post and <span className="italic">published</span> piece, in one place.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Generated from real appointments and shaped by your Brand DNA. Filter by state, format or goal — and see exactly which posts are blocked because the client hasn't consented.
        </p>
        {error && (
          <p className="mt-4 text-[11px] uppercase tracking-widest border-l-2 border-destructive pl-3 text-destructive">
            Couldn't load content from your account.
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
            const n = counts[f.id] || 0;
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
        {loading ? (
            <div className="artifact p-12 text-center text-taupe italic">Loading library...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} hasFilters={hasActiveFilters} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c) => (
              <ContentCard
                key={c.id}
                item={c}
                appointment={c.sourceAppointmentId ? appointmentsById.get(c.sourceAppointmentId) : undefined}
                onReview={() => setEditItem(c)}
                onApprove={async () => {
                  try {
                    await api.patch(`/content/${c.id}/approve`);
                    toast.success("Content approved");
                    refresh?.();
                  } catch { toast.error("Failed to approve"); }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Edit sidebar */}
      {editItem && (
        <EditSidebar
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { refresh?.(); setEditItem(null); }}
        />
      )}

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
    </div>
  );
}

function ContentCard({
  item,
  appointment,
  onReview,
  onApprove,
}: {
  item: ContentItem;
  appointment?: any;
  onReview?: () => void;
  onApprove?: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const state = item.state.toLowerCase();
  const blocked = state === "blocked";
  const isDraft = state === "draft" || state === "needs review";
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
          <StatePill state={state} />
        </div>
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
          {item.scheduledFor && <span>· Scheduled {new Date(item.scheduledFor).toLocaleDateString()}</span>}
          {item.postedAt && <span>· Posted {new Date(item.postedAt).toLocaleDateString()}</span>}
          <span className="ml-auto">· Updated {item.updatedAt}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {!blocked && (
            <div className="flex items-center gap-3">
              <button
                onClick={onReview}
                className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe"
              >
                Review
              </button>
              {isDraft && (
                <button
                  onClick={async () => {
                    setApproving(true);
                    await onApprove?.();
                    setApproving(false);
                  }}
                  disabled={approving}
                  className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-1.5 hover:bg-taupe disabled:opacity-50 transition-colors"
                >
                  {approving ? "..." : "Approve"}
                </button>
              )}
              {(state === "approved" || state === "scheduled") && (
                <span className="text-[10px] uppercase tracking-widest text-sage">{state}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function EditSidebar({ item, onClose, onSaved }: { item: ContentItem; onClose: () => void; onSaved: () => void }) {
  const [caption, setCaption] = useState(item.caption);
  const [cta, setCta] = useState(item.cta ?? "");
  const [hashtags, setHashtags] = useState((item.hashtags ?? []).join(" "));
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/content/${item.id}`, {
        caption,
        callToAction: cta,
        hashtags: hashtags.split(/\s+/).map(h => h.replace(/^#/, '')).filter(Boolean),
      });
      toast.success("Saved");
      onSaved();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.patch(`/content/${item.id}/approve`);
      toast.success("Approved!");
      onSaved();
    } catch { toast.error("Failed to approve"); }
    finally { setApproving(false); }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-foreground/20 z-40" onClick={onClose} />

      {/* Sidebar */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-card border-l hairline z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b hairline">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-0.5">Edit draft</p>
            <p className="font-serif text-lg leading-tight">{item.title}</p>
          </div>
          <button onClick={onClose} className="text-taupe hover:text-foreground text-xl leading-none">×</button>
        </div>

        {/* Status */}
        <div className="px-6 py-3 border-b hairline">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Status</p>
          <StatePill state={item.state.toLowerCase()} />
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Caption</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={6}
              className="w-full bg-transparent border hairline p-3 text-sm outline-none focus:border-foreground resize-none leading-relaxed"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Call to action</label>
            <input
              value={cta}
              onChange={e => setCta(e.target.value)}
              className="w-full bg-transparent border hairline p-3 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">Hashtags</label>
            <p className="text-[9px] text-taupe mb-2">Space-separated. # is optional.</p>
            <input
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              className="w-full bg-transparent border hairline p-3 text-sm outline-none focus:border-foreground"
              placeholder="#haircolour #sydney"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t hairline flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-[10px] uppercase tracking-widest border hairline px-4 py-2 hover:bg-nude/30 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {(item.state.toLowerCase() === "draft" || item.state.toLowerCase() === "needs review") && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-4 py-2 hover:bg-taupe disabled:opacity-50 transition-colors"
              >
                {approving ? "Approving..." : "Approve"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatePill({ state }: { state: string }) {
  const styles: Record<string, string> = {
    draft: "bg-offwhite/95 text-foreground",
    scheduled: "bg-foreground text-offwhite",
    published: "bg-sage text-offwhite",
    blocked: "bg-destructive text-offwhite",
  };
  return (
    <span className={`backdrop-blur px-2 py-1 text-[9px] uppercase tracking-[0.18em] ${styles[state] || styles.draft}`}>
      {state}
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
