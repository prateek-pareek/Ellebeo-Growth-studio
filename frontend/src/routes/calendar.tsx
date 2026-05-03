import { createFileRoute, Link } from "@tanstack/react-router";
import { useCalendar } from "@/lib/providers/calendar-provider";
import { useContentItems } from "@/lib/providers/content-provider";
import { useCampaigns } from "@/lib/providers/campaign-provider";

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
  const { entries, month, loading, error } = useCalendar();
  const { items: contentItems } = useContentItems();
  const { data: campaigns } = useCampaigns();

  // Build a 28-slot grid from calendar entries (keyed by day of month)
  const entryByDay = new Map(entries.map((e) => [e.date, e]));
  const grid = Array.from({ length: 28 }, (_, i) => entryByDay.get(i + 1) ?? null);

  const upcoming = contentItems
    .filter((c) => c.status === "Scheduled" || c.status === "Approved")
    .slice(0, 4);

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-5">Calendar</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            <span className="italic">{month}</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            {loading ? "Loading your schedule…" : "Your live posting schedule, synced from the backend."}
          </p>
          {error && (
            <p className="mt-2 text-xs text-destructive">
              Error loading schedule from cloud.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        {grid.map((d, i) => (
          <div
            key={i}
            draggable={!!d?.title}
            className={
              "bg-card min-h-[110px] sm:min-h-[140px] p-3 sm:p-4 flex flex-col gap-2 transition-colors hover:bg-nude/20 cursor-grab " +
              (d?.status === "scheduled" ? "ring-1 ring-inset ring-foreground/10" : "")
            }
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] tabular-nums text-taupe">
                {d ? String(d.date).padStart(2, "0") : "·"}
              </span>
              {d?.status && d.status !== "rest" && (
                <span className={"size-1.5 rounded-full " + STATUS_DOT[d.status]} />
              )}
            </div>
            {d?.title ? (
              <div className="mt-auto">
                <p className="text-[11px] font-medium leading-tight tracking-tight line-clamp-2">{d.title}</p>
                <p className="text-[10px] text-taupe mt-1">{d.type}</p>
              </div>
            ) : d?.status === "rest" ? (
              <p className="text-[10px] italic text-taupe/60 mt-auto">Open slot</p>
            ) : loading ? (
              <p className="text-[10px] italic text-taupe/30 mt-auto">—</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mb-12 text-[10px] uppercase tracking-widest text-taupe">
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-foreground" /> Scheduled</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-taupe/60" /> Draft</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-sage" /> Published</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-taupe/20" /> Open slot</span>
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
            ) : upcoming.map((c) => (
              <div key={c.id} className="bg-card p-5 flex items-center gap-5">
                <div className="size-16 sm:size-20 shrink-0 overflow-hidden bg-nude/30 ring-1 ring-border">
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="eyebrow mb-1">{c.type} · {c.pillar}</p>
                  <p className="font-serif text-lg truncate">{c.title}</p>
                  <p className="text-xs text-taupe line-clamp-1 mt-0.5">{c.caption}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] uppercase tracking-widest text-taupe">When</p>
                  <p className="text-sm">{c.scheduledFor ? new Date(c.scheduledFor).toLocaleDateString() : "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
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
