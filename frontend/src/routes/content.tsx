import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useContentItems, type ContentItem } from "@/lib/providers/content-provider";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { useTemplates } from "@/lib/providers/template-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Images, Play, AlignLeft, Smartphone, Music2, Clock, CalendarCheck, Trash2, Sparkles, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Pagination } from "@/components/Pagination";

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

// One consistent icon language for format, reused in the filter chips, the
// active-filter pill, and the card badge — so a glance at any of the three
// tells you the same thing the same way.
const FORMAT_ICON: Record<string, LucideIcon> = {
  Carousel: Images,
  Reel: Play,
  Story: Smartphone,
  Caption: AlignLeft,
  TikTok: Music2,
};

const PAGE_SIZE = 10;

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
  const [page, setPage]                 = useState(1);

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

  // Reset to page 1 whenever the result set changes shape
  useEffect(() => { setPage(1); }, [stateFilter, formatFilter, goalFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      <header className="mt-6 lg:mt-10 mb-6">
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
        <h1 className="page-title max-w-[22ch]">
          Every draft, post and <span className="italic text-brass-ink">publish</span> in one place.
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
      {!loading && <section className="mb-6 bg-card rounded-2xl shadow-elevated overflow-hidden">
        <div className="px-6 py-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Generate new content
          </h2>
        </div>
        <div className="px-6 pb-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
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
                    className="text-[11px] font-medium rounded-full border border-border bg-muted px-3.5 py-1.5 hover:border-brass/50 hover:text-brass-ink transition-colors"
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
              className="inline-flex items-center gap-2 bg-brass text-white text-xs font-semibold px-5 py-3 rounded-xl shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all"
            >
              <Sparkles className="size-3.5" />
              Open generator
            </Link>
          </div>
        </div>
      </section>}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-nude/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      {!loading && <div className="bg-card rounded-2xl shadow-elevated overflow-hidden mb-6">
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          {/* State segment tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-full p-1 flex-wrap">
            {STATE_FILTERS.map((f) => {
              const active = stateFilter === f.id;
              const n = counts[f.id] ?? 0;
              const dotColor: Record<string, string> = {
                needs_review: "bg-brass",
                draft:        "bg-taupe/50",
                scheduled:    "bg-foreground",
                published:    "bg-sage",
              };
              return (
                <button
                  key={f.id}
                  onClick={() => setStateFilter(f.id)}
                  className={
                    "flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full transition-colors whitespace-nowrap " +
                    (active
                      ? "bg-card text-foreground shadow-elevated"
                      : "text-taupe hover:text-foreground")
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe text-[11px] pointer-events-none">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-9 text-[12px] rounded-full bg-muted border border-transparent focus:border-brass focus:ring-2 focus:ring-brass/15 outline-none pl-8 pr-3.5 w-32 placeholder:text-taupe/60 transition-all focus:w-44"
              />
            </div>

            {/* Filters dropdown */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className={
                  "h-9 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3.5 rounded-full transition-all duration-150 " +
                  (filterOpen || activeChipCount > 0
                    ? "bg-brass text-white"
                    : "bg-muted text-taupe hover:text-foreground")
                }
              >
                <SlidersHorizontal className="size-3" />
                Filters
                {activeChipCount > 0 && (
                  <span className="size-4 rounded-full bg-white/25 text-white text-[9px] flex items-center justify-center font-semibold leading-none">
                    {activeChipCount}
                  </span>
                )}
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-card rounded-xl shadow-elevated-lg z-30 overflow-hidden">
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Format</p>
                  </div>
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {FORMAT_FILTERS.map((f) => {
                      const Icon = FORMAT_ICON[f];
                      return (
                        <button
                          key={f}
                          onClick={() => setFormatFilter(formatFilter === f ? null : f)}
                          className={
                            "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1.5 rounded-full border transition-all duration-150 " +
                            (formatFilter === f
                              ? "bg-brass border-brass text-white"
                              : "text-foreground/70 border-border hover:border-brass/50 hover:text-foreground")
                          }
                        >
                          <Icon size={11} strokeWidth={2} className="opacity-80" />
                          {f}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-border" />
                  <div className="px-4 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Goal</p>
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-1.5">
                    {GOAL_FILTERS.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setGoalFilter(goalFilter === g.id ? null : g.id)}
                        className={
                          "text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1.5 rounded-full border transition-all duration-150 " +
                          (goalFilter === g.id
                            ? "bg-brass border-brass text-white"
                            : "text-foreground/70 border-border hover:border-brass/50 hover:text-foreground")
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
                          className="text-[9px] font-semibold uppercase tracking-widest text-taupe hover:text-brass-ink transition-colors"
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
                className="size-9 flex items-center justify-center rounded-full text-taupe hover:text-foreground hover:bg-muted transition-colors text-sm"
                title="Clear all filters"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Active filter pills */}
        {(formatFilter || goalFilter) && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-t border-border bg-muted/30">
            {formatFilter && (
              <ActivePill label={formatFilter} onRemove={() => setFormatFilter(null)} />
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
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
                {pageItems.map((c) => (
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
        <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quick start from a template
            </h2>
            <Link to="/templates" className="text-[10px] font-semibold uppercase tracking-widest text-taupe hover:text-brass-ink transition-colors">
              All templates →
            </Link>
          </div>
          <div className="px-6 pb-6 grid grid-cols-2 lg:grid-cols-4 gap-5">
            {templates.slice(0, 4).map((t) => (
              <Link to="/templates" key={t.id} className="group">
                <div className="aspect-[4/5] overflow-hidden rounded-xl bg-nude/30 mb-3">
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
  const thumbnailUrl = slides.length > 0 ? slides[0]?.url : item.image;

  const state   = item.state.toLowerCase();
  const blocked = state === "blocked";
  const isDraft = state === "draft" || state === "needs review";

  const FormatIcon = FORMAT_ICON[item.type] ?? AlignLeft;

  return (
    <article className="group flex flex-col rounded-3xl bg-card shadow-elevated hover:shadow-elevated-lg hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
      {/* Media — a consistent aspect ratio (not a fixed pixel height) across every
          format, so cards stay level whatever the grid's column width is;
          format identity comes from the badge + the story "phone" inset +
          the carousel stacked-card effect below, not from a wobbly aspect ratio. */}
      <div
        className="relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
        onClick={onReview}
      >
        {isCarousel ? (
          <>
            {/* Stacked-deck effect: two offset cards peeking out behind the top image */}
            <div className="absolute inset-x-6 top-4 bottom-0 bg-card border border-border rotate-[-2deg] rounded-2xl" />
            <div className="absolute inset-x-5 top-2 bottom-0 bg-card border border-border rotate-[1.5deg] rounded-2xl" />
            <div className="absolute inset-2 overflow-hidden rounded-2xl">
              <img
                src={thumbnailUrl}
                alt={item.title}
                loading="lazy"
                className={"w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] " + (blocked ? "opacity-40 grayscale" : "")}
              />
            </div>
            {slides.length > 1 && (
              <span className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1 bg-foreground/80 backdrop-blur text-offwhite text-[9px] font-semibold px-2 py-1 rounded-full shadow-sm">
                <Images size={10} strokeWidth={2.25} />
                {slides.length}
              </span>
            )}
          </>
        ) : isStory ? (
          // Letterboxed vertical "phone screen" — immediately reads as Story
          // without needing a label, and keeps the row height uniform.
          <div className="h-full flex items-center justify-center bg-gradient-to-b from-muted to-nude/20">
            <div className="h-full aspect-[9/16] overflow-hidden shadow-lg ring-1 ring-border/60 rounded-2xl">
              <img
                src={thumbnailUrl}
                alt={item.title}
                loading="lazy"
                className={"w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] " + (blocked ? "opacity-40 grayscale" : "")}
              />
            </div>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={item.title}
            loading="lazy"
            className={"w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] " + (blocked ? "opacity-40 grayscale" : "")}
          />
        )}

        {/* Soft scrim so the top-corner badges stay legible over any photo */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />

        <div className="absolute top-4 left-4 z-10">
          <StatePill state={state} />
        </div>
        <div className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 bg-foreground/70 backdrop-blur text-offwhite text-[9px] font-semibold uppercase tracking-widest px-2.5 py-1.5 rounded-full shadow-sm">
          <FormatIcon size={11} strokeWidth={2.25} />
          {item.type}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-6">
        {item.pillar && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-taupe/70 mb-2.5">
            {String(item.pillar).replace(/_/g, " ")}
          </p>
        )}
        {/* No separate caption preview here — item.title is already derived
            from the caption's opening line (see content-provider.ts), so
            showing the full caption underneath just repeated the same text
            twice on the card. */}
        <h3 className="font-serif text-xl mb-3 leading-snug line-clamp-2">{item.title}</h3>

        {blocked && (
          <p className="text-xs text-taupe leading-relaxed mb-3">
            {item.blockedReason || "This draft didn't meet brand quality standards and needs another pass before it can be scheduled."}
          </p>
        )}
      </div>

      {/* Meta strip */}
      <div className="bg-muted/60 border-t border-border/70 px-6 py-4">
        {(appointment || item.scheduledFor || item.postedAt) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-taupe mb-2">
            {appointment && (
              <span className="inline-flex items-center gap-1 truncate">
                {appointment.clientName.split(" ")[0]} · {appointment.category}
              </span>
            )}
            {item.scheduledFor && (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} /> {new Date(item.scheduledFor).toLocaleDateString()}
              </span>
            )}
            {item.postedAt && (
              <span className="inline-flex items-center gap-1">
                <CalendarCheck size={10} /> {new Date(item.postedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-nowrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              {!blocked && (
                <button
                  onClick={onReview}
                  className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3 py-1.5 rounded-lg hover:bg-muted active:scale-[0.97] transition-all shrink-0"
                >
                  Review
                </button>
              )}
              {!blocked && isDraft && (
                <button
                  onClick={async () => {
                    setApproving(true);
                    await onApprove?.();
                    setApproving(false);
                  }}
                  disabled={approving}
                  className="inline-flex items-center bg-brass text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-elevated hover:brightness-105 active:scale-[0.97] transition-all disabled:opacity-50 shrink-0"
                >
                  {approving ? "Approving…" : "Approve"}
                </button>
              )}
              {!blocked && (state === "approved" || state === "scheduled") && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-white bg-sage px-2.5 py-1 rounded-full truncate">
                  {state}
                </span>
              )}
            </div>

            {/* Discard — icon + label together (so the action is still named,
                not just an icon), always pinned to the right of Review/Approve
                — the outer row is nowrap and this button never grows past its
                content, so it can't get pushed onto its own line. Two-tap
                confirm. Available for blocked drafts too, so a post that
                failed quality checks isn't stuck in the library forever. */}
            {state !== "published" && (
              <button
                onClick={handleDiscard}
                disabled={discarding}
                onBlur={() => setConfirm(false)}
                className={
                  "shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40 " +
                  (confirm
                    ? "bg-destructive/10 text-destructive border border-destructive/30"
                    : blocked
                      ? "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      : "text-taupe hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100")
                }
              >
                <Trash2 size={12} strokeWidth={2} />
                {discarding ? "…" : confirm ? "Confirm?" : "Discard"}
              </button>
            )}
        </div>
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
  const [activeVariant, setActiveVariant] = useState(0);

  // Extract variants from generationOptions if they exist
  const variants = Array.isArray(item.generationOptions) && item.generationOptions.length > 0
    ? item.generationOptions
    : [item];

  // Initialize state based on the current active variant
  useEffect(() => {
    const current = variants[activeVariant] as any;
    setCaption(current?.caption || item.caption || "");
    setCta(current?.callToAction || item.cta || "");
    setHashtags((current?.hashtags ?? item.hashtags ?? []).join(" "));
  }, [activeVariant, item, variants]);

  const [caption,  setCaption]  = useState(item.caption || "");
  const [cta,      setCta]      = useState(item.cta ?? "");
  const [hashtags, setHashtags] = useState((item.hashtags ?? []).join(" "));
  const [saving,   setSaving]   = useState(false);
  const [approving, setApproving] = useState(false);

  const platformVariants = item.platformVariants;
  const isCarousel = platformVariants?.type === "carousel";
  const isStory = platformVariants?.type === "story";
  const slides = isCarousel ? (platformVariants?.slides ?? []) : isStory ? (platformVariants?.frames ?? []) : [];
  const [activeSlide, setActiveSlide] = useState(0);

  // Keyboard navigation for slides
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't change slide if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveSlide(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveSlide(prev => Math.min(slides.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length]);

  const opt = variants[activeVariant] ?? variants[0];

  const getVariantUrl = (slideData: any) => {
    if (!slideData) return null;
    const isEmpatheticOption = opt?.generatedBy?.toLowerCase().includes('empathetic');
    if (slideData.variants) {
      if (isEmpatheticOption && slideData.variants.gemini) return slideData.variants.gemini;
      if (!isEmpatheticOption && slideData.variants.dalle) return slideData.variants.dalle;
    }
    return slideData.url;
  };

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

      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-card z-50 flex flex-col shadow-2xl">
        {/* Header — same surface as the body, separated only by a hairline so it reads as one panel */}
        <div className="bg-card flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Edit draft
            </p>
            <p className="font-serif text-lg leading-tight mb-2.5">{item.title}</p>
            <StatePill state={item.state.toLowerCase()} />
          </div>
          <button onClick={onClose} className="shrink-0 text-taupe hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Visual Preview Slider */}
          {slides.length > 0 && (
            <div className="rounded-xl bg-muted/30 p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-widest text-taupe">
                  Visual Preview ({activeSlide + 1}/{slides.length})
                </span>
                <span className="text-[8px] uppercase tracking-widest rounded-full bg-brass/15 text-brass-ink px-2 py-0.5 font-semibold">
                  {isCarousel ? "Carousel (1:1 Square)" : "Story (9:16 Vertical)"}
                </span>
              </div>

              <div className={`relative w-full overflow-hidden rounded-lg bg-black/5 mb-2 transition-all duration-300 ${isStory ? 'aspect-[9/16] max-h-[460px] mx-auto' : 'aspect-square'}`}>
                <img
                  src={getVariantUrl(slides[activeSlide])}
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
                    className={`shrink-0 size-11 overflow-hidden rounded-lg border-2 transition-all ${
                      idx === activeSlide ? "border-brass scale-95" : "border-transparent opacity-60 hover:opacity-90"
                    }`}
                  >
                    <img src={getVariantUrl(s)} alt="" className="w-full h-full object-cover animate-fade-in" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {variants.length > 1 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">Caption options</p>
              <div className="flex gap-2">
                {variants.map((v: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActiveVariant(i)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left transition-all ${
                      i === activeVariant
                        ? "border-brass bg-brass/5 shadow-elevated"
                        : "border-border bg-card opacity-60 hover:opacity-100"
                    }`}
                  >
                    <p className={"text-[9px] uppercase tracking-widest mb-1 " + (i === activeVariant ? "text-brass-ink" : "text-taupe")}>
                      Option {i + 1}
                    </p>
                    <p className="text-xs font-medium truncate">{v.generatedBy === 'anthropic/claude-3-5-sonnet-20241022' ? 'Claude 3.5 Sonnet' : v.generatedBy === 'openai/gpt-4o' ? 'GPT-4o' : v.generatedBy === 'openai/gpt-4o-mini' ? 'GPT-4o Mini' : `Option ${i + 1}`}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Content</p>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                className="w-full rounded-lg bg-muted/30 border border-border p-3 text-sm outline-none focus:border-brass focus:ring-2 focus:ring-brass/15 resize-none leading-relaxed"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Call to action</label>
              <input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-sm outline-none focus:border-brass focus:ring-2 focus:ring-brass/15"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-taupe block mb-1">Hashtags</label>
              <p className="text-[9px] text-taupe mb-2">Space-separated. # is optional.</p>
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-sm outline-none focus:border-brass focus:ring-2 focus:ring-brass/15"
                placeholder="#haircolour #sydney"
              />
            </div>
          </section>
        </div>

        {/* Footer actions — same surface as header/body, hairline border only */}
        <div className="bg-card px-6 py-4 border-t border-border flex items-center justify-between gap-3">
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
              className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2 rounded-lg hover:bg-muted active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {(item.state.toLowerCase() === "draft" || item.state.toLowerCase() === "needs review") && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="inline-flex items-center bg-brass text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-elevated hover:brightness-105 active:scale-[0.97] transition-all disabled:opacity-50"
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
    draft:        "bg-card text-foreground",
    needs_review: "bg-brass/15 text-brass-ink",
    "needs review": "bg-brass/15 text-brass-ink",
    scheduled:    "bg-foreground text-offwhite",
    published:    "bg-sage text-offwhite",
    blocked:      "bg-destructive text-offwhite",
  };
  return (
    <span className={`backdrop-blur px-2.5 py-1 rounded-full text-[9px] uppercase tracking-[0.18em] shadow-sm ${styles[state] || styles.draft}`}>
      {state}
    </span>
  );
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest bg-muted text-foreground rounded-full px-3 py-1.5">
      {label}
      <button onClick={onRemove} className="text-taupe hover:text-brass-ink leading-none text-[11px]">
        ×
      </button>
    </span>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/20 py-10 text-center">
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
            className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2 rounded-xl hover:bg-muted active:scale-[0.97] transition-all"
          >
            Clear filters
          </button>
        )}
        <Link
          to="/generate"
          className="inline-flex items-center gap-2 bg-brass text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all"
        >
          <Sparkles className="size-3.5" />
          Open generator
        </Link>
      </div>
    </div>
  );
}
