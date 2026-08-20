import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useBrandDna, type BrandDnaView } from "./brand-dna-provider";

export type TemplateZone = { order: number; type: string; label: string };

// Structural data comes from the /templates API (format, pillar, categories,
// slide/zone layout). Every styling field below — preview image, palette,
// fonts — is derived from the active tenant's Brand DNA, never from the
// template record itself, so a template can never render off-brand.
export type Template = {
  id: string;
  slug: string;
  name: string;
  type: string;       // Carousel | Reel | Story | Caption | TikTok
  pillar: string;      // Transformations | Education | Behind the chair | Client stories
  categories: string[];
  description: string;
  goal: string;        // maps to generate page goal
  slideCount: number | null;
  zones: TemplateZone[];
  preview: string;         // brand moodboard image url ("" if tenant has none yet)
  paletteHexes: string[];  // ordered brand palette, for swatch rendering
  accentColor: string;
  backgroundColor: string;
  headingFont: string;
  bodyFont: string;
};

export type UseTemplatesResult = {
  templates: Template[];
  categories: string[];
  loading: boolean;
  error: boolean;
};

const FORMAT_LABEL: Record<string, string> = {
  carousel: "Carousel",
  reel: "Reel",
  story: "Story",
  caption: "Caption",
  tiktok: "TikTok",
};

function applyBrandStyling(raw: any[], brandDna: BrandDnaView | null): Template[] {
  const moodboard = (brandDna?.moodboardLabeled ?? []).map((m) => m.url).filter(Boolean);
  const paletteHexes = brandDna?.paletteLabeled.map((c) => c.hex) ?? [];
  const accentColor =
    brandDna?.paletteLabeled.find((c) => c.role === "Accent")?.hex || paletteHexes[0] || "";
  const backgroundColor = brandDna?.paletteLabeled.find((c) => c.role === "Background")?.hex || "";
  const headingFont = brandDna?.typography.headingFont || "";
  const bodyFont = brandDna?.typography.bodyFont || "";

  return raw.map((t, i) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    type: FORMAT_LABEL[t.format] ?? t.format,
    pillar: t.pillar ?? "",
    categories: t.categories ?? [],
    description: t.description ?? "",
    goal: t.goal ?? "",
    slideCount: t.slideCount ?? null,
    zones: Array.isArray(t.zones) ? t.zones : [],
    preview: moodboard.length > 0 ? moodboard[i % moodboard.length] : "",
    paletteHexes,
    accentColor,
    backgroundColor,
    headingFont,
    bodyFont,
  }));
}

export function useTemplates(): UseTemplatesResult {
  const { data: brandDna, loading: brandLoading } = useBrandDna();
  const [state, setState] = useState<{ raw: any[]; loading: boolean; error: boolean }>({
    raw: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get("/templates")
      .then((res) => {
        if (cancelled) return;
        setState({ raw: res.data?.data ?? [], loading: false, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ raw: [], loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const templates = applyBrandStyling(state.raw, brandDna);
  const categories = Array.from(new Set(templates.flatMap((t) => t.categories))).sort();

  return {
    templates,
    categories,
    loading: state.loading || brandLoading,
    error: state.error,
  };
}
