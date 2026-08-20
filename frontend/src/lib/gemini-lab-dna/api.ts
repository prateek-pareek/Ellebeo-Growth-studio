import { api } from "@/lib/api";
import type { GuidedDnaProfile, MoodId } from "./contract";

function unwrap<T>(res: { data: any }): T {
  return (res.data?.data ?? res.data) as T;
}

export type GuidedDnaState = {
  currentStep: number;
  draft: GuidedDnaProfile;
  profile: GuidedDnaProfile | null;
  completedAt: string | null;
  seededFromLegacy: boolean;
  hasProductionDna?: boolean;
};

export async function loadGuidedDna(): Promise<GuidedDnaState> {
  return unwrap(await api.get("/gemini-lab/brand-dna"));
}

export async function saveGuidedDna(currentStep: number, draft: GuidedDnaProfile) {
  return unwrap<Pick<GuidedDnaState, "currentStep" | "draft" | "completedAt">>(
    await api.put("/gemini-lab/brand-dna", { currentStep, draft }),
  );
}

export async function completeGuidedDna(draft: GuidedDnaProfile) {
  return unwrap<{ profile: GuidedDnaProfile; completedAt: string | null }>(
    await api.post("/gemini-lab/brand-dna/complete", { currentStep: 5, draft }),
  );
}

export async function suggestIdentity(body: { serviceCategory?: string; services?: string[] }) {
  return unwrap<{
    moods: Array<{ id: MoodId; label: string; blurb: string; palette: string[]; essenceHints: string[]; typePairing: { heading: string; body: string } }>;
  }>(await api.post("/gemini-lab/brand-dna/suggest/identity", body));
}

export async function suggestEssence(body: { mood: string; services?: string[] }) {
  return unwrap<{ essence: string[] }>(await api.post("/gemini-lab/brand-dna/suggest/essence", body));
}

export async function suggestAudience(body: { serviceCategory?: string; services?: string[] }) {
  return unwrap<{ ageMin: number; ageMax: number; genderFocus: string; clientTypes: string[] }>(
    await api.post("/gemini-lab/brand-dna/suggest/audience", body),
  );
}

export async function suggestStrategy(body: { objective?: string; services?: string[] }) {
  return unwrap<{ objective: string; postsPerWeek: number; bookingTargetPerMonth: number; rationale: string }>(
    await api.post("/gemini-lab/brand-dna/suggest/strategy", body),
  );
}

export async function draftStory(draft: GuidedDnaProfile) {
  return unwrap<{ aiDrafted: string }>(await api.post("/gemini-lab/brand-dna/draft-story", { draft }));
}

export type WebsiteScanResult = {
  brandName: string;
  mood: MoodId;
  essence: string[];
  serviceCategory: string;
  services: string[];
  ageMin: number;
  ageMax: number;
  genderFocus: string;
  clientTypes: string[];
  objective: string;
  storySentence: string;
};

export async function scanWebsite(url: string) {
  return unwrap<WebsiteScanResult>(await api.post("/gemini-lab/brand-dna/scan-website", { url }));
}

/**
 * Adjusts the whole brand from one sentence.
 *
 * The wizard asks for around forty values across five steps. Nobody describes
 * their own studio that way — they say "we're more clinical than that".
 */
export async function adjustBrand(draft: GuidedDnaProfile, wish: string) {
  return unwrap<{ draft: GuidedDnaProfile; changed: string[] }>(
    await api.post("/gemini-lab/brand-dna/adjust", { draft, wish }),
  );
}
