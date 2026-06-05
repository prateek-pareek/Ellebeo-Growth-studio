import { api } from "@/lib/api";

export type OnboardingPayload = {
  displayName: string;
  niche: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  signatureService: string;
  otherServices: string;
  aestheticDirection: string;
  brandTier: string;
  voiceWords: string;
  alwaysDo: string;
  neverDo: string;
  emojiPolicy: string;
  captionLength: string;
  ageRange: string;
  cities: string;
  idealClient: string;
  bookingsPerWeek: string;
  postsPerWeek: string;
  pillars: string;
  logoUrl?: string;
  logoPosition?: string;
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
      personaAge: payload.ageRange,
      personaLocation: payload.cities || payload.city,
      primaryTone: payload.voiceWords,
      voiceDo: payload.alwaysDo.split('\n').filter(Boolean),
      voiceDont: payload.neverDo.split('\n').filter(Boolean),
      aestheticDirection: payload.aestheticDirection || undefined,
      brandTier: payload.brandTier || undefined,
      primaryBrandColor: payload.primaryColor || undefined,
      secondaryBrandColor: payload.secondaryColor || undefined,
      emojiPolicy: payload.emojiPolicy || 'minimal',
      captionLengthPreference: payload.captionLength || 'medium',
      pillars,
      goals,
      logoUrl: payload.logoUrl || undefined,
      logoPosition: payload.logoPosition || 'bottom_right',
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
      city: dna.locationCity || "",
      primaryColor: dna.primaryBrandColor || "",
      secondaryColor: dna.secondaryBrandColor || "",
      signatureService: dna.uniqueSellingProposition || "",
      otherServices: "",
      aestheticDirection: dna.aestheticDirection || "",
      brandTier: dna.brandTier || "",
      voiceWords: dna.primaryTone || "",
      alwaysDo: (dna.vocabularyPreferred || []).join('\n'),
      neverDo: (dna.doNotSay || []).join('\n'),
      emojiPolicy: dna.emojiPolicy || "minimal",
      captionLength: dna.captionLengthPreference || "medium",
      ageRange: dna.secondaryPersona || "",
      cities: dna.locationCity || "",
      idealClient: dna.primaryPersona || "",
      bookingsPerWeek: String(goalMap.get('bookings per week') ?? ""),
      postsPerWeek: String(goalMap.get('posts per week') ?? ""),
      pillars: (dna.pillars || []).map((p: any) => p.label).join(', '),
      logoUrl: dna.logoUrl || "",
      logoPosition: dna.logoPosition || "bottom_right",
    };
  } catch {
    return null;
  }
}
