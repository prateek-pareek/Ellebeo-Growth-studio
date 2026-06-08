import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
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
  { id: "needs_review", label: "Needs Review" },
  { id: "draft", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

const FORMAT_FILTERS: Array<string> = ["Carousel", "Reel", "Story", "Caption", "TikTok"];

const FORMAT_ICONS: Record<string, string> = {
  Carousel: "⊞",
  Reel: "▶",
  Story: "◻",
  Caption: "≡",
  TikTok: "♪",
};

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
    const c: Record<string, number> = { all: items.length, draft: 0, needs_review: 0, scheduled: 0, published: 0 };
    for (const item of items) {
      const s = item.state.toLowerCase().replace(/\s+/g, "_");
      if (c[s] !== undefined) c[s] += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (stateFilter !== "all" && c.state.toLowerCase().replace(/\s+/g, "_") !== stateFilter) return false;
      if (formatFilter && c.type !== formatFilter) return false;
      if (goalFilter && c.goal !== goalFilter) return false;
      if (q) {
        const apt = c.sourceAppointmentId ? appointmentsById.get(c.sourceAppointmentId) : undefined;
        const hay = [
          c.title,
          c.caption,
          c.category,
          c.type,
          c.goal,
          c.status,
          c.cta,
          (c.hashtags ?? []).join(" "),
          apt?.clientName,
          apt?.service,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, appointmentsById, stateFilter, formatFilter, goalFilter, query]);

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

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeChipCount = (formatFilter ? 1 : 0) + (goalFilter ? 1 : 0);

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
      <section className="mb-8">
        <div className="flex items-center gap-3 border-b hairline pb-px">
          {/* State tabs */}
          <div className="flex items-end gap-0 flex-1 min-w-0 overflow-x-auto">
            {STATE_FILTERS.map((f) => {
              const active = stateFilter === f.id;
              const n = counts[f.id] ?? 0;
              const dotColor: Record<string, string> = {
                needs_review: "bg-amber-400",
                draft: "bg-taupe/50",
                scheduled: "bg-foreground",
                published: "bg-sage",
              };
              return (
                <button
                  key={f.id}
                  onClick={() => setStateFilter(f.id)}
                  className={
                    "group flex items-center gap-1.5 px-3 pb-2.5 -mb-px text-[11px] uppercase tracking-[0.18em] transition-all duration-150 whitespace-nowrap " +
                    (active
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-taupe hover:text-foreground border-b-2 border-transparent")
                  }
                >
                  {f.id !== "all" && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor[f.id] || "bg-taupe/40"} ${active ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`} />
                  )}
                  {f.label}
                  <span className={
                    "tabular-nums text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-colors " +
                    (active ? "bg-foreground text-offwhite" : "bg-nude/60 text-taupe group-hover:bg-nude")
                  }>{n}</span>
                </button>
              );
            })}
          </div>

          {/* Right side: Filters dropdown + search */}
          <div className="flex items-center gap-2 pb-2 flex-shrink-0">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe text-[11px] pointer-events-none">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="text-[12px] bg-transparent border hairline focus:border-foreground/60 outline-none pl-7 pr-3 py-1.5 w-32 placeholder:text-taupe/60 transition-all focus:w-44"
              />
            </div>

            {/* Filters dropdown */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className={
                  "flex items-center gap-2 text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-all duration-150 " +
                  (filterOpen || activeChipCount > 0
                    ? "bg-foreground text-offwhite border-foreground"
                    : "border-hairline text-taupe hover:text-foreground hover:border-foreground/50")
                }
              >
                <svg width="13" height="10" viewBox="0 0 13 10" fill="none" className="flex-shrink-0">
                  <line x1="0" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="2" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="4" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                Filters
                {activeChipCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-offwhite text-foreground text-[9px] flex items-center justify-center font-semibold leading-none">
                    {activeChipCount}
                  </span>
                )}
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-card border hairline shadow-lg z-30 p-4 space-y-5">
                  {/* Format */}
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-taupe mb-2.5 font-medium">Format</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FORMAT_FILTERS.map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormatFilter(formatFilter === f ? null : f)}
                          className={
                            "flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-all duration-150 " +
                            (formatFilter === f
                              ? "bg-foreground text-offwhite border-foreground"
                              : "text-taupe border-border hover:text-foreground hover:border-foreground/50")
                          }
                        >
                          <span className="leading-none opacity-70">{FORMAT_ICONS[f]}</span>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t hairline" />

                  {/* Goal */}
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-taupe mb-2.5 font-medium">Goal</p>
                    <div className="flex flex-wrap gap-1.5">
                      {GOAL_FILTERS.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setGoalFilter(goalFilter === g.id ? null : g.id)}
                          className={
                            "text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-all duration-150 " +
                            (goalFilter === g.id
                              ? "bg-foreground text-offwhite border-foreground"
                              : "text-taupe border-border hover:text-foreground hover:border-foreground/50")
                          }
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  {activeChipCount > 0 && (
                    <>
                      <div className="border-t hairline" />
                      <button
                        onClick={() => { setFormatFilter(null); setGoalFilter(null); }}
                        className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Clear all (when search or state also active) */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
                title="Clear all filters"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Active filter pills */}
        {(formatFilter || goalFilter) && (
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {formatFilter && (
              <ActivePill label={`${FORMAT_ICONS[formatFilter]} ${formatFilter}`} onRemove={() => setFormatFilter(null)} />
            )}
            {goalFilter && (
              <ActivePill label={GOAL_FILTERS.find(g => g.id === goalFilter)?.label ?? goalFilter} onRemove={() => setGoalFilter(null)} />
            )}
            <span className="text-[9px] text-taupe">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        )}
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
                    setStateFilter("all");
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
          onApproved={() => { refresh?.(); setEditItem(null); setStateFilter("all"); }}
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

function EditSidebar({ item, onClose, onSaved, onApproved }: { item: ContentItem; onClose: () => void; onSaved: () => void; onApproved?: () => void }) {
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
      onApproved ? onApproved() : onSaved();
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
    needs_review: "bg-amber-100 text-amber-800",
    "needs review": "bg-amber-100 text-amber-800",
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

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-widest bg-foreground/8 border hairline text-foreground px-2.5 py-1 rounded-full">
      {label}
      <button onClick={onRemove} className="text-taupe hover:text-foreground leading-none text-[11px]">×</button>
    </span>
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
