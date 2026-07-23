import { ITemplateCandidate, ITemplateContext } from './interfaces';

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
      // Cover slides (index 0) usually benefit from High Impact / Hero layouts
      if (context.slideIndex === 0 && template.id.includes('hero')) {
        score += 15;
      }
      
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
      
      // 4. Random Jitter (Weight: +0 to +8)
      // This ensures that when 50 templates match perfectly, we get a rotating organic mix of top candidates instead of the exact same 8 every time.
      const jitter = Math.floor(Math.random() * 8);
      score += jitter;

      return { ...template, score };
    });

    // Sort by highest score first
    return ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}
