/** Gemini Lab–only Brand DNA v2. Do not import from the /generate pipeline. */

export const GUIDED_DNA_SCHEMA_VERSION = 2 as const;

export const MOODS = [
  'SOFT_GLAM',
  'CLEAN_CLINICAL',
  'EDITORIAL_MINIMAL',
  'NATURAL_ORGANIC',
  'BOLD_LUXE',
  'PLAYFUL_FRESH',
] as const;
export type MoodId = (typeof MOODS)[number];

export const ESSENCE_WORDS = [
  'WARM',
  'FEMININE',
  'PREMIUM',
  'CALM',
  'CONFIDENT',
  'MINIMAL',
  'EDITORIAL',
  'NATURAL',
  'PLAYFUL',
  'CLINICAL',
  'LUXE',
  'APPROACHABLE',
  'BOLD',
  'SOFT',
  'REFINED',
  'EXPERT',
] as const;
export type EssenceWord = (typeof ESSENCE_WORDS)[number];

export const OBJECTIVES = [
  'PREMIUM_CLIENTS',
  'FILL_QUIET_DAYS',
  'EDUCATE_TRUST',
  'PROMOTE_BRIDAL',
  'LAUNCH_PRODUCT',
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number];

export const GENDER_FOCUS = ['WOMEN', 'MEN', 'ALL'] as const;
export type GenderFocus = (typeof GENDER_FOCUS)[number];

export const LANGUAGE_VARIANTS = ['AU', 'UK', 'US'] as const;
export type LanguageVariant = (typeof LANGUAGE_VARIANTS)[number];

export const SERVICE_CATEGORIES = [
  'hair',
  'makeup',
  'nails',
  'eyelashes',
  'eyebrows',
  'skin',
  'medical_aesthetics',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CLIENT_TYPES = [
  'bridal',
  'colour_clients',
  'first_timers',
  'loyalty',
  'corporate',
  'wellness',
  'editorial',
] as const;

export const SERVICES_BY_CATEGORY: Record<ServiceCategory, string[]> = {
  hair: ['balayage', 'colour', 'cut', 'treatment', 'extensions', 'bridal_hair'],
  makeup: ['bridal', 'soft_glam', 'editorial', 'lessons', 'event'],
  nails: ['gel', 'builder', 'art', 'care', 'extensions'],
  eyelashes: ['classic', 'hybrid', 'volume', 'lift', 'tint'],
  eyebrows: ['lamination', 'shape', 'tint', 'microblading'],
  skin: ['facial', 'peel', 'hydration', 'led', 'consult'],
  medical_aesthetics: ['consult', 'skin_health', 'education', 'aftercare'],
};

export type TypePairing = { heading: string; body: string };

export const TYPE_PAIRINGS: Record<MoodId, TypePairing> = {
  SOFT_GLAM: { heading: 'Playfair Display', body: 'Inter' },
  CLEAN_CLINICAL: { heading: 'Inter', body: 'Inter' },
  EDITORIAL_MINIMAL: { heading: 'Cormorant Garamond', body: 'Inter' },
  NATURAL_ORGANIC: { heading: 'Fraunces', body: 'Source Sans 3' },
  BOLD_LUXE: { heading: 'Cinzel', body: 'Inter' },
  PLAYFUL_FRESH: { heading: 'Outfit', body: 'Inter' },
};

export const PALETTE_SEEDS: Record<MoodId, [string, string, string, string]> = {
  SOFT_GLAM: ['#F6EEE4', '#E8D5C4', '#5C4033', '#C9A227'],
  CLEAN_CLINICAL: ['#F7F7F5', '#E6E4DF', '#2F2F2F', '#9AA3A7'],
  EDITORIAL_MINIMAL: ['#F4F1EC', '#D9D2C5', '#1F1C19', '#8A7A6A'],
  NATURAL_ORGANIC: ['#F3EDE3', '#D4C4A8', '#3F4A3C', '#A3B18A'],
  BOLD_LUXE: ['#F7F0E6', '#D4AF77', '#1A1A1A', '#8B1E3F'],
  PLAYFUL_FRESH: ['#FFF6F0', '#F3C1B0', '#3D2C2E', '#E07A5F'],
};

export const MOOD_META: Record<MoodId, { label: string; blurb: string; essenceHints: EssenceWord[] }> = {
  SOFT_GLAM: {
    label: 'Soft glam',
    blurb: 'Warm light, cream space, quietly polished.',
    essenceHints: ['WARM', 'FEMININE', 'SOFT', 'PREMIUM'],
  },
  CLEAN_CLINICAL: {
    label: 'Clean clinical',
    blurb: 'Calm, precise, education-first.',
    essenceHints: ['CLINICAL', 'MINIMAL', 'CALM', 'EXPERT'],
  },
  EDITORIAL_MINIMAL: {
    label: 'Editorial minimal',
    blurb: 'Negative space, type-led, fashion-adjacent.',
    essenceHints: ['EDITORIAL', 'MINIMAL', 'REFINED', 'CONFIDENT'],
  },
  NATURAL_ORGANIC: {
    label: 'Natural organic',
    blurb: 'Skin, texture, unforced light.',
    essenceHints: ['NATURAL', 'WARM', 'APPROACHABLE', 'CALM'],
  },
  BOLD_LUXE: {
    label: 'Bold luxe',
    blurb: 'High contrast, jewellery-box, campaign energy.',
    essenceHints: ['LUXE', 'BOLD', 'PREMIUM', 'CONFIDENT'],
  },
  PLAYFUL_FRESH: {
    label: 'Playful fresh',
    blurb: 'Colour, movement, approachable spark.',
    essenceHints: ['PLAYFUL', 'APPROACHABLE', 'WARM', 'BOLD'],
  },
};

export const OBJECTIVE_META: Record<ObjectiveId, { label: string; blurb: string; sampleHeadline: string }> = {
  PREMIUM_CLIENTS: {
    label: 'Attract premium clients',
    blurb: 'Fewer, higher-value bookings.',
    sampleHeadline: 'Quiet luxury, done properly',
  },
  FILL_QUIET_DAYS: {
    label: 'Fill quiet days',
    blurb: 'Midweek and off-peak demand.',
    sampleHeadline: 'Your midweek reset',
  },
  EDUCATE_TRUST: {
    label: 'Educate & build trust',
    blurb: 'Authority without hard sell.',
    sampleHeadline: 'What we actually do',
  },
  PROMOTE_BRIDAL: {
    label: 'Promote bridal',
    blurb: 'Weddings and events pipeline.',
    sampleHeadline: 'For the day that matters',
  },
  LAUNCH_PRODUCT: {
    label: 'Launch a product',
    blurb: 'Retail or treatment drop.',
    sampleHeadline: 'New, and worth the wait',
  },
};

export type GuidedDnaProfile = {
  schemaVersion: typeof GUIDED_DNA_SCHEMA_VERSION;
  technicianId?: string;
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
  meta: { completedAt: string | null; source: 'guided_v2' };
};

export function emptyGuidedDraft(): GuidedDnaProfile {
  return {
    schemaVersion: GUIDED_DNA_SCHEMA_VERSION,
    identity: {
      brandName: '',
      logoAssetId: null,
      logoUrl: null,
      palette: [...PALETTE_SEEDS.SOFT_GLAM],
      mood: 'SOFT_GLAM',
      typography: { ...TYPE_PAIRINGS.SOFT_GLAM },
      essence: [],
    },
    offering: {
      serviceCategory: '',
      services: [],
      signatureHandle: null,
      serviceAreas: [],
    },
    audience: {
      ageMin: 25,
      ageMax: 45,
      genderFocus: 'WOMEN',
      clientTypes: [],
    },
    strategy: {
      objective: 'PREMIUM_CLIENTS',
      postsPerWeek: 4,
      bookingTargetPerMonth: 20,
    },
    config: {
      languageVariant: 'AU',
      platforms: { instagram: true, facebook: true, tiktok: false },
      medicalAestheticsCompliance: false,
      useAssetLibrary: true,
    },
    story: { userWritten: null, aiDrafted: null },
    meta: { completedAt: null, source: 'guided_v2' },
  };
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asHex(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  const withHash = raw.startsWith('#') ? raw : raw ? `#${raw}` : '';
  return HEX.test(withHash) ? withHash : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Coerce unknown JSON into a draft. Off-vocab values are repaired, never stored raw. */
export function coerceGuidedDraft(input: unknown): GuidedDnaProfile {
  const base = emptyGuidedDraft();
  const src = input && typeof input === 'object' ? (input as Record<string, any>) : {};
  const id = src.identity && typeof src.identity === 'object' ? src.identity : {};
  const off = src.offering && typeof src.offering === 'object' ? src.offering : {};
  const aud = src.audience && typeof src.audience === 'object' ? src.audience : {};
  const strat = src.strategy && typeof src.strategy === 'object' ? src.strategy : {};
  const cfg = src.config && typeof src.config === 'object' ? src.config : {};
  const story = src.story && typeof src.story === 'object' ? src.story : {};
  const mood = asEnum(id.mood, MOODS, base.identity.mood);
  const paletteSrc = Array.isArray(id.palette) ? id.palette : [];
  const seed = PALETTE_SEEDS[mood];
  const essence = (Array.isArray(id.essence) ? id.essence : [])
    .map((w: unknown) => String(w).toUpperCase())
    .filter((w: string): w is EssenceWord => (ESSENCE_WORDS as readonly string[]).includes(w))
    .slice(0, 3);
  const heading = String(id.typography?.heading || TYPE_PAIRINGS[mood].heading);
  const body = String(id.typography?.body || TYPE_PAIRINGS[mood].body);
  const platforms = cfg.platforms && typeof cfg.platforms === 'object' ? cfg.platforms : {};

  return {
    schemaVersion: GUIDED_DNA_SCHEMA_VERSION,
    technicianId: typeof src.technicianId === 'string' ? src.technicianId : undefined,
    identity: {
      brandName: String(id.brandName || '').slice(0, 120),
      logoAssetId: id.logoAssetId ? String(id.logoAssetId) : null,
      logoUrl: id.logoUrl ? String(id.logoUrl) : null,
      palette: [
        asHex(paletteSrc[0], seed[0]),
        asHex(paletteSrc[1], seed[1]),
        asHex(paletteSrc[2], seed[2]),
        asHex(paletteSrc[3], seed[3]),
      ],
      mood,
      typography: { heading, body },
      essence,
    },
    offering: {
      serviceCategory: String(off.serviceCategory || ''),
      services: Array.isArray(off.services) ? off.services.map((s: unknown) => String(s)).filter(Boolean).slice(0, 12) : [],
      signatureHandle: off.signatureHandle ? String(off.signatureHandle).slice(0, 80) : null,
      serviceAreas: Array.isArray(off.serviceAreas) ? off.serviceAreas.map((s: unknown) => String(s)).filter(Boolean).slice(0, 8) : [],
    },
    audience: {
      ageMin: clamp(Number(aud.ageMin) || 25, 18, 65),
      ageMax: clamp(Number(aud.ageMax) || 45, 18, 65),
      genderFocus: asEnum(aud.genderFocus, GENDER_FOCUS, 'WOMEN'),
      clientTypes: Array.isArray(aud.clientTypes)
        ? aud.clientTypes.map((t: unknown) => String(t)).filter((t: string) => (CLIENT_TYPES as readonly string[]).includes(t)).slice(0, 5)
        : [],
    },
    strategy: {
      objective: asEnum(strat.objective, OBJECTIVES, 'PREMIUM_CLIENTS'),
      postsPerWeek: clamp(Number(strat.postsPerWeek) || 4, 1, 14),
      bookingTargetPerMonth: clamp(Number(strat.bookingTargetPerMonth) || 20, 1, 200),
    },
    config: {
      languageVariant: asEnum(cfg.languageVariant, LANGUAGE_VARIANTS, 'AU'),
      platforms: {
        instagram: platforms.instagram !== false,
        facebook: platforms.facebook !== false,
        tiktok: platforms.tiktok === true,
      },
      medicalAestheticsCompliance: cfg.medicalAestheticsCompliance === true,
      useAssetLibrary: cfg.useAssetLibrary !== false,
    },
    story: {
      userWritten: story.userWritten ? String(story.userWritten).slice(0, 400) : null,
      aiDrafted: story.aiDrafted ? String(story.aiDrafted).slice(0, 400) : null,
    },
    meta: {
      completedAt: src.meta?.completedAt ? String(src.meta.completedAt) : null,
      source: 'guided_v2',
    },
  };
}

export function validateGuidedProfile(draft: GuidedDnaProfile): string[] {
  const errors: string[] = [];
  if (!draft.identity.brandName.trim()) errors.push('Brand name is missing.');
  if (!draft.offering.serviceCategory) errors.push('Pick a service category.');
  if (draft.identity.essence.length < 1) errors.push('Pick at least one essence word.');
  if (draft.identity.essence.length > 3) errors.push('Essence is max 3 words.');
  if (draft.audience.ageMin > draft.audience.ageMax) errors.push('Age range is inverted.');
  return errors;
}

export function isGuidedDnaEnabled(): boolean {
  return process.env['BRAND_DNA_GUIDED_V2'] !== 'false';
}

/** Hard gate: never infer; only the explicit boolean. */
export function labComplianceBlocksClientPhotos(profile: GuidedDnaProfile | null | undefined): boolean {
  return profile?.config.medicalAestheticsCompliance === true;
}
