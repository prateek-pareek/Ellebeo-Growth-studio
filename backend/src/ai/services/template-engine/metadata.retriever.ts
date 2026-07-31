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
      } else if (id.includes('before_after')) {
        category = 'Before & After';
        concept = 'Two real photos (before and after) genuinely stitched side by side or stacked to show a transformation.';
      } else if (id.includes('scrapbook')) {
        category = 'Scrapbook';
        concept = 'Taped or torn-paper photo card with a personal, handmade collage feel.';
      } else if (id.includes('quadrant')) {
        category = 'Quadrant';
        concept = 'Grid- or badge-structured layout evoking a multi-panel composition on a single hero image.';
      }

      const isSplit = id.includes('split') || id.includes('clinical_hero') || id.includes('before_after');
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
      { id: 'premium_cta_poster', concept: 'High-contrast text poster designed strictly to drive conversions and taps.', type: 'procedural' },
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
      { id: 'product_showcase_band', concept: 'Heading and tagline band over a photo starting mid-canvas, divider at the seam, CTA chip at the bottom.', type: 'procedural' },

      // Before & After Family
      { id: 'before_after_side_by_side', concept: 'Real before-photo and after-photo genuinely stitched side by side, arrow marking the transformation, heading below.', type: 'procedural' },
      { id: 'before_after_stacked', concept: 'Real before-photo and after-photo stitched top and bottom, arrow marking the seam, heading at the bottom.', type: 'procedural' },
      { id: 'before_after_labeled', concept: 'Side-by-side before/after split with a masking-tape accent, heading and tagline stacked, pinned-up card feel.', type: 'procedural' },

      // Testimonial Family
      { id: 'testimonial_quote_portrait', concept: 'Circle-masked client portrait with a quote-marks accent, heading carries the quote, tagline carries attribution.', type: 'procedural' },
      { id: 'testimonial_star_card', concept: 'Glass-card treatment with a 5-star rating row, quote heading, client name as tagline.', type: 'procedural' },
      { id: 'testimonial_minimal_quote', concept: 'Pure typography quote with a small star rating row, no image required.', type: 'procedural' },

      // Scrapbook Family
      { id: 'scrapbook_collage', concept: 'Polaroid-masked photo pinned with a masking-tape accent and torn-paper texture, caption-card heading below.', type: 'procedural' },
      { id: 'scrapbook_journal_entry', concept: 'Inset rectangle photo beside handwritten-feel margin notes and a divider, personal journal-spread feel.', type: 'procedural' },

      // Quadrant Family
      { id: 'quadrant_grid', concept: 'Full photo with a subtle quadrant grid overlay and a corner badge, evoking a 4-panel structure on one hero image.', type: 'procedural' },
      { id: 'quadrant_badge_focus', concept: 'Arch-masked photo with a prominent geometric badge and grain texture, heading and tagline stacked below.', type: 'procedural' }
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
