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

function PlansPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseCanceled, setPurchaseCanceled] = useState(false);
  const [generationsRemaining, setGenerationsRemaining] = useState<number | null>(null);

  useEffect(() => {
    api.get("/generation/plan-info")
      .then((res) => setPlan(res.data?.data ?? res.data))
      .catch(() => toast.error("Could not load plan details."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (search.success) {
      setPurchaseSuccess(true);
      // Webhook usually finishes before this redirect lands, but poll briefly
      // in case it's still in flight.
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
    }
    if (search.canceled) setPurchaseCanceled(true);
  }, [search.success, search.canceled]);

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
    <div className="max-w-lg mx-auto pb-16">
      <header className="mt-6 lg:mt-10 mb-10 text-center">
        <Link to="/generate" className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="size-3" /> Back to generator
        </Link>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-3">
          {purchaseSuccess ? "Payment confirmed" : purchaseCanceled ? "Checkout canceled" : "Unlock the studio"}
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">
          {purchaseSuccess
            ? <>You're all <span className="italic text-taupe">set</span>.</>
            : purchaseCanceled
            ? <>No charge <span className="italic text-taupe">made</span>.</>
            : <>Buy generations to keep <span className="italic text-taupe">creating</span>.</>}
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[48ch] mx-auto">
          {purchaseSuccess
            ? "Your purchase went through. You're ready to turn more appointments into content."
            : purchaseCanceled
            ? "You backed out before paying — nothing was charged. You can try again whenever you're ready."
            : "A single one-time purchase unlocks a batch of AI generations for turning appointments into content."}
        </p>
      </header>

      {purchaseSuccess ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-sage/30 bg-card shadow-sm overflow-hidden flex flex-col"
        >
          <div className="h-1.5 bg-gradient-to-r from-sage via-sage to-sage/60" />
          <div className="p-8 flex flex-col items-center text-center">
            <div className="size-14 rounded-full bg-sage/10 flex items-center justify-center mb-5">
              <CheckCircle2 className="size-7 text-sage" />
            </div>
            <h2 className="font-serif text-2xl mb-2">Purchase complete</h2>
            <p className="text-sm text-taupe mb-6 leading-relaxed">
              {generationsRemaining === null
                ? "Confirming your balance…"
                : <>You now have <span className="font-semibold text-foreground">{generationsRemaining} generation{generationsRemaining !== 1 ? "s" : ""}</span> ready to use.</>}
            </p>
            <button
              onClick={() => navigate({ to: "/generate" })}
              className="w-full bg-foreground text-offwhite py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors inline-flex items-center justify-center gap-2"
            >
              Start creating <ArrowRight className="size-3.5" />
            </button>
          </div>
        </motion.div>
      ) : purchaseCanceled ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col"
        >
          <div className="h-1.5 bg-gradient-to-r from-taupe/40 via-border to-taupe/40" />
          <div className="p-8 flex flex-col items-center text-center">
            <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-5">
              <XCircle className="size-7 text-taupe" />
            </div>
            <h2 className="font-serif text-2xl mb-2">Checkout canceled</h2>
            <p className="text-sm text-taupe mb-6 leading-relaxed">
              Nothing was charged. Whenever you're ready, you can try again.
            </p>
            <button
              onClick={() => setPurchaseCanceled(false)}
              className="w-full bg-foreground text-offwhite py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            >
              Try again
            </button>
          </div>
        </motion.div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="size-5 text-taupe animate-spin" />
        </div>
      ) : plan ? (
        <motion.div
          whileHover={{ y: -3 }}
          className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
        >
          <div className="h-1.5 bg-gradient-to-r from-taupe via-nude to-sage" />
          <div className="p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 rounded-xl bg-gradient-to-br from-taupe to-sage flex items-center justify-center shadow-sm">
                <Sparkles className="size-5 text-white" />
              </div>
              <h2 className="font-serif text-2xl">Growth Studio Plan</h2>
            </div>

            <div className="flex items-end gap-1 mb-1">
              <span className="font-serif text-5xl tabular-nums">${plan.priceUsd}</span>
              <span className="text-sm text-taupe mb-2">one-time</span>
            </div>
            <p className="text-sm text-taupe mb-6">
              Unlocks <span className="font-semibold text-foreground">{plan.generationsIncluded} generations</span>
            </p>

            <ul className="space-y-2.5 mb-8">
              {[
                `${plan.generationsIncluded} AI content generations`,
                "Brand DNA-aware captions & images",
                "No expiry — use them whenever",
                "Buy again anytime once they run out",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="size-3.5 text-sage shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handleBuy}
              disabled={busy}
              className="w-full bg-foreground text-offwhite py-3.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50"
            >
              {busy ? "Redirecting…" : `Buy ${plan.generationsIncluded} generations — $${plan.priceUsd}`}
            </button>
          </div>
        </motion.div>
      ) : (
        <p className="text-center text-sm text-taupe">Plan details unavailable right now.</p>
      )}

      <p className="text-center text-[10px] text-taupe/60 mt-8">
        Payments processed securely by Stripe. One-time charge, no subscription.
      </p>
    </div>
  );
}
