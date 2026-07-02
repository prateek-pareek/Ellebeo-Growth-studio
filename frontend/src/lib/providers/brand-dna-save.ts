import { api } from "@/lib/api";
import type { BrandDnaRecord, DraftStatus } from "@/lib/brand-dna/schema";
import { EMPTY_BRAND_DNA } from "@/lib/brand-dna/schema";

export type { BrandDnaRecord, DraftStatus };

export type SaveResult =
  | { kind: "ok" }
  | { kind: "anon" }
  | { kind: "error"; message: string };

export type LoadResult =
  | { kind: "ok"; record: BrandDnaRecord }
  | { kind: "empty" }
  | { kind: "anon" }
  | { kind: "error"; message: string };

export async function saveBrandDnaRecord(
  record: BrandDnaRecord,
  _status: DraftStatus,
): Promise<SaveResult> {
  try {
    await api.post("/brand-dna", {
      businessName: record.foundations.professional_name || "My Brand",
      brandDnaV2: record,
      // Mirror key scalar fields for backwards compat with AI prompt builder
      serviceCategories: record.foundations.categories,
      serviceArea: record.foundations.service_area || undefined,
      personaLocation: record.foundations.location || undefined,
      oneLiner: record.foundations.known_for || undefined,
      brandEssenceSentence: record.essence.one_sentence || undefined,
      brandWorldAnchor: record.essence.world_anchor || undefined,
      imageEnergy: record.essence.image_energy || undefined,
      primaryBrandColor: record.visual_identity.palette.primary || undefined,
      secondaryBrandColor: record.visual_identity.palette.secondary || undefined,
      backgroundBrandColor: record.visual_identity.palette.background || undefined,
      accentBrandColor: record.visual_identity.palette.accent || undefined,
      depthBrandColor: record.visual_identity.palette.depth || undefined,
      primaryTone: record.voice_v2.three_words || undefined,
      emojiPolicy: record.voice_v2.emoji_usage || "minimal",
      captionLengthPreference: record.voice_v2.caption_length || "medium",
      primaryPersona: record.ideal_client_v2.summary || undefined,
      moodboardUrls: record.moodboard.map((m) => m.storage_path).filter(Boolean),
      moodboardLabels: record.moodboard.map((m) => m.usage).filter(Boolean),
      visualRanking: record.visual_identity.style_ranking,
      pillars: record.content_strategy.pillars_ranked,
      logoUrl: record.logo_storage_path || undefined,
      logoPosition: record.logo_position || 'bottom_right',
      goals: [
        record.content_strategy.targets.bookings_per_week
          ? { label: "bookings per week", target: record.content_strategy.targets.bookings_per_week }
          : null,
        record.content_strategy.targets.posts_per_week
          ? { label: "posts per week", target: record.content_strategy.targets.posts_per_week }
          : null,
      ].filter(Boolean),
    });
    return { kind: "ok" };
  } catch (err: any) {
    if (err.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: err.response?.data?.message || err.message };
  }
}

export async function loadBrandDnaRecord(): Promise<LoadResult> {
  try {
    const res = await api.get("/brand-dna");
    const dna = res.data?.data;
    if (!dna) return { kind: "empty" };

    // New JSONB record takes priority over scalar columns
    if (dna.brandDnaV2 && typeof dna.brandDnaV2 === "object") {
      return { kind: "ok", record: dna.brandDnaV2 as BrandDnaRecord };
    }

    // Seed from legacy scalar columns so existing data is not lost
    const record: BrandDnaRecord = {
      ...EMPTY_BRAND_DNA,
      foundations: {
        ...EMPTY_BRAND_DNA.foundations,
        professional_name: dna.businessName || "",
        categories: dna.serviceCategories || [],
        category: (dna.serviceCategories || [])[0] || "",
        location: dna.locationCity || "",
        service_area: dna.serviceArea || "",
        known_for: dna.oneLiner || "",
        reputation_asset: dna.reputationAsset || "",
        what_makes_different: dna.workDifferentiation || "",
        niche: dna.uniqueSellingProposition || "",
      },
      essence: {
        one_sentence: dna.brandEssenceSentence || "",
        world_anchor: dna.brandWorldAnchor || "",
        image_energy: (dna.imageEnergy as any) || "",
      },
      visual_identity: {
        ...EMPTY_BRAND_DNA.visual_identity,
        palette: {
          primary: dna.primaryBrandColor || "",
          secondary: dna.secondaryBrandColor || "",
          background: dna.backgroundBrandColor || "",
          accent: dna.accentBrandColor || "",
          depth: dna.depthBrandColor || "",
        },
        style_ranking: dna.visualRanking || [],
      },
      voice_v2: {
        ...EMPTY_BRAND_DNA.voice_v2,
        three_words: dna.primaryTone || "",
        emoji_usage: (dna.emojiPolicy as any) || "",
        caption_length: (dna.captionLengthPreference as any) || "",
      },
      ideal_client_v2: {
        ...EMPTY_BRAND_DNA.ideal_client_v2,
        summary: dna.primaryPersona || "",
        fears_objections: dna.clientFears || "",
        trust_signals: dna.clientTrustTriggers || "",
        visual_taste: dna.clientVisualTaste || "",
        buying_motivation: dna.clientBuyingTriggers || "",
        feeling_after_booking: dna.clientEmotionalOutcome || "",
      },
      moodboard: (dna.moodboardUrls || []).map((url: string, i: number) => ({
        id: `legacy-${i}`,
        storage_path: url,
        filename: `reference-${i + 1}.jpg`,
        usage: (dna.moodboardLabels?.[i] || "") as any,
        notes: "",
        is_priority: false,
      })),
      content_strategy: {
        ...EMPTY_BRAND_DNA.content_strategy,
        pillars_ranked: (dna.pillars || []).map((p: any) => p.label || p),
        targets: {
          bookings_per_week: String((dna.goals || []).find((g: any) => g.label?.includes("booking"))?.targetMetric ?? ""),
          posts_per_week: String((dna.goals || []).find((g: any) => g.label?.includes("posts"))?.targetMetric ?? ""),
        },
      },
      compliance: {
        ...EMPTY_BRAND_DNA.compliance,
        medical_aesthetics_practitioner:
          (dna.serviceCategories || []).includes("medical_aesthetics"),
      },
    };
    return { kind: "ok", record };
  } catch (err: any) {
    if (err.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: err.message };
  }
}
