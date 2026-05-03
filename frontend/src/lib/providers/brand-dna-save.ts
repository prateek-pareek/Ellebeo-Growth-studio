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
    if (payload.bookingsPerWeek) goals.push({ label: 'bookings per week', targetMetric: payload.bookingsPerWeek });
    if (payload.postsPerWeek) goals.push({ label: 'posts per week', targetMetric: payload.postsPerWeek });

    await api.post('/brand-dna', {
      businessName: payload.displayName,
      oneLiner: payload.niche,
      uniqueSellingProposition: payload.signatureService,
      primaryPersona: payload.idealClient,
      personaAge: payload.ageRange,
      personaLocation: payload.cities,
      primaryTone: payload.voiceWords,
      voiceDo: payload.alwaysDo.split('\n').filter(Boolean),
      voiceDont: payload.neverDo.split('\n').filter(Boolean),
      pillars,
      goals
    });

    return { kind: "ok" };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.response?.data?.message || error.message };
  }
}

export async function fetchBrandDnaForEditing(): Promise<OnboardingPayload | null> {
  try {
    const res = await api.get('/brand-dna');
    const dna = res.data.data;
    if (!dna) return null;

    const goalMap = new Map(dna.goals?.map((g: any) => [g.label.toLowerCase(), g.targetMetric]) || []);

    return {
      displayName: dna.businessName || "",
      niche: dna.oneLiner || "",
      city: dna.personaLocation || "",
      signatureService: dna.uniqueSellingProposition || "",
      otherServices: "",
      voiceWords: dna.primaryTone || "",
      alwaysDo: (dna.voiceDo || []).join('\n'),
      neverDo: (dna.voiceDont || []).join('\n'),
      ageRange: dna.personaAge || "",
      cities: dna.personaLocation || "",
      idealClient: dna.primaryPersona || "",
      bookingsPerWeek: goalMap.get('bookings per week') || "",
      postsPerWeek: goalMap.get('posts per week') || "",
      pillars: (dna.pillars || []).map((p: any) => p.label).join(', '),
    };
  } catch {
    return null;
  }
}
