import { ITemplateMetadata, ITemplateRetriever, ITemplateCandidate, ITemplateContext } from './interfaces';
import compiledLayoutsData from '../../config/compiled-layouts.v2.json';

export class MetadataRetriever implements ITemplateRetriever {
  private library: Record<string, any> = {};

  constructor() {
    try {
      this.library = JSON.parse(JSON.stringify(compiledLayoutsData));
    } catch (e) {
      console.error('Failed to load compiled layouts library', e);
    }
  }

  async retrieveCandidates(context: ITemplateContext): Promise<ITemplateCandidate[]> {
    const candidates: ITemplateCandidate[] = [];

    for (const [id, raw] of Object.entries(this.library)) {
      let category = 'Procedural V2 Layout';
      let concept = 'A dynamically generated procedural layout';
      
      if (id.includes('editorial')) {
        category = 'Editorial';
        concept = 'High-end fashion and beauty layout with striking visual structure.';
      } else if (id.includes('minimalist_quote')) {
        category = 'Minimalist Quote';
        concept = 'Clean, typography-focused layout with extensive negative space.';
      } else if (id.includes('testimonial')) {
        category = 'Testimonial';
        concept = 'Layout designed to highlight client reviews or quotes effectively.';
      } else if (id.includes('text_only')) {
        category = 'Text Only';
        concept = 'Bold typographic layout without image dependencies.';
      } else if (id.includes('clinical_hero')) {
        category = 'Clinical Hero';
        concept = 'Structured layout suited for professional or before/after visual evidence.';
      }

      const isSplit = id.includes('split') || id.includes('clinical_hero');
      const macroFaceSafe = !isSplit;

      const requiresText = id.includes('text_only') || id.includes('quote') || id.includes('testimonial');

      let textDensity: 'low' | 'medium' | 'high' = 'medium';
      if (id.includes('text_only') || id.includes('quote')) {
        textDensity = 'high';
      } else if (id.includes('editorial')) {
        textDensity = 'low';
      }

      candidates.push({
        id,
        category,
        concept,
        best_use_cases: ['Carousel', 'Instagram Post'],
        macroFaceSafe,
        requiresText,
        supportsNoText: !requiresText,
        textDensity,
        isCarouselOnly: false,
        premiumStyleScore: 10,
        occupiedTextZones: [],
        type: 'rigid' // All V2 compiled layouts are fully compiled, acting as rigid structures
      });
    }

    // PHASE 3A: Inject Semantic Composition Recipes (Procedural)
    // These tell the Art Director that instead of a rigid layout, it can select a dynamic Composition Recipe
    const compositionRecipes = [
      { id: 'editorial_hero', concept: 'Massive hero headline, vertical caption, deep negative space.', type: 'procedural' },
      { id: 'editorial_quote', concept: 'Clean split text quote, subtle grain, huge whitespace.', type: 'procedural' },
      { id: 'editorial_informational', concept: 'Educational layout with offset image cutouts and structural grid lines.', type: 'procedural' },
    ];

    for (const recipe of compositionRecipes) {
      candidates.push({
        id: recipe.id,
        category: 'Procedural Composition',
        concept: recipe.concept,
        best_use_cases: ['Carousel'],
        macroFaceSafe: true,
        requiresText: true,
        supportsNoText: false,
        textDensity: 'medium',
        isCarouselOnly: false,
        premiumStyleScore: 20, // Heavily weight Phase 3 recipes to encourage selection
        occupiedTextZones: [],
        type: 'procedural' as any
      });
    }

    return candidates;
  }
}
