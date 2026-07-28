import { ICompiledLayoutDSL, IDSLSceneLayer, IDSLImageLayer, IDSLTextLayer, IDSLDecorationLayer } from '../interfaces';
import { IDesignLanguage } from './art-direction-engine';
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

  /**
   * Translates a Behavioral Profile / Family ID into a strict, deterministic 
   * Composition Recipe (a compiled DSL).
   */
  public buildRecipe(familyId: string, slideIndex: number, brandName: string): ICompiledLayoutDSL {
    
    // Instead of randomizing, we now use strict recipes based on the family requested.
    const layers: IDSLSceneLayer[] = [];
    const recipeId = `${familyId}_${slideIndex}`;
    
    if (familyId === 'editorial_hero' || familyId === 'brand_story') {
      // RECIPE: Editorial Hero
      // 1 Full bleed image, 1 massive title, 1 vertical caption, 1 large page number, 1 thin divider
      layers.push({
        id: 'hero_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle', 
        paddingPercent: 0,
        anchor: 'middle_right'
      } as IDSLImageLayer);

      layers.push({
        id: 'hero_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_left',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      layers.push({
        id: 'hero_caption',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 30
      } as IDSLTextLayer);

      // Distinct Composition Primitives
      layers.push({
        id: 'page_number',
        type: 'decoration',
        zIndex: 20,
        component: 'oversized_index',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'accent_rule',
        type: 'decoration',
        zIndex: 25,
        component: 'thin_divider',
        anchor: 'bottom_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);
      
    } else if (familyId === 'editorial_quote' || familyId === 'minimalist_quote') {
      // RECIPE: Editorial Quote
      layers.push({
        id: 'author_image',
        type: 'image',
        zIndex: 10,
        mask: 'split',
        paddingPercent: 10,
        anchor: 'middle_right'
      } as IDSLImageLayer);

      layers.push({
        id: 'quote_text',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_left',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'quote_author',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        role: 'tagline',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'quote_marks_bg',
        type: 'decoration',
        zIndex: 5,
        component: 'quote_marks',
        anchor: 'top_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);
      
      layers.push({
        id: 'texture',
        type: 'decoration',
        zIndex: 90,
        component: 'grain_overlay',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

    } else if (familyId === 'editorial_informational' || familyId === 'educational') {
      // RECIPE: Editorial Informational / Step-by-Step
      layers.push({
        id: 'step_image',
        type: 'image',
        zIndex: 10,
        mask: 'die_cut',
        paddingPercent: 15,
        anchor: 'middle_right'
      } as IDSLImageLayer);

      layers.push({
        id: 'step_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_left',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

      layers.push({
        id: 'step_body',
        type: 'text',
        zIndex: 31,
        anchor: 'middle_left',
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

      layers.push({
        id: 'grid_bg',
        type: 'decoration',
        zIndex: 5,
        component: 'minimal_grid',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'step_number',
        type: 'decoration',
        zIndex: 25,
        component: 'metadata_label',
        anchor: 'top_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

    } else {
      // Default Fallback Recipe
      layers.push({
        id: 'main_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 10,
        anchor: 'center'
      } as IDSLImageLayer);

      layers.push({
        id: 'main_text',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);
    }

    return {
      schemaVersion: '1.0',
      layoutVersion: '1.0',
      id: recipeId,
      layers
    };
  }
}
