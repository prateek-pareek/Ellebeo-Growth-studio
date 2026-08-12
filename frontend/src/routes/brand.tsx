import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useBrandDnaV2 } from "@/lib/providers/brand-dna-v2-provider";
import { MOOD_META, TYPE_META, OBJECTIVE_META, moodLabel } from "@/lib/brand-dna/v2-presentation";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand DNA — Elle.Be.O Growth" },
      { name: "description", content: "Your living Brand DNA: identity, voice, strategy and ideal client." },
      { property: "og:title", content: "Brand DNA — Elle.Be.O Growth" },
    ],
  }),
  component: BrandPage,
});

const POWERS = [
  "Caption tone and word choice",
  "Template recommendations",
  "Campaign goals and CTAs",
  "Calendar pacing and mood",
  "Profile bio and service descriptions",
];

function humanizeTag(value: string): string {
  if (!value) return "";
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function BrandPage() {
  const { data: brandDNA, loading, isEmpty, error, refresh } = useBrandDnaV2();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/brand") {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (location.pathname !== "/brand") {
    return <Outlet />;
  }

  if (loading && !brandDNA) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading your Brand DNA…
      </div>
    );
  }

  if (isEmpty) {
    return <BrandEmptyState />;
  }

  if (!brandDNA) return null;

  const palette = brandDNA.identity.mood === "CUSTOM" ? brandDNA.identity.palette : (MOOD_META[brandDNA.identity.mood]?.palette ?? brandDNA.identity.palette);
  const typeMeta = brandDNA.identity.typography.heading ? TYPE_META[brandDNA.identity.typography.heading as keyof typeof TYPE_META] : undefined;
  const story = brandDNA.story.userWritten || brandDNA.story.aiDrafted || "";
  const objective = OBJECTIVE_META[brandDNA.strategy.objective];

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-10">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Brand DNA</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage animate-pulse" />
            Active
          </span>
          {error && (
            <span className="text-[9px] uppercase tracking-widest text-destructive border border-destructive/30 px-2.5 py-1 rounded-full">
              Error loading
            </span>
          )}
        </div>
        <h1 className="page-title max-w-[22ch]">
          Your Brand DNA is <span className="italic text-taupe">ready</span>.
        </h1>
        {story && (
          <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
            {story} Powers every caption, template and calendar recommendation.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <span className="text-[10px] uppercase tracking-widest border border-border bg-muted px-3 py-1.5 rounded-full">{humanizeTag(brandDNA.offering.serviceCategory) || "Not set"}</span>
          <Link
            to="/brand/onboarding"
            className="text-[10px] uppercase tracking-widest border border-border bg-card px-3 py-1.5 rounded-full hover:bg-nude/30 transition-colors"
          >
            Edit Brand DNA
          </Link>
          <Link
            to="/generate"
            className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-1.5 rounded-full hover:bg-taupe transition-colors"
          >
            Generate content
          </Link>
        </div>
      </header>

      {/* ── What it powers ───────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4 pb-3 border-b hairline">
          <h2 className="eyebrow">What your Brand DNA powers</h2>
          <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-1">
            {POWERS.length} features
          </span>
        </div>
        <div className="border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted px-5 py-3 grid grid-cols-[2.5rem_1fr_auto] gap-4 border-b border-border">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">#</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Feature</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</span>
          </div>
          <div className="divide-y divide-border">
            {POWERS.map((p, i) => (
              <div key={p} className="px-5 py-3.5 grid grid-cols-[2.5rem_1fr_auto] gap-4 items-center hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-mono text-taupe tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm text-foreground">{p}</span>
                <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-0.5">Active</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8 lg:gap-10">
        {/* ── Identity & palette ───────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-5">
          <div className="border border-border bg-card shadow-sm overflow-hidden mb-10">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Visual identity</h2>
              <span className="eyebrow">Identity</span>
            </div>
            <div className="divide-y divide-border">
              {brandDNA.identity.logoAssetId && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Logo</span>
                  <div className="size-12 border hairline bg-nude/20 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={brandDNA.identity.logoAssetId} alt="Brand logo" className="max-w-full max-h-full object-contain p-1" />
                  </div>
                </div>
              )}
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Colours</span>
                {palette.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {palette.map((hex, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="size-8 rounded-sm ring-1 ring-border shrink-0" style={{ backgroundColor: hex }} />
                        <span className="text-[9px] text-taupe font-mono">{hex}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-taupe italic">No colours set — add them in Brand DNA settings.</span>
                )}
              </div>
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mood</span>
                <span className="text-sm">{moodLabel(brandDNA.identity.mood, brandDNA.identity.customMoodLabel)}</span>
              </div>
              {brandDNA.identity.essence.length > 0 && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Essence</span>
                  <div className="flex flex-wrap gap-2">
                    {brandDNA.identity.essence.map((w) => (
                      <span key={w} className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5 text-taupe">{w}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Type pairing</span>
                <span className={typeMeta ? typeMeta.headClass + " text-lg" : "text-sm text-taupe italic"}>
                  {typeMeta ? typeMeta.name : "Not set"}
                </span>
              </div>
            </div>
          </div>

          {/* Config */}
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Config</h2>
              <span className="eyebrow">Settings</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border divide-y">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Language</p>
                <p className="text-sm">{brandDNA.config.languageVariant}</p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Instagram</p>
                <p className="text-sm">{brandDNA.config.platforms.instagram ? "Connected" : "Not connected"}</p>
              </div>
              <div className="px-5 py-3.5 col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Medical-aesthetics compliance</p>
                <p className="text-sm">{brandDNA.config.medicalAestheticsCompliance ? "AHPRA guardrails active" : "Not applicable"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Strategy ─────────────────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-4 pb-3 border-b hairline">Content strategy</h2>
          <div className="bg-card border border-border p-6 shadow-sm mb-10">
            <p className="font-serif text-2xl mb-1">{objective.name}</p>
            <p className="text-sm text-taupe">{objective.desc}</p>
          </div>

          <div className="border border-border bg-card shadow-sm overflow-hidden mb-10">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Targets</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">Posts per week</p>
                <p className="mt-2 stat-figure text-foreground">{brandDNA.strategy.postsPerWeek}</p>
              </div>
              <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">Booking target / month</p>
                <p className="mt-2 stat-figure text-foreground">{brandDNA.strategy.bookingTargetPerMonth}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Ideal client ─────────────────────────────────────────────── */}
        <section className="col-span-12 mt-2">
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ideal client</h2>
              <span className="eyebrow">Profile</span>
            </div>
            <div className="divide-y divide-border">
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Age range</span>
                <p className="font-serif text-xl">{brandDNA.audience.ageMin}–{brandDNA.audience.ageMax}</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Gender focus</span>
                <p className="text-sm">{brandDNA.audience.genderFocus === "ALL" ? "Everyone" : humanizeTag(brandDNA.audience.genderFocus)}</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Your niche</span>
                <p className="font-serif text-lg">{humanizeTag(brandDNA.offering.serviceCategory) || "Not set"}</p>
              </div>
              {brandDNA.audience.clientTypes.length > 0 && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Client types</span>
                  <div className="flex flex-wrap gap-2">
                    {brandDNA.audience.clientTypes.map((p) => (
                      <span key={p} className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5 text-taupe">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function BrandEmptyState() {
  return (
    <div className="relative mt-6 lg:mt-10 overflow-hidden border border-nude/60 bg-card p-6 sm:p-8 shadow-sm max-w-[60ch]">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-taupe via-sage to-sage opacity-90"
        aria-hidden
      />
      <div className="pl-4 sm:pl-5">
        <p className="eyebrow mb-4">Brand DNA · the intelligence layer</p>
        <h1 className="page-title">
          Your Brand DNA is <span className="italic">not set up yet</span>.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-taupe leading-relaxed">
          Brand DNA powers every caption, template, campaign and calendar recommendation. Set it up once and the rest of Elle.Be.O Growth tunes itself to your voice.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/brand/onboarding"
            className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2 hover:bg-taupe transition-colors"
          >
            Build your Brand DNA
          </Link>
        </div>
      </div>
    </div>
  );
}
