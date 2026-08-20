import { Logger } from '@nestjs/common';
import {
  CLIENT_TYPES,
  ESSENCE_WORDS,
  MOOD_META,
  MOODS,
  OBJECTIVES,
  OBJECTIVE_META,
  PALETTE_SEEDS,
  TYPE_PAIRINGS,
  coerceGuidedDraft,
  type EssenceWord,
  type GuidedDnaProfile,
  type MoodId,
} from './contract';

const logger = new Logger('GeminiLabDnaSuggest');
const TEXT_MODEL = 'gemini-2.5-flash';

async function geminiJson(prompt: string): Promise<any | null> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) return null;
  const model = process.env['GEMINI_MODEL'] || TEXT_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );
    const json = await res.json() as any;
    if (!res.ok) throw new Error(json?.error?.message || res.statusText);
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.warn(`Suggest call fell back: ${(err as Error).message}`);
    return null;
  }
}

function filterMoods(ids: unknown): MoodId[] {
  const allowed = new Set<string>(MOODS);
  const list = Array.isArray(ids) ? ids : [];
  const out = list.map((id) => String(id)).filter((id): id is MoodId => allowed.has(id));
  return out.length ? out : [...MOODS];
}

function filterEssence(ids: unknown): EssenceWord[] {
  const allowed = new Set<string>(ESSENCE_WORDS);
  const list = Array.isArray(ids) ? ids : [];
  return list.map((id) => String(id).toUpperCase()).filter((id): id is EssenceWord => allowed.has(id)).slice(0, 8);
}

export function fallbackIdentity(serviceCategory?: string) {
  const clinical = serviceCategory === 'medical_aesthetics' || serviceCategory === 'skin';
  const order: MoodId[] = clinical
    ? ['CLEAN_CLINICAL', 'EDITORIAL_MINIMAL', 'SOFT_GLAM', 'NATURAL_ORGANIC', 'BOLD_LUXE', 'PLAYFUL_FRESH']
    : [...MOODS];
  return {
    moods: order.map((id) => ({
      id,
      label: MOOD_META[id].label,
      blurb: MOOD_META[id].blurb,
      palette: PALETTE_SEEDS[id],
      essenceHints: MOOD_META[id].essenceHints,
      typePairing: TYPE_PAIRINGS[id],
    })),
    typePairings: order.map((id) => ({ id, ...TYPE_PAIRINGS[id] })),
    paletteSeeds: order.map((id) => ({ id, palette: PALETTE_SEEDS[id] })),
  };
}

export async function suggestIdentity(input: { serviceCategory?: string; services?: string[] }) {
  const fallback = fallbackIdentity(input.serviceCategory);
  const parsed = await geminiJson([
    `Rank these brand moods for a ${input.serviceCategory || 'beauty'} professional.`,
    `Services: ${(input.services || []).join(', ') || 'unspecified'}.`,
    `Allowed mood ids: ${MOODS.join(', ')}.`,
    `Return JSON only: {"moods":["SOFT_GLAM", "..."]}`,
    `Use only allowed ids. Rank best-fit first.`,
  ].join('\n'));
  const ranked = filterMoods(parsed?.moods);
  const byId = new Map(fallback.moods.map((m) => [m.id, m]));
  return {
    moods: ranked.map((id) => byId.get(id)!).filter(Boolean),
    typePairings: ranked.map((id) => ({ id, ...TYPE_PAIRINGS[id] })),
    paletteSeeds: ranked.map((id) => ({ id, palette: PALETTE_SEEDS[id] })),
  };
}

export async function suggestEssence(input: { mood: string; services?: string[] }) {
  const mood = (MOODS as readonly string[]).includes(input.mood) ? (input.mood as MoodId) : 'SOFT_GLAM';
  const hints = MOOD_META[mood].essenceHints;
  const parsed = await geminiJson([
    `Pick up to 8 essence words for mood ${mood}, services ${(input.services || []).join(', ') || 'unspecified'}.`,
    `Allowed: ${ESSENCE_WORDS.join(', ')}.`,
    `Return JSON only: {"essence":["WARM","FEMININE"]}`,
  ].join('\n'));
  const ranked = filterEssence(parsed?.essence);
  const merged = [...ranked, ...hints].filter((w, i, arr) => arr.indexOf(w) === i).slice(0, 8);
  return { essence: merged.length ? merged : hints };
}

export async function suggestAudience(input: { serviceCategory?: string; services?: string[] }) {
  const bridal = (input.services || []).some((s) => s.includes('bridal'));
  const medical = input.serviceCategory === 'medical_aesthetics';
  const fallback = {
    ageMin: bridal ? 22 : medical ? 28 : 25,
    ageMax: bridal ? 40 : medical ? 55 : 45,
    genderFocus: 'WOMEN' as const,
    clientTypes: bridal ? ['bridal', 'loyalty'] : medical ? ['wellness', 'first_timers'] : ['colour_clients', 'loyalty'],
  };
  const parsed = await geminiJson([
    `Suggest ideal client for ${input.serviceCategory || 'beauty'}: ${(input.services || []).join(', ')}.`,
    `genderFocus must be WOMEN, MEN, or ALL. clientTypes from: ${CLIENT_TYPES.join(', ')}.`,
    `Return JSON only: {"ageMin":25,"ageMax":45,"genderFocus":"WOMEN","clientTypes":["loyalty"]}`,
  ].join('\n'));
  if (!parsed) return fallback;
  const types = Array.isArray(parsed.clientTypes)
    ? parsed.clientTypes.map((t: unknown) => String(t)).filter((t: string) => (CLIENT_TYPES as readonly string[]).includes(t)).slice(0, 5)
    : fallback.clientTypes;
  const gender = ['WOMEN', 'MEN', 'ALL'].includes(parsed.genderFocus) ? parsed.genderFocus : 'WOMEN';
  return {
    ageMin: Math.min(65, Math.max(18, Number(parsed.ageMin) || fallback.ageMin)),
    ageMax: Math.min(65, Math.max(18, Number(parsed.ageMax) || fallback.ageMax)),
    genderFocus: gender,
    clientTypes: types.length ? types : fallback.clientTypes,
  };
}

export async function suggestStrategy(input: { objective?: string; services?: string[] }) {
  const bridal = (input.services || []).some((s) => s.includes('bridal'));
  const objective = (OBJECTIVES as readonly string[]).includes(String(input.objective))
    ? input.objective
    : bridal ? 'PROMOTE_BRIDAL' : 'PREMIUM_CLIENTS';
  const fallback = {
    objective,
    postsPerWeek: 4,
    bookingTargetPerMonth: 20,
    rationale: OBJECTIVE_META[objective as keyof typeof OBJECTIVE_META]?.blurb || '',
  };
  const parsed = await geminiJson([
    `Suggest content strategy. Preferred objective ${objective}. Services: ${(input.services || []).join(', ')}.`,
    `objective must be one of: ${OBJECTIVES.join(', ')}.`,
    `Return JSON only: {"objective":"PREMIUM_CLIENTS","postsPerWeek":4,"bookingTargetPerMonth":20,"rationale":""}`,
  ].join('\n'));
  if (!parsed) return fallback;
  const obj = (OBJECTIVES as readonly string[]).includes(parsed.objective) ? parsed.objective : fallback.objective;
  return {
    objective: obj,
    postsPerWeek: Math.min(14, Math.max(1, Number(parsed.postsPerWeek) || 4)),
    bookingTargetPerMonth: Math.min(200, Math.max(1, Number(parsed.bookingTargetPerMonth) || 20)),
    rationale: String(parsed.rationale || OBJECTIVE_META[obj as keyof typeof OBJECTIVE_META]?.blurb || '').slice(0, 180),
  };
}

export async function draftStory(draftInput: unknown): Promise<{ aiDrafted: string }> {
  const draft = coerceGuidedDraft(draftInput) as GuidedDnaProfile;
  const fallback = `${draft.identity.brandName || 'This studio'} is ${draft.identity.essence.map((e) => e.toLowerCase()).join(', ') || 'considered'} ${MOOD_META[draft.identity.mood].label.toLowerCase()} work for ${draft.offering.serviceCategory || 'clients'} who want it done properly.`;
  const parsed = await geminiJson([
    `Write 1–2 sentences for a beauty brand story. No medical claims. No invented results.`,
    `Name: ${draft.identity.brandName}`,
    `Mood: ${draft.identity.mood}`,
    `Essence: ${draft.identity.essence.join(', ')}`,
    `Category: ${draft.offering.serviceCategory}`,
    `Services: ${draft.offering.services.join(', ')}`,
    `Objective: ${draft.strategy.objective}`,
    `Optional user note: ${draft.story.userWritten || '(none)'}`,
    `Return JSON only: {"aiDrafted":"..."}`,
  ].join('\n'));
  const text = String(parsed?.aiDrafted || '').trim();
  return { aiDrafted: (text || fallback).slice(0, 400) };
}

/**
 * Adjusts a whole brand in the studio's own words.
 *
 * The wizard asks for around forty separate values across five steps. Nobody
 * describes their own studio that way — they say "we're warmer than that" or
 * "we're more clinical, less soft". This takes the profile as it stands, one
 * sentence of intent, and returns the profile adjusted.
 *
 * The vocabularies are closed: mood, essence words and objective must come
 * from the lists the rest of the system renders from, so an adjustment can
 * never produce a brand the compositor cannot draw. Anything the model returns
 * outside those lists is dropped by coerceGuidedDraft on the way back.
 */
export async function adjustBrand(
  draftInput: unknown,
  wish: string,
): Promise<{ draft: GuidedDnaProfile; changed: string[] }> {
  const draft = coerceGuidedDraft(draftInput) as GuidedDnaProfile;
  const parsed = await geminiJson(
    [
      "You are adjusting a beauty studio's brand profile. The studio has said, in their own words, what they want changed.",
      '',
      `WHAT THEY SAID: "${String(wish).trim().slice(0, 300)}"`,
      '',
      'THE PROFILE AS IT STANDS:',
      JSON.stringify(
        {
          brandName: draft.identity.brandName,
          mood: draft.identity.mood,
          essence: draft.identity.essence,
          serviceCategory: draft.offering.serviceCategory,
          services: draft.offering.services,
          clientTypes: draft.audience.clientTypes,
          ageMin: draft.audience.ageMin,
          ageMax: draft.audience.ageMax,
          objective: draft.strategy.objective,
          story: draft.story.userWritten || draft.story.aiDrafted || '',
        },
        null,
        1,
      ),
      '',
      'Change ONLY what they asked for, and whatever genuinely follows from it. Leave everything else exactly as it is.',
      `mood must be one of: ${MOODS.join(', ')}`,
      `each essence word must be one of: ${ESSENCE_WORDS.join(', ')}`,
      `objective must be one of: ${OBJECTIVES.join(', ')}`,
      'Never invent a service the studio does not offer, a client testimonial, a price, or a medical claim.',
      '',
      'Return JSON only, with the same keys as the profile above, plus "changed": a list of the key names you actually altered.',
    ].join('\n'),
  );

  if (!parsed) return { draft, changed: [] };

  const next: GuidedDnaProfile = {
    ...draft,
    identity: {
      ...draft.identity,
      brandName: typeof parsed.brandName === 'string' ? parsed.brandName : draft.identity.brandName,
      mood: parsed.mood ?? draft.identity.mood,
      essence: Array.isArray(parsed.essence) ? parsed.essence : draft.identity.essence,
    },
    offering: {
      ...draft.offering,
      serviceCategory:
        typeof parsed.serviceCategory === 'string' ? parsed.serviceCategory : draft.offering.serviceCategory,
      services: Array.isArray(parsed.services) ? parsed.services : draft.offering.services,
    },
    audience: {
      ...draft.audience,
      clientTypes: Array.isArray(parsed.clientTypes) ? parsed.clientTypes : draft.audience.clientTypes,
      ageMin: Number.isFinite(parsed.ageMin) ? parsed.ageMin : draft.audience.ageMin,
      ageMax: Number.isFinite(parsed.ageMax) ? parsed.ageMax : draft.audience.ageMax,
    },
    strategy: {
      ...draft.strategy,
      objective: parsed.objective ?? draft.strategy.objective,
    },
    story: {
      ...draft.story,
      aiDrafted: typeof parsed.story === 'string' && parsed.story.trim() ? parsed.story.trim() : draft.story.aiDrafted,
    },
  };

  // Coerced on the way out, so an out-of-vocabulary mood or essence word from
  // the model is replaced rather than stored.
  const safe = coerceGuidedDraft(next) as GuidedDnaProfile;
  const changed = Array.isArray(parsed.changed)
    ? parsed.changed.filter((c: unknown) => typeof c === 'string').slice(0, 12)
    : [];
  return { draft: safe, changed };
}
