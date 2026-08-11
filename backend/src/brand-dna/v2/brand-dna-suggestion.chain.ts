// Phase 3 — AI suggestion endpoints (BRAND_DNA_GUIDED_V2, /brand_dna_implementation_plan.md §5).
// Each method returns OPTIONS for the user to pick from, never final saved
// text. Hallucination control is enforced here, not trusted from the model:
// every enum-shaped field is validated post-parse and repaired/defaulted if
// the model returns anything outside the controlled vocabulary. Only the two
// explicitly-free-text fields (rationale, aiDrafted story) skip enum
// validation, and even those are length-capped and HTML/control-char
// stripped before leaving this file.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  BRAND_MOODS, BRAND_OBJECTIVES, GENDER_FOCUS_OPTIONS, ESSENCE_WORDS, TYPE_PAIRINGS,
  MOOD_PALETTE_SEEDS,
} from './brand-dna-v2.constants';
import { BrandMoodV2, BrandObjectiveV2 } from './brand-dna-v2.types';

export interface IdentitySuggestion {
  moods: { id: BrandMoodV2; label: string; palette: string[]; essenceHints: string[] }[];
  typePairing: (typeof TYPE_PAIRINGS)[number];
}

export interface EssenceSuggestion { essence: string[] }

export interface AudienceSuggestion {
  ageMin: number; ageMax: number; genderFocus: (typeof GENDER_FOCUS_OPTIONS)[number]; clientTypes: string[];
}

export interface StrategySuggestion {
  objective: BrandObjectiveV2; postsPerWeek: number; bookingTargetPerMonth: number; rationale: string;
}

export interface DraftStorySuggestion { aiDrafted: string }

function cleanFreeText(v: unknown, maxLen: number, fallback = ''): string {
  const s = typeof v === 'string' ? v : fallback;
  return s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export class BrandDnaSuggestionChain {
  private client(): ChatGoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not defined in the environment');
    return new ChatGoogleGenerativeAI({
      model: 'gemini-flash-latest',
      temperature: 0.6,
      maxOutputTokens: 1024,
      apiKey,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });
  }

  private async callJson(systemPrompt: string, userPrompt: string): Promise<Record<string, any>> {
    const res = await this.client().invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Malformed JSON — repair path is "return empty object", callers fall
      // back to defaults for every field rather than throwing to the user.
      return {};
    }
  }

  async suggestIdentity(input: { serviceCategory: string; services?: string[] }): Promise<IdentitySuggestion> {
    const system = `You help rank which of these 6 fixed brand moods best fits a beauty/wellness professional's service, and write a one-sentence essence hint per mood. You do not invent new moods. Reply JSON only, no markdown.
Moods (in this exact set, use these ids only): ${BRAND_MOODS.join(', ')}
JSON schema: { "rankedMoodIds": ["<mood id>", ...all 6, best fit first], "essenceHints": {"<mood id>": "one short phrase", ...}, "typePairing": "<one of ${TYPE_PAIRINGS.join(', ')}>" }`;
    const user = `Service category: ${cleanFreeText(input.serviceCategory, 100)}\nServices: ${(input.services ?? []).map((s) => cleanFreeText(s, 60)).join(', ')}`;

    const raw = await this.callJson(system, user);
    const rankedIds = Array.isArray(raw.rankedMoodIds)
      ? raw.rankedMoodIds.filter((id: unknown): id is BrandMoodV2 => BRAND_MOODS.includes(id as any))
      : [];
    const orderedIds = [...new Set([...rankedIds, ...BRAND_MOODS])] as BrandMoodV2[];

    const hints = typeof raw.essenceHints === 'object' && raw.essenceHints ? raw.essenceHints : {};
    const moods = orderedIds.map((id) => ({
      id,
      label: id.replace(/_/g, ' '),
      palette: MOOD_PALETTE_SEEDS[id],
      essenceHints: [cleanFreeText(hints[id], 80)].filter(Boolean),
    }));

    const typePairing = TYPE_PAIRINGS.includes(raw.typePairing) ? raw.typePairing : TYPE_PAIRINGS[0];

    return { moods, typePairing };
  }

  async suggestEssence(input: { mood: string; services?: string[] }): Promise<EssenceSuggestion> {
    const system = `Pick up to 3 words that best describe a beauty/wellness brand's essence, from this fixed list only: ${ESSENCE_WORDS.join(', ')}. Reply JSON only: { "essence": ["WORD1","WORD2","WORD3"] }`;
    const user = `Mood: ${cleanFreeText(input.mood, 40)}\nServices: ${(input.services ?? []).map((s) => cleanFreeText(s, 60)).join(', ')}`;

    const raw = await this.callJson(system, user);
    const picked = Array.isArray(raw.essence)
      ? raw.essence.filter((w: unknown) => ESSENCE_WORDS.includes(w as any)).slice(0, 3)
      : [];
    return { essence: picked.length > 0 ? picked : [ESSENCE_WORDS[0], ESSENCE_WORDS[1], ESSENCE_WORDS[2]] };
  }

  async suggestAudience(input: { serviceCategory: string; services?: string[] }): Promise<AudienceSuggestion> {
    const system = `Suggest a plausible target-client age range, gender focus, and up to 5 short client-type phrases for a beauty/wellness service. genderFocus must be exactly one of: ${GENDER_FOCUS_OPTIONS.join(', ')}. Reply JSON only: { "ageMin": 18, "ageMax": 65, "genderFocus": "ALL", "clientTypes": ["phrase", ...] }`;
    const user = `Service category: ${cleanFreeText(input.serviceCategory, 100)}\nServices: ${(input.services ?? []).map((s) => cleanFreeText(s, 60)).join(', ')}`;

    const raw = await this.callJson(system, user);
    let ageMin = clampInt(raw.ageMin, 13, 80, 18);
    let ageMax = clampInt(raw.ageMax, 13, 80, 65);
    if (ageMin >= ageMax) { ageMin = 18; ageMax = 65; }
    const genderFocus = GENDER_FOCUS_OPTIONS.includes(raw.genderFocus) ? raw.genderFocus : 'ALL';
    const clientTypes = Array.isArray(raw.clientTypes)
      ? raw.clientTypes.map((t: unknown) => cleanFreeText(t, 60)).filter(Boolean).slice(0, 5)
      : [];

    return { ageMin, ageMax, genderFocus, clientTypes };
  }

  async suggestStrategy(input: { objective?: string; services?: string[] }): Promise<StrategySuggestion> {
    const system = `Suggest a content objective, weekly posting cadence, and monthly booking target for a beauty/wellness professional. objective must be exactly one of: ${BRAND_OBJECTIVES.join(', ')}. Reply JSON only: { "objective": "PREMIUM_CLIENTS", "postsPerWeek": 3, "bookingTargetPerMonth": 20, "rationale": "one short sentence" }`;
    const user = `Preferred objective (if any): ${cleanFreeText(input.objective, 40)}\nServices: ${(input.services ?? []).map((s) => cleanFreeText(s, 60)).join(', ')}`;

    const raw = await this.callJson(system, user);
    const objective = BRAND_OBJECTIVES.includes(raw.objective) ? raw.objective : 'PREMIUM_CLIENTS';
    const postsPerWeek = clampInt(raw.postsPerWeek, 1, 14, 3);
    const bookingTargetPerMonth = clampInt(raw.bookingTargetPerMonth, 0, 1000, 0);
    const rationale = cleanFreeText(raw.rationale, 200, 'Based on your services and objective.');

    return { objective, postsPerWeek, bookingTargetPerMonth, rationale };
  }

  async draftStory(input: {
    brandName?: string; mood?: string; essence?: string[]; serviceCategory?: string; objective?: string;
  }): Promise<DraftStorySuggestion> {
    const system = `Write a 1-2 sentence brand story for a beauty/wellness professional, in their voice, warm and specific — no generic AI phrases like "elevate", "journey", "glow up". Reply JSON only: { "aiDrafted": "1-2 sentences" }`;
    const user = [
      input.brandName ? `Brand name: ${cleanFreeText(input.brandName, 100)}` : '',
      input.mood ? `Mood: ${cleanFreeText(input.mood, 40)}` : '',
      input.essence?.length ? `Essence: ${input.essence.map((e) => cleanFreeText(e, 30)).join(', ')}` : '',
      input.serviceCategory ? `Service category: ${cleanFreeText(input.serviceCategory, 100)}` : '',
      input.objective ? `Objective: ${cleanFreeText(input.objective, 40)}` : '',
    ].filter(Boolean).join('\n');

    const raw = await this.callJson(system, user);
    return { aiDrafted: cleanFreeText(raw.aiDrafted, 400, 'A brand built on real results and real care for every client.') };
  }
}
