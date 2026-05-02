import { api } from "@/lib/api";

export type OnboardingPayload = {
  displayName: string;
  niche: string;
  city: string;
  signatureService: string;
  otherServices: string;
  voiceWords: string;
  alwaysDo: string;
  neverDo: string;
  ageRange: string;
  cities: string;
  idealClient: string;
  bookingsPerWeek: string;
  postsPerWeek: string;
  pillars: string;
};

export type SaveResult =
  | { kind: "ok" }
  | { kind: "anon" }
  | { kind: "error"; message: string };

export async function saveBrandDna(
  payload: OnboardingPayload
): Promise<SaveResult> {
  try {
    const pillars = payload.pillars.split(',').map(s => s.trim()).filter(Boolean);
    const goals = [];
    if (payload.bookingsPerWeek) goals.push({ label: 'bookings per week', target: payload.bookingsPerWeek });
    if (payload.postsPerWeek) goals.push({ label: 'posts per week', target: payload.postsPerWeek });

    await api.post('/brand-dna', {
      businessName: payload.displayName,
      oneLiner: payload.niche,
      uniqueSellingProposition: payload.signatureService,
      primaryPersona: payload.idealClient,
      primaryTone: payload.voiceWords,
      pillars,
      goals
    });

    return { kind: "ok" };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.response?.data?.message || error.message };
  }
}
