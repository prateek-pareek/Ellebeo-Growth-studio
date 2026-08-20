import designKnowledgeMapRaw from '../../config/design-knowledge-map.json';
import designKnowledgeSamplesRaw from '../../config/design-knowledge.json';
import { DesignReadingFlow } from './interfaces';

/**
 * Mined samples store readingFlow as hyphenated free text (e.g. "z-pattern").
 * Normalizes to the underscore enum the rest of the engine speaks, with a safe fallback.
 */
export function normalizeReadingFlow(raw: string | undefined): DesignReadingFlow {
  const key = (raw || '').replace(/-/g, '_');
  const known: DesignReadingFlow[] = ['z_pattern', 'center_down', 'circular', 'center_outward', 'diagonal', 'bottom_left', 'scattered'];
  return (known as string[]).includes(key) ? (key as DesignReadingFlow) : 'center_down';
}

/**
 * Shape of one mined knowledge entry (either from design-knowledge-map.json,
 * keyed by exact compiled-layout id, or from design-knowledge.json's per-sample array).
 * Matches the real AI-vision-extracted structure — see backend/scripts/ingestion/.
 */
export interface IExtractedKnowledge {
  layoutFamily: { value: string; confidence: number };
  visualLanguage: { style: string; energy: string; tone: string; industry: string };
  composition: {
    primaryFocus: string;
    secondaryFocus?: string;
    readingFlow: string;
    balance: string;
    negativeSpace: string;
  };
  typography: {
    headlineStyle: string;
    hierarchy: string;
    tracking: string;
    lineBreakStrategy: string;
    contrast: string;
  };
  decorations: Array<{ type: string; purpose: string; emotion: string }>;
  designRules: string[];
}

export interface IFamilyStats {
  energy: string;
  balance: string;
  readingFlow: string;
  sampleFraction: string; // e.g. "9/13" — how many of the matched samples agreed on the majority readingFlow
  totalSamples: number;
  decorationTypes: string[];
  designRules: string[];
}

interface IKnowledgeSample {
  hash: string;
  knowledge: IExtractedKnowledge;
}

const designKnowledgeMap = designKnowledgeMapRaw as unknown as Record<string, IExtractedKnowledge>;
const designKnowledgeSamples = designKnowledgeSamplesRaw as unknown as IKnowledgeSample[];

/**
 * Our internal macro-family ids (composition-engine layoutId prefixes / diversity.engine
 * getMacroFamily buckets) don't always match the literal `layoutFamily.value` strings the
 * mining pipeline assigned. This is a naming alias table, not a design value — safe to
 * hardcode, same class of fact as diversity.engine.ts's family prefix list.
 */
const FAMILY_VALUE_ALIASES: Record<string, string[]> = {
  clinical: ['clinical_hero'],
  minimalist: ['minimalist_quote'],
  premium: ['text_only'],
};

function resolveFamilyValues(macroFamily: string): string[] {
  return FAMILY_VALUE_ALIASES[macroFamily] || [macroFamily];
}

function majority(values: string[]): { value: string; count: number } {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  let best = '';
  let bestCount = 0;
  for (const [value, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, count: bestCount };
}

/**
 * Serves the real mined per-template and per-family design knowledge that today sits
 * unused at runtime, so the Template Agent can ground its Design Intent in actual data
 * instead of inventing or hardcoding it.
 */
export class DesignKnowledgeService {
  /**
   * Exact lookup for a rigid template id (one of the 770 compiled-layouts.v2.json keys).
   * Returns null when this specific id has no mined entry.
   */
  public getGroundTruth(layoutId: string): IExtractedKnowledge | null {
    return designKnowledgeMap[layoutId] || null;
  }

  /**
   * Runtime-computed aggregate stats for a procedural design family (e.g. 'transformation',
   * 'notification_card'), read fresh from design-knowledge.json every call — never baked
   * into code as literals. Returns null when no real samples exist for this family.
   */
  public getFamilyStats(macroFamily: string): IFamilyStats | null {
    const aliases = resolveFamilyValues(macroFamily);
    const matches = designKnowledgeSamples.filter((s) => aliases.includes(s.knowledge?.layoutFamily?.value));

    if (matches.length === 0) return null;

    const energies = matches.map((s) => s.knowledge.visualLanguage?.energy).filter(Boolean);
    const balances = matches.map((s) => s.knowledge.composition?.balance).filter(Boolean);
    const readingFlows = matches.map((s) => s.knowledge.composition?.readingFlow).filter(Boolean);

    const energy = majority(energies);
    const balance = majority(balances);
    const readingFlow = majority(readingFlows);

    const decorationTypes = Array.from(
      new Set(matches.flatMap((s) => (s.knowledge.decorations || []).map((d) => d.type)).filter(Boolean)),
    ).slice(0, 6);

    const designRules = Array.from(new Set(matches.flatMap((s) => s.knowledge.designRules || []).filter(Boolean))).slice(
      0,
      3,
    );

    return {
      energy: energy.value,
      balance: balance.value,
      readingFlow: readingFlow.value,
      sampleFraction: `${readingFlow.count}/${matches.length}`,
      totalSamples: matches.length,
      decorationTypes,
      designRules,
    };
  }
}
