import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, ArrowLeft, RefreshCw } from "lucide-react";
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
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/generation/plan-info")
      .then((res) => setPlan(res.data?.data ?? res.data))
      .catch(() => toast.error("Could not load plan details."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (search.success) toast.success("Payment successful! Your generations are now available.");
    if (search.canceled) toast("Checkout canceled. You can buy anytime.");
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
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-3">Unlock the studio</p>
        <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">
          Buy generations to keep <span className="italic text-taupe">creating</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[48ch] mx-auto">
          A single one-time purchase unlocks a batch of AI generations for turning appointments into content.
        </p>
      </header>

      {loading ? (
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
