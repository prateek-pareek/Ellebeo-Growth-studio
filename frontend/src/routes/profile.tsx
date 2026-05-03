import { createFileRoute, Link } from "@tanstack/react-router";
import { useProfile } from "@/lib/providers/profile-provider";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile optimisation — Elle.Be.O Growth" },
      { name: "description", content: "Optimise your Elle.Be.O marketplace profile to attract more bookings." },
      { property: "og:title", content: "Profile — Elle.Be.O Growth" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, technician, loading } = useProfile();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading profile data...
      </div>
    );
  }

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-5">Profile optimisation</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Make your Elle.Be.O profile <span className="italic">work harder</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            Small fixes to your marketplace listing — clearer bio, more photos, better service titles — typically lift bookings by 20%+.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="size-14 rounded-full bg-nude overflow-hidden ring-1 ring-border">
            <img src={technician.avatar} alt={technician.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-serif text-lg leading-tight">{technician.name}</p>
            <p className="text-xs text-taupe">{technician.handle} · {technician.city}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Completion */}
        <section className="col-span-12 lg:col-span-5">
          <h2 className="eyebrow mb-6">Profile strength</h2>
          <div className="artifact p-8">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-serif text-5xl tabular-nums">{profile.completion}%</span>
              <span className="text-xs text-taupe uppercase tracking-widest">complete</span>
            </div>
            <div className="h-px bg-border relative mb-6">
              <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${profile.completion}%` }} />
            </div>
            <p className="text-sm text-taupe leading-relaxed">
              Profiles above 90% appear higher in Elle.Be.O search and convert roughly twice as often.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Average rating" value={profile.averageRating.toString()} />
            <Stat label="Reviews" value={profile.reviewsCount.toString()} />
            <Stat label="Avg. reply time" value={`${profile.responseTimeHours}h`} />
            <Stat label="Bio strength" value={profile.bioStrength} />
          </div>
        </section>

        {/* Suggestions */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Recommended improvements</h2>
          <div className="space-y-px bg-border">
            {profile.suggestions.length === 0 ? (
              <div className="bg-card p-10 text-center text-taupe italic text-sm">
                Your profile is in great shape! No immediate improvements recommended.
              </div>
            ) : profile.suggestions.map((s, i) => (
              <div key={i} className="bg-card p-5 flex items-center justify-between gap-4">
                <p className="text-sm flex-1">{s.label}</p>
                <span
                  className={
                    "text-[10px] uppercase tracking-widest " +
                    (s.impact === "High" ? "text-foreground" : s.impact === "Medium" ? "text-taupe" : "text-taupe/60")
                  }
                >
                  {s.impact} impact
                </span>
                <button className="text-[10px] uppercase tracking-widest border hairline px-3 py-2 hover:bg-nude/30">
                  Fix
                </button>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Services listed" value={`${profile.servicesListed} / ${profile.servicesRecommended}`} />
            <Stat label="Photos uploaded" value={`${profile.photosCount} / ${profile.photosRecommended}`} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/brand" className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card">
              Edit brand profile
            </Link>
            <Link to="/appointments" className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2">
              Add new photos from appointments
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">{label}</p>
      <p className="font-serif text-2xl tabular-nums">{value}</p>
    </div>
  );
}
