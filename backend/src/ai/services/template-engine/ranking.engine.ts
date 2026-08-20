import { ITemplateCandidate, ITemplateContext } from './interfaces';
import * as fs from 'fs';
import * as path from 'path';

// Load layout config to resolve structural base
const layoutConfigPath = path.join(__dirname, '../../config/layout-templates.config.json');
let layoutConfig: any = {};
try {
  layoutConfig = JSON.parse(fs.readFileSync(layoutConfigPath, 'utf8'));
} catch (e) {
  console.warn('[RankingEngine] Failed to load layout-templates.config.json');
}

export class RankingEngine {
  /**
   * Assigns a deterministic mathematical score to each candidate based on relevance.
   */
  rank(candidates: ITemplateCandidate[], context: ITemplateContext): ITemplateCandidate[] {
    const ranked = candidates.map(template => {
      let score = 50; // Base score

      // 1. Aesthetic Matching (Weight: +20)
      const isPremiumAesthetic = context.aesthetic.toLowerCase().includes('premium') || 
                                 context.aesthetic.toLowerCase().includes('luxury') || 
                                 context.aesthetic.toLowerCase().includes('editorial');
      
      if (isPremiumAesthetic && template.premiumStyleScore >= 8) {
        score += 20;
      } else if (!isPremiumAesthetic && template.premiumStyleScore < 6) {
        score += 10;
      }

      // 2. Slide Position Matching (Weight: +15)
      // Cover slides (index 0) benefit from high impact layouts. We rely on the LLM to pick the right structural vibe.
      // Removed the hardcoded 'hero' bonus to allow diverse variants (split, text_only) to compete for Slide 0.
      
      // End slides often benefit from CTAs
      if (context.slideIndex === context.totalSlides - 1 && template.id.includes('cta')) {
        score += 15;
      }

      // 3. Text Density Optimization (Weight: +10)
      if (context.textLength > 0 && context.textLength <= 50 && template.textDensity === 'low') {
        score += 10;
      } else if (context.textLength > 100 && template.textDensity === 'medium') {
        score += 10;
      }
      
      // 3b. Layout Collision Prevention (Heavy Penalty for Full-Bleed on Long Text)
      // Check the structural base of the template
      const familyId = template.id.split('_variant')[0];
      const baseGeometry = layoutConfig[familyId]?.base || 'unknown';
      if (context.textLength > 40 && (baseGeometry === 'full_bleed' || baseGeometry === 'full_bleed_duotone')) {
        score -= 50; // Heavily penalize full-bleed for long text, forcing framed/split layouts
      }
      
      // 3.5 Semantic Trait Scoring
      let visPriScore = 0;
      let flowScore = 0;
      let energyScore = 0;

      if (context.semanticIntent) {
        const { required, preferred, weights } = context.semanticIntent;
        
        if (required?.visualPriority && template.visualPriority === required.visualPriority) {
          visPriScore = weights.visualPriority || 30;
          score += visPriScore;
        }
        if (preferred?.readingFlow && template.readingFlow === preferred.readingFlow) {
          flowScore = weights.readingFlow || 15;
          score += flowScore;
        }
        if (preferred?.energy && template.energy === preferred.energy) {
          energyScore = weights.energy || 10;
          score += energyScore;
        }
      }

      // 4. Random Jitter (Weight: +0 to +25)
      // This ensures that when 50 templates match perfectly, we get a rotating organic mix of top candidates instead of the exact same 8 every time.
      const jitter = Math.floor(Math.random() * 25);
      score += jitter;

      // Store breakdown for logging
      (template as any)._scoreBreakdown = {
        base: 50,
        aesthetic: score - 50 - visPriScore - flowScore - energyScore - jitter,
        visPri: visPriScore,
        flow: flowScore,
        energy: energyScore,
        jitter: jitter
      };

      return { ...template, score };
    });

    // Sort by highest score first initially
    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Soft Diversity Reranker
    const familyCounts: Record<string, number> = {};
    for (let i = 0; i < ranked.length; i++) {
      const template = ranked[i];
      if (template.family) {
        const count = familyCounts[template.family] || 0;
        if (count > 0) {
          const penalty = count * 5; // -5 points for each previous occurrence
          template.score = (template.score || 0) - penalty;
          (template as any)._scoreBreakdown.diversity = -penalty;
        } else {
          (template as any)._scoreBreakdown.diversity = 0;
        }
        familyCounts[template.family] = count + 1;
      }
    }

    // Re-sort after diversity penalty
    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Log the Top 8 Breakdown
    const top8 = ranked.slice(0, 8);
    console.log(`\n[Ranking] Top 8 candidates for Slide ${context.slideIndex}:`);
    const tableData = top8.map(t => {
      const b = (t as any)._scoreBreakdown;
      return {
        ID: t.id,
        Source: t.type,
        VisPri: `+${b?.visPri || 0}`,
        Flow: `+${b?.flow || 0}`,
        Energy: `+${b?.energy || 0}`,
        Diversity: b?.diversity || 0,
        Total: t.score
      };
    });
    console.table(tableData);

    return ranked;
  }
}
