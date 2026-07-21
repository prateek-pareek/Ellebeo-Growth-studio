import { DesignTokens } from './theme-engine';

export type TemplateIntent = 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';

export interface CompositionMetadata {
  dominantElement: 'image' | 'typography' | 'badge';
  whitespaceRatio: 'low' | 'medium' | 'high';
  elementOverlap: boolean;
  maskPreference: 'full_bleed' | 'rectangle' | 'arch' | 'circle' | 'polaroid' | 'blob' | 'organic' | 'torn';
  injectedFeatures: ('cards' | 'numbers' | 'cta' | 'ribbon' | 'quotation' | 'corner_badge' | 'sticker' | 'pricing_pill')[];
}

export class CompositionEngine {
  
  public calculateComposition(
    tokens: DesignTokens, 
    intent: TemplateIntent,
    isFirstSlide: boolean
  ): CompositionMetadata {
    
    // 1. Base initialization from Design Tokens
    const metadata: CompositionMetadata = {
      dominantElement: tokens.headlinePresence === 'hero' ? 'typography' : 'image',
      whitespaceRatio: tokens.spacing === 'airy' ? 'high' : (tokens.spacing === 'dense' ? 'low' : 'medium'),
      elementOverlap: tokens.layerDepth === 'high',
      maskPreference: 'full_bleed',
      injectedFeatures: []
    };

    // 2. Adjust Mask Preference based on Tokens
    if (tokens.borderRadius === 'soft') metadata.maskPreference = 'rectangle';
    if (tokens.borderRadius === 'pill') metadata.maskPreference = 'arch'; // Simple mapping for now

    // 3. Inject Semantic Intent Overrides
    switch (intent) {
      case 'educational':
        metadata.injectedFeatures.push('numbers');
        if (!isFirstSlide) metadata.injectedFeatures.push('cards');
        metadata.maskPreference = 'rectangle'; 
        metadata.dominantElement = 'typography';
        break;
      case 'promotion':
        metadata.injectedFeatures.push('pricing_pill');
        metadata.injectedFeatures.push('corner_badge');
        metadata.elementOverlap = true; // Promotions often have popping badges
        break;
      case 'testimonial':
        metadata.injectedFeatures.push('quotation');
        metadata.maskPreference = 'circle'; // Often circular portrait
        break;
      case 'before_after':
        metadata.maskPreference = 'rectangle'; // Usually split screen
        break;
      case 'brand_story':
        if (tokens.layerDepth === 'high') metadata.maskPreference = 'polaroid';
        break;
    }

    // Cover slides generally get more punchy visual weight
    if (isFirstSlide && metadata.dominantElement !== 'typography') {
      if (tokens.contrast === 'high') {
         metadata.dominantElement = 'typography';
      }
    }

    return metadata;
  }
}
