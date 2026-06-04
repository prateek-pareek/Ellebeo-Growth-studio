import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppointments } from "@/lib/providers/appointments-provider";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { useCalendar } from "@/lib/providers/calendar-provider";
import { useContentItems } from "@/lib/providers/content-provider";
import { useProfile } from "@/lib/providers/profile-provider";

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
  const { technician } = useProfile();
  const { data: brandDNA } = useBrandDna();
  const { data: appointments } = useAppointments();
  const { items: contentItems } = useContentItems();
  const { entries: calendarEntries } = useCalendar();

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = technician.name.split(" ")[0] || "there";

  const dateLabel =
    now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase() +
    " · " +
    now.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();

  const todayISO = now.toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => a.rawDate === todayISO);

  const reviewQueue = contentItems.filter((c) => c.status === "Needs review").slice(0, 2);
  const postsReadyForReview = contentItems.filter((c) => c.status === "Needs review").length;
  const consentPending = appointments.filter(
    (a) => a.consent === "pending" || a.consent === "not_requested"
  ).length;
  const scheduledThisWeek = contentItems.filter((c) => c.status === "Scheduled").length;

  // Bookings this week (Mon–Sun)
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const bookingsThisWeek = appointments.filter((a) => {
    if (!a.rawDate) return false;
    const d = new Date(a.rawDate + "T12:00:00");
    return d >= monday && d <= sunday;
  }).length;
  const bookingTarget = brandDNA?.goals?.bookingsPerWeek || 0;
  const bookingShortfall = bookingTarget > 0 ? Math.max(0, bookingTarget - bookingsThisWeek) : 0;

  // Week at a glance (Mon–Sun of current week)
  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const label = DAY_LABELS[i] + String(d.getDate()).padStart(2, "0");
    const hasContent = calendarEntries.some((e) => e.date === d.getDate());
    const isToday = d.toISOString().slice(0, 10) === todayISO;
    return { label, hasContent, isToday };
  });

  return (
    <div>
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <section className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">{dateLabel}</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          {greeting}, <span className="italic">{firstName}.</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          You have{" "}
          <span className="text-foreground font-medium">{todayAppointments.length} appointments today</span>,{" "}
          <span className="text-foreground font-medium">{postsReadyForReview} posts ready for review</span>, and{" "}
          <span className="text-foreground font-medium">{consentPending} client consent</span>{" "}
          still pending.
        </p>
      </section>

      {/* ── Brand DNA ────────────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <p className="eyebrow">Your Brand DNA</p>
          <Link to="/brand" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            Open Brand DNA →
          </Link>
        </div>

        {!brandDNA ? (
          <div className="artifact p-10 text-center">
            <p className="text-taupe italic text-sm mb-4">No Brand DNA set up yet.</p>
            <Link
              to="/brand/onboarding"
              className="text-[10px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-5 py-2.5 hover:bg-taupe transition-colors"
            >
              Build your Brand DNA
            </Link>
          </div>
        ) : (
          <div className="artifact p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
            {/* Left — identity */}
            <div className="lg:col-span-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="size-1.5 rounded-full bg-sage shrink-0" />
                <span className="text-[10px] uppercase tracking-widest text-sage">Active · powering this account</span>
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl leading-tight italic mb-3">
                {brandDNA.archetype}
              </h2>
              {brandDNA.oneLiner && (
                <p className="text-sm text-taupe leading-relaxed mb-6">{brandDNA.oneLiner}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-6">
                {brandDNA.category && (
                  <span className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5">
                    {brandDNA.category}
                  </span>
                )}
                {brandDNA.voiceTones.length > 0 && (
                  <span className="text-[10px] uppercase tracking-widest text-taupe">
                    Voice · {brandDNA.voiceTones.join(" · ")}
                  </span>
                )}
              </div>
              {brandDNA.palette.length > 0 && (
                <div className="flex gap-2">
                  {brandDNA.palette.map((c, i) => (
                    <div
                      key={i}
                      className="size-7 rounded-sm border hairline"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right — what it powers */}
            <div className="lg:col-span-7 lg:border-l lg:hairline lg:pl-10">
              <p className="text-sm leading-relaxed mb-5">
                Your Brand DNA is the intelligence layer of{" "}
                <span className="font-medium">Elle.Be.O Growth</span>. It powers every part of the
                product so the work feels like{" "}
                <em className="not-italic font-medium">you</em>, not a generic template.
              </p>
              <ul className="space-y-2.5 mb-8">
                {brandDNA.powers.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-taupe">
                    <span className="mt-[7px] size-1 rounded-full bg-foreground/40 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/brand/onboarding"
                  className="text-[10px] uppercase tracking-[0.2em] border hairline px-4 py-2.5 hover:bg-card transition-colors"
                >
                  Refine Brand DNA
                </Link>
                <Link
                  to="/generate"
                  className="text-[10px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2.5 hover:bg-taupe transition-colors"
                >
                  Generate content
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline mb-12">
        <Link to="/content" className="bg-card p-6 hover:bg-nude/30 transition-colors group">
          <p className="eyebrow mb-3">Review</p>
          <p className="font-serif text-5xl mb-2 tabular-nums">{postsReadyForReview}</p>
          <p className="text-sm text-taupe mb-5">posts are ready for review</p>
          <span className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 group-hover:border-foreground transition-colors">
            Open queue →
          </span>
        </Link>

        <div className="bg-card p-6">
          <p className="eyebrow mb-3">Consent</p>
          <p className="font-serif text-5xl mb-2 tabular-nums">{consentPending}</p>
          <p className="text-sm text-taupe mb-5">client consent waiting</p>
          <Link
            to="/appointments"
            className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:border-foreground transition-colors"
          >
            Send reminder →
          </Link>
        </div>

        <Link to="/calendar" className="bg-card p-6 hover:bg-nude/30 transition-colors group">
          <p className="eyebrow mb-3">This week</p>
          <p className="font-serif text-5xl mb-2 tabular-nums">{scheduledThisWeek}</p>
          <p className="text-sm text-taupe mb-5">posts scheduled</p>
          <span className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 group-hover:border-foreground transition-colors">
            Open calendar →
          </span>
        </Link>
      </section>

      {/* ── Main two-col grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-8 lg:gap-12">

        {/* Left col ─ appointments + bookings */}
        <div className="col-span-12 lg:col-span-7 space-y-10">

          {/* Today's appointments */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="eyebrow">Today's appointments</h2>
              <Link to="/appointments" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
                All appointments →
              </Link>
            </div>
            <div className="space-y-px bg-border">
              {todayAppointments.length === 0 ? (
                <div className="bg-card p-10 text-center text-taupe italic text-sm">
                  No appointments scheduled for today.
                </div>
              ) : (
                todayAppointments.map((a) => (
                  <div key={a.id} className="bg-card p-5 flex items-center gap-4">
                    <div className="size-[52px] shrink-0 overflow-hidden bg-nude/40">
                      {a.afterPhotoUrl || a.beforePhotoUrl ? (
                        <img
                          src={(a.afterPhotoUrl ?? a.beforePhotoUrl)!}
                          alt={a.clientName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-nude/60" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="eyebrow mb-1">Today · {a.timeLabel} · {a.category}</p>
                      <p className="font-serif text-lg leading-tight truncate">{a.clientName}</p>
                      <p className="text-xs text-taupe truncate">{a.service}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <ConsentBadge status={a.consent as any} />
                      <Link
                        to="/generate"
                        search={{ appointment: a.id }}
                        className="block mt-2 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 hover:text-taupe hover:border-taupe transition-colors"
                      >
                        Turn into content
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Bookings this week */}
          <section>
            <h2 className="eyebrow mb-6">Bookings this week</h2>
            <div className="artifact p-6">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-serif text-5xl tabular-nums">{bookingsThisWeek}</span>
                {bookingTarget > 0 && (
                  <span className="text-xs text-taupe">target {bookingTarget}</span>
                )}
              </div>

              {bookingTarget > 0 ? (
                <>
                  <div className="h-px bg-border relative my-4">
                    <div
                      className="absolute inset-y-0 left-0 bg-foreground transition-all"
                      style={{ width: `${Math.min(100, (bookingsThisWeek / bookingTarget) * 100)}%` }}
                    />
                  </div>
                  {bookingShortfall > 0 ? (
                    <p className="text-xs text-taupe mb-4">
                      {bookingShortfall} booking{bookingShortfall !== 1 ? "s" : ""} short of target.{" "}
                      <Link to="/campaigns" className="text-foreground underline underline-offset-2 hover:text-taupe">
                        Try a campaign to fill quiet weekdays.
                      </Link>
                    </p>
                  ) : (
                    <p className="text-xs text-sage mb-4">On track to meet your weekly target.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-taupe mt-2 mb-4">
                  Set a booking target in your{" "}
                  <Link to="/brand/onboarding" className="text-foreground underline underline-offset-2">
                    Brand DNA
                  </Link>{" "}
                  to track progress.
                </p>
              )}

              <Link
                to="/campaigns"
                className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:border-foreground transition-colors"
              >
                Start a campaign →
              </Link>
            </div>
          </section>
        </div>

        {/* Right col ─ review queue + week glance */}
        <div className="col-span-12 lg:col-span-5 space-y-10">

          {/* Posts ready for review */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="eyebrow">Posts ready for review</h2>
              <Link to="/content" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
                Review all →
              </Link>
            </div>
            <div className="space-y-px bg-border">
              {reviewQueue.length === 0 ? (
                <div className="bg-card p-6 text-sm text-taupe italic">
                  All caught up — no posts waiting for review.
                </div>
              ) : (
                reviewQueue.map((c) => (
                  <div key={c.id} className="bg-card p-4 flex items-start gap-4">
                    <div className="w-16 aspect-[4/5] shrink-0 overflow-hidden bg-nude/30">
                      <img
                        src={c.image}
                        alt={c.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow mb-1">{c.type} · {c.pillar}</p>
                      <h3 className="font-serif text-base leading-snug mb-1">{c.title}</h3>
                      <p className="text-xs text-taupe leading-relaxed line-clamp-2">{c.caption}</p>
                      <Link
                        to="/content"
                        className="mt-3 inline-block text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:border-foreground transition-colors"
                      >
                        Review →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* This week at a glance */}
          <section>
            <h2 className="eyebrow mb-6">This week at a glance</h2>
            <div className="grid grid-cols-7 border hairline bg-border gap-px">
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  className={"bg-card py-4 px-1 text-center " + (d.isToday ? "bg-nude/30" : "")}
                >
                  <p className={
                    "text-[9px] uppercase tracking-wide mb-3 " +
                    (d.isToday ? "text-foreground font-semibold" : "text-taupe")
                  }>
                    {d.label}
                  </p>
                  {d.hasContent ? (
                    <span className="block size-1.5 rounded-full bg-foreground mx-auto" />
                  ) : (
                    <span className="block text-[10px] text-taupe/40 leading-none mx-auto">–</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ConsentBadge({ status }: { status: "granted" | "pending" | "declined" | "not_requested" }) {
  const map: Record<string, { label: string; cls: string }> = {
    granted:      { label: "Consent granted",  cls: "text-sage" },
    pending:      { label: "Consent pending",  cls: "text-foreground" },
    declined:     { label: "Consent declined", cls: "text-destructive" },
    not_requested:{ label: "Consent required", cls: "text-taupe" },
  };
  const m = map[status] ?? map["not_requested"];
  return <span className={"text-[10px] uppercase tracking-widest " + m.cls}>{m.label}</span>;
}
