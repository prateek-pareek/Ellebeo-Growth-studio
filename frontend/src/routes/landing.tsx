import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Elle.Be.O Growth — AI Marketing Studio for Beauty Professionals" },
      { name: "description", content: "Turn every client appointment into scroll-stopping content. Brand DNA-powered AI that generates, schedules and publishes — while you focus on the chair." },
    ],
  }),
  component: LandingPage,
});

// ─── Variants ────────────────────────────────────────────────────────────────

type Ease4 = [number, number, number, number];
const EASE: Ease4 = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const stagger = (delay = 0.08) => ({
  hidden: {},
  show:   { transition: { staggerChildren: delay } },
});

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    number: "01",
    title: "Brand DNA",
    headline: "Every post sounds unmistakably like you.",
    body: "Answer 8 questions once. Growth Studio extracts your archetype, tone of voice, ideal client and visual palette — then bakes it into every piece of content it ever generates.",
    tags: ["Archetype", "Voice tones", "Ideal client", "Palette"],
    accent: "from-nude/60 to-offwhite",
  },
  {
    number: "02",
    title: "AI Content Generation",
    headline: "Three ready-to-review posts from one appointment.",
    body: "Pick an appointment with photos and consent on file. The AI crafts a Carousel, a Reel caption and a Story — shaped by your Brand DNA, not a generic template.",
    tags: ["Carousel", "Reels", "Stories", "Captions", "TikTok"],
    accent: "from-sage/10 to-offwhite",
  },
  {
    number: "03",
    title: "Consent Management",
    headline: "Client consent, handled before the content leaves the studio.",
    body: "Send a one-tap consent link after every appointment. Content tied to undecided clients is automatically locked — GDPR and Australian Privacy Act compliant.",
    tags: ["One-tap consent", "Auto-lock", "Audit trail", "Compliant"],
    accent: "from-taupe/10 to-offwhite",
  },
  {
    number: "04",
    title: "Content Calendar",
    headline: "Schedule once, publish everywhere.",
    body: "Drag approved posts to the calendar. Connect Instagram, Facebook and TikTok — Growth Studio publishes at your chosen time and tracks performance back to the original appointment.",
    tags: ["Instagram", "Facebook", "TikTok", "Auto-publish"],
    accent: "from-nude/40 to-offwhite",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Build your Brand DNA",
    body: "Complete the 8-question setup. The AI extracts your unique brand voice, ideal client profile and visual palette in under 5 minutes.",
  },
  {
    step: "02",
    title: "Log an appointment",
    body: "Add the client, service and upload before/after photos. Send a consent link — the client approves with one tap.",
  },
  {
    step: "03",
    title: "Generate content",
    body: "Click 'Turn into content'. Three brand-accurate drafts land in your review queue. Edit, approve, schedule.",
  },
  {
    step: "04",
    title: "Publish and grow",
    body: "Approved posts go to the calendar. Connect your socials and Growth Studio publishes automatically — tracking every result back to the chair.",
  },
];

const PILLARS = [
  { icon: "◈", label: "Brand DNA" },
  { icon: "✦", label: "AI Generation" },
  { icon: "◻", label: "Consent" },
  { icon: "▦", label: "Calendar" },
  { icon: "⊞", label: "Templates" },
  { icon: "◎", label: "Analytics" },
];

const NAV_LINKS = [
  { href: "#features",     label: "Features" },
  { href: "#how-it-works", label: "How it works" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function LandingPage() {
  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-dvh bg-offwhite text-foreground overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={
          "fixed top-0 inset-x-0 z-50 transition-all duration-300 " +
          (scrolled
            ? "bg-offwhite/95 backdrop-blur-md border-b border-nude/60 shadow-sm"
            : "bg-transparent")
        }
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/landing" className="flex flex-col leading-none shrink-0">
            <span className="font-serif italic text-2xl tracking-tight">Elle.Be.O</span>
            <span className="text-[8px] uppercase tracking-[0.4em] text-taupe mt-0.5">Growth</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[10px] uppercase tracking-[0.22em] text-taupe hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 border border-border bg-card/80 backdrop-blur-sm text-xs font-medium text-foreground px-5 py-2.5 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-semibold px-5 py-2.5 rounded-full shadow-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              Get started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center size-9 rounded-full border border-border bg-card/80 backdrop-blur-sm text-taupe hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="md:hidden bg-offwhite/98 backdrop-blur-md border-b border-nude/60 shadow-lg"
            >
              <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4">
                {NAV_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-sm uppercase tracking-[0.22em] text-taupe hover:text-foreground transition-colors py-1"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="pt-2 border-t border-border flex items-center gap-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 border border-border bg-card text-foreground text-xs font-medium px-5 py-2.5 rounded-full"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-semibold px-5 py-2.5 rounded-full"
                  >
                    Get started <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-screen flex items-center pt-16 pb-10">

        {/* Ambient gradient orbs */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -top-32 -left-24 h-[42rem] w-[42rem] rounded-full bg-nude/45 blur-[140px] animate-[drift_18s_ease-in-out_infinite]" />
          <div className="absolute -bottom-20 right-[-6rem] h-[36rem] w-[36rem] rounded-full bg-sage/20 blur-[130px] animate-[drift_14s_ease-in-out_infinite_reverse]" />
          <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-taupe/8 blur-[100px] animate-[drift_20s_ease-in-out_infinite_2s]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-10 items-center">

          {/* ── Left copy ── */}
          <motion.div
            variants={stagger(0.1)}
            initial="hidden"
            animate="show"
            className="lg:col-span-6"
          >
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/70 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/60 backdrop-blur"
            >
              <span className="size-1.5 rounded-full bg-sage animate-pulse" />
              AI Marketing Studio · Beauty Professionals
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className="mt-6 font-serif text-[2.6rem] sm:text-[3rem] lg:text-[3.5rem] font-semibold leading-[1.08] tracking-tight"
            >
              Every appointment becomes{" "}
              <span className="italic text-taupe">content</span>{" "}
              that fills your{" "}
              <span className="italic text-taupe">calendar.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-6 text-base text-taupe leading-relaxed max-w-[42ch]"
            >
              Growth Studio is the AI marketing studio built for beauty technicians.
              Your Brand DNA shapes every post — so it sounds like you, not a template.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-foreground text-offwhite text-sm font-semibold px-7 py-3.5 rounded-full shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45)] hover:opacity-90 hover:shadow-xl active:scale-[0.97] transition-all"
              >
                Sign in to your studio
                <ArrowRight className="size-3.5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 border border-border bg-card/70 backdrop-blur-sm text-sm font-medium text-foreground px-7 py-3.5 rounded-full hover:bg-nude/30 hover:border-foreground/20 active:scale-[0.97] transition-all"
              >
                See how it works
              </a>
            </motion.div>

            {/* Trust phrases */}
            <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3">
              {[
                "Brand DNA shapes every post — sounds like you, not a template",
                "One-tap client consent built into every appointment",
                "Auto-publish to Instagram, Facebook & TikTok",
              ].map((text) => (
                <div key={text} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 rounded-full bg-sage shrink-0" />
                  <p className="text-sm text-taupe leading-snug">{text}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* ── Right mockup ── */}
          <motion.div
            initial={{ opacity: 0, x: 40, y: 10 }}
            animate={{ opacity: 1, x: 0,  y: 0 }}
            transition={{ duration: 1, delay: 0.35, ease: EASE }}
            className="lg:col-span-6 relative"
          >
            {/* Main content-library card */}
            <div className="border border-nude/60 bg-card rounded-2xl shadow-[0_32px_80px_rgba(140,122,112,0.16)] overflow-hidden">
              {/* Tab bar */}
              <div className="bg-muted border-b border-border px-5 py-3 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-rose-300/70" />
                  <span className="size-2.5 rounded-full bg-amber-300/70" />
                  <span className="size-2.5 rounded-full bg-sage/60" />
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Content library · 3 new drafts
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2.5 py-0.5 rounded-full">
                    <span className="size-1.5 rounded-full bg-sage animate-pulse" />
                    Live
                  </span>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {[
                  { type: "Carousel", client: "Zara M.",  service: "Balayage",  status: "Needs review", dot: "bg-amber-400", img: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=88&h=88&fit=crop&q=75" },
                  { type: "Reel",     client: "Priya S.", service: "Lash lift", status: "Scheduled",    dot: "bg-foreground", img: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=88&h=88&fit=crop&q=75" },
                  { type: "Story",    client: "Jade T.",  service: "Colour",    status: "Published",    dot: "bg-sage", img: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=88&h=88&fit=crop&q=75" },
                  { type: "Caption",  client: "Maya K.",  service: "Keratin",   status: "Draft",        dot: "bg-taupe/40", img: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=88&h=88&fit=crop&q=75" },
                ].map((row, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.1, ease: "easeOut" }}
                    className="px-5 py-4 flex items-center gap-4 hover:bg-nude/20 transition-colors cursor-default"
                  >
                    <div className="size-12 shrink-0 rounded-xl overflow-hidden border border-border shadow-sm">
                      <img src={row.img} alt={row.service} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-taupe">{row.type} · {row.service}</p>
                      <p className="font-serif text-[15px] leading-tight mt-0.5">{row.client}</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className={`size-2 rounded-full ${row.dot}`} />
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:block w-[5.5rem] text-right">
                        {row.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Bottom bar */}
              <div className="bg-muted border-t border-border px-5 py-3 flex items-center justify-between">
                <span className="text-[10px] text-taupe">
                  Brand DNA ·{" "}
                  <span className="text-foreground font-medium">The Elevated Specialist</span>
                </span>
                <span className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-medium px-4 py-2 rounded-lg">
                  <Sparkles className="size-3" />
                  Generate content
                </span>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <section className="py-6 bg-gradient-to-b from-offwhite to-card">
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="border border-nude/60 bg-card rounded-2xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-x divide-y sm:divide-y-0 lg:divide-y-0 divide-border">
              {[
                { icon: "◈", title: "Brand DNA",          body: "Every post shaped by your unique voice, archetype and visual palette" },
                { icon: "✦", title: "AI Generation",      body: "Carousel, Reel & Story drafts ready from a single appointment" },
                { icon: "◻", title: "Client Consent",     body: "One-tap consent link sent automatically — GDPR compliant" },
                { icon: "▦", title: "Auto-publish",       body: "Schedule once, publish to Instagram, Facebook & TikTok automatically" },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5, ease: "easeOut" }}
                  className="px-6 py-7 hover:bg-nude/20 transition-colors cursor-default"
                >
                  <span className="block text-xl text-taupe/50 mb-3">{item.icon}</span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground mb-1.5">{item.title}</p>
                  <p className="text-xs text-taupe leading-relaxed">{item.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mb-14 max-w-[52ch]"
          >
            <p className="eyebrow mb-4">Features</p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight">
              Everything you need to{" "}
              <span className="italic">grow without the grind</span>.
            </h2>
            <p className="mt-5 text-base text-taupe leading-relaxed">
              Growth Studio is purpose-built for beauty technicians — not a generic social media tool
              retrofitted with a pastel theme.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.number}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: (i % 2) * 0.12, duration: 0.6, ease: EASE }}
                whileHover={{ y: -4, boxShadow: "0 20px 48px rgba(140,122,112,0.14)" }}
                className={`border border-border bg-gradient-to-br ${f.accent} rounded-2xl shadow-sm overflow-hidden cursor-default`}
              >
                <div className="bg-white/60 backdrop-blur-sm border-b border-border/60 px-5 py-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {f.number} · {f.title}
                  </span>
                  <span className="size-2 rounded-full bg-sage shrink-0" />
                </div>
                <div className="p-6">
                  <h3 className="font-serif text-xl sm:text-2xl leading-snug mb-3">{f.headline}</h3>
                  <p className="text-sm text-taupe leading-relaxed mb-5">{f.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase tracking-widest border border-border/60 bg-white/70 px-2.5 py-1 rounded-full text-taupe"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Brand DNA spotlight ───────────────────────────────────────────── */}
      <section className="py-24 lg:py-28 overflow-hidden relative bg-card border-y border-nude/60">
        <div className="pointer-events-none absolute -top-40 right-0 w-[500px] h-[500px] rounded-full bg-nude/20 blur-3xl" aria-hidden />
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="lg:col-span-5"
            >
              <p className="eyebrow mb-4">Brand DNA</p>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-5">
                Your brand, baked into{" "}
                <span className="italic">every single post</span>.
              </h2>
              <p className="text-base text-taupe leading-relaxed mb-8">
                Most AI tools produce generic content. Brand DNA fixes that.
                Answer 8 questions about your business — your archetype, tone of voice,
                ideal client, pain points, visual palette — and every piece of content
                Growth Studio creates will be distinctly, unmistakably yours.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 border border-border bg-offwhite text-sm font-medium text-foreground px-5 py-3 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
              >
                Build your Brand DNA
                <ArrowRight className="size-3" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: EASE }}
              className="lg:col-span-7"
            >
              <div className="border border-border bg-offwhite rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-muted border-b border-border px-5 py-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Your Brand DNA · Active
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {[
                    { label: "Archetype",     value: "The Elevated Specialist" },
                    { label: "Tone of voice", value: "Warm · Confident · Educational" },
                    { label: "Ideal client",  value: "Women 28–45 seeking premium colour" },
                    { label: "Market tier",   value: "Premium / Boutique" },
                    { label: "Pain points",   value: "Clients who value expertise, not price" },
                    { label: "Headline font", value: "Playfair Display" },
                  ].map((row, i) => (
                    <motion.div
                      key={row.label}
                      initial={{ opacity: 0, x: 12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.07, duration: 0.4, ease: "easeOut" }}
                      className="flex items-baseline hover:bg-nude/20 transition-colors"
                    >
                      <span
                        className="shrink-0 px-5 py-3 text-[10px] uppercase tracking-widest text-taupe bg-muted/60 border-r border-border"
                        style={{ width: "11rem" }}
                      >
                        {row.label}
                      </span>
                      <span className="px-5 py-3 text-sm">{row.value}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="bg-muted border-t border-border px-5 py-3 flex items-center gap-2">
                  <span className="size-2 rounded-full bg-sage shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-sage">
                    Powering 3 content formats · last generated 2h ago
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mb-14 max-w-[48ch]"
          >
            <p className="eyebrow mb-4">How it works</p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight">
              From chair to feed in{" "}
              <span className="italic">four steps</span>.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                whileHover={{ y: -3 }}
                className="border border-border bg-card rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group cursor-default"
              >
                <p className="font-serif text-4xl text-taupe/25 tabular-nums mb-4 group-hover:text-taupe/40 transition-colors">
                  {s.step}
                </p>
                <h3 className="font-serif text-lg leading-snug mb-3">{s.title}</h3>
                <p className="text-sm text-taupe leading-relaxed">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform pillars ─────────────────────────────────────────────── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="border border-border bg-card rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-muted border-b border-border px-5 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                What's included in every plan
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-border">
              {PILLARS.map((p, i) => (
                <motion.div
                  key={p.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4, ease: "easeOut" }}
                  whileHover={{ backgroundColor: "rgba(230,210,204,0.3)" }}
                  className="px-5 py-7 text-center cursor-default transition-colors"
                >
                  <span className="block text-2xl text-taupe/40 mb-3">{p.icon}</span>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-taupe">{p.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-28 lg:py-36 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nude/50 via-offwhite to-sage/10" aria-hidden />
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-nude/30 blur-3xl" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
            className="space-y-6"
          >
            <p className="eyebrow">Ready to grow?</p>
            <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight max-w-[18ch] mx-auto">
              Your next client is already{" "}
              <span className="italic text-taupe">scrolling</span>.
            </h2>
            <p className="text-base sm:text-lg text-taupe leading-relaxed max-w-[46ch] mx-auto">
              Join 2,400+ beauty technicians who use Growth Studio to turn their best work
              into content that fills their calendar — automatically.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-foreground text-offwhite text-sm font-medium px-8 py-4 rounded-full shadow-lg hover:opacity-90 hover:shadow-xl active:scale-[0.97] transition-all"
              >
                Sign in to Growth Studio
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="text-[11px] font-medium text-taupe">
              Your studio is waiting for you.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-nude/60 bg-card">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-12">
            <div>
              <div className="mb-4">
                <span className="font-serif italic text-xl tracking-tight">Elle.Be.O</span>
                <span className="block text-[8px] uppercase tracking-[0.4em] text-taupe mt-0.5">Growth</span>
              </div>
              <p className="text-xs text-taupe leading-relaxed max-w-[26ch]">
                AI marketing studio built for beauty technicians. Brand DNA-powered content, every time.
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-5">Platform</p>
              <ul className="space-y-3">
                {["Brand DNA", "Content generation", "Consent management", "Calendar", "Templates"].map((l) => (
                  <li key={l}>
                    <Link to="/login" className="text-xs text-taupe hover:text-foreground transition-colors">
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-5">Account</p>
              <ul className="space-y-3">
                {[{ label: "Sign in", to: "/login" as const }].map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-xs text-taupe hover:text-foreground transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <span className="text-[10px] uppercase tracking-[0.35em] text-taupe">
              © {new Date().getFullYear()} Elle.Be.O · Growth Studio
            </span>
            <div className="flex items-center gap-6">
              {["Privacy", "Terms", "Contact"].map((l) => (
                <a key={l} href="#" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(3%, 2%) scale(1.04); }
          66%       { transform: translate(-2%, 3%) scale(0.97); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }

      `}</style>
    </div>
  );
}

