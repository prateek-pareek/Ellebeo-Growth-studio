import { api } from "@/lib/api";

// Phase 6 (BRAND_DNA_GUIDED_V2 — /brand_dna_implementation_plan.md §10).
// Fire-and-forget on purpose — analytics must never block or fail the
// onboarding flow it's measuring.
export function trackBrandDnaEvent(event: string, step?: number, metadata?: Record<string, unknown>) {
  api.post("/brand-dna/v2/events", { event, step, metadata }).catch(() => {});
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}

// Compares the final value the technician confirmed against what the AI
// suggested, and fires the matching accepted/modified event.
export function trackSuggestionOutcome(step: number, kind: string, suggested: string[] | string | undefined, final: string[] | string) {
  if (suggested == null) return;
  const kept = Array.isArray(suggested) && Array.isArray(final) ? sameSet(suggested, final) : suggested === final;
  trackBrandDnaEvent(kept ? "suggestion_accepted" : "suggestion_modified", step, { kind });
}
