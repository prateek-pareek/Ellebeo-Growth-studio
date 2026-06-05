import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type BrandDnaView = {
  ready: boolean;
  archetype: string;
  oneLiner: string;
  category: string;
  voiceTones: string[];
  powers: string[];
  palette: string[];
  moodboard: string[];
  logoUrl: string;
  logoPosition: string;
  aestheticDirection: string;
  brandTier: string;
  emojiPolicy: string;
  captionLength: string;
  pillars: Array<{
    name: string;
    description: string;
    weight: number;
  }>;
  voice: {
    summary: string;
    do: string[];
    dont: string[];
  };
  idealClient: {
    age: string;
    cities: string;
    looksFor: string;
    painPoints: string[];
    aspirations: string[];
  };
  goals: {
    bookingsPerWeek: number;
    postsPerWeek: number;
    focusServices: string[];
  };
};

export type UseBrandDnaResult = {
  data: BrandDnaView | null;
  loading: boolean;
  source: "cloud";
  isEmpty: boolean;
  error: boolean;
};

function mapCloudRow(dna: any): BrandDnaView {
  const pillars = dna.pillars || [];
  const goals = dna.goals || [];

  const weight = pillars.length > 0 ? Math.floor(100 / pillars.length) : 0;
  const mappedPillars = pillars.map((p: any, i: number) => ({
    name: p.label,
    description: p.description || "",
    weight: i === pillars.length - 1 ? 100 - weight * (pillars.length - 1) : weight,
  }));

  const goalByLabel = new Map(goals.map((g: any) => [g.label.toLowerCase(), g.targetMetric || ""]));
  const num = (key: string) => {
    const v = parseInt(String(goalByLabel.get(key) ?? ""), 10);
    return Number.isFinite(v) ? v : 0;
  };

  // Parse voice tone words (stored as "Calm · Expert · Warm" or "calm, expert, warm")
  const rawTone: string = dna.primaryTone || "";
  const voiceTones = rawTone
    .split(/[\s·,]+/)
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    ready: true,
    // oneLiner is the niche (e.g. "Quiet Luxury Colourist"); uniqueSellingProposition is the service description
    archetype: dna.oneLiner || dna.businessName || "Your Brand",
    oneLiner: dna.uniqueSellingProposition || dna.oneLiner || "",
    category: dna.businessName || "",
    voiceTones,
    powers: ["Caption tone and word choice", "Template recommendations", "Campaign goals and CTAs", "Calendar pacing and pillar mix", "Profile bio and service descriptions"],
    palette: [
      dna.primaryBrandColor,
      dna.secondaryBrandColor
    ].filter(Boolean),
    moodboard: [],
    logoUrl: dna.logoUrl || "",
    logoPosition: dna.logoPosition || "bottom_right",
    aestheticDirection: dna.aestheticDirection || "",
    brandTier: dna.brandTier || "",
    emojiPolicy: dna.emojiPolicy || "minimal",
    captionLength: dna.captionLengthPreference || "medium",
    pillars: mappedPillars,
    voice: {
      summary: dna.primaryTone || "",
      do: dna.vocabularyPreferred || [],
      dont: dna.doNotSay || [],
    },
    idealClient: {
      age: dna.secondaryPersona || "",
      cities: dna.locationCity || "",
      looksFor: dna.primaryPersona || "",
      painPoints: dna.clientPainPoints || [],
      aspirations: [],
    },
    goals: {
      bookingsPerWeek: num("bookings per week"),
      postsPerWeek: num("posts per week"),
      focusServices: [],
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
  const [state, setState] = useState<UseBrandDnaResult>({
    data: null,
    loading: true,
    source: "cloud",
    isEmpty: false,
    error: false,
  });
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    fetchCloudBrandDna()
      .then((res) => {
        if (id !== reqId.current) return;
        if (res.kind === "ok") {
          setState({ data: res.data, loading: false, source: "cloud", isEmpty: false, error: false });
        } else if (res.kind === "empty") {
          setState({ data: null, loading: false, source: "cloud", isEmpty: true, error: false });
        } else {
          setState({ data: null, loading: false, source: "cloud", isEmpty: true, error: true });
        }
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setState({ data: null, loading: false, source: "cloud", isEmpty: true, error: true });
      });
  }, []);

  return state;
}
