import { api } from "@/lib/api";

export type OnboardingPayload = {
  // Brand Foundations
  displayName: string;
  serviceCategories: string[];
  signature: string;
  city: string;
  serviceArea: string;
  reputationAsset: string;
  knownFor: string;
  workDifferentiation: string;
  // Brand Essence
  brandEssenceSentence: string;
  brandWorldAnchor: string;
  imageEnergy: string;
  // Legacy / other tabs
  niche: string;
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
  // Colours (5-colour system)
  backgroundColor: string;
  accentColor: string;
  depthColor: string;
  // Visual Direction
  moodboardUrls: string[];
  moodboardLabels: string[];
  visualRanking: string[];
  lightingPreference: string;
  texturePreference: string;
  compositionStyle: string;
  environmentPreference: string;
  finishPreference: string;
  audienceLifestyle: string;
  commercialObjective: string;
  // Deeper ICP
  clientFears: string;
  clientTrustTriggers: string;
  clientVisualTaste: string;
  clientBuyingTriggers: string;
  clientEmotionalOutcome: string;
  // Brand perception
  brandPerceptionGoal: string;
  brandProofStatement: string;
  brandNeverLooksLike: string;
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
      serviceCategories: payload.serviceCategories || [],
      serviceArea: payload.serviceArea || undefined,
      reputationAsset: payload.reputationAsset || undefined,
      workDifferentiation: payload.workDifferentiation || undefined,
      brandEssenceSentence: payload.brandEssenceSentence || undefined,
      brandWorldAnchor: payload.brandWorldAnchor || undefined,
      imageEnergy: payload.imageEnergy || undefined,
      oneLiner: payload.knownFor || payload.niche,
      uniqueSellingProposition: payload.signature || payload.signatureService,
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
      backgroundBrandColor: payload.backgroundColor || undefined,
      accentBrandColor: payload.accentColor || undefined,
      depthBrandColor: payload.depthColor || undefined,
      emojiPolicy: payload.emojiPolicy || 'minimal',
      captionLengthPreference: payload.captionLength || 'medium',
      pillars,
      goals,
      logoUrl: payload.logoUrl || undefined,
      logoPosition: payload.logoPosition || 'bottom_right',
      moodboardUrls: payload.moodboardUrls?.filter(Boolean) || [],
      moodboardLabels: payload.moodboardLabels?.filter(Boolean) || [],
      visualRanking: payload.visualRanking?.filter(Boolean) || [],
      lightingPreference: payload.lightingPreference || undefined,
      texturePreference: payload.texturePreference || undefined,
      compositionStyle: payload.compositionStyle || undefined,
      environmentPreference: payload.environmentPreference || undefined,
      finishPreference: payload.finishPreference || undefined,
      audienceLifestyle: payload.audienceLifestyle || undefined,
      commercialObjective: payload.commercialObjective || undefined,
      clientFears: payload.clientFears || undefined,
      clientTrustTriggers: payload.clientTrustTriggers || undefined,
      clientVisualTaste: payload.clientVisualTaste || undefined,
      clientBuyingTriggers: payload.clientBuyingTriggers || undefined,
      clientEmotionalOutcome: payload.clientEmotionalOutcome || undefined,
      brandPerceptionGoal: payload.brandPerceptionGoal || undefined,
      brandProofStatement: payload.brandProofStatement || undefined,
      brandNeverLooksLike: payload.brandNeverLooksLike || undefined,
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
      serviceCategories: dna.serviceCategories || [],
      signature: dna.uniqueSellingProposition || "",
      city: dna.locationCity || "",
      serviceArea: dna.serviceArea || "",
      reputationAsset: dna.reputationAsset || "",
      knownFor: dna.oneLiner || "",
      workDifferentiation: dna.workDifferentiation || "",
      brandEssenceSentence: dna.brandEssenceSentence || "",
      brandWorldAnchor: dna.brandWorldAnchor || "",
      imageEnergy: dna.imageEnergy || "",
      niche: dna.oneLiner || "",
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
      backgroundColor: dna.backgroundBrandColor || "",
      accentColor: dna.accentBrandColor || "",
      depthColor: dna.depthBrandColor || "",
      moodboardUrls: dna.moodboardUrls?.length ? [...dna.moodboardUrls, ...Array(8).fill('')].slice(0, 8) : Array(8).fill(''),
      moodboardLabels: dna.moodboardLabels?.length ? [...dna.moodboardLabels, ...Array(8).fill('')].slice(0, 8) : Array(8).fill(''),
      visualRanking: dna.visualRanking?.length ? dna.visualRanking : [],
      lightingPreference: dna.lightingPreference || "",
      texturePreference: dna.texturePreference || "",
      compositionStyle: dna.compositionStyle || "",
      environmentPreference: dna.environmentPreference || "",
      finishPreference: dna.finishPreference || "",
      audienceLifestyle: dna.audienceLifestyle || "",
      commercialObjective: dna.commercialObjective || "",
      clientFears: dna.clientFears || "",
      clientTrustTriggers: dna.clientTrustTriggers || "",
      clientVisualTaste: dna.clientVisualTaste || "",
      clientBuyingTriggers: dna.clientBuyingTriggers || "",
      clientEmotionalOutcome: dna.clientEmotionalOutcome || "",
      brandPerceptionGoal: dna.brandPerceptionGoal || "",
      brandProofStatement: dna.brandProofStatement || "",
      brandNeverLooksLike: dna.brandNeverLooksLike || "",
    };
  } catch {
    return null;
  }
}
