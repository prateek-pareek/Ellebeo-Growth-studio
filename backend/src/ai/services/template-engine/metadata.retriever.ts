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

      // We keep the legacy rigid layouts active as they provide the 266 base templates.

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

    // PHASE 3A: The Core 20 Semantic Variant Library
    // These replace random procedural numeric suffixes with intentional, highly distinct geometries.
    let compositionRecipes = [
      // Editorial Family
      { id: 'editorial_magazine_cover', concept: 'Ghost headline, large masthead, paper texture. Elite and warm.', type: 'procedural' },
      { id: 'editorial_portrait_hero', concept: 'Large portrait image on top, small caption below, soft texture.', type: 'procedural' },
      { id: 'editorial_split', concept: 'Two equal zones (left image, right text), medium typography, minimal texture.', type: 'procedural' },
      { id: 'editorial_full_bleed', concept: 'Image covers entire canvas. High-end fashion typography.', type: 'procedural' },
      { id: 'editorial_feature_story', concept: 'Deep negative space, massive hero headline, vertical caption.', type: 'procedural' },
      
      // Clinical Family
      { id: 'clinical_hero', concept: 'Structured, highly aligned, professional focus.', type: 'procedural' },
      { id: 'clinical_procedure_steps', concept: 'Step-by-step procedure layout with strict grid and precision lines.', type: 'procedural' },
      { id: 'clinical_benefits_grid', concept: 'Data-driven grid layout for highlighting multiple benefits.', type: 'procedural' },
      { id: 'clinical_ingredient_focus', concept: 'Offset image cutout focusing on raw ingredients or microscopic details.', type: 'procedural' },
      { id: 'clinical_before_after', concept: 'Split view layout designed for dramatic before and after results.', type: 'procedural' },
      
      // Minimalist Family
      { id: 'minimalist_centered_quote', concept: 'Ultra clean minimalist quote layout centered perfectly with massive whitespace. No image.', type: 'procedural' },
      { id: 'minimalist_offset_quote', concept: 'Quote pushed hard to the side, creating extreme asymmetrical balance.', type: 'procedural' },
      { id: 'minimalist_quote_image', concept: 'Clean split text quote and subtle image, huge whitespace.', type: 'procedural' },
      { id: 'minimalist_bottom_caption', concept: 'Image pushed to the top, small delicate caption at the absolute bottom.', type: 'procedural' },
      { id: 'minimalist_floating_card', concept: 'Text floats in a distinct card over a blurred or textured background.', type: 'procedural' },
      
      // Premium Text Only Family
      { id: 'premium_hero_statement', concept: 'Massive singular statement taking up the entire canvas. No image required.', type: 'procedural' },
      { id: 'premium_stacked_typography', concept: 'Bold, tight typography stacked vertically. Extremely modern.', type: 'procedural' },
      { id: 'premium_manifesto', concept: 'Text-heavy manifesto layout for deep reading. Excellent for brand values.', type: 'procedural' },
      { id: 'premium_quote_poster', concept: 'Premium text-only quote slide with exquisite SVG deco elements (stars, meteors).', type: 'procedural' },
      { id: 'premium_cta_poster', concept: 'High-contrast text poster designed strictly to drive conversions and taps.', type: 'procedural' }
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
