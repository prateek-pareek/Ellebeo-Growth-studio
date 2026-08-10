import { DesignRecipe, TypographyTokens, VisualTokens, CompositionTokens, ReadingFlowTokens, PrimitiveTokens, ImageTreatmentTokens } from '../interfaces';

export class DesignLanguageResolver {
  
  /**
   * Translates Brand DNA and Structural Intent into a unified Design Recipe.
   * This is the core engine that ensures Editorial looks like Editorial, Minimalist looks Minimalist, etc.
   */
  public generateRecipe(layoutId: string, baseFamily: string, brandStyle: string = 'balanced'): DesignRecipe {
    
    // Default fallback tokens (A baseline to prevent errors)
    let typography: TypographyTokens = {
      headlineWeight: 'medium',
      bodyWeight: 'medium',
      tracking: 'standard',
      casing: 'natural',
      contrast: 'medium'
    };
    
    let visual: VisualTokens = {
      texture: 'none',
      decorationDensity: 'minimal'
    };
    
    let composition: CompositionTokens = {
      imageDominance: 0.5,
      whitespace: 'medium',
      alignment: 'center'
    };
    
    let readingFlow: ReadingFlowTokens = {
      type: 'center_down'
    };
    
    let primitives: PrimitiveTokens = {
      rings: false,
      stars: false,
      borders: false,
      ghostHeadline: false,
      cornerBadges: false
    };

    let imageTreatment: ImageTreatmentTokens = {
      crop: 'portrait',
      mask: 'soft_edge',
      protectFace: true
    };

    // ==========================================
    // 1. FAMILY BASELINE (Structural Rules)
    // ==========================================
    switch (baseFamily) {
      case 'editorial':
        // Editorial: Magazine spread. Elegant hierarchy, large breathing space, sophisticated type.
        typography.headlineWeight = 'light';
        typography.tracking = 'wide';
        typography.casing = 'force_uppercase';
        composition.whitespace = 'high';
        composition.alignment = 'offset';
        readingFlow.type = 'z_pattern';
        primitives.borders = true; // Elegant structural lines
        visual.texture = 'paper';
        break;

      case 'clinical':
        // Clinical: Medical-grade precision. Structured grid, highly readable.
        typography.headlineWeight = 'heavy';
        typography.tracking = 'tight';
        typography.casing = 'sentence';
        composition.whitespace = 'medium';
        composition.alignment = 'center'; // High alignment precision
        primitives.cornerBadges = true; // Callout boxes
        visual.texture = 'grain';
        break;

      case 'minimalist':
        // Minimalist: Less is more. Huge whitespace, quiet typography.
        typography.headlineWeight = 'light';
        typography.tracking = 'airy';
        typography.casing = 'natural';
        composition.whitespace = 'massive';
        composition.alignment = 'dynamic';
        visual.decorationDensity = 'minimal';
        visual.texture = 'none'; // Ultra clean
        primitives.rings = false;
        primitives.borders = false;
        break;

      case 'premium':
      case 'premium_text':
      case 'premium_text_only':
        // Premium Text: Typography is the artwork. Massive headline, dramatic scale.
        typography.headlineWeight = 'hero';
        typography.tracking = 'tight';
        typography.casing = 'force_uppercase';
        composition.whitespace = 'high';
        readingFlow.type = 'center_down';
        primitives.ghostHeadline = true; // Dramatic typography effects
        visual.decorationDensity = 'medium';
        break;

      case 'split':
        // Split: Two balanced stories.
        typography.headlineWeight = 'medium';
        typography.tracking = 'wide';
        typography.casing = 'sentence';
        composition.imageDominance = 0.5; // Perfect balance
        composition.whitespace = 'medium';
        readingFlow.type = 'left_right';
        primitives.borders = true; // Separation line
        imageTreatment.crop = 'square';
        break;

      case 'countdown_promo':
        // Countdown: Time-sensitive urgency. (Defaults to a balanced urgency, can be overridden by brand DNA)
        typography.headlineWeight = 'heavy';
        typography.tracking = 'tight';
        typography.casing = 'force_uppercase';
        composition.imageDominance = 0.4; // Text needs to speak loudly
        composition.whitespace = 'medium';
        readingFlow.type = 'center_down';
        primitives.cornerBadges = true; // Urgency badges
        break;

      case 'product_showcase':
        // Product Showcase: The product is the undeniable hero.
        typography.headlineWeight = 'light';
        typography.tracking = 'standard';
        typography.casing = 'sentence';
        composition.imageDominance = 0.8; // Product dominates the canvas
        composition.whitespace = 'high';
        primitives.rings = true; // Halo effect to draw eye to product
        primitives.ghostHeadline = false; // Don't distract from product
        imageTreatment.protectFace = true; // Protect the subject
        break;
    }

    // ==========================================
    // 2. BRAND DNA OVERRIDES (Aesthetic Shift)
    // ==========================================
    const styleKey = (brandStyle || '').toLowerCase();
    // This is where a "Countdown Promo" can become a "Luxury Countdown"
    if (styleKey.includes('luxury') || styleKey.includes('high_fashion') || styleKey.includes('editorial')) {
      // Luxury brands soften urgency and increase whitespace
      if (baseFamily === 'countdown_promo') {
        typography.headlineWeight = 'light';
        typography.tracking = 'wide';
        typography.casing = 'force_uppercase';
        composition.whitespace = 'massive';
        visual.texture = 'grain'; // Premium subtlety
      }
      // General luxury / editorial overrides
      if (styleKey.includes('luxury') || styleKey.includes('high_fashion')) {
        typography.casing = 'force_uppercase';
        composition.whitespace = 'high';
        typography.headlineWeight = typography.headlineWeight === 'hero' ? 'heavy' : typography.headlineWeight;
        visual.texture = visual.texture === 'none' ? 'grain' : visual.texture;
      }
      if (styleKey.includes('editorial')) {
        typography.headlineWeight = 'light';
        typography.tracking = 'wide';
        composition.whitespace = 'high';
        visual.texture = 'paper';
      }
    } 
    else if (styleKey.includes('bold') || styleKey.includes('campaign') || styleKey.includes('energetic')) {
      // Bold brands amplify weight and tighten tracking for impact
      typography.headlineWeight = 'hero';
      typography.tracking = 'tight';
      visual.texture = 'noise'; // High energy texture
    }
    else if (styleKey.includes('warm') || styleKey.includes('wellness') || styleKey.includes('natural') || styleKey.includes('organic')) {
      // Wellness brands soften edges and use natural textures
      typography.headlineWeight = 'medium';
      typography.casing = 'natural';
      visual.texture = 'paper';
      imageTreatment.mask = 'soft_edge';
    }
    else if (styleKey.includes('clinical') || styleKey.includes('medical') || styleKey.includes('clean')) {
      typography.headlineWeight = 'heavy';
      typography.tracking = 'tight';
      typography.casing = 'sentence';
      visual.texture = 'grain';
      visual.decorationDensity = 'minimal';
    }
    else if (styleKey.includes('minimal')) {
      typography.headlineWeight = 'light';
      typography.tracking = 'airy';
      composition.whitespace = 'massive';
      visual.decorationDensity = 'minimal';
    }

    return {
      layoutId,
      typography,
      visual,
      composition,
      readingFlow,
      primitives,
      imageTreatment
    };
  }
}
