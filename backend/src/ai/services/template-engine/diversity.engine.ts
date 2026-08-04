import { ITemplateCandidate, ITemplateContext } from './interfaces';
import * as fs from 'fs';
import * as path from 'path';

const layoutConfigPath = path.join(__dirname, '../../config/layout-templates.config.json');
let layoutConfig: any = {};
try {
  layoutConfig = JSON.parse(fs.readFileSync(layoutConfigPath, 'utf8'));
} catch (e) {
  console.warn('[DiversityEngine] Failed to load layout-templates.config.json');
}

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
      
      // 3. Structural Diversity Penalty
      // Prevent the engine from picking consecutive templates with the same base geometry (e.g., full-bleed -> full-bleed)
      if (carouselHistory.length > 0) {
        const lastTemplateId = carouselHistory[carouselHistory.length - 1];
        // Remove variants (e.g., _variant_12) to get the true ID if it's procedural
        const lastFamilyId = lastTemplateId.split('_variant')[0];
        
        const lastBase = layoutConfig[lastFamilyId]?.base;
        const currentBase = layoutConfig[template.id]?.base;
        
        if (lastBase && currentBase && lastBase === currentBase) {
           penalty += 40; // Soft exclusion: it can still be picked if nothing else is good, but highly unlikely
        }
      }

      // 4. Macro-Family Diversity Penalty (Ensures Carousel hits distinct families)
      if (carouselHistory.length > 0) {
        const getMacroFamily = (id: string) => {
          // Family-specific checks must come before the generic 'quote' substring
          // check below — e.g. 'testimonial_quote_portrait' contains "quote" and
          // would otherwise get misbucketed with minimalist_quote/premium_quote
          // (while 'testimonial_star_card', with no "quote" in its name, would
          // correctly bucket as 'testimonial' — an inconsistent split within the
          // same family that silently broke its own diversity rotation).
          if (id.startsWith('testimonial')) return 'testimonial';
          if (id.startsWith('before_after')) return 'before_after';
          if (id.startsWith('scrapbook')) return 'scrapbook';
          if (id.startsWith('quadrant')) return 'quadrant';
          if (id.startsWith('transformation')) return 'transformation';
          if (id.startsWith('magazine')) return 'magazine';
          if (id.startsWith('polaroid')) return 'polaroid';
          // Must come before the generic id.split('_')[0] fallback below — that
          // fallback would otherwise fragment 'notification_card_alert' and
          // 'notification_card_banner' into a bare 'notification' bucket.
          if (id.startsWith('notification_card')) return 'notification_card';
          if (id.startsWith('announcement')) return 'announcement';
          if (id.includes('quote')) return 'quote';
          if (id.startsWith('editorial')) return 'editorial';
          if (id.startsWith('clinical')) return 'clinical';
          if (id.startsWith('educational')) return 'educational';
          if (id.startsWith('premium_text') || id.includes('breather')) return 'text_only';
          return id.split('_')[0];
        };
        
        const currentMacro = getMacroFamily(template.id);
        const usedMacros = carouselHistory.map(historyId => getMacroFamily(historyId.split('_variant')[0] || ''));
        
        if (usedMacros.includes(currentMacro)) {
           penalty += 500; // Strong penalty to force picking a different macro-family
        }
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
