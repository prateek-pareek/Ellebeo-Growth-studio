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
      } else if (id.includes('countdown_promo')) {
        category = 'Countdown Promo';
        concept = 'Urgency-driven promotional layout pairing a bold offer headline with product/photo focus.';
      } else if (id.includes('product_showcase')) {
        category = 'Product Showcase';
        concept = 'Product- or result-hero layout built around a centered or full-bleed focal image.';
      } else if (id.includes('split')) {
        category = 'Split';
        concept = 'Two-region layout dividing the canvas between a photo area and a dedicated text area.';
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

    // PHASE 3A: Inject Semantic Composition Recipes (Procedural)
    // These tell the Art Director that instead of a rigid layout, it can select a dynamic Composition Recipe
    let compositionRecipes = [
      { id: 'editorial_hero', concept: 'Massive hero headline, vertical caption, deep negative space.', type: 'procedural' },
      { id: 'editorial_quote', concept: 'Clean split text quote, subtle grain, huge whitespace.', type: 'procedural' },
      { id: 'editorial_informational', concept: 'Educational layout with offset image cutouts and structural grid lines.', type: 'procedural' },
      { id: 'editorial_breather', concept: 'Text-only composition with rich paper textures and bold ghost typography, no image required.', type: 'procedural' },
      
      // Minimalist Family
      { id: 'minimalist_quote', concept: 'Ultra clean minimalist quote layout with massive whitespace.', type: 'procedural' },
      
      // Clinical Family
      { id: 'clinical_step_routine', concept: 'Structured, highly aligned step-by-step clinical routine.', type: 'procedural' },
      { id: 'clinical_analysis_card', concept: 'Data-driven clinical analysis layout with metric labels.', type: 'procedural' },
      
      // Educational Family
      { id: 'educational_numbered_list', concept: 'Bold numbered educational list focusing purely on typography.', type: 'procedural' },
      { id: 'educational_myth_vs_fact', concept: 'Text-heavy myth vs fact layout with floating badge.', type: 'procedural' },
      { id: 'educational_quote_hero', concept: 'Educational quote emphasis with massive typographic accents.', type: 'procedural' },
      
      // Premium Text Only Family
      { id: 'premium_text_only', concept: 'Premium text-only slide with exquisite SVG deco elements (stars, meteors, rings). No image required. Pure brand DNA.', type: 'procedural' },

      // Split Family
      { id: 'split_vertical_stack', concept: 'Heading block on top, circle-masked photo filling the bottom, divider at the seam.', type: 'procedural' },
      { id: 'split_horizontal_band', concept: 'Full-width photo band on top, solid-color text block below, divider at the seam.', type: 'procedural' },
      { id: 'split_left_right', concept: 'Circle photo on one side, heading and tagline anchored opposite, textured background.', type: 'procedural' },

      // Countdown Promo Family
      { id: 'countdown_promo_frames', concept: 'Text stack on one side, overlapping polaroid-style photo frames on the other, CTA accent chip.', type: 'procedural' },
      { id: 'countdown_promo_headline', concept: 'Full-bleed photo on one half, single large centered headline on the other, minimal decoration.', type: 'procedural' },
      { id: 'countdown_promo_circle', concept: 'Circle-cropped photo centered on a flat background, tight negative space, minimal decoration.', type: 'procedural' },

      // Product Showcase Family
      { id: 'product_showcase_overlay', concept: 'Full-bleed background photo with headline and tagline text overlaid directly on top.', type: 'procedural' },
      { id: 'product_showcase_halo', concept: 'Circle-cropped product photo with a larger decorative halo ring behind it.', type: 'procedural' },
      { id: 'product_showcase_band', concept: 'Heading and tagline band over a photo starting mid-canvas, divider at the seam, CTA chip at the bottom.', type: 'procedural' }
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
