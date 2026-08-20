import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded-2xl ${className ?? ""}`} />;
}

const CONSENT_CHIP: Record<string, { label: string; cls: string; dot: string }> = {
  granted:       { label: "Consent granted",  cls: "bg-sage/10 text-sage",             dot: "bg-sage" },
  pending:       { label: "Consent pending",  cls: "bg-brass/10 text-brass-ink",        dot: "bg-brass" },
  declined:      { label: "Consent declined", cls: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  not_requested: { label: "Consent required", cls: "bg-muted text-taupe",               dot: "bg-taupe" },
};

function HomePage() {
  const { technician, loading: profileLoading } = useProfile();
  const { data: brandDNA } = useBrandDna();
  const { data: appointments, loading: apptLoading } = useAppointments();
  const { items: contentItems, loading: contentLoading } = useContentItems();
  const { entries: calendarEntries } = useCalendar();

  const isLoading = profileLoading || apptLoading || contentLoading;

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
  const bookingPct = bookingTarget > 0 ? Math.min(1, bookingsThisWeek / bookingTarget) : 0;

  // Week at a glance (Mon–Sun of current week)
  const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const count     = calendarEntries.filter((e) => e.date === d.getDate()).length;
    const isToday   = d.toISOString().slice(0, 10) === todayISO;
    return { label: DAY_LABELS[i], count, isToday };
  });
  const maxDayCount = Math.max(1, ...weekDays.map((d) => d.count));

  if (isLoading) {
    return (
      <div className="mt-6 lg:mt-10 space-y-6">
        <Skeleton className="h-44" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mt-6 lg:mt-10 mb-6 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] rounded-2xl overflow-hidden bg-card shadow-elevated hover:shadow-elevated-lg transition-shadow duration-200">
        <div className="p-8 sm:p-10">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">{dateLabel}</span>
            <span className="text-taupe/30">·</span>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-sage animate-pulse" />
              Live
            </span>
          </div>
          <h1 className="page-title max-w-[22ch]">
            {greeting}, <span className="italic text-taupe">{firstName}.</span>
          </h1>
          <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[48ch]">
            You have{" "}
            <span className="text-foreground font-medium">{todayAppointments.length} appointments today</span>,{" "}
            <span className="text-foreground font-medium">{postsReadyForReview} posts ready for review</span>, and{" "}
            <span className="text-foreground font-medium">{consentPending} consent</span>{" "}
            pending.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              to="/gemini-lab"
              className="inline-flex items-center gap-2 bg-brass text-white text-xs font-semibold px-5 py-3 rounded-xl shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all"
            >
              <Sparkles className="size-3.5" />
              Generate content
            </Link>
            <Link
              to="/content"
              className="inline-flex items-center gap-2 border border-border bg-card text-xs font-semibold text-foreground px-5 py-3 rounded-xl hover:bg-muted active:scale-[0.97] transition-all"
            >
              Review queue ({postsReadyForReview})
            </Link>
          </div>
        </div>

        <div className="bg-muted/40 border-t lg:border-t-0 lg:border-l border-border p-8 sm:p-10 flex flex-col justify-center gap-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-taupe">Bookings this week</span>
            <span className="stat-figure tnum">
              {bookingsThisWeek}
              {bookingTarget > 0 && <span className="text-sm text-taupe font-sans"> / {bookingTarget}</span>}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-taupe">Posts ready for review</span>
            <span className="stat-figure tnum">{postsReadyForReview}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-taupe">Next up today</span>
            <span className="font-serif text-base text-right">
              {todayAppointments[0] ? `${todayAppointments[0].timeLabel} · ${todayAppointments[0].clientName}` : "Nothing scheduled"}
            </span>
          </div>
        </div>
      </section>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link
          to="/content"
          className="group bg-card rounded-2xl p-5 shadow-elevated hover:shadow-elevated-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          <span className="flex items-center justify-center size-8 rounded-lg bg-brass/10 text-brass-ink mb-3">
            <Sparkles className="size-4" />
          </span>
          <p className="stat-figure tnum">{postsReadyForReview}</p>
          <p className="text-xs text-taupe mt-1 mb-3">Posts ready for review</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
            Open queue <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        <Link
          to="/appointments"
          search={{ filter: "consent" }}
          className="group bg-card rounded-2xl p-5 shadow-elevated hover:shadow-elevated-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          <span className="flex items-center justify-center size-8 rounded-lg bg-destructive/10 text-destructive mb-3">
            <ShieldCheck className="size-4" />
          </span>
          <p className="stat-figure tnum">{consentPending}</p>
          <p className="text-xs text-taupe mt-1 mb-3">Consent waiting</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
            Send reminder <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        <Link
          to="/calendar"
          className="group bg-card rounded-2xl p-5 shadow-elevated hover:shadow-elevated-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          <span className="flex items-center justify-center size-8 rounded-lg bg-sage/10 text-sage mb-3">
            <CalendarClock className="size-4" />
          </span>
          <p className="stat-figure tnum">{scheduledThisWeek}</p>
          <p className="text-xs text-taupe mt-1 mb-3">Scheduled this week</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
            Open calendar <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        <div className="bg-card rounded-2xl p-5 shadow-elevated cursor-default">
          <span className="flex items-center justify-center size-8 rounded-lg bg-brass/10 text-brass-ink mb-3">
            <TrendingUp className="size-4" />
          </span>
          <p className="stat-figure tnum">
            {bookingsThisWeek}
            <span className="text-base text-taupe font-sans">/{bookingTarget || "–"}</span>
          </p>
          <p className="text-xs text-taupe mt-1 mb-3">Bookings vs. weekly target</p>
          <span className="text-[11px] font-semibold text-taupe">
            {bookingTarget === 0
              ? "Set a target in Brand DNA"
              : bookingShortfall > 0
                ? `${bookingShortfall} short of target`
                : "On track"}
          </span>
        </div>
      </section>

      {/* ── Body grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">

        {/* Left column */}
        <div className="col-span-12 lg:col-span-7 space-y-6">

          {/* Today's appointments */}
          <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Today's appointments
              </h2>
              <Link to="/appointments" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                All appointments →
              </Link>
            </div>
            {todayAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl m-5 py-10 text-center bg-muted/20">
                <p className="text-sm text-taupe italic">No appointments scheduled for today.</p>
              </div>
            ) : (
              <div className="px-6 pb-5">
                {todayAppointments.map((a, i) => {
                  const chip = CONSENT_CHIP[a.consent] ?? CONSENT_CHIP.not_requested;
                  return (
                    <div
                      key={a.id}
                      className={
                        "flex gap-4 py-4" +
                        (i !== todayAppointments.length - 1 ? " border-b border-border" : "")
                      }
                    >
                      <div className="flex flex-col items-center w-2 pt-2 shrink-0">
                        <span className={"size-2.5 rounded-full ring-2 ring-card " + chip.dot} />
                      </div>
                      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-nude/40">
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
                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <span className={"text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full " + chip.cls}>
                          {chip.label}
                        </span>
                        <Link
                          to="/gemini-lab"
                          search={{ appointment: a.id }}
                          className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground/40 pb-0.5 hover:text-taupe hover:border-taupe transition-colors"
                        >
                          Turn into content
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Posts ready for review */}
          <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Posts ready for review
              </h2>
              <Link to="/content" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                Review all →
              </Link>
            </div>
            {reviewQueue.length === 0 ? (
              <div className="px-6 py-8 text-sm text-taupe italic text-center">
                All caught up — no posts waiting for review.
              </div>
            ) : (
              <div className="px-6 pb-5 space-y-5">
                {reviewQueue.map((c) => (
                  <div key={c.id} className="flex items-start gap-4">
                    <div className="w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-nude/30">
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
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-5 space-y-6">

          {/* Brand DNA */}
          <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
            {!brandDNA ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl m-5 py-10 text-center bg-muted/20">
                <p className="eyebrow mb-2">Not set up yet</p>
                <p className="text-sm text-taupe mb-4 max-w-[32ch] mx-auto">
                  Build your Brand DNA to power every piece of content this account generates.
                </p>
                <Link
                  to="/brand/onboarding"
                  className="inline-flex items-center bg-brass text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-elevated hover:brightness-105 active:scale-[0.97] transition-all"
                >
                  Build your Brand DNA
                </Link>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="size-1.5 rounded-full bg-sage shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-sage">Active · powering this account</span>
                </div>
                <h3 className="font-serif text-2xl leading-tight italic mb-3">
                  {brandDNA.archetype}
                </h3>
                {brandDNA.oneLiner && (
                  <p className="text-sm text-taupe leading-relaxed mb-4">{brandDNA.oneLiner}</p>
                )}
                {brandDNA.palette.length > 0 && (
                  <div className="flex gap-2 mb-4">
                    {brandDNA.palette.map((c, i) => (
                      <div key={i} className="size-6 rounded-lg" style={{ backgroundColor: c }} title={c} />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {brandDNA.category && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-taupe px-3 py-1.5 rounded-full">
                      {brandDNA.category}
                    </span>
                  )}
                  {brandDNA.voiceTones.length > 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-taupe px-3 py-1.5 rounded-full">
                      {brandDNA.voiceTones.join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/brand/onboarding"
                    className="flex-1 text-center inline-flex items-center justify-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2.5 rounded-xl hover:bg-muted transition-all"
                  >
                    Refine Brand DNA
                  </Link>
                  <Link
                    to="/gemini-lab"
                    className="flex-1 text-center inline-flex items-center justify-center bg-brass text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-elevated hover:brightness-105 transition-all"
                  >
                    Generate content
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* Weekly booking goal */}
          <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
            <div className="px-6 py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Weekly booking goal
              </h2>
            </div>
            <div className="px-6 pb-6 flex items-center gap-5">
              <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--muted)" strokeWidth="8" />
                <circle
                  cx="36" cy="36" r="30" fill="none" stroke="var(--brass)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 30}
                  strokeDashoffset={2 * Math.PI * 30 * (1 - bookingPct)}
                  transform="rotate(-90 36 36)"
                  className="transition-all duration-700"
                />
                <text x="36" y="41" textAnchor="middle" className="font-serif" fontSize="20" fill="var(--foreground)">
                  {bookingsThisWeek}
                </text>
              </svg>
              <div>
                {bookingTarget > 0 ? (
                  <>
                    <p className="text-sm font-medium leading-snug">
                      {bookingShortfall > 0
                        ? `${bookingShortfall} booking${bookingShortfall !== 1 ? "s" : ""} short of ${bookingTarget}.`
                        : `On track to meet your target of ${bookingTarget}.`}
                    </p>
                    <p className="text-xs text-taupe mt-1">
                      {bookingShortfall > 0 ? "Fill remaining slots to close the gap this week." : "Nicely done — keep the momentum going."}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-taupe leading-relaxed">
                    Set a booking target in your{" "}
                    <Link to="/brand/onboarding" className="text-foreground underline underline-offset-2">
                      Brand DNA
                    </Link>{" "}
                    to track progress here.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Week at a glance */}
          <section className="bg-card rounded-2xl shadow-elevated overflow-hidden">
            <div className="px-6 py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                This week at a glance
              </h2>
            </div>
            <div className="px-4 pb-6 grid grid-cols-7">
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  className={"flex flex-col items-center gap-2.5 py-2 rounded-xl " + (d.isToday ? "bg-brass/10" : "")}
                >
                  <span className={"text-[9px] font-bold uppercase tracking-wide " + (d.isToday ? "text-brass-ink" : "text-taupe")}>
                    {d.label}
                  </span>
                  <div className="w-1.5 h-9 rounded-full bg-muted flex items-end overflow-hidden">
                    <div
                      className={"w-full rounded-full transition-all duration-500 " + (d.isToday ? "bg-brass" : "bg-taupe/50")}
                      style={{ height: d.count === 0 ? "0%" : `${Math.max(15, (d.count / maxDayCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-taupe tnum">{d.count || "–"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
