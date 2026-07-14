import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand DNA — Elle.Be.O Growth" },
      { name: "description", content: "Your living Brand DNA: identity, voice, content pillars and ideal client." },
      { property: "og:title", content: "Brand DNA — Elle.Be.O Growth" },
    ],
  }),
  component: BrandPage,
});

function humanizeTag(value: string): string {
  if (!value) return "";
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function consentDotClass(status: string): string {
  if (status === "owned" || status === "client_consented") return "bg-sage";
  if (status === "no_consent") return "bg-destructive";
  return "bg-taupe";
}

function BrandPage() {
  const { data: brandDNA, loading, isEmpty, error, refresh } = useBrandDna();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/brand") {
      refresh();
    }
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
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          {brandDNA.oneLiner} Powers every caption, template and calendar recommendation.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className="text-[10px] uppercase tracking-widest border border-border bg-muted px-3 py-1.5 rounded-full">{brandDNA.category}</span>
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
            {brandDNA.powers.length} features
          </span>
        </div>
        <div className="border border-border bg-card shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="bg-muted px-5 py-3 grid grid-cols-[2.5rem_1fr_auto] gap-4 border-b border-border">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">#</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Feature</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border">
            {brandDNA.powers.map((p, i) => (
              <div
                key={p}
                className="px-5 py-3.5 grid grid-cols-[2.5rem_1fr_auto] gap-4 items-center hover:bg-nude/20 transition-colors"
              >
                <span className="text-[10px] font-mono text-taupe tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm text-foreground">{p}</span>
                <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-0.5">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8 lg:gap-10">
        {/* ── Identity & palette ───────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-5">
          {/* Visual identity — definition table */}
          <div className="border border-border bg-card shadow-sm overflow-hidden mb-10">
            {/* Card header */}
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Visual identity</h2>
              <span className="eyebrow">Identity</span>
            </div>
            <div className="divide-y divide-border">
              {/* Logo */}
              {brandDNA.logoUrl && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Logo</span>
                  <div className="flex items-center gap-3">
                    <div className="size-12 border hairline bg-nude/20 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={brandDNA.logoUrl} alt="Brand logo" className="max-w-full max-h-full object-contain p-1" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-taupe">
                      {brandDNA.logoPosition.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )}
              {/* Colours */}
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Colours</span>
                {brandDNA.paletteLabeled.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {brandDNA.paletteLabeled.map((c) => (
                      <div key={c.role} className="flex flex-col items-center gap-1">
                        <div className="size-8 rounded-sm ring-1 ring-border shrink-0" style={{ backgroundColor: c.hex }} />
                        <span className="text-[9px] uppercase tracking-widest text-taupe">{c.role}</span>
                        <span className="text-[9px] text-taupe font-mono">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-taupe italic">No colours set — add them in Brand DNA settings.</span>
                )}
              </div>
              {/* Aesthetic */}
              {brandDNA.aestheticDirection && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Aesthetic</span>
                  <span className="text-sm capitalize">{brandDNA.aestheticDirection.replace(/_/g, " ")}</span>
                </div>
              )}
              {/* Market tier */}
              {brandDNA.brandTier && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Market tier</span>
                  <span className="text-sm capitalize">{brandDNA.brandTier}</span>
                </div>
              )}
              {/* Headline font */}
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Headline font</span>
                <span className="font-serif text-xl">Playfair</span>
              </div>
              {/* Body font */}
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Body font</span>
                <span className="text-sm">Inter</span>
              </div>
            </div>
          </div>

          {/* Tone of voice — rules table */}
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Tone of voice</h2>
              <span className="eyebrow">Voice</span>
            </div>
            {/* Summary */}
            <div className="px-5 py-4 border-b border-border bg-nude/10">
              <p className="font-serif text-xl leading-snug">{brandDNA.voice.summary}</p>
            </div>
            {/* Rules table header */}
            <div className="bg-muted px-5 py-2.5 border-b border-border grid grid-cols-[2.5rem_5.5rem_1fr] gap-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">#</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Type</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rule</span>
            </div>
            {/* Rules rows */}
            <div className="divide-y divide-border">
              {brandDNA.voice.do.length === 0 && brandDNA.voice.dont.length === 0 ? (
                <div className="px-5 py-4 text-sm text-taupe italic">No voice rules set yet.</div>
              ) : (
                <>
                  {brandDNA.voice.do.map((d, i) => (
                    <div key={d} className="px-5 py-3.5 grid grid-cols-[2.5rem_5.5rem_1fr] gap-4 items-center hover:bg-nude/20 transition-colors">
                      <span className="text-[10px] font-mono text-taupe tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-0.5 text-center">Always</span>
                      <span className="text-sm text-foreground">{d}</span>
                    </div>
                  ))}
                  {brandDNA.voice.dont.map((d, i) => (
                    <div key={d} className="px-5 py-3.5 grid grid-cols-[2.5rem_5.5rem_1fr] gap-4 items-center hover:bg-nude/20 transition-colors">
                      <span className="text-[10px] font-mono text-taupe tabular-nums">{String(brandDNA.voice.do.length + i + 1).padStart(2, "0")}</span>
                      <span className="text-[10px] uppercase tracking-widest text-taupe bg-taupe/10 px-2 py-0.5 text-center">Never</span>
                      <span className="text-sm text-foreground">{d}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
            {/* Settings footer */}
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Emojis</p>
                <p className="text-sm capitalize">{brandDNA.emojiPolicy.replace(/_/g, " ")}</p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Caption length</p>
                <p className="text-sm capitalize">{brandDNA.captionLength}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pillars + goals ──────────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-4 pb-3 border-b hairline">Content pillars</h2>
          <p className="text-sm text-taupe mb-6 max-w-[60ch]">
            Every post is tagged to one pillar. The mix below is what we plan against in your calendar.
          </p>
          <div className="space-y-3 mb-10">
            {brandDNA.pillars.length === 0 ? (
              <div className="bg-card border border-border p-6 text-taupe italic text-sm shadow-sm">
                No pillars defined yet.
              </div>
            ) : brandDNA.pillars.map((p) => (
              <div key={p.name} className="bg-card border border-border p-6 flex items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-1">
                  <p className="font-serif text-2xl mb-1">{p.name}</p>
                  <p className="text-sm text-taupe">{p.description}</p>
                </div>
                <div className="w-32 sm:w-48">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-taupe">Share</span>
                    <span className="text-sm tabular-nums">{p.weight}%</span>
                  </div>
                  <div className="h-px bg-border relative">
                    <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${p.weight}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Business goals — stat grid */}
          <div className="border border-border bg-card shadow-sm overflow-hidden mb-10">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Business goals</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                  Bookings per week
                </p>
                <p className="mt-2 stat-figure text-foreground">
                  {brandDNA.goals.bookingsPerWeek}
                </p>
              </div>
              <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                  Posts per week
                </p>
                <p className="mt-2 stat-figure text-foreground">
                  {brandDNA.goals.postsPerWeek}
                </p>
              </div>
              <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                  Focus services
                </p>
                <p className="mt-2 stat-figure text-foreground">
                  {brandDNA.goals.focusServices.length}
                </p>
              </div>
            </div>
          </div>

          {brandDNA.moodboardLabeled.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4 pb-3 border-b hairline">
                <h2 className="eyebrow">Moodboard</h2>
                <span className="text-[10px] uppercase tracking-widest text-taupe">
                  {brandDNA.moodboardLabeled.length} reference{brandDNA.moodboardLabeled.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {brandDNA.moodboardLabeled.map((m, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-sm ring-1 ring-border bg-muted">
                    <img
                      src={m.url}
                      alt="Moodboard reference"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    {m.usage && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] uppercase tracking-widest text-offwhite">{humanizeTag(m.usage)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {brandDNA.assetLibrary.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b hairline">
                <h2 className="eyebrow">Asset library</h2>
                <span className="text-[10px] uppercase tracking-widest text-taupe">
                  {brandDNA.assetLibrary.length} file{brandDNA.assetLibrary.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {brandDNA.assetLibrary.map((a) => (
                  <div key={a.id} className="group relative aspect-square overflow-hidden rounded-sm ring-1 ring-border bg-muted">
                    <img
                      src={a.url}
                      alt={a.assetType || "Brand asset"}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                      <span className={"size-1.5 rounded-full shrink-0 " + consentDotClass(a.consentStatus)} title={humanizeTag(a.consentStatus)} />
                      {a.assetType && (
                        <span className="text-[8px] uppercase tracking-widest text-offwhite bg-foreground/70 px-1.5 py-0.5">
                          {humanizeTag(a.assetType)}
                        </span>
                      )}
                    </div>
                    {a.usageRule && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] uppercase tracking-widest text-offwhite">{humanizeTag(a.usageRule)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Ideal client ─────────────────────────────────────────────── */}
        <section className="col-span-12 mt-12">
          {/* Ideal client — definition table */}
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ideal client</h2>
              <span className="eyebrow">Profile</span>
            </div>
            <div className="divide-y divide-border">
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Age range</span>
                <div>
                  <p className="font-serif text-xl">{brandDNA.idealClient.age || "—"}</p>
                  {brandDNA.idealClient.cities && (
                    <p className="text-sm text-taupe mt-1">{brandDNA.idealClient.cities}</p>
                  )}
                </div>
              </div>
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Looking for</span>
                <p className="text-sm leading-relaxed">{brandDNA.idealClient.looksFor || "Not defined"}</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start hover:bg-nude/20 transition-colors">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Your niche</span>
                <div>
                  <p className="font-serif text-lg mb-1">{brandDNA.category}</p>
                  <p className="text-sm text-taupe">{brandDNA.oneLiner}</p>
                </div>
              </div>
              {brandDNA.idealClient.painPoints.length > 0 && (
                <div className="px-5 py-4 grid grid-cols-[9rem_1fr] gap-4 items-start">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-0.5">Pain points</span>
                  <div className="flex flex-wrap gap-2">
                    {brandDNA.idealClient.painPoints.map((p) => (
                      <span key={p} className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5 text-taupe">
                        {p}
                      </span>
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
