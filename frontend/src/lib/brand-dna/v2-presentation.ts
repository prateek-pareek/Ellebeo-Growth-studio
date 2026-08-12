// Display metadata for Brand DNA Guided v2 — shared between the onboarding
// wizard (brand.onboarding.tsx) and the read-only view (brand.tsx) so labels
// can't drift apart between the two pages.
import { BRAND_MOODS, BRAND_OBJECTIVES, TYPE_PAIRINGS } from "@/lib/brand-dna/v2-schema";

export const MOOD_META: Record<(typeof BRAND_MOODS)[number], { label: string; hint: string; palette: string[] }> = {
  SOFT_GLAM: { label: "Soft Glam", hint: "Romantic, polished, feminine warmth.", palette: ["#F5D6D0", "#C98A8A", "#FFF7F3", "#8A5A5A", "#3D2A2A"] },
  CLEAN_CLINICAL: { label: "Clean Clinical", hint: "Precise, sterile, trust-first.", palette: ["#EAF2F2", "#3A7C7C", "#FFFFFF", "#1F3D3D", "#0F1F1F"] },
  EDITORIAL_MINIMAL: { label: "Editorial Minimal", hint: "Sleek, refined, quietly confident.", palette: ["#EDEDED", "#1A1A1A", "#FFFFFF", "#5C5C5C", "#000000"] },
  NATURAL_ORGANIC: { label: "Natural Organic", hint: "Earthy, gentle, hands-on craft.", palette: ["#F4EFE6", "#8A7355", "#FAF8F4", "#4E4335", "#2A241C"] },
  BOLD_LUXE: { label: "Bold Luxe", hint: "High-end, dramatic, statement-making.", palette: ["#D4AF37", "#1A1A2E", "#FFFFFF", "#8A7968", "#000000"] },
  PLAYFUL_FRESH: { label: "Playful Fresh", hint: "Vibrant, energetic, fun-first.", palette: ["#FFE5B4", "#FF6F61", "#FFFFFF", "#4ECDC4", "#2D2D2D"] },
};

export const TYPE_META: Record<(typeof TYPE_PAIRINGS)[number], { name: string; headClass: string }> = {
  CLASSIC_SERIF: { name: "Classic Serif", headClass: "font-serif font-normal" },
  MODERN_SANS: { name: "Modern Sans", headClass: "font-sans font-bold tracking-tight" },
  EDITORIAL_MIX: { name: "Editorial Mix", headClass: "font-serif italic font-normal" },
  WARM_ROUNDED: { name: "Warm Rounded", headClass: "font-serif font-normal" },
  BOLD_DISPLAY: { name: "Bold Display", headClass: "font-sans font-extrabold uppercase tracking-wide text-[0.85em]" },
  SOFT_SCRIPT: { name: "Soft Script", headClass: "font-serif italic font-normal text-[1.15em]" },
};

export const OBJECTIVE_META: Record<(typeof BRAND_OBJECTIVES)[number], { name: string; desc: string }> = {
  PREMIUM_CLIENTS: { name: "Attract premium clients", desc: "Position for higher-value bookings and fewer discount-seekers." },
  FILL_QUIET_DAYS: { name: "Fill quiet days", desc: "Drive last-minute and off-peak bookings." },
  EDUCATE_TRUST: { name: "Educate & build trust", desc: "Establish authority before someone books at all." },
  PROMOTE_BRIDAL: { name: "Promote bridal & events", desc: "Lead with occasion-based, higher-ticket packages." },
  LAUNCH_PRODUCT: { name: "Launch a new service", desc: "Introduce something new to your existing audience." },
};

export function moodLabel(mood: string, customLabel?: string | null): string {
  if (mood === "CUSTOM") return customLabel || "Custom mood";
  return MOOD_META[mood as (typeof BRAND_MOODS)[number]]?.label ?? mood;
}
