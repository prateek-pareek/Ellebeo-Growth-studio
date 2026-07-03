import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, ArrowLeft, ArrowRight, CheckCircle2, XCircle, RefreshCw, Star } from "lucide-react";
import { z } from "zod";
import { api } from "@/lib/api";
import { toast } from "sonner";

const searchSchema = z.object({
  success: z.union([z.boolean(), z.string()]).optional(),
  canceled: z.union([z.boolean(), z.string()]).optional(),
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/plans")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Plans — Elle.Be.O Growth" },
      { name: "description", content: "Choose a subscription plan to unlock the Growth Studio." },
    ],
  }),
  component: PlansPage,
});

type PlanTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5";

type TierCard = {
  id: PlanTier;
  name: string;
  tagline: string;
  price: number;
  recommended?: boolean;
  features: string[];
  note?: string;
};

const TIERS: TierCard[] = [
  {
    id: "tier1",
    name: "Starter",
    tagline: "Get started with AI content",
    price: 59,
    features: [
      "2 AI posts per day",
      "Booking-only posts",
      "Basic Brand DNA",
      "3-colour palette",
      "Caption + image generation",
    ],
  },
  {
    id: "tier2",
    name: "Growth",
    tagline: "Better content, more detail",
    price: 99,
    features: [
      "Unlimited daily posts",
      "Booking-only posts",
      "Moodboard reference unlocked",
      "5-colour palette + brand world",
      "Vocabulary & tone lists",
    ],
  },
  {
    id: "tier3",
    name: "Premium",
    tagline: "Full brand expression",
    price: 250,
    recommended: true,
    features: [
      "Unlimited daily posts",
      "Brand + marketing posts",
      "Full visual Brand DNA",
      "Signature system + moodboard",
      "Grid rotation strategy",
    ],
  },
  {
    id: "tier4",
    name: "Premium+",
    tagline: "Premium with expert guidance",
    price: 500,
    features: [
      "Everything in Premium",
      "Monthly brand audit",
      "OMG Media publicist review",
      "Priority support",
      "Performance reporting",
    ],
    note: "In partnership with OMG Media",
  },
  {
    id: "tier5",
    name: "Publicist",
    tagline: "Full-service brand management",
    price: 2000,
    features: [
      "Everything in Premium+",
      "Dedicated publicist",
      "Brand partnership introductions",
      "Monthly photo/video shoot",
      "Content strategy sessions",
    ],
    note: "In partnership with OMG Media",
  },
];

const TIER_RANK: Record<string, number> = {
  free: 0, standard: 1, premium: 3,
  tier1: 1, tier2: 2, tier3: 3, tier4: 4, tier5: 5,
};

function PlansPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [currentTier, setCurrentTier] = useState<string>("free");
  const [loadingTier, setLoadingTier] = useState(true);
  const [busy, setBusy] = useState<PlanTier | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [activatedTier, setActivatedTier] = useState<string | null>(null);
  const [purchaseCanceled, setPurchaseCanceled] = useState(false);

  useEffect(() => {
    api.get("/auth/me")
      .then((res) => {
        const tier = res.data?.data?.tenant?.subscriptionTier ?? "free";
        setCurrentTier(tier);
      })
      .catch(() => {})
      .finally(() => setLoadingTier(false));
  }, []);

  useEffect(() => {
    if (search.success) {
      setPurchaseSuccess(true);
      const sessionId = search.session_id;
      if (sessionId) {
        api.post("/billing/verify-session", { sessionId })
          .then((res) => {
            const tier = res.data?.data?.tier ?? res.data?.tier;
            if (tier) {
              setCurrentTier(tier);
              setActivatedTier(tier);
            }
          })
          .catch(() => {});
      }
    }
    if (search.canceled) setPurchaseCanceled(true);
  }, [search.success, search.canceled, search.session_id]);

  const handleSubscribe = async (plan: PlanTier) => {
    setBusy(plan);
    try {
      const res = await api.post("/billing/checkout-session", { plan });
      const url = res.data?.data?.url ?? res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Could not start checkout. Try again.");
        setBusy(null);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || e.response?.data?.message || "Could not start checkout.");
      setBusy(null);
    }
  };

  const tierLabel = (tier: string) => TIERS.find((t) => t.id === tier)?.name ?? tier;

  if (purchaseSuccess) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl"
        >
          <div className="rounded-2xl overflow-hidden border border-sage/20 bg-foreground text-offwhite p-12 flex flex-col items-center text-center gap-6">
            <div className="size-20 rounded-full bg-white/10 flex items-center justify-center">
              <CheckCircle2 className="size-10 text-sage" />
            </div>
            <div>
              <h2 className="font-serif text-3xl mb-2">
                {activatedTier ? `${tierLabel(activatedTier)} activated` : "Subscription confirmed"}
              </h2>
              <p className="text-offwhite/70 leading-relaxed text-sm">
                Your plan is now active. Start creating content from your appointments.
              </p>
            </div>
            <button
              onClick={() => navigate({ to: "/generate" })}
              className="bg-white text-foreground px-8 py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-offwhite transition-colors inline-flex items-center gap-2"
            >
              Start creating <ArrowRight className="size-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (purchaseCanceled) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl"
        >
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center text-center gap-6">
            <div className="size-20 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="size-10 text-taupe" />
            </div>
            <div>
              <h2 className="font-serif text-3xl mb-2">Checkout canceled</h2>
              <p className="text-taupe text-sm leading-relaxed">Nothing was charged. Choose a plan below whenever you're ready.</p>
            </div>
            <button
              onClick={() => setPurchaseCanceled(false)}
              className="bg-foreground text-offwhite px-8 py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            >
              View plans
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      <div className="max-w-7xl mx-auto px-6">

        {/* Back link */}
        <div className="pt-8 mb-8">
          <Link
            to="/generate"
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3" /> Back to generator
          </Link>
        </div>

        {/* Header */}
        <header className="mb-14">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-3">Subscription plans</p>
          <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] tracking-tight">
            Choose your <span className="italic text-taupe">studio</span>.
          </h1>
          <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
            Every plan includes AI-powered captions, images, and on-brand content. Higher tiers unlock richer Brand DNA, more formats, and expert human support.
          </p>
        </header>

        {loadingTier ? (
          <div className="flex items-center justify-center py-32">
            <RefreshCw className="size-5 text-taupe animate-spin" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch pt-6"
          >
            {TIERS.map((tier) => {
              const isCurrent = currentTier === tier.id;
              const isDowngrade = TIER_RANK[currentTier] > TIER_RANK[tier.id];
              const isRecommended = tier.recommended;

              return (
                <motion.div
                  key={tier.id}
                  whileHover={{ y: isRecommended ? -10 : -6, scale: isRecommended ? 1.05 : 1.03 }}
                  transition={{ type: "spring", stiffness: 350, damping: 22 }}
                  className={[
                    "relative rounded-2xl border flex flex-col",
                    isRecommended
                      ? "border-foreground bg-foreground text-offwhite shadow-xl z-10"
                      : "border-border bg-card",
                  ].join(" ")}
                >
                  {/* Recommended badge */}
                  {isRecommended && (
                    <div className="absolute top-0 inset-x-0 flex justify-center -translate-y-1/2">
                      <span className="bg-sage text-white text-[9px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full inline-flex items-center gap-1.5">
                        <Star className="size-2.5 fill-white" /> Recommended
                      </span>
                    </div>
                  )}

                  {/* Current plan badge */}
                  {isCurrent && (
                    <div className="absolute top-3 right-3">
                      <span className={[
                        "text-[9px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full",
                        isRecommended ? "bg-white/20 text-white" : "bg-sage/15 text-sage",
                      ].join(" ")}>
                        Current plan
                      </span>
                    </div>
                  )}

                  <div className="p-6 flex flex-col flex-1 gap-6">
                    {/* Icon + name */}
                    <div>
                      <div className={[
                        "size-9 rounded-xl flex items-center justify-center mb-4",
                        isRecommended ? "bg-white/10" : "bg-muted",
                      ].join(" ")}>
                        <Sparkles className={["size-4", isRecommended ? "text-white" : "text-taupe"].join(" ")} />
                      </div>
                      <p className={[
                        "text-[9px] font-bold uppercase tracking-[0.25em] mb-1",
                        isRecommended ? "text-offwhite/60" : "text-taupe",
                      ].join(" ")}>
                        {tier.id.replace("tier", "Tier ")}
                      </p>
                      <h2 className={["font-serif text-2xl leading-tight", isRecommended ? "text-offwhite" : ""].join(" ")}>
                        {tier.name}
                      </h2>
                      <p className={["text-xs mt-1 leading-snug", isRecommended ? "text-offwhite/60" : "text-taupe"].join(" ")}>
                        {tier.tagline}
                      </p>
                    </div>

                    {/* Price */}
                    <div>
                      <div className="flex items-end gap-1">
                        <span className={["font-serif text-4xl leading-none", isRecommended ? "text-offwhite" : ""].join(" ")}>
                          ${tier.price}
                        </span>
                        <span className={["text-xs mb-1", isRecommended ? "text-offwhite/50" : "text-taupe"].join(" ")}>/mo</span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 flex-1">
                      {tier.features.map((f) => (
                        <li key={f} className={["flex items-start gap-2.5 text-xs leading-snug", isRecommended ? "text-offwhite/80" : "text-foreground/80"].join(" ")}>
                          <Check className={["size-3 shrink-0 mt-0.5", isRecommended ? "text-sage" : "text-sage"].join(" ")} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* Partner note */}
                    {tier.note && (
                      <p className={["text-[10px] leading-snug", isRecommended ? "text-offwhite/40" : "text-taupe/60"].join(" ")}>
                        {tier.note}
                      </p>
                    )}

                    {/* CTA */}
                    <button
                      onClick={() => !isCurrent && !isDowngrade && handleSubscribe(tier.id)}
                      disabled={isCurrent || isDowngrade || busy === tier.id}
                      className={[
                        "w-full py-3 text-[10px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed",
                        isCurrent
                          ? isRecommended
                            ? "bg-white/10 text-offwhite/50 cursor-default"
                            : "bg-muted text-taupe/50 cursor-default"
                          : isDowngrade
                          ? isRecommended
                            ? "bg-white/10 text-offwhite/40 cursor-not-allowed"
                            : "bg-muted text-taupe/40 cursor-not-allowed"
                          : isRecommended
                          ? "bg-white text-foreground hover:bg-offwhite"
                          : "bg-foreground text-offwhite hover:bg-taupe",
                      ].join(" ")}
                    >
                      {busy === tier.id
                        ? "Redirecting…"
                        : isCurrent
                        ? "Current plan"
                        : isDowngrade
                        ? "Contact support to downgrade"
                        : <>Subscribe <ArrowRight className="size-3" /></>}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Footer note */}
        <p className="text-center text-[10px] text-taupe/50 mt-10">
          Secure payment via Stripe · Cancel anytime · All plans include consent + compliance guardrails
        </p>

      </div>
    </div>
  );
}
