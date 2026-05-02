import { createFileRoute, Link } from "@tanstack/react-router";
import {
  appointments,
  brandDNA,
  calendarEntries,
  contentLibrary,
  insights,
  technician,
} from "@/lib/sample-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Elle.Be.O Growth" },
      { name: "description", content: "Today at a glance: posts to review, consent to chase, bookings, and what to post next — all powered by your Brand DNA." },
      { property: "og:title", content: "Home — Elle.Be.O Growth" },
      { property: "og:description", content: "Your AI marketing studio for beauty professionals." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const week = calendarEntries.slice(0, 7);
  const reviewQueue = contentLibrary.filter((c) => c.status === "Needs review").slice(0, 2);
  const todayAppointments = appointments.filter((a) => a.date.startsWith("Today"));

  return (
    <div>
      {/* Greeting + today summary */}
      <section className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">Tuesday · March 3</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-balance">
          Good morning, <span className="italic">{technician.firstName}.</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe font-light leading-relaxed">
          You have <span className="text-foreground font-medium">{todayAppointments.length} appointments today</span>,{" "}
          <span className="text-foreground font-medium">{insights.postsReadyForReview} posts ready for review</span>, and{" "}
          <span className="text-foreground font-medium">{insights.consentPending} client consent</span> still pending.
        </p>
      </section>

      {/* BRAND DNA — the intelligence layer */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <p className="eyebrow">Your Brand DNA</p>
          <Link to="/brand" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            Open Brand DNA →
          </Link>
        </div>

        <div className="artifact p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="size-1.5 rounded-full bg-sage" />
              <span className="text-[10px] uppercase tracking-widest text-sage">Active · powering this account</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl leading-tight mb-3">
              <span className="italic">{brandDNA.archetype}</span>
            </h2>
            <p className="text-sm text-taupe leading-relaxed mb-5">{brandDNA.oneLiner}</p>

            <div className="flex items-center gap-3 mb-6">
              <span className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5">
                {brandDNA.category}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-taupe">Voice · {brandDNA.voice.summary}</span>
            </div>

            <div className="flex gap-1.5">
              {brandDNA.palette.map((c) => (
                <div key={c} className="size-7 rounded-sm" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 lg:border-l lg:hairline lg:pl-10">
            <p className="text-sm text-foreground leading-relaxed mb-5">
              Your Brand DNA is the intelligence layer of Elle.Be.O Growth. It powers every part of the product so the work feels like
              <em className="not-italic font-medium"> you</em>, not a generic template.
            </p>
            <ul className="space-y-3">
              {brandDNA.powers.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm">
                  <span className="mt-2 size-1 rounded-full bg-foreground shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/brand/onboarding"
                className="text-[10px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card"
              >
                Refine Brand DNA
              </Link>
              <Link
                to="/generate"
                className="text-[10px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
              >
                Generate content
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Action strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline mb-16">
        <Link to="/content" className="bg-card p-6 hover:bg-nude/30 transition-colors">
          <p className="eyebrow mb-3">Review</p>
          <p className="font-serif text-3xl mb-1 tabular-nums">{insights.postsReadyForReview}</p>
          <p className="text-sm text-taupe">posts are ready for review</p>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 inline-block">
            Open queue →
          </p>
        </Link>
        <Link to="/appointments" className="bg-card p-6 hover:bg-nude/30 transition-colors">
          <p className="eyebrow mb-3">Consent</p>
          <p className="font-serif text-3xl mb-1 tabular-nums">{insights.consentPending}</p>
          <p className="text-sm text-taupe">client consent waiting</p>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 inline-block">
            Send reminder →
          </p>
        </Link>
        <Link to="/calendar" className="bg-card p-6 hover:bg-nude/30 transition-colors">
          <p className="eyebrow mb-3">This week</p>
          <p className="font-serif text-3xl mb-1 tabular-nums">{insights.scheduledThisWeek}</p>
          <p className="text-sm text-taupe">posts scheduled</p>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 inline-block">
            Open calendar →
          </p>
        </Link>
      </section>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Today's appointments */}
        <section className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="eyebrow">Today's appointments</h2>
            <Link to="/appointments" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
              All appointments →
            </Link>
          </div>
          <div className="space-y-px bg-border">
            {todayAppointments.map((a) => (
              <div key={a.id} className="bg-card p-5 sm:p-6 flex items-center gap-5">
                <div className="hidden sm:block size-16 shrink-0 overflow-hidden bg-nude/30 ring-1 ring-border">
                  {a.beforeImage && <img src={a.beforeImage} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="eyebrow mb-1">{a.date} · {a.category}</p>
                  <p className="font-serif text-lg truncate">{a.clientName}</p>
                  <p className="text-xs text-taupe truncate">{a.service}</p>
                </div>
                <div className="text-right">
                  <ConsentBadge status={a.consent} />
                  <Link
                    to="/generate"
                    search={{ appointment: a.id }}
                    className="block mt-2 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5"
                  >
                    Turn into content
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Posts to review */}
        <section className="col-span-12 lg:col-span-5">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="eyebrow">Posts ready for review</h2>
            <Link to="/content" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
              Review all →
            </Link>
          </div>

          <div className="space-y-6">
            {reviewQueue.map((c) => (
              <article key={c.id} className="flex gap-4">
                <div className="aspect-[4/5] w-24 shrink-0 overflow-hidden bg-nude/30 ring-1 ring-border">
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow mb-1">{c.type} · {c.pillar}</p>
                  <h3 className="font-serif text-lg leading-tight mb-2">{c.title}</h3>
                  <p className="text-xs text-taupe leading-relaxed line-clamp-2">{c.caption}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      to="/content"
                      className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe"
                    >
                      Review →
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Bookings + week */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Bookings this week</h2>
          <div className="artifact p-6">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-serif text-4xl tabular-nums">{insights.bookingsThisWeek}</span>
              <span className="text-xs text-taupe">target {insights.bookingsTarget}</span>
            </div>
            <div className="h-px bg-border relative mb-3">
              <div
                className="absolute inset-y-0 left-0 bg-foreground"
                style={{ width: `${(insights.bookingsThisWeek / insights.bookingsTarget) * 100}%` }}
              />
            </div>
            <p className="text-xs text-taupe">
              4 bookings short of target. Try a campaign to fill quiet weekdays.
            </p>
            <Link
              to="/campaigns"
              className="mt-4 inline-block text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5"
            >
              Start a campaign →
            </Link>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-5">
          <h2 className="eyebrow mb-4">This week at a glance</h2>
          <div className="grid grid-cols-7 border-t border-b hairline">
            {week.map((d, i) => (
              <div
                key={i}
                className={
                  "py-4 px-2 text-left " +
                  (i < week.length - 1 ? "border-r hairline" : "")
                }
              >
                <p className="text-[9px] uppercase tracking-widest text-taupe mb-3">
                  {d.weekday.slice(0, 1)}{String(d.date).padStart(2, "0")}
                </p>
                {d.title ? (
                  <span className="block size-1.5 rounded-full bg-foreground" />
                ) : (
                  <span className="block size-1.5 rounded-full bg-taupe/20" />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ConsentBadge({ status }: { status: "granted" | "pending" | "declined" | "not_requested" }) {
  const map: Record<string, { label: string; cls: string }> = {
    granted: { label: "Consent granted", cls: "text-sage" },
    pending: { label: "Consent pending", cls: "text-foreground" },
    declined: { label: "Consent declined", cls: "text-destructive" },
    not_requested: { label: "Consent required", cls: "text-taupe" },
  };
  const m = map[status];
  return <span className={"text-[10px] uppercase tracking-widest " + m.cls}>{m.label}</span>;
}
