import { ITemplateCandidate, ITemplateContext } from './interfaces';

// In-memory LRU tracking global usage across the instance to prevent mode collapse.
// For production, this could be backed by Redis `hincrby tenantId templateId 1`
const usageHistory: Record<string, number> = {};

export class DiversityEngine {
  /**
   * Applies usage penalties to prevent the LLM from constantly picking `vogue_cover`.
   */
  applyDiversityPenalties(candidates: ITemplateCandidate[], context: ITemplateContext, carouselHistory: string[] = []): ITemplateCandidate[] {
    const diversified = candidates.map(template => {
      let penalty = 0;
      const usageCount = usageHistory[template.id] || 0;

      // 1. Global Usage Penalty (Mathematical Decay)
      // Every time a template is used, it loses 2 points.
      // This forces the ranking engine to surface fresh templates over time.
      if (usageCount > 0) {
        penalty += usageCount * 2;
      }

      // 2. Exact Match Carousel Penalty (Hard Exclusion)
      // If it was already used in THIS carousel, completely destroy its score.
      const wasUsedInCarousel = carouselHistory.some(historyId => historyId.startsWith(template.id));
      if (wasUsedInCarousel) {
        penalty += 1000;
      }

      const finalRank = (template.score || 0) - penalty;

      return {
        ...template,
        diversityPenalty: penalty,
        finalRank
      };
    });

    // Strictly filter out any layout that was banned (penalty >= 1000), unless it leaves us with 0 options.
    let finalCandidates = diversified.filter(t => (t.finalRank || 0) > -500);
    if (finalCandidates.length === 0) {
      finalCandidates = diversified; // Safety fallback
    }

    // Sort by final rank
    return finalCandidates.sort((a, b) => (b.finalRank || 0) - (a.finalRank || 0));
  }

  /**
   * Call this after the LLM makes its final selection to update the math.
   */
  recordUsage(templateId: string) {
    if (!usageHistory[templateId]) {
      usageHistory[templateId] = 0;
    }
    usageHistory[templateId] += 1;
  }
}
