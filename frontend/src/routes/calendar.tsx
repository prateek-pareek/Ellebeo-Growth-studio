import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useCalendar, type CalendarEntry } from "@/lib/providers/calendar-provider";
import { useContentItems, type ContentItem } from "@/lib/providers/content-provider";
import { useCampaigns } from "@/lib/providers/campaign-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Elle.Be.O Growth" },
      { name: "description", content: "Plan your monthly content schedule around bookings, content pillars and campaigns." },
      { property: "og:title", content: "Calendar — Elle.Be.O Growth" },
    ],
  }),
  component: CalendarPage,
});

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-foreground",
  draft: "bg-taupe/60",
  published: "bg-sage",
  rest: "bg-transparent",
};

function CalendarPage() {
  const { entries, month, year, monthIndex, loading, error, goNext, goPrev, refresh } = useCalendar();
  const { items: contentItems } = useContentItems();
  const { data: campaigns } = useCampaigns();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);

  // Group entries by day (multiple per day supported)
  const entriesByDay = new Map<number, CalendarEntry[]>();
  for (const e of entries) {
    if (!entriesByDay.has(e.date)) entriesByDay.set(e.date, []);
    entriesByDay.get(e.date)!.push(e);
  }

  // Compute grid layout for the month
  const firstDOW = new Date(year, monthIndex, 1).getDay(); // 0=Sun
  const startOffset = (firstDOW + 6) % 7; // Mon-first: Mon=0, Sun=6
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const upcoming = contentItems
    .filter((c) => c.status === "Scheduled" || c.status === "Approved")
    .slice(0, 4);

  return (
    <>
      <header className="mt-6 lg:mt-10 mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-5">Calendar</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            <span className="italic">{month}</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            Drag posts between days. Quiet weekdays are flagged so you can fill them with a campaign.
          </p>
          {error && (
            <p className="mt-2 text-xs text-destructive">
              Error loading schedule from cloud.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="px-3 py-2.5 text-sm border hairline hover:bg-card leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={goNext}
            className="px-3 py-2.5 text-sm border hairline hover:bg-card leading-none"
            aria-label="Next month"
          >
            ›
          </button>
          <button className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] border hairline hover:bg-card">
            Week
          </button>
          <button className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite">
            Month
          </button>
          <Link
            to="/campaigns"
            className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] border hairline hover:bg-card"
          >
            Campaigns
          </Link>
        </div>
      </header>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-3">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-[0.25em] text-taupe pb-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border border hairline mb-12">
        {Array.from({ length: totalCells }, (_, i) => {
          const day = i - startOffset + 1;
          const inMonth = day >= 1 && day <= daysInMonth;

          if (!inMonth) {
            return <div key={i} className="bg-card/40 min-h-[110px] sm:min-h-[140px]" />;
          }

          const dayEntries = entriesByDay.get(day) ?? [];
          const primary = dayEntries[0] ?? null;
          // i % 7 gives day-of-week index in Mon-first grid: 0=Mon … 4=Fri, 5=Sat, 6=Sun
          const isWeekday = i % 7 < 5;
          const isQuiet = dayEntries.length === 0 && isWeekday && !loading;

          return (
            <div
              key={i}
              draggable={dayEntries.length > 0}
              onClick={() => setSelectedDay(day)}
              className={
                "bg-card min-h-[110px] sm:min-h-[140px] p-3 sm:p-4 flex flex-col gap-2 transition-colors cursor-pointer hover:bg-nude/20 " +
                (primary?.status === "scheduled" ? "ring-1 ring-inset ring-foreground/10" : "")
              }
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] tabular-nums text-taupe">
                  {String(day).padStart(2, "0")}
                </span>
                {isQuiet ? (
                  <span className="text-[8px] uppercase tracking-widest text-taupe/50">Quiet</span>
                ) : primary?.status && primary.status !== "rest" ? (
                  <span className={"size-1.5 rounded-full " + STATUS_DOT[primary.status]} />
                ) : null}
              </div>
              {dayEntries.length > 0 ? (
                <div className="mt-auto space-y-1">
                  {dayEntries.slice(0, 2).map((e, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setSelectedEntry(e); }}
                      className="w-full text-left hover:bg-foreground/5 rounded-sm px-1 -mx-1 py-0.5 transition-colors"
                    >
                      <p className="text-[11px] font-medium leading-tight tracking-tight line-clamp-1">{e.title}</p>
                      <p className="text-[10px] text-taupe">{e.type}</p>
                    </button>
                  ))}
                  {dayEntries.length > 2 && (
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setSelectedEntry(dayEntries[2]); }}
                      className="text-[9px] text-taupe/70 hover:text-foreground transition-colors"
                    >
                      +{dayEntries.length - 2} more
                    </button>
                  )}
                </div>
              ) : (
                <p className={
                  "text-[10px] italic mt-auto " +
                  (isQuiet ? "text-taupe/60" : "text-taupe/40")
                }>
                  {isQuiet ? "Fill with a post" : "Open slot"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mb-12 text-[10px] uppercase tracking-widest text-taupe">
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-foreground" /> Scheduled</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-taupe/60" /> Draft</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-sage" /> Published</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full border border-taupe/40" /> Open slot</span>
        <span className="flex items-center gap-2"><span className="text-[8px] uppercase tracking-widest">Quiet</span> Quiet weekday</span>
      </div>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Campaigns */}
        <section className="col-span-12 lg:col-span-5">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="eyebrow">Active campaigns</h2>
            <Link to="/campaigns" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
              All →
            </Link>
          </div>
          <div className="space-y-px bg-border">
            {campaigns.length === 0 ? (
               <div className="bg-card p-6 text-sm text-taupe italic">No active campaigns.</div>
            ) : campaigns.map((c) => (
              <div key={c.id} className="bg-card p-6">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="font-serif text-xl">{c.name}</p>
                  <span className="text-[10px] uppercase tracking-widest text-sage">{c.status}</span>
                </div>
                <p className="text-xs text-taupe mb-3">{c.goal}</p>
                <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-taupe mb-2">
                  <span>{c.window}</span>
                  <span>{c.posts} posts</span>
                </div>
                <div className="h-px bg-border relative">
                  <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${c.progress * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h3 className="eyebrow mb-4">Posting cadence</h3>
            <div className="artifact p-6 space-y-4">
              <Cadence label="Posts per week" value="4" />
              <Cadence label="Reels per week" value="1" />
              <Cadence label="Stories per day" value="1" />
              <Cadence label="Booking-driven posts" value="2 / week" />
            </div>
          </div>
        </section>

        {/* Upcoming queue */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Scheduled and approved</h2>
          <div className="space-y-px bg-border">
            {upcoming.length === 0 ? (
              <div className="bg-card p-6 text-sm text-taupe italic">
                No scheduled content yet. Generate and approve content to see it here.
              </div>
            ) : upcoming.map((c) => {
              const whenLabel = c.scheduledFor
                ? new Date(c.scheduledFor).toLocaleDateString("en-GB", { weekday: "short" }) +
                  " · " +
                  new Date(c.scheduledFor).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                : null;
              return (
                <div key={c.id} className="bg-card p-5 flex items-start gap-5">
                  <div className="size-20 sm:size-24 shrink-0 overflow-hidden bg-nude/30">
                    <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="eyebrow mb-1">{c.type} · {c.pillar}</p>
                    <p className="font-serif text-xl leading-snug mb-1">{c.title}</p>
                    <p className="text-xs text-taupe leading-relaxed line-clamp-2">{c.caption}</p>
                  </div>
                  <div className="text-right hidden sm:block shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">When</p>
                    <p className="text-sm font-medium">{whenLabel ?? "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

    <ScheduleModal
      open={selectedDay !== null}
      onClose={() => setSelectedDay(null)}
      day={selectedDay ?? 1}
      year={year}
      monthIndex={monthIndex}
      contentItems={contentItems}
      onScheduled={refresh}
    />
    <EntryDetailModal
      entry={selectedEntry}
      dayEntries={selectedEntry ? (entriesByDay.get(selectedEntry.date) ?? []) : []}
      contentItems={contentItems}
      onClose={() => setSelectedEntry(null)}
      onMutated={() => { refresh(); setSelectedEntry(null); }}
    />
    </>
  );
}


function Cadence({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b hairline pb-3 last:border-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-widest text-taupe">{label}</span>
      <span className="font-serif text-lg">{value}</span>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── EntryDetailModal ────────────────────────────────────────────────────────

type EntryDetailModalProps = {
  entry: CalendarEntry | null;
  dayEntries: CalendarEntry[];
  contentItems: ContentItem[];
  onClose: () => void;
  onMutated: () => void;
};

function EntryDetailModal({ entry, dayEntries, contentItems, onClose, onMutated }: EntryDetailModalProps) {
  const [active, setActive] = useState<CalendarEntry | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync active entry when the modal opens or the clicked entry changes
  useEffect(() => { setActive(entry); }, [entry]);

  // Reset reschedule time whenever the active entry changes
  useEffect(() => {
    if (!active?.scheduledFor) return;
    setRescheduleTime(toDatetimeLocal(active.scheduledFor));
  }, [active?.scheduledFor]);

  const contentItem = active?.contentItemId
    ? contentItems.find((c) => c.id === active.contentItemId) ?? null
    : null;

  const handleReschedule = async () => {
    if (!active?.scheduledPostId || !rescheduleTime) return;
    setRescheduling(true);
    try {
      await api.patch(`/schedule/${active.scheduledPostId}`, {
        scheduledFor: new Date(rescheduleTime).toISOString(),
      });
      toast.success("Rescheduled");
      onMutated();
    } catch {
      toast.error("Reschedule failed. Try again.");
    } finally {
      setRescheduling(false);
    }
  };

  const handlePublishNow = async () => {
    if (!active?.scheduledPostId) return;
    setPublishing(true);
    try {
      await api.post(`/schedule/${active.scheduledPostId}/publish-now`);
      toast.success("Publishing initiated");
      onMutated();
    } catch {
      toast.error("Publish failed. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!active?.scheduledPostId) return;
    setDeleting(true);
    try {
      await api.delete(`/schedule/${active.scheduledPostId}`);
      toast.success("Post cancelled");
      onMutated();
    } catch {
      toast.error("Could not cancel. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const scheduledLabel = active?.scheduledFor
    ? new Date(active.scheduledFor).toLocaleString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const showList = dayEntries.length > 1;

  return (
    <Dialog open={entry !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">

        {/* ── Entries list (shown when day has multiple posts) ── */}
        {showList && (
          <div className="border-b hairline">
            <p className="px-6 pt-5 pb-2 text-[10px] uppercase tracking-widest text-taupe">
              {dayEntries.length} posts · {active
                ? new Date(active.scheduledFor ?? "").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
                : ""}
            </p>
            <div className="space-y-px bg-border mx-6 mb-4 border hairline">
              {dayEntries.map((e, i) => {
                const isActive = active?.scheduledPostId === e.scheduledPostId;
                const timeLabel = e.scheduledFor
                  ? new Date(e.scheduledFor).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(e)}
                    className={
                      "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors " +
                      (isActive ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/20")
                    }
                  >
                    <span className={"size-1.5 rounded-full shrink-0 " + STATUS_DOT[e.status]} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium line-clamp-1 leading-tight">{e.title}</p>
                      <p className={"text-[10px] mt-0.5 " + (isActive ? "text-offwhite/60" : "text-taupe")}>
                        {e.type}{timeLabel ? ` · ${timeLabel}` : ""}
                      </p>
                    </div>
                    <span className={
                      "text-[9px] uppercase tracking-widest px-1.5 py-0.5 shrink-0 " +
                      (e.status === "published"
                        ? isActive ? "bg-sage/30 text-sage" : "bg-sage/20 text-sage"
                        : isActive ? "bg-offwhite/10 text-offwhite/70" : "bg-foreground/8 text-taupe")
                    }>
                      {e.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active entry detail ── */}
        {contentItem?.image && (
          <div className="h-32 w-full overflow-hidden bg-nude/30">
            <img src={contentItem.image} alt={active?.title} className="w-full h-full object-cover" />
          </div>
        )}

        <DialogHeader className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">
                {active?.platform ? <span className="capitalize">{active.platform}</span> : null}
                {active?.platform && active?.type ? " · " : null}
                {active?.type}
              </p>
              <DialogTitle className="font-serif text-xl font-normal leading-snug">
                {active?.title}
              </DialogTitle>
            </div>
            {!showList && (
              <span className={
                "shrink-0 mt-0.5 text-[9px] uppercase tracking-widest px-2 py-1 " +
                (active?.status === "published" ? "bg-sage/20 text-sage"
                  : active?.status === "scheduled" ? "bg-foreground/10 text-foreground"
                  : "bg-taupe/10 text-taupe")
              }>
                {active?.status}
              </span>
            )}
          </div>
          {scheduledLabel && (
            <DialogDescription className="text-xs text-taupe mt-1">{scheduledLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-60 overflow-y-auto">
          {contentItem?.caption && (
            <p className="text-sm text-taupe leading-relaxed line-clamp-3">{contentItem.caption}</p>
          )}

          {active?.status !== "published" && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Reschedule</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="flex-1 border hairline bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                />
                <button
                  type="button"
                  onClick={handleReschedule}
                  disabled={!rescheduleTime || rescheduling}
                  className="px-4 py-2.5 text-[10px] uppercase tracking-widest border hairline hover:bg-card disabled:opacity-40"
                >
                  {rescheduling ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-0 flex-row justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || active?.status === "published"}
            className="px-4 py-2.5 text-[10px] uppercase tracking-widest text-destructive border border-destructive/30 hover:bg-destructive/5 disabled:opacity-30"
          >
            {deleting ? "Cancelling…" : "Cancel post"}
          </button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <button type="button" className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] border hairline hover:bg-card">
                Close
              </button>
            </DialogClose>
            {active?.status === "scheduled" && (
              <button
                type="button"
                onClick={handlePublishNow}
                disabled={publishing}
                className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite disabled:opacity-40"
              >
                {publishing ? "Publishing…" : "Publish now"}
              </button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ScheduleModal ────────────────────────────────────────────────────────────

type PostFormat = "feed" | "story" | "reel" | "carousel";

type ScheduleModalProps = {
  open: boolean;
  onClose: () => void;
  day: number;
  year: number;
  monthIndex: number;
  contentItems: ContentItem[];
  onScheduled: () => void;
};

function ScheduleModal({ open, onClose, day, year, monthIndex, contentItems, onScheduled }: ScheduleModalProps) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [postFormat, setPostFormat] = useState<PostFormat>("feed");
  const [submitting, setSubmitting] = useState(false);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const mm = String(monthIndex + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    setScheduleTime(`${year}-${mm}-${dd}T09:00`);
    setSelectedItemId("");
    setSearch("");
  }, [open, day, year, monthIndex]);

  useEffect(() => {
    if (!open) return;
    api.get("/social-accounts")
      .then((res) => {
        const accounts: any[] = res.data?.data ?? res.data ?? [];
        setSocialAccounts(accounts);
      })
      .catch(() => {});
  }, [open]);

  const schedulable = contentItems.filter(
    (c) => c.status === "Approved" || c.status === "Needs review" || c.status === "Scheduled"
  );
  const filtered = search.trim()
    ? schedulable.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.caption.toLowerCase().includes(search.toLowerCase())
      )
    : schedulable;

  const selectedItem = schedulable.find((c) => c.id === selectedItemId) ?? null;
  const connected = socialAccounts.find((a) => a.status === "connected") ?? null;

  useEffect(() => {
    if (!selectedItem) return;
    const fmt: PostFormat =
      selectedItem.type === "Reel" ? "reel" :
      selectedItem.type === "Story" ? "story" : "feed";
    setPostFormat(fmt);
  }, [selectedItemId]);

  const handleSubmit = async () => {
    if (!selectedItem || !scheduleTime) return;
    if (!connected) {
      toast.error("No connected social account. Connect one in Settings.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/schedule", {
        contentItemId: selectedItem.id,
        socialAccountId: connected.id,
        platform: connected.platform,
        postFormat,
        scheduledFor: new Date(scheduleTime).toISOString(),
      });
      const label = new Date(scheduleTime).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      toast.success(`Scheduled for ${label}`);
      onScheduled();
      onClose();
    } catch {
      toast.error("Schedule failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const monthLabel = new Date(year, monthIndex).toLocaleString("default", { month: "long" });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-serif text-2xl font-normal">
            Schedule for {String(day).padStart(2, "0")} {monthLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-taupe">
            Pick content, set a time, and confirm your platform.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Time */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Time</label>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full border hairline bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>

          {/* Content picker */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Content</label>
            <input
              type="text"
              placeholder="Search content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border hairline bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground mb-px"
            />
            <div className="max-h-48 overflow-y-auto space-y-px bg-border border hairline">
              {filtered.length === 0 ? (
                <div className="bg-card px-4 py-3 text-sm text-taupe italic">
                  No approved content found.
                </div>
              ) : (
                filtered.slice(0, 20).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedItemId(c.id)}
                    className={
                      "w-full text-left bg-card px-4 py-3 flex items-start gap-3 transition-colors hover:bg-nude/20 " +
                      (selectedItemId === c.id ? "ring-1 ring-inset ring-foreground" : "")
                    }
                  >
                    <img
                      src={c.image}
                      alt=""
                      className="size-10 shrink-0 object-cover bg-nude/30"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight line-clamp-1">{c.title}</p>
                      <p className="text-[10px] text-taupe mt-0.5">{c.type} · {c.status}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-taupe block mb-2">Format</label>
            <div className="flex gap-px bg-border border hairline">
              {(["feed", "story", "reel", "carousel"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPostFormat(f)}
                  className={
                    "flex-1 py-2.5 text-[10px] uppercase tracking-widest transition-colors " +
                    (postFormat === f
                      ? "bg-foreground text-offwhite"
                      : "bg-card hover:bg-nude/20 text-taupe")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          {connected ? (
            <p className="text-[11px] text-taupe">
              Platform:{" "}
              <span className="text-foreground capitalize">{connected.platform}</span>
              {connected.accountName ? ` · ${connected.accountName}` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-destructive">
              No connected social account —{" "}
              <Link to="/profile" className="underline underline-offset-2 hover:text-foreground">
                connect one in Profile
              </Link>{" "}
              to publish.
            </p>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-0">
          <DialogClose asChild>
            <button
              type="button"
              className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] border hairline hover:bg-card"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedItemId || !scheduleTime || submitting}
            className="px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite disabled:opacity-40"
          >
            {submitting ? "Scheduling…" : "Schedule"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
