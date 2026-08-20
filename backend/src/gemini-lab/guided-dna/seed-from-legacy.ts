import {
  CLIENT_TYPES,
  LANGUAGE_VARIANTS,
  MOODS,
  OBJECTIVES,
  PALETTE_SEEDS,
  SERVICE_CATEGORIES,
  SERVICES_BY_CATEGORY,
  TYPE_PAIRINGS,
  coerceGuidedDraft,
  emptyGuidedDraft,
  type EssenceWord,
  type GuidedDnaProfile,
  type MoodId,
  type ServiceCategory,
} from './contract';

const ENERGY_TO_MOOD: Record<string, MoodId> = {
  still_quiet: 'SOFT_GLAM',
  calm_warm: 'SOFT_GLAM',
  soft_clinical: 'CLEAN_CLINICAL',
  confident_editorial: 'EDITORIAL_MINIMAL',
  contemporary_cool: 'EDITORIAL_MINIMAL',
  energetic_bright: 'PLAYFUL_FRESH',
  natural_organic: 'NATURAL_ORGANIC',
  quiet_luxury: 'BOLD_LUXE',
  editorial_beauty: 'EDITORIAL_MINIMAL',
  clinical_minimalist: 'CLEAN_CLINICAL',
  warm_wellness: 'NATURAL_ORGANIC',
  soft_feminine: 'SOFT_GLAM',
  bold_campaign: 'BOLD_LUXE',
  high_fashion: 'BOLD_LUXE',
};

function parseV2(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : null;
}

function guessMood(dna: any, v2: Record<string, any> | null): MoodId {
  const energy = String(v2?.essence?.image_energy || dna.imageEnergy || '').toLowerCase();
  if (ENERGY_TO_MOOD[energy]) return ENERGY_TO_MOOD[energy];
  const style = String(v2?.visual_identity?.style_ranking?.[0] || '').toLowerCase();
  if (ENERGY_TO_MOOD[style]) return ENERGY_TO_MOOD[style];
  const aesthetic = String(dna.aestheticDirection || '').toLowerCase();
  for (const [k, mood] of Object.entries(ENERGY_TO_MOOD)) {
    if (aesthetic.includes(k.replace(/_/g, ' ')) || aesthetic.includes(k)) return mood;
  }
  return 'SOFT_GLAM';
}

function guessEssence(dna: any, v2: Record<string, any> | null, mood: MoodId): EssenceWord[] {
  const fromVoice = String(v2?.voice_v2?.three_words || dna.primaryTone || '')
    .toUpperCase()
    .split(/[\s·,]+/)
    .filter((w): w is EssenceWord =>
      (['WARM', 'FEMININE', 'PREMIUM', 'CALM', 'CONFIDENT', 'MINIMAL', 'EDITORIAL', 'NATURAL', 'PLAYFUL', 'CLINICAL', 'LUXE', 'APPROACHABLE', 'BOLD', 'SOFT', 'REFINED', 'EXPERT'] as string[]).includes(w),
    );
  if (fromVoice.length) return fromVoice.slice(0, 3);
  const hints = {
    SOFT_GLAM: ['WARM', 'FEMININE', 'PREMIUM'],
    CLEAN_CLINICAL: ['CLINICAL', 'MINIMAL', 'EXPERT'],
    EDITORIAL_MINIMAL: ['EDITORIAL', 'MINIMAL', 'REFINED'],
    NATURAL_ORGANIC: ['NATURAL', 'WARM', 'APPROACHABLE'],
    BOLD_LUXE: ['LUXE', 'BOLD', 'PREMIUM'],
    PLAYFUL_FRESH: ['PLAYFUL', 'APPROACHABLE', 'WARM'],
  } as Record<MoodId, EssenceWord[]>;
  return hints[mood];
}

export function seedGuidedFromLegacy(params: {
  dna: any | null;
  tenantName?: string | null;
}): GuidedDnaProfile {
  const draft = emptyGuidedDraft();
  const dna = params.dna;
  if (!dna) {
    draft.identity.brandName = params.tenantName || '';
    return coerceGuidedDraft(draft);
  }
  const v2 = parseV2(dna.brandDnaV2);
  const mood = guessMood(dna, v2);
  const pal = v2?.visual_identity?.palette || {};
  const cats: string[] = Array.isArray(v2?.foundations?.categories) && v2.foundations.categories.length
    ? v2.foundations.categories
    : Array.isArray(dna.serviceCategories) ? dna.serviceCategories : [];
  const category = (SERVICE_CATEGORIES as readonly string[]).includes(cats[0])
    ? (cats[0] as ServiceCategory)
    : (SERVICE_CATEGORIES as readonly string[]).includes(String(v2?.foundations?.category || ''))
      ? (v2!.foundations.category as ServiceCategory)
      : '';
  const knownServices = category ? SERVICES_BY_CATEGORY[category] : [];
  const rawServices = String(v2?.commercial?.hero_service || v2?.commercial?.secondary_services_text || '')
    .split(/[,/·\n]+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);
  const services = knownServices.filter((s) => rawServices.some((r) => r.includes(s) || s.includes(r))).slice(0, 6);

  const ageBits = String(v2?.ideal_client_v2?.age_range || '').match(/(\d{2})/g);
  const genderRaw = String(v2?.ideal_client_v2?.audience_gender || '').toLowerCase();
  const spelling = String(v2?.written_conventions?.spelling_variant || '').toLowerCase();
  const language = spelling.includes('us') ? 'US' : spelling.includes('uk') ? 'UK' : 'AU';
  const objectiveRaw = String(v2?.commercial?.content_objectives?.[0] || dna.commercialObjective || '').toUpperCase();
  const objective = (OBJECTIVES as readonly string[]).find((o) => objectiveRaw.includes(o) || objectiveRaw.includes(o.replace(/_/g, ' ')))
    || 'PREMIUM_CLIENTS';

  const posts = parseInt(String(v2?.content_strategy?.targets?.posts_per_week || ''), 10);
  const bookings = parseInt(String(v2?.content_strategy?.targets?.bookings_per_week || ''), 10);
  const medical = v2?.compliance?.medical_aesthetics_practitioner === true
    || cats.includes('medical_aesthetics');

  const bg = pal.background || dna.backgroundBrandColor || PALETTE_SEEDS[mood][0];
  const secondary = pal.secondary || dna.secondaryBrandColor || PALETTE_SEEDS[mood][1];
  const depth = pal.depth || dna.depthBrandColor || pal.primary || dna.primaryBrandColor || PALETTE_SEEDS[mood][2];
  const accent = pal.accent || dna.accentBrandColor || PALETTE_SEEDS[mood][3];

  const areas = String(v2?.foundations?.service_area || dna.serviceArea || '')
    .split(/[,/·]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const clientTypes = String(v2?.ideal_client_v2?.summary || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => (CLIENT_TYPES as readonly string[]).includes(t));

  draft.identity.brandName = String(v2?.foundations?.professional_name || dna.businessName || params.tenantName || '');
  draft.identity.logoUrl = dna.logoUrl || v2?.logo_asset_url || v2?.logo_storage_path || null;
  draft.identity.palette = [bg, secondary, depth, accent];
  draft.identity.mood = mood;
  draft.identity.typography = v2?.typography?.heading_font
    ? { heading: String(v2.typography.heading_font), body: String(v2.typography.body_font || 'Inter') }
    : { ...TYPE_PAIRINGS[mood] };
  draft.identity.essence = guessEssence(dna, v2, mood);
  draft.offering.serviceCategory = category;
  draft.offering.services = services;
  draft.offering.signatureHandle = v2?.foundations?.professional_name
    ? String(v2.foundations.professional_name).toLowerCase().replace(/\s+/g, '')
    : null;
  draft.offering.serviceAreas = areas;
  draft.audience.ageMin = ageBits?.[0] ? Math.max(18, parseInt(ageBits[0], 10)) : 25;
  draft.audience.ageMax = ageBits?.[1] ? Math.min(65, parseInt(ageBits[1], 10)) : 45;
  draft.audience.genderFocus = genderRaw.includes('men') && !genderRaw.includes('wo')
    ? 'MEN'
    : genderRaw.includes('all') || genderRaw.includes('everyone')
      ? 'ALL'
      : 'WOMEN';
  draft.audience.clientTypes = clientTypes.slice(0, 4);
  draft.strategy.objective = objective as GuidedDnaProfile['strategy']['objective'];
  draft.strategy.postsPerWeek = Number.isFinite(posts) && posts > 0 ? posts : 4;
  draft.strategy.bookingTargetPerMonth = Number.isFinite(bookings) && bookings > 0 ? bookings * 4 : 20;
  draft.config.languageVariant = (LANGUAGE_VARIANTS as readonly string[]).includes(language) ? language as any : 'AU';
  draft.config.medicalAestheticsCompliance = medical;
  draft.config.useAssetLibrary = !Array.isArray(v2?.asset_library) || v2.asset_library.length === 0;
  draft.story.userWritten = v2?.essence?.one_sentence || dna.brandEssenceSentence || dna.oneLiner || null;

  void MOODS;
  return coerceGuidedDraft(draft);
}
