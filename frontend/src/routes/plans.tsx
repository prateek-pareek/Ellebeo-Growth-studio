import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, ArrowLeft, RefreshCw, CheckCircle2, ArrowRight, XCircle } from "lucide-react";
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
      { name: "description", content: "Buy generations to keep creating AI content for your appointments." },
    ],
  }),
  component: PlansPage,
});

type PlanInfo = { priceUsd: number; generationsIncluded: number };
type UsageInfo = { total: number; used: number; remaining: number };

function PlansPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseCanceled, setPurchaseCanceled] = useState(false);
  const [generationsRemaining, setGenerationsRemaining] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/generation/plan-info"),
      api.get("/generation/rate-limit-status"),
    ]).then(([planRes, usageRes]) => {
      setPlan(planRes.data?.data ?? planRes.data);
      const d = usageRes.data?.data ?? usageRes.data;
      if (d?.plan) setUsage(d.plan);
    }).catch(() => toast.error("Could not load plan details."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (search.success) {
      setPurchaseSuccess(true);
      const sessionId = search.session_id;
      // First: call verify-session to ensure the DB is updated even if the
      // Stripe webhook hasn't fired yet (common on deployed environments where
      // the webhook endpoint isn't configured in the Stripe Dashboard).
      const verifyThenPoll = async () => {
        if (sessionId) {
          try {
            await api.post("/billing/verify-session", { sessionId });
          } catch {
            // Ignore — webhook may have already applied it
          }
        }
        // Then poll for the updated balance
        let attempts = 0;
        const poll = () => {
          api.get("/generation/rate-limit-status")
            .then((res) => {
              const data = res.data?.data ?? res.data;
              const remaining = (data?.plan?.remaining ?? 0) + (data?.trial?.remaining ?? 0);
              if (remaining > 0 || attempts >= 5) {
                setGenerationsRemaining(remaining);
              } else {
                attempts += 1;
                setTimeout(poll, 1500);
              }
            })
            .catch(() => {});
        };
        poll();
      };
      verifyThenPoll();
    }
    if (search.canceled) setPurchaseCanceled(true);
  }, [search.success, search.canceled, search.session_id]);

  const handleBuy = async () => {
    setBusy(true);
    try {
      const res = await api.post("/billing/checkout-session");
      const url = res.data?.data?.url ?? res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Could not start checkout. Try again.");
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || e.response?.data?.message || "Could not start checkout.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      <div className="max-w-4xl mx-auto px-6">

        {/* Back link */}
        <div className="pt-8 mb-8">
          <Link
            to="/generate"
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3" /> Back to generator
          </Link>
        </div>

        {/* Page header */}
        <header className="mb-12">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-3">
            {purchaseSuccess
              ? "Payment confirmed"
              : purchaseCanceled
              ? "Checkout canceled"
              : usage && usage.total > 0
              ? "Your plan"
              : "Unlock the studio"}
          </p>
          <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] tracking-tight">
            {purchaseSuccess
              ? <>You're all <span className="italic text-taupe">set</span>.</>
              : purchaseCanceled
              ? <>No charge <span className="italic text-taupe">made</span>.</>
              : usage && usage.total > 0
              ? <>Your <span className="italic text-taupe">generations</span>.</>
              : <>Power your <span className="italic text-taupe">studio</span>.</>}
          </h1>
          <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
            {purchaseSuccess
              ? "Your purchase went through. You're ready to turn more appointments into content."
              : purchaseCanceled
              ? "You backed out before paying — nothing was charged. You can try again whenever you're ready."
              : usage && usage.total > 0
              ? "You have an active plan. See your usage below and top up anytime."
              : "A single one-time purchase unlocks a batch of AI generations for turning appointments into content."}
          </p>
        </header>

        {/* States */}
        {purchaseSuccess ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden border border-sage/20"
          >
            <div className="bg-foreground text-offwhite p-10 lg:p-12 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
              <div className="size-20 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-10 text-sage" />
              </div>
              <div className="flex-1 text-center lg:text-left">
                <h2 className="font-serif text-3xl mb-2">Purchase complete</h2>
                <p className="text-offwhite/70 leading-relaxed">
                  {generationsRemaining === null
                    ? "Confirming your balance…"
                    : <>You now have <span className="text-white font-semibold">{generationsRemaining} generation{generationsRemaining !== 1 ? "s" : ""}</span> ready to use.</>}
                </p>
              </div>
              <button
                onClick={() => navigate({ to: "/generate" })}
                className="shrink-0 bg-white text-foreground px-8 py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-offwhite transition-colors inline-flex items-center gap-2 rounded-none"
              >
                Start creating <ArrowRight className="size-3.5" />
              </button>
            </div>
          </motion.div>

        ) : purchaseCanceled ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            <div className="p-10 lg:p-12 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
              <div className="size-20 rounded-full bg-muted flex items-center justify-center shrink-0">
                <XCircle className="size-10 text-taupe" />
              </div>
              <div className="flex-1 text-center lg:text-left">
                <h2 className="font-serif text-3xl mb-2">Checkout canceled</h2>
                <p className="text-taupe leading-relaxed">Nothing was charged. Whenever you're ready, you can try again.</p>
              </div>
              <button
                onClick={() => setPurchaseCanceled(false)}
                className="shrink-0 bg-foreground text-offwhite px-8 py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
              >
                Try again
              </button>
            </div>
          </motion.div>

        ) : loading ? (
          <div className="flex items-center justify-center py-32">
            <RefreshCw className="size-5 text-taupe animate-spin" />
          </div>

        ) : plan ? (
          usage && usage.total > 0 ? (
            /* Active plan — usage dashboard */
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total", value: usage.total, accent: false },
                  { label: "Used", value: usage.used, accent: false },
                  { label: "Remaining", value: usage.remaining, accent: true },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-center">
                    <p className={`font-serif text-5xl sm:text-6xl tabular-nums ${accent ? "text-sage" : ""}`}>{value}</p>
                    <p className="text-[10px] uppercase tracking-widest text-taupe mt-2">{label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="rounded-2xl border border-border bg-card px-8 py-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-sage" />
                    <span className="text-xs font-semibold text-sage uppercase tracking-widest">Active plan</span>
                  </div>
                  <span className="text-xs text-taupe">{usage.used} of {usage.total} used</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage transition-all duration-700 rounded-full"
                    style={{ width: `${Math.min(100, (usage.used / usage.total) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Top-up */}
              <div className="rounded-2xl border border-border bg-card p-8 flex flex-col lg:flex-row items-center gap-6">
                <div className="flex-1 text-center lg:text-left">
                  <h3 className="font-serif text-2xl mb-1">Running low?</h3>
                  <p className="text-sm text-taupe">Top up anytime — new generations are added to your balance.</p>
                </div>
                <button
                  onClick={handleBuy}
                  disabled={busy}
                  className="shrink-0 bg-foreground text-offwhite px-8 py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {busy ? "Redirecting…" : `Top up ${plan.generationsIncluded} more — $${plan.priceUsd}`}
                </button>
              </div>
            </motion.div>

          ) : (
            /* No plan — purchase */
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid lg:grid-cols-2 rounded-2xl overflow-hidden border border-border"
            >
              {/* Left: dark features panel */}
              <div className="bg-foreground text-offwhite p-10 flex flex-col">
                <div className="size-11 rounded-xl bg-white/10 flex items-center justify-center mb-8">
                  <Sparkles className="size-5 text-white" />
                </div>
                <h2 className="font-serif text-3xl mb-3">Growth Studio</h2>
                <p className="text-offwhite/60 text-sm mb-10 leading-relaxed">
                  Everything you need to turn appointments into scroll-stopping content.
                </p>
                <ul className="space-y-4 mt-auto">
                  {[
                    `${plan.generationsIncluded} AI content generations`,
                    "Brand DNA-aware captions & images",
                    "No expiry — use them whenever",
                    "Buy again anytime once they run out",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-offwhite/80">
                      <Check className="size-3.5 text-sage shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: pricing + CTA */}
              <div className="bg-card p-10 flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-8">One-time purchase</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="font-serif text-7xl tabular-nums leading-none">${plan.priceUsd}</span>
                  </div>
                  <p className="text-sm text-taupe mt-2 mb-10">
                    for <span className="font-semibold text-foreground">{plan.generationsIncluded} generations</span>
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleBuy}
                    disabled={busy}
                    className="w-full bg-foreground text-offwhite py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {busy ? "Redirecting…" : <>Buy now <ArrowRight className="size-3.5" /></>}
                  </button>
                  <p className="text-center text-[10px] text-taupe/60">
                    Secure payment via Stripe · No subscription
                  </p>
                </div>
              </div>
            </motion.div>
          )

        ) : (
          <p className="text-center text-sm text-taupe py-16">Plan details unavailable right now.</p>
        )}

      </div>
    </div>
  );
}
