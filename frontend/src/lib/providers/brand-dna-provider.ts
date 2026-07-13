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
  paletteLabeled: Array<{ role: string; hex: string }>;
  moodboard: string[];
  moodboardLabeled: Array<{ url: string; usage: string }>;
  assetLibrary: Array<{ id: string; url: string; assetType: string; usageRule: string; consentStatus: string }>;
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
  refresh: () => void;
};

function mapCloudRow(dna: any): BrandDnaView {
  const pillars = dna.pillars || [];
  const goals = dna.goals || [];

  // brandDnaV2 carries the richer per-image moodboard usage tags and the full
  // asset library — neither is mirrored to scalar columns the way palette/moodboardUrls are.
  const v2 = typeof dna.brandDnaV2 === "string" ? JSON.parse(dna.brandDnaV2) : dna.brandDnaV2;
  const v2Moodboard: any[] = Array.isArray(v2?.moodboard) ? v2.moodboard : [];
  const v2AssetLibrary: any[] = Array.isArray(v2?.asset_library) ? v2.asset_library : [];

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
      dna.secondaryBrandColor,
      dna.backgroundBrandColor,
      dna.accentBrandColor,
      dna.depthBrandColor,
    ].filter(Boolean),
    paletteLabeled: [
      { role: "Primary", hex: dna.primaryBrandColor },
      { role: "Secondary", hex: dna.secondaryBrandColor },
      { role: "Background", hex: dna.backgroundBrandColor },
      { role: "Accent", hex: dna.accentBrandColor },
      { role: "Depth", hex: dna.depthBrandColor },
    ].filter((c) => Boolean(c.hex)),
    moodboard: dna.moodboardUrls || [],
    moodboardLabeled: v2Moodboard.length > 0
      ? v2Moodboard.filter((m) => m.storage_path).map((m) => ({ url: m.storage_path, usage: m.usage || "" }))
      : (dna.moodboardUrls || []).map((url: string) => ({ url, usage: "" })),
    assetLibrary: v2AssetLibrary
      .filter((a) => a.storage_path)
      .map((a) => ({
        id: a.id || a.storage_path,
        url: a.storage_path,
        assetType: a.asset_type || "",
        usageRule: a.usage_rule || "",
        consentStatus: a.consent_status || "",
      })),
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
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<UseBrandDnaResult, "refresh">>({
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
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
