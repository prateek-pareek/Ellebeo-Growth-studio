/**
 * Brand DNA data provider — Phase 2 (read-only).
 *
 * The page consumes a single shape (BrandDnaView) regardless of source.
 * Source resolution:
 *   - flag off OR signed-out OR any error → sample data
 *   - flag on AND signed-in AND row exists → cloud
 *   - flag on AND signed-in AND no row → empty state (handled by caller)
 *
 * No writes here. /brand/onboarding is unchanged in this phase.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFeatureFlag } from "@/lib/feature-flags";
import { brandDNA as sampleBrandDNA } from "@/lib/sample-data";

export type BrandDnaView = typeof sampleBrandDNA;
export type BrandDnaSource = "sample" | "cloud";

export type UseBrandDnaResult = {
  data: BrandDnaView | null;
  loading: boolean;
  source: BrandDnaSource;
  isEmpty: boolean;
  error: boolean;
};

function sampleResult(): UseBrandDnaResult {
  return { data: sampleBrandDNA, loading: false, source: "sample", isEmpty: false, error: false };
}

function mapCloudRow(dna: any): BrandDnaView {
  const pillars = dna.pillars || [];
  const goals = dna.goals || [];

  const weight = pillars.length > 0 ? Math.floor(100 / pillars.length) : 0;
  const mappedPillars = pillars.length > 0
    ? pillars.map((p: any, i: number) => ({
        name: p.label,
        description: p.description || "",
        weight: i === pillars.length - 1 ? 100 - weight * (pillars.length - 1) : weight,
      }))
    : sampleBrandDNA.pillars;

  const goalByLabel = new Map(goals.map((g: any) => [g.label.toLowerCase(), g.targetMetric || ""]));
  const num = (key: string, fallback: number) => {
    const v = parseInt(goalByLabel.get(key) || "", 10);
    return Number.isFinite(v) ? v : fallback;
  };

  return {
    ...sampleBrandDNA,
    ready: true,
    archetype: dna.aestheticDirection || sampleBrandDNA.archetype,
    oneLiner: dna.oneLiner || sampleBrandDNA.oneLiner,
    category: dna.businessName, // Or map from coreSpecialties
    pillars: mappedPillars,
    voice: {
      summary: dna.primaryTone || sampleBrandDNA.voice.summary,
      do: sampleBrandDNA.voice.do,
      dont: sampleBrandDNA.voice.dont,
    },
    idealClient: {
      ...sampleBrandDNA.idealClient,
      looksFor: dna.primaryPersona || sampleBrandDNA.idealClient.looksFor,
    },
    goals: {
      bookingsPerWeek: num("bookings per week", sampleBrandDNA.goals.bookingsPerWeek),
      postsPerWeek: num("posts per week", sampleBrandDNA.goals.postsPerWeek),
      focusServices: dna.coreSpecialties || sampleBrandDNA.goals.focusServices,
    },
  };
}

async function fetchCloudBrandDna(): Promise<
  | { kind: "ok"; data: BrandDnaView }
  | { kind: "empty" }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  try {
    const res = await api.get('/brand-dna');
    const data = res.data.data;
    if (!data) return { kind: "empty" };

    return {
      kind: "ok",
      data: mapCloudRow(data),
    };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.message };
  }
}

export function useBrandDna(): UseBrandDnaResult {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  // Default to sample so first paint is identical to today.
  const [state, setState] = useState<UseBrandDnaResult>(() => sampleResult());
  const reqId = useRef(0);

  useEffect(() => {
    if (!cloudEnabled) {
      setState(sampleResult());
      return;
    }

    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    fetchCloudBrandDna()
      .then((res) => {
        if (id !== reqId.current) return; // stale
        if (res.kind === "ok") {
          setState({ data: res.data, loading: false, source: "cloud", isEmpty: false, error: false });
        } else if (res.kind === "empty") {
          setState({ data: null, loading: false, source: "cloud", isEmpty: true, error: false });
        } else if (res.kind === "anon") {
          setState(sampleResult());
        } else {
          // error → fall back to sample, surface a subtle warning
          // eslint-disable-next-line no-console
          console.warn("[brand-dna] cloud fetch failed, using sample:", res.message);
          setState({ ...sampleResult(), error: true });
        }
      })
      .catch((err) => {
        if (id !== reqId.current) return;
        // eslint-disable-next-line no-console
        console.warn("[brand-dna] cloud fetch threw, using sample:", err);
        setState({ ...sampleResult(), error: true });
      });
  }, [cloudEnabled]);

  return state;
}
