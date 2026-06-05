import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
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

function BrandPage() {
  const { data: brandDNA, loading, isEmpty, error } = useBrandDna();
  const location = useLocation();

  // If we are on a sub-route (like /brand/onboarding), just render the Outlet
  if (location.pathname !== "/brand") {
    return <Outlet />;
  }

  if (isEmpty) {
    return <BrandEmptyState />;
  }

  if (loading && !brandDNA) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading your Brand DNA…
      </div>
    );
  }

  if (!brandDNA) return null;

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-12 max-w-[72ch]">
        <p className="eyebrow mb-5">Brand DNA · the intelligence layer</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-balance">
          Your Brand DNA is <span className="italic">ready</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          {brandDNA.oneLiner} Brand DNA powers every caption, template, campaign and calendar recommendation across Elle.Be.O Growth.
        </p>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5">{brandDNA.category}</span>
          <span className="text-[10px] uppercase tracking-widest text-sage">Active</span>
          {error && (
            <span className="text-[10px] uppercase tracking-widest text-destructive">
              Error loading saved profile
            </span>
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/brand/onboarding"
            className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card"
          >
            Edit Brand DNA
          </Link>
          <Link
            to="/generate"
            className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
          >
            Generate content
          </Link>
        </div>
      </header>

      {/* What it powers */}
      <section className="mb-12">
        <h2 className="eyebrow mb-6">What your Brand DNA powers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-border border hairline">
          {brandDNA.powers.map((p) => (
            <div key={p} className="bg-card p-5">
              <p className="text-sm leading-snug">{p}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Identity & palette */}
        <section className="col-span-12 lg:col-span-5">
          <h2 className="eyebrow mb-6">Visual identity</h2>
          <div className="artifact p-8 mb-10">
            {/* Logo */}
            {brandDNA.logoUrl && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Logo</p>
                <div className="size-20 border hairline bg-nude/20 flex items-center justify-center overflow-hidden">
                  <img src={brandDNA.logoUrl} alt="Brand logo" className="max-w-full max-h-full object-contain p-2" />
                </div>
                <p className="text-[10px] text-taupe mt-1 uppercase tracking-widest">
                  Position: {brandDNA.logoPosition.replace("_", " ")}
                </p>
              </div>
            )}

            {/* Colours */}
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Colours</p>
            <div className="flex gap-2 mb-6">
              {brandDNA.palette.length > 0 ? (
                brandDNA.palette.map((c) => (
                  <div key={c} className="flex flex-col items-center gap-1">
                    <div className="size-12 rounded-sm ring-1 ring-border flex-shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-[9px] text-taupe font-mono">{c}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-taupe italic">No colours set — add them in Brand DNA settings.</p>
              )}
            </div>

            {/* Aesthetic + tier */}
            {(brandDNA.aestheticDirection || brandDNA.brandTier) && (
              <div className="grid grid-cols-2 gap-6 pt-6 border-t hairline mb-6">
                {brandDNA.aestheticDirection && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Aesthetic</p>
                    <p className="text-sm capitalize">{brandDNA.aestheticDirection.replace(/_/g, " ")}</p>
                  </div>
                )}
                {brandDNA.brandTier && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Market tier</p>
                    <p className="text-sm capitalize">{brandDNA.brandTier}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 pt-6 border-t hairline">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Headline font</p>
                <p className="font-serif text-2xl">Playfair</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Body font</p>
                <p className="text-base">Inter</p>
              </div>
            </div>
          </div>

          <h2 className="eyebrow mb-6">Tone of voice</h2>
          <div className="artifact p-8">
            <p className="font-serif text-2xl mb-6">{brandDNA.voice.summary}</p>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-sage mb-3">Always</p>
                <ul className="space-y-2 text-sm text-foreground">
                  {brandDNA.voice.do.length === 0 ? (
                    <li className="text-taupe/60 italic">No rules set</li>
                  ) : brandDNA.voice.do.map((d) => (
                    <li key={d} className="flex gap-2">
                      <span className="text-sage">·</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Never</p>
                <ul className="space-y-2 text-sm text-foreground">
                  {brandDNA.voice.dont.length === 0 ? (
                    <li className="text-taupe/60 italic">No rules set</li>
                  ) : brandDNA.voice.dont.map((d) => (
                    <li key={d} className="flex gap-2">
                      <span className="text-taupe">·</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 pt-6 border-t hairline">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Emojis</p>
                <p className="text-sm capitalize">{brandDNA.emojiPolicy.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Caption length</p>
                <p className="text-sm capitalize">{brandDNA.captionLength}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pillars + goals */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Content pillars</h2>
          <p className="text-sm text-taupe mb-6 max-w-[60ch]">
            Every post is tagged to one pillar. The mix below is what we plan against in your calendar.
          </p>
          <div className="space-y-px bg-border mb-10">
            {brandDNA.pillars.length === 0 ? (
              <div className="bg-card p-6 text-taupe italic text-sm">No pillars defined yet.</div>
            ) : brandDNA.pillars.map((p) => (
              <div key={p.name} className="bg-card p-6 flex items-center gap-6">
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

          <h2 className="eyebrow mb-6">Business goals</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border hairline mb-10">
            <Goal label="Bookings per week" value={`${brandDNA.goals.bookingsPerWeek}`} />
            <Goal label="Posts per week" value={`${brandDNA.goals.postsPerWeek}`} />
            <Goal label="Focus services" value={`${brandDNA.goals.focusServices.length}`} />
          </div>

          {brandDNA.moodboard.length > 0 && (
            <>
              <h2 className="eyebrow mb-6">Moodboard</h2>
              <div className="grid grid-cols-3 gap-2">
                {brandDNA.moodboard.map((src, i) => (
                  <div
                    key={i}
                    className={
                      "overflow-hidden ring-1 ring-border " +
                      (i % 5 === 0 ? "aspect-[3/4] col-span-2 row-span-2" : "aspect-square")
                    }
                  >
                    <img src={src} alt="moodboard" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Ideal client */}
        <section className="col-span-12 mt-12">
          <h2 className="eyebrow mb-6">Ideal client</h2>
          <div className="artifact p-8 sm:p-10 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Age range</p>
              <p className="font-serif text-2xl mb-2">{brandDNA.idealClient.age || "—"}</p>
              <p className="text-sm text-taupe leading-relaxed">{brandDNA.idealClient.cities}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">She is looking for</p>
              <p className="text-base leading-relaxed">{brandDNA.idealClient.looksFor || "Not defined"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">Your niche</p>
              <p className="font-serif text-xl mb-2">{brandDNA.category}</p>
              <p className="text-sm text-taupe">{brandDNA.oneLiner}</p>
            </div>
            {brandDNA.idealClient.painPoints.length > 0 && (
              <div className="md:col-span-3 pt-6 border-t hairline">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">Pain points</p>
                <div className="flex flex-wrap gap-2">
                  {brandDNA.idealClient.painPoints.map((p) => (
                    <span key={p} className="text-[10px] uppercase tracking-widest border hairline px-3 py-1.5 text-taupe">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Goal({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-6">
      <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">{label}</p>
      <p className="font-serif text-3xl tabular-nums">{value}</p>
    </div>
  );
}

function BrandEmptyState() {
  return (
    <div className="mt-6 lg:mt-10 max-w-[60ch]">
      <p className="eyebrow mb-5">Brand DNA · the intelligence layer</p>
      <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">
        Your Brand DNA is <span className="italic">not set up yet</span>.
      </h1>
      <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
        Brand DNA powers every caption, template, campaign and calendar recommendation. Set it up once and the rest of Elle.Be.O Growth tunes itself to your voice.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/brand/onboarding"
          className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
        >
          Build your Brand DNA
        </Link>
      </div>
    </div>
  );
}
