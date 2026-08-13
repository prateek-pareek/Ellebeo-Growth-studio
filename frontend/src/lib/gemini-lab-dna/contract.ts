/** Keep in sync with backend/src/gemini-lab/guided-dna/contract.ts — Lab only. */

export const MOODS = [
  "SOFT_GLAM",
  "CLEAN_CLINICAL",
  "EDITORIAL_MINIMAL",
  "NATURAL_ORGANIC",
  "BOLD_LUXE",
  "PLAYFUL_FRESH",
] as const;
export type MoodId = (typeof MOODS)[number];

export const ESSENCE_WORDS = [
  "WARM", "FEMININE", "PREMIUM", "CALM", "CONFIDENT", "MINIMAL", "EDITORIAL",
  "NATURAL", "PLAYFUL", "CLINICAL", "LUXE", "APPROACHABLE", "BOLD", "SOFT",
  "REFINED", "EXPERT",
] as const;
export type EssenceWord = (typeof ESSENCE_WORDS)[number];

export const OBJECTIVES = [
  "PREMIUM_CLIENTS",
  "FILL_QUIET_DAYS",
  "EDUCATE_TRUST",
  "PROMOTE_BRIDAL",
  "LAUNCH_PRODUCT",
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number];

export const GENDER_FOCUS = ["WOMEN", "MEN", "ALL"] as const;
export type GenderFocus = (typeof GENDER_FOCUS)[number];

export const LANGUAGE_VARIANTS = ["AU", "UK", "US"] as const;
export type LanguageVariant = (typeof LANGUAGE_VARIANTS)[number];

export const SERVICE_CATEGORIES = [
  "hair", "makeup", "nails", "eyelashes", "eyebrows", "skin", "medical_aesthetics",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CLIENT_TYPES = [
  "bridal", "colour_clients", "first_timers", "loyalty", "corporate", "wellness", "editorial",
] as const;

export const SERVICES_BY_CATEGORY: Record<ServiceCategory, string[]> = {
  hair: ["balayage", "colour", "cut", "treatment", "extensions", "bridal_hair"],
  makeup: ["bridal", "soft_glam", "editorial", "lessons", "event"],
  nails: ["gel", "builder", "art", "care", "extensions"],
  eyelashes: ["classic", "hybrid", "volume", "lift", "tint"],
  eyebrows: ["lamination", "shape", "tint", "microblading"],
  skin: ["facial", "peel", "hydration", "led", "consult"],
  medical_aesthetics: ["consult", "skin_health", "education", "aftercare"],
};

export type TypePairing = { heading: string; body: string };

export const TYPE_PAIRINGS: Record<MoodId, TypePairing> = {
  SOFT_GLAM: { heading: "Playfair Display", body: "Inter" },
  CLEAN_CLINICAL: { heading: "Inter", body: "Inter" },
  EDITORIAL_MINIMAL: { heading: "Cormorant Garamond", body: "Inter" },
  NATURAL_ORGANIC: { heading: "Fraunces", body: "Source Sans 3" },
  BOLD_LUXE: { heading: "Cinzel", body: "Inter" },
  PLAYFUL_FRESH: { heading: "Outfit", body: "Inter" },
};

export const PALETTE_SEEDS: Record<MoodId, [string, string, string, string]> = {
  SOFT_GLAM: ["#F6EEE4", "#E8D5C4", "#5C4033", "#C9A227"],
  CLEAN_CLINICAL: ["#F7F7F5", "#E6E4DF", "#2F2F2F", "#9AA3A7"],
  EDITORIAL_MINIMAL: ["#F4F1EC", "#D9D2C5", "#1F1C19", "#8A7A6A"],
  NATURAL_ORGANIC: ["#F3EDE3", "#D4C4A8", "#3F4A3C", "#A3B18A"],
  BOLD_LUXE: ["#F7F0E6", "#D4AF77", "#1A1A1A", "#8B1E3F"],
  PLAYFUL_FRESH: ["#FFF6F0", "#F3C1B0", "#3D2C2E", "#E07A5F"],
};

export const MOOD_META: Record<MoodId, { label: string; blurb: string; essenceHints: EssenceWord[] }> = {
  SOFT_GLAM: { label: "Soft glam", blurb: "Warm light, cream space, quietly polished.", essenceHints: ["WARM", "FEMININE", "SOFT", "PREMIUM"] },
  CLEAN_CLINICAL: { label: "Clean clinical", blurb: "Calm, precise, education-first.", essenceHints: ["CLINICAL", "MINIMAL", "CALM", "EXPERT"] },
  EDITORIAL_MINIMAL: { label: "Editorial minimal", blurb: "Negative space, type-led, fashion-adjacent.", essenceHints: ["EDITORIAL", "MINIMAL", "REFINED", "CONFIDENT"] },
  NATURAL_ORGANIC: { label: "Natural organic", blurb: "Skin, texture, unforced light.", essenceHints: ["NATURAL", "WARM", "APPROACHABLE", "CALM"] },
  BOLD_LUXE: { label: "Bold luxe", blurb: "High contrast, jewellery-box, campaign energy.", essenceHints: ["LUXE", "BOLD", "PREMIUM", "CONFIDENT"] },
  PLAYFUL_FRESH: { label: "Playful fresh", blurb: "Colour, movement, approachable spark.", essenceHints: ["PLAYFUL", "APPROACHABLE", "WARM", "BOLD"] },
};

export const OBJECTIVE_META: Record<ObjectiveId, { label: string; blurb: string; sampleHeadline: string }> = {
  PREMIUM_CLIENTS: { label: "Attract premium clients", blurb: "Fewer, higher-value bookings.", sampleHeadline: "Quiet luxury, done properly" },
  FILL_QUIET_DAYS: { label: "Fill quiet days", blurb: "Midweek and off-peak demand.", sampleHeadline: "Your midweek reset" },
  EDUCATE_TRUST: { label: "Educate & build trust", blurb: "Authority without hard sell.", sampleHeadline: "What we actually do" },
  PROMOTE_BRIDAL: { label: "Promote bridal", blurb: "Weddings and events pipeline.", sampleHeadline: "For the day that matters" },
  LAUNCH_PRODUCT: { label: "Launch a product", blurb: "Retail or treatment drop.", sampleHeadline: "New, and worth the wait" },
};

export const STEPS = [
  { id: 1, label: "Autofill" },
  { id: 2, label: "Identity" },
  { id: 3, label: "Audience" },
  { id: 4, label: "Strategy" },
  { id: 5, label: "Config" },
  { id: 6, label: "Your words" },
  { id: 7, label: "Confirm" },
] as const;

export type GuidedDnaProfile = {
  schemaVersion: 2;
  identity: {
    brandName: string;
    logoAssetId: string | null;
    logoUrl: string | null;
    palette: [string, string, string, string];
    mood: MoodId;
    typography: TypePairing;
    essence: EssenceWord[];
  };
  offering: {
    serviceCategory: string;
    services: string[];
    signatureHandle: string | null;
    serviceAreas: string[];
  };
  audience: {
    ageMin: number;
    ageMax: number;
    genderFocus: GenderFocus;
    clientTypes: string[];
  };
  strategy: {
    objective: ObjectiveId;
    postsPerWeek: number;
    bookingTargetPerMonth: number;
  };
  config: {
    languageVariant: LanguageVariant;
    platforms: { instagram: boolean; facebook: boolean; tiktok: boolean };
    medicalAestheticsCompliance: boolean;
    useAssetLibrary: boolean;
  };
  story: { userWritten: string | null; aiDrafted: string | null };
  meta: { completedAt: string | null; source: "guided_v2" };
};

export function prettyChip(value: string) {
  return value.replace(/_/g, " ");
}
