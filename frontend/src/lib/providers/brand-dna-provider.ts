import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type BrandDnaView = {
  ready: boolean;
  archetype: string;
  oneLiner: string;
  category: string;
  powers: string[];
  palette: string[];
  moodboard: string[];
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
    const v = parseInt(goalByLabel.get(key) || "", 10);
    return Number.isFinite(v) ? v : 0;
  };

  return {
    ready: true,
    archetype: dna.aestheticDirection || "Expert",
    oneLiner: dna.oneLiner || "",
    category: dna.businessName || "",
    powers: [
      "AI caption generation",
      "Campaign planning",
      "Content pillar mix",
      "Ideal client targeting",
      "Voice consistency",
    ],
    palette: dna.visualPalette || ["#F5F2ED", "#D8C7B1", "#8C7E6D", "#3E3B35", "#2C2A26"],
    moodboard: dna.moodboardUrls || [
      "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop",
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=800&fit=crop",
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&h=800&fit=crop",
    ],
    pillars: mappedPillars,
    voice: {
      summary: dna.primaryTone || "",
      do: dna.voiceDo || [],
      dont: dna.voiceDont || [],
    },
    idealClient: {
      age: dna.personaAge || "25–45",
      cities: dna.personaLocation || "Local area",
      looksFor: dna.primaryPersona || "",
      painPoints: [],
      aspirations: [],
    },
    goals: {
      bookingsPerWeek: num("bookings per week"),
      postsPerWeek: num("posts per week"),
      focusServices: dna.coreSpecialties || [],
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
