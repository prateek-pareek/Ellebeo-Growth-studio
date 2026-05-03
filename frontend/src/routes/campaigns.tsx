import { createFileRoute, Link } from "@tanstack/react-router";
import { useCampaigns } from "@/lib/providers/campaign-provider";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Elle.Be.O Growth" },
      { name: "description", content: "Run multi-post campaigns to fill quiet weekdays, launch services or promote offers." },
      { property: "og:title", content: "Campaigns — Elle.Be.O Growth" },
    ],
  }),
  component: CampaignsPage,
});

const PRESETS = [
  { name: "Fill quiet weekdays", goal: "Add bookings on Tue + Wed", posts: 6 },
  { name: "Promote a service", goal: "Drive 10 bookings for one service", posts: 8 },
  { name: "Launch a new service", goal: "Awareness + first 5 bookings", posts: 9 },
  { name: "Reactivate past clients", goal: "Bring back clients from 6+ months ago", posts: 4 },
];

function CampaignsPage() {
  const { data: campaigns, loading } = useCampaigns();

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">Campaigns</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Run a <span className="italic">campaign</span> with a clear goal.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Pick a goal, set the dates, and we'll plan the posts across your calendar.
        </p>
      </header>

      <section className="mb-16">
        <h2 className="eyebrow mb-6">Start from a goal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border hairline">
          {PRESETS.map((p) => (
            <button key={p.name} className="bg-card p-6 text-left hover:bg-nude/30 transition-colors">
              <p className="font-serif text-xl mb-2">{p.name}</p>
              <p className="text-xs text-taupe mb-4 leading-relaxed">{p.goal}</p>
              <p className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5 inline-block">
                {p.posts} posts · plan →
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-6">Your campaigns</h2>
        <div className="space-y-px bg-border">
          {loading ? (
            <div className="bg-card p-10 text-center text-taupe italic">Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="bg-card p-10 text-center text-taupe italic">No active campaigns. Pick a goal above to start your first one.</div>
          ) : campaigns.map((c) => (
            <div key={c.id} className="bg-card p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-5">
                <p className="font-serif text-2xl mb-1">{c.name}</p>
                <p className="text-sm text-taupe">{c.goal}</p>
              </div>
              <div className="md:col-span-3">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Window</p>
                <p className="text-sm">{c.window}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">Posts</p>
                <p className="text-sm tabular-nums">{c.posts}</p>
              </div>
              <div className="md:col-span-2 md:text-right">
                <p className="text-[10px] uppercase tracking-widest text-sage mb-2">{c.status}</p>
                <Link to="/calendar" className="text-[10px] uppercase tracking-widest text-foreground border-b border-foreground pb-0.5">
                  View on calendar →
                </Link>
              </div>
              <div className="md:col-span-12 h-px bg-border relative">
                <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${c.progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
