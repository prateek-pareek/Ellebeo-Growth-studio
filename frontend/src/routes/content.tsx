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
  { id: "all",          label: "All" },
  { id: "needs_review", label: "Needs Review" },
  { id: "draft",        label: "Drafts" },
  { id: "scheduled",    label: "Scheduled" },
  { id: "published",    label: "Published" },
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
  { id: "showcase",     label: "Showcase" },
  { id: "educate",      label: "Educate" },
  { id: "convert",      label: "Convert" },
  { id: "availability", label: "Availability" },
  { id: "trust",        label: "Trust" },
];

function ContentPage() {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [goalFilter, setGoalFilter]     = useState<string | null>(null);
  const [query, setQuery]               = useState("");
  const [editItem, setEditItem]         = useState<ContentItem | null>(null);

  const { items, appointmentsById, loading, error, refresh } = useContentItems();
  const { data: appts } = useAppointments();
  const { templates }   = useTemplates();

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
          c.title, c.caption, c.category, c.type, c.goal, c.status, c.cta,
          (c.hashtags ?? []).join(" "), apt?.clientName, apt?.service,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, appointmentsById, stateFilter, formatFilter, goalFilter, query]);

  const readyAppointments = appts.filter((a) => a.consent === "granted");

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
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Content library</span>
          <span className="text-taupe/30">·</span>
          {loading ? (
            <span className="text-[9px] uppercase tracking-widest text-taupe">Loading…</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-sage animate-pulse" />
              {items.length} items
            </span>
          )}
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-[22ch]">
          Every draft, post and <span className="italic text-taupe">publish</span> in one place.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Filter by state, format or goal. Posts blocked by missing consent are clearly flagged.
        </p>
        {error && (
          <p className="mt-3 text-[11px] uppercase tracking-widest border-l-2 border-destructive pl-3 text-destructive">
            Couldn't load content from your account.
          </p>
        )}
      </header>

      {/* ── Generate hand-off ────────────────────────────────────────────── */}
      {!loading && <section className="mb-10 border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted px-5 py-3 border-b border-border">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Generate new content
          </h2>
        </div>
        <div className="p-6 lg:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7">
            <p className="font-serif text-2xl mb-2">Turn an appointment into 3 ready-to-review posts</p>
            <p className="text-sm text-taupe leading-relaxed max-w-[60ch]">
              Pick an appointment with consent and visuals on file. Your Brand DNA shapes every variant.
            </p>
            {readyAppointments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {readyAppointments.slice(0, 3).map((a) => (
                  <Link
                    key={a.id}
                    to="/generate"
                    search={{ appointment: a.id }}
                    className="text-[10px] uppercase tracking-widest border border-border bg-muted px-3 py-1.5 hover:bg-nude/30 transition-colors"
                  >
                    {a.clientName.split(" ")[0]} · {a.category}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-5 flex lg:justify-end">
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-medium px-4 py-2.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Open generator
            </Link>
          </div>
        </div>
      </section>}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-nude/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      {!loading && <div className="border border-border bg-card shadow-sm overflow-hidden mb-8">
        <div className="bg-muted px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
          {/* State segment tabs */}
          <div className="flex items-center divide-x divide-border border border-border">
            {STATE_FILTERS.map((f) => {
              const active = stateFilter === f.id;
              const n = counts[f.id] ?? 0;
              const dotColor: Record<string, string> = {
                needs_review: "bg-amber-400",
                draft:        "bg-taupe/50",
                scheduled:    "bg-foreground",
                published:    "bg-sage",
              };
              return (
                <button
                  key={f.id}
                  onClick={() => setStateFilter(f.id)}
                  className={
                    "flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors whitespace-nowrap " +
                    (active
                      ? "bg-foreground text-offwhite"
                      : "text-taupe hover:text-foreground hover:bg-nude/30")
                  }
                >
                  {f.id !== "all" && (
                    <span className={`size-1.5 rounded-full flex-shrink-0 ${dotColor[f.id] || "bg-taupe/40"}`} />
                  )}
                  {f.label}
                  <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>

          {/* Right: search + filters */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe text-[11px] pointer-events-none">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="text-[12px] bg-card border border-border focus:border-foreground/60 outline-none pl-7 pr-3 py-1.5 w-32 placeholder:text-taupe/60 transition-all focus:w-44"
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
                    : "border-border text-taupe hover:text-foreground hover:border-foreground/50")
                }
              >
                <svg width="13" height="10" viewBox="0 0 13 10" fill="none" className="flex-shrink-0">
                  <line x1="0" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="2" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="4" y1="8" x2="9"  y2="8" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                Filters
                {activeChipCount > 0 && (
                  <span className="size-4 rounded-full bg-offwhite text-foreground text-[9px] flex items-center justify-center font-semibold leading-none">
                    {activeChipCount}
                  </span>
                )}
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-card border border-border shadow-lg z-30 overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Format</p>
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-1.5">
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

                  <div className="border-t border-border" />
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Goal</p>
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-1.5">
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

                  {activeChipCount > 0 && (
                    <>
                      <div className="border-t border-border" />
                      <div className="px-4 py-3">
                        <button
                          onClick={() => { setFormatFilter(null); setGoalFilter(null); }}
                          className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
                        >
                          Clear filters
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
          <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border bg-nude/10">
            {formatFilter && (
              <ActivePill label={`${FORMAT_ICONS[formatFilter]} ${formatFilter}`} onRemove={() => setFormatFilter(null)} />
            )}
            {goalFilter && (
              <ActivePill
                label={GOAL_FILTERS.find((g) => g.id === goalFilter)?.label ?? goalFilter}
                onRemove={() => setGoalFilter(null)}
              />
            )}
            <span className="text-[9px] text-taupe">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Results */}
        <div className="p-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-taupe italic">Loading library…</div>
          ) : filtered.length === 0 ? (
            <EmptyState onClear={clearFilters} hasFilters={hasActiveFilters} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
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
                  onDeleted={() => refresh?.()}
                />
              ))}
            </div>
          )}
        </div>
      </div>}

      {/* Edit sidebar */}
      {editItem && (
        <EditSidebar
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { refresh?.(); setEditItem(null); }}
          onApproved={() => { refresh?.(); setEditItem(null); setStateFilter("all"); }}
        />
      )}

      {/* ── Quick templates ───────────────────────────────────────────────── */}
      {!loading && templates.length > 0 && (
        <section className="border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quick start from a template
            </h2>
            <Link to="/templates" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
              All templates →
            </Link>
          </div>
          <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-5">
            {templates.slice(0, 4).map((t) => (
              <Link to="/templates" key={t.id} className="group">
                <div className="aspect-[4/5] overflow-hidden bg-nude/30 mb-3 border border-border">
                  <img src={t.preview} alt={t.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" loading="lazy" />
                </div>
                <p className="eyebrow mb-1">{t.type} · {t.pillar}</p>
                <p className="font-serif text-base leading-tight">{t.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ContentCard({
  item,
  appointment,
  onReview,
  onApprove,
  onDeleted,
}: {
  item: ContentItem;
  appointment?: any;
  onReview?: () => void;
  onApprove?: () => void;
  onDeleted?: () => void;
}) {
  const [approving,  setApproving]  = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirm,    setConfirm]    = useState(false);

  const handleDiscard = async () => {
    if (!confirm) { setConfirm(true); return; }
    setDiscarding(true);
    try {
      await api.delete(`/content/${item.id}`);
      toast.success("Draft discarded.");
      onDeleted?.();
    } catch {
      toast.error("Failed to discard. Try again.");
    } finally {
      setDiscarding(false);
      setConfirm(false);
    }
  };
  const platformVariants = item.platformVariants;
  const isCarousel = platformVariants?.type === "carousel";
  const isStory = platformVariants?.type === "story";
  const slides = isCarousel ? (platformVariants?.slides ?? []) : isStory ? (platformVariants?.frames ?? []) : [];
  const [cardSlideIndex, setCardSlideIndex] = useState(0);

  const state   = item.state.toLowerCase();
  const blocked = state === "blocked";
  const isDraft = state === "draft" || state === "needs review";

  return (
    <article className="group flex flex-col border border-border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Image */}
      <div className="aspect-[4/5] overflow-hidden bg-nude/30 relative border-b border-border hover:cursor-pointer" onClick={onReview}>
        <img
          src={slides.length > 0 ? slides[cardSlideIndex]?.url : item.image}
          alt={item.title}
          loading="lazy"
          className={
            "w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.01] " +
            (blocked ? "opacity-40 grayscale" : "")
          }
        />
        
        {/* Navigation arrows directly on the grid card */}
        {slides.length > 1 && !blocked && (
          <>
            {cardSlideIndex > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCardSlideIndex(cardSlideIndex - 1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white size-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all shadow-md z-10"
              >
                ←
              </button>
            )}
            {cardSlideIndex < slides.length - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCardSlideIndex(cardSlideIndex + 1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white size-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all shadow-md z-10"
              >
                →
              </button>
            )}
            
            {/* Page Dots Indicator */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm z-10">
              {slides.map((_: any, idx: number) => (
                <span
                  key={idx}
                  className={`size-1.5 rounded-full transition-all ${idx === cardSlideIndex ? "bg-white scale-110" : "bg-white/40"}`}
                />
              ))}
            </div>
          </>
        )}

        <div className="absolute top-3 left-3 z-10">
          <StatePill state={state} />
        </div>
        {blocked && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-foreground/90 text-offwhite px-3 py-2 text-[10px] uppercase tracking-widest backdrop-blur">
              Locked · consent declined
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3">
        <p className="eyebrow mb-1">{item.type} · {item.pillar}</p>
        <h3 className="font-serif text-base mb-1.5 leading-snug">{item.title}</h3>
        {!blocked ? (
          <p className="text-xs text-taupe leading-relaxed line-clamp-3 mb-3">{item.caption}</p>
        ) : (
          <p className="text-xs text-taupe leading-relaxed mb-3">
            The client declined consent. We won't preview, schedule or publish this draft.
          </p>
        )}
      </div>

      {/* Meta strip */}
      <div className="bg-muted border-t border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-widest text-taupe mb-2">
          {appointment && (
            <span>{appointment.clientName.split(" ")[0]} · {appointment.category}</span>
          )}
          {item.scheduledFor && (
            <span>· Scheduled {new Date(item.scheduledFor).toLocaleDateString()}</span>
          )}
          {item.postedAt && (
            <span>· Posted {new Date(item.postedAt).toLocaleDateString()}</span>
          )}
        </div>

        {!blocked && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={onReview}
                className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3 py-1.5 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
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
                  className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3 py-1.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {approving ? "Approving…" : "Approve"}
                </button>
              )}
              {(state === "approved" || state === "scheduled") && (
                <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-0.5">
                  {state}
                </span>
              )}
            </div>

            {/* Discard — two-tap confirm */}
            {state !== "published" && (
              <button
                onClick={handleDiscard}
                disabled={discarding}
                onBlur={() => setConfirm(false)}
                className={
                  "text-[10px] uppercase tracking-widest px-2.5 py-1.5 transition-all disabled:opacity-40 " +
                  (confirm
                    ? "bg-destructive/10 text-destructive border border-destructive/30 rounded"
                    : "text-taupe/50 hover:text-destructive opacity-0 group-hover:opacity-100")
                }
              >
                {discarding ? "…" : confirm ? "Confirm?" : "Discard"}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function EditSidebar({
  item,
  onClose,
  onSaved,
  onApproved,
}: {
  item: ContentItem;
  onClose: () => void;
  onSaved: () => void;
  onApproved?: () => void;
}) {
  const [caption,  setCaption]  = useState(item.caption);
  const [cta,      setCta]      = useState(item.cta ?? "");
  const [hashtags, setHashtags] = useState((item.hashtags ?? []).join(" "));
  const [saving,   setSaving]   = useState(false);
  const [approving, setApproving] = useState(false);

  const platformVariants = item.platformVariants;
  const isCarousel = platformVariants?.type === "carousel";
  const isStory = platformVariants?.type === "story";
  const slides = isCarousel ? (platformVariants?.slides ?? []) : isStory ? (platformVariants?.frames ?? []) : [];
  const [activeSlide, setActiveSlide] = useState(0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/content/${item.id}`, {
        caption,
        callToAction: cta,
        hashtags: hashtags.split(/\s+/).map((h) => h.replace(/^#/, "")).filter(Boolean),
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
      <div className="fixed inset-0 bg-foreground/20 z-40" onClick={onClose} />

      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-muted flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
              Edit draft
            </p>
            <p className="font-serif text-lg leading-tight">{item.title}</p>
          </div>
          <button onClick={onClose} className="text-taupe hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        {/* Status */}
        <div className="px-6 py-3 border-b border-border flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-taupe">Status</span>
          <StatePill state={item.state.toLowerCase()} />
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Visual Preview Slider */}
          {slides.length > 0 && (
            <div className="border border-border bg-muted/20 p-3 mb-2 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-widest text-taupe">
                  Visual Preview ({activeSlide + 1}/{slides.length})
                </span>
                <span className="text-[8px] uppercase tracking-widest bg-foreground/10 text-foreground px-2 py-0.5 font-semibold">
                  {isCarousel ? "Carousel" : "Story"}
                </span>
              </div>
              
              <div className="relative aspect-square w-full overflow-hidden bg-black/5 mb-2 border border-border">
                <img
                  src={slides[activeSlide]?.url}
                  alt={slides[activeSlide]?.label ?? `Slide ${activeSlide + 1}`}
                  className="w-full h-full object-cover"
                />
                
                {activeSlide > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveSlide(activeSlide - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-foreground/70 hover:bg-foreground text-white size-6 flex items-center justify-center rounded-full text-xs font-bold transition-all shadow-md"
                  >
                    ←
                  </button>
                )}
                {activeSlide < slides.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setActiveSlide(activeSlide + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-foreground/70 hover:bg-foreground text-white size-6 flex items-center justify-center rounded-full text-xs font-bold transition-all shadow-md"
                  >
                    →
                  </button>
                )}
              </div>

              {/* Thumbnails strip */}
              <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
                {slides.map((s: any, idx: number) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`shrink-0 size-11 overflow-hidden border-2 transition-all ${
                      idx === activeSlide ? "border-foreground scale-95" : "border-transparent opacity-60 hover:opacity-90"
                    }`}
                  >
                    <img src={s.url} alt="" className="w-full h-full object-cover animate-fade-in" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full bg-muted/30 border border-border p-3 text-sm outline-none focus:border-foreground resize-none leading-relaxed"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Call to action</label>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full bg-muted/30 border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">Hashtags</label>
            <p className="text-[9px] text-taupe mb-2">Space-separated. # is optional.</p>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full bg-muted/30 border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground"
              placeholder="#haircolour #sydney"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-muted px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {(item.state.toLowerCase() === "draft" || item.state.toLowerCase() === "needs review") && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {approving ? "Approving…" : "Approve"}
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
    draft:        "bg-offwhite/95 text-foreground",
    needs_review: "bg-amber-100 text-amber-800",
    "needs review": "bg-amber-100 text-amber-800",
    scheduled:    "bg-foreground text-offwhite",
    published:    "bg-sage text-offwhite",
    blocked:      "bg-destructive text-offwhite",
  };
  return (
    <span className={`backdrop-blur px-2 py-1 text-[9px] uppercase tracking-[0.18em] ${styles[state] || styles.draft}`}>
      {state}
    </span>
  );
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-widest bg-muted border border-border text-foreground px-2.5 py-1">
      {label}
      <button onClick={onRemove} className="text-taupe hover:text-foreground leading-none text-[11px]">
        ×
      </button>
    </span>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border bg-muted/20 py-14 text-center">
      <p className="eyebrow mb-3">No content matches</p>
      <p className="font-serif text-2xl mb-3">
        {hasFilters ? "Nothing here with those filters." : "Your library is empty."}
      </p>
      <p className="text-sm text-taupe max-w-[48ch] mx-auto mb-6">
        {hasFilters
          ? "Try clearing the filters, or generate a new draft from an appointment."
          : "Generate your first post from an appointment to start building your library."}
      </p>
      <div className="flex items-center justify-center gap-3">
        {hasFilters && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
          >
            Clear filters
          </button>
        )}
        <Link
          to="/generate"
          className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-medium px-4 py-2.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Open generator
        </Link>
      </div>
    </div>
  );
}
