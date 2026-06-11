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

  const reviewQueue         = contentItems.filter((c) => c.status === "Needs review").slice(0, 2);
  const postsReadyForReview = contentItems.filter((c) => c.status === "Needs review").length;
  const consentPending      = appointments.filter(
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
  const bookingTarget   = brandDNA?.goals?.bookingsPerWeek || 0;
  const bookingShortfall = bookingTarget > 0 ? Math.max(0, bookingTarget - bookingsThisWeek) : 0;

  // Week at a glance (Mon–Sun of current week)
  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const label     = DAY_LABELS[i] + String(d.getDate()).padStart(2, "0");
    const hasContent = calendarEntries.some((e) => e.date === d.getDate());
    const isToday   = d.toISOString().slice(0, 10) === todayISO;
    return { label, hasContent, isToday };
  });

  return (
    <div>
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <section className="relative mt-6 lg:mt-10 mb-10 overflow-hidden border border-nude/60 bg-card p-6 sm:p-8 shadow-sm">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-taupe via-sage to-sage opacity-90"
          aria-hidden
        />
        <div className="pl-4 sm:pl-5">
          <p className="eyebrow mb-4">{dateLabel}</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            {greeting}, <span className="italic">{firstName}.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-taupe leading-relaxed max-w-[68ch]">
            You have{" "}
            <span className="text-foreground font-medium">{todayAppointments.length} appointments today</span>,{" "}
            <span className="text-foreground font-medium">{postsReadyForReview} posts ready for review</span>, and{" "}
            <span className="text-foreground font-medium">{consentPending} client consent</span>{" "}
            still pending.
          </p>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="mb-10 border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted px-5 py-3 border-b border-border">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            At a glance
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <Link
            to="/content"
            className="px-6 py-5 group hover:bg-nude/20 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
              Review
            </p>
            <p className="mt-2 font-serif text-4xl tabular-nums">{postsReadyForReview}</p>
            <p className="text-xs text-taupe mt-1 mb-3">posts ready for review</p>
            <span className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 group-hover:border-foreground transition-colors">
              Open queue →
            </span>
          </Link>

          <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
              Consent
            </p>
            <p className="mt-2 font-serif text-4xl tabular-nums">{consentPending}</p>
            <p className="text-xs text-taupe mt-1 mb-3">client consent waiting</p>
            <Link
              to="/appointments"
              className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:border-foreground transition-colors"
            >
              Send reminder →
            </Link>
          </div>

          <Link
            to="/calendar"
            className="px-6 py-5 group hover:bg-nude/20 transition-colors"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
              This week
            </p>
            <p className="mt-2 font-serif text-4xl tabular-nums">{scheduledThisWeek}</p>
            <p className="text-xs text-taupe mt-1 mb-3">posts scheduled</p>
            <span className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 group-hover:border-foreground transition-colors">
              Open calendar →
            </span>
          </Link>
        </div>
      </section>

      {/* ── Brand DNA ────────────────────────────────────────────────────── */}
      <section className="mb-10 border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Your Brand DNA
          </h2>
          <Link
            to="/brand"
            className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
          >
            Open Brand DNA →
          </Link>
        </div>

        {!brandDNA ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-12 text-center bg-muted/20">
            <p className="eyebrow mb-2">Not set up yet</p>
            <p className="text-sm text-taupe mb-4 max-w-[40ch] mx-auto">
              Build your Brand DNA to power every piece of content this account generates.
            </p>
            <Link
              to="/brand/onboarding"
              className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-4 py-2.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
            >
              Build your Brand DNA
            </Link>
          </div>
        ) : (
          <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
            {/* Left — identity */}
            <div className="lg:col-span-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="size-1.5 rounded-full bg-sage shrink-0" />
                <span className="text-[10px] uppercase tracking-widest text-sage">Active · powering this account</span>
              </div>
              <h3 className="font-serif text-2xl sm:text-3xl leading-tight italic mb-3">
                {brandDNA.archetype}
              </h3>
              {brandDNA.oneLiner && (
                <p className="text-sm text-taupe leading-relaxed mb-5">{brandDNA.oneLiner}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-5">
                {brandDNA.category && (
                  <span className="text-[10px] uppercase tracking-widest border border-border bg-muted px-3 py-1.5">
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
                      className="size-7 border border-border"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right — powers */}
            <div className="lg:col-span-7 lg:border-l lg:border-border lg:pl-10">
              <p className="text-sm leading-relaxed mb-4">
                Your Brand DNA is the intelligence layer of{" "}
                <span className="font-medium">Elle.Be.O Growth</span>. It powers every part of the
                product so the work feels like{" "}
                <em className="not-italic font-medium">you</em>, not a generic template.
              </p>
              <ul className="space-y-2.5 mb-7">
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
                  className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
                >
                  Refine Brand DNA
                </Link>
                <Link
                  to="/generate"
                  className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
                >
                  Generate content
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Main two-col grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-8 lg:gap-10">

        {/* Left col — today's appointments + bookings */}
        <div className="col-span-12 lg:col-span-7 space-y-8">

          {/* Today's appointments */}
          <section className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Today's appointments
              </h2>
              <Link
                to="/appointments"
                className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
              >
                All appointments →
              </Link>
            </div>
            {todayAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-5 py-10 text-center bg-muted/20">
                <p className="text-sm text-taupe italic">No appointments scheduled for today.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {todayAppointments.map((a) => (
                  <div key={a.id} className="px-5 py-4 flex items-center gap-4 hover:bg-nude/20 transition-colors">
                    <div className="size-[48px] shrink-0 overflow-hidden bg-nude/40 border border-border">
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
                      <p className="eyebrow mb-0.5">Today · {a.timeLabel} · {a.category}</p>
                      <p className="font-serif text-base leading-tight truncate">{a.clientName}</p>
                      <p className="text-xs text-taupe truncate">{a.service}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <ConsentBadge status={a.consent as any} />
                      <Link
                        to="/generate"
                        search={{ appointment: a.id }}
                        className="block mt-1.5 text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:text-taupe hover:border-taupe transition-colors"
                      >
                        Turn into content
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bookings this week */}
          <section className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Bookings this week
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-serif text-5xl tabular-nums">{bookingsThisWeek}</span>
                {bookingTarget > 0 && (
                  <span className="text-xs text-taupe uppercase tracking-widest">target {bookingTarget}</span>
                )}
              </div>

              {bookingTarget > 0 ? (
                <>
                  <div className="h-1.5 bg-border relative my-4 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-foreground transition-all duration-700"
                      style={{ width: `${Math.min(100, (bookingsThisWeek / bookingTarget) * 100)}%` }}
                    />
                  </div>
                  {bookingShortfall > 0 ? (
                    <p className="text-xs text-taupe mb-5">
                      {bookingShortfall} booking{bookingShortfall !== 1 ? "s" : ""} short of target.{" "}
                      <Link to="/campaigns" className="text-foreground underline underline-offset-2 hover:text-taupe">
                        Try a campaign to fill quiet weekdays.
                      </Link>
                    </p>
                  ) : (
                    <p className="text-xs text-sage mb-5">On track to meet your weekly target.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-taupe mt-2 mb-5">
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

        {/* Right col — review queue + week glance */}
        <div className="col-span-12 lg:col-span-5 space-y-8">

          {/* Posts ready for review */}
          <section className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Posts ready for review
              </h2>
              <Link
                to="/content"
                className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
              >
                Review all →
              </Link>
            </div>
            {reviewQueue.length === 0 ? (
              <div className="px-5 py-8 text-sm text-taupe italic text-center">
                All caught up — no posts waiting for review.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {reviewQueue.map((c) => (
                  <div key={c.id} className="px-5 py-4 flex items-start gap-4 hover:bg-nude/20 transition-colors">
                    <div className="w-14 aspect-[4/5] shrink-0 overflow-hidden bg-nude/30 border border-border">
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
                        className="mt-2.5 inline-block text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:border-foreground transition-colors"
                      >
                        Review →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* This week at a glance */}
          <section className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                This week at a glance
              </h2>
            </div>
            <div className="grid grid-cols-7 divide-x divide-border">
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  className={"py-5 px-1 text-center " + (d.isToday ? "bg-nude/30" : "hover:bg-nude/10 transition-colors")}
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
    granted:       { label: "Consent granted",  cls: "text-sage" },
    pending:       { label: "Consent pending",  cls: "text-foreground" },
    declined:      { label: "Consent declined", cls: "text-destructive" },
    not_requested: { label: "Consent required", cls: "text-taupe" },
  };
  const m = map[status] ?? map["not_requested"];
  return (
    <span className={"text-[10px] uppercase tracking-widest " + m.cls}>
      {m.label}
    </span>
  );
}
