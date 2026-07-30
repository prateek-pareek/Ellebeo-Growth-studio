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
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'middle_left', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'hero_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_left',
        allowedAnchors: ['bottom_left', 'bottom_center', 'middle_left'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      layers.push({
        id: 'hero_caption',
        type: 'text',
        zIndex: 31,
        anchor: 'top_left',
        allowedAnchors: ['top_left', 'bottom_right'],
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 30
      } as IDSLTextLayer);

      // Distinct Composition Primitives
      layers.push({
        id: 'bg_ghost_text',
        type: 'decoration',
        zIndex: 5,
        component: 'ghost_headline',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'corner_badge',
        type: 'decoration',
        zIndex: 20,
        component: 'handmade_mark', // Semantic category
        anchor: 'top_right',
        allowedAnchors: ['top_right', 'bottom_right'],
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'accent_rule',
        type: 'decoration',
        zIndex: 25,
        component: 'structural_border', // Semantic category
        anchor: 'bottom_left',
        allowedAnchors: ['bottom_left', 'top_left'],
        offsetPercent: 10
      } as IDSLDecorationLayer);
      
    } else if (familyId === 'editorial_quote' || familyId === 'minimalist_quote') {
      // RECIPE: Editorial Quote
      layers.push({
        id: 'author_image',
        type: 'image',
        zIndex: 10,
        mask: 'split',
        paddingPercent: 10,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'middle_left']
      } as IDSLImageLayer);

      layers.push({
        id: 'quote_text',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left', 'middle_right'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'quote_author',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        allowedAnchors: ['bottom_left', 'bottom_right'],
        role: 'tagline',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'quote_marks_bg',
        type: 'decoration',
        zIndex: 5,
        component: 'pull_quote',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);
      
      layers.push({
        id: 'texture',
        type: 'decoration',
        zIndex: 90,
        component: 'paper_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);
      
      layers.push({
        id: 'museum_border',
        type: 'decoration',
        zIndex: 25,
        component: 'structural_border', // Resolves to museum_border or similar
        anchor: 'center',
        offsetPercent: 10
      } as IDSLDecorationLayer);

    } else if (familyId === 'editorial_informational' || familyId === 'educational') {
      // RECIPE: Editorial Informational / Step-by-Step
      layers.push({
        id: 'step_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 15,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'middle_left', 'top_center']
      } as IDSLImageLayer);

      layers.push({
        id: 'step_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_left',
        allowedAnchors: ['top_left', 'bottom_left'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

      layers.push({
        id: 'step_body',
        type: 'text',
        zIndex: 31,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left', 'bottom_left'],
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

      layers.push({
        id: 'number_block',
        type: 'decoration',
        zIndex: 5,
        component: 'editorial_number_block',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'texture_bg',
        type: 'decoration',
        zIndex: 15,
        component: 'paper_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);
      
      // Add an editorial breather family recipe as well
    } else if (familyId === 'editorial_breather') {
      layers.push({
        id: 'breather_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        allowedAnchors: ['center', 'middle_left'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'organic_accent_1',
        type: 'decoration',
        zIndex: 15,
        component: 'organic_accent',
        anchor: 'top_left',
        allowedAnchors: ['top_left', 'bottom_right'],
        offsetPercent: 10
      } as IDSLDecorationLayer);

      layers.push({
        id: 'texture_bg',
        type: 'decoration',
        zIndex: 5,
        component: 'paper_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'running_header',
        type: 'decoration',
        zIndex: 25,
        component: 'running_header',
        anchor: 'top_center',
        offsetPercent: 5
      } as IDSLDecorationLayer);

    } else if (familyId === 'editorial_breather') {
      // RECIPE: Editorial Breather (Text only, rich texture)
      layers.push({
        id: 'bg_paper',
        type: 'decoration',
        zIndex: 5,
        component: 'paper_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'bg_noise',
        type: 'decoration',
        zIndex: 6,
        component: 'noise_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);
      
      layers.push({
        id: 'breather_ghost_text',
        type: 'decoration',
        zIndex: 10,
        component: 'ghost_headline',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'breather_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'accent_rule',
        type: 'decoration',
        zIndex: 25,
        component: 'accent_rule',
        anchor: 'bottom_center',
        offsetPercent: 10
      } as IDSLDecorationLayer);

      layers.push({
        id: 'breather_page_num',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'footnote',
        alignment: 'center',
        maxWidthPercent: 10
      } as IDSLTextLayer);

    } else if (familyId.startsWith('clinical')) {
      // RECIPE: Clinical Family (Precision, Alignment, Steps)
      // Focuses on structured information, steps, and callout boxes
      layers.push({
        id: 'clinical_image',
        type: 'image',
        zIndex: 10,
        mask: 'split',
        paddingPercent: 5,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'top_center']
      } as IDSLImageLayer);

      layers.push({
        id: 'clinical_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_left',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);
      
      layers.push({
        id: 'clinical_callout',
        type: 'decoration',
        zIndex: 15,
        component: 'clinical_callout_box',
        anchor: 'middle_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      if (familyId === 'clinical_step_routine') {
        layers.push({
          id: 'step_badge',
          type: 'decoration',
          zIndex: 35,
          component: 'step_badge',
          anchor: 'top_left',
          offsetPercent: 2
        } as IDSLDecorationLayer);
      } else if (familyId === 'clinical_analysis_card') {
        layers.push({
          id: 'metric_label',
          type: 'decoration',
          zIndex: 35,
          component: 'metric_label',
          anchor: 'bottom_left',
          offsetPercent: 10
        } as IDSLDecorationLayer);
      }

    } else if (familyId.startsWith('educational')) {
      // RECIPE: Educational Family (Text-Based, Informational, Structured)
      // Usually lacks a hero image, focusing purely on high-end typography layout
      layers.push({
        id: 'educational_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'educational_body',
        type: 'text',
        zIndex: 31,
        anchor: 'center',
        role: 'body',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      if (familyId === 'educational_numbered_list') {
        layers.push({
          id: 'large_numeral',
          type: 'decoration',
          zIndex: 5,
          component: 'large_numeral_bullet',
          anchor: 'top_left',
          offsetPercent: 0
        } as IDSLDecorationLayer);
      } else if (familyId === 'educational_myth_vs_fact') {
        layers.push({
          id: 'myth_fact_badge',
          type: 'decoration',
          zIndex: 35,
          component: 'myth_fact_badge',
          anchor: 'top_center',
          offsetPercent: 5
        } as IDSLDecorationLayer);
      } else if (familyId === 'educational_quote_hero') {
        layers.push({
          id: 'quote_mark',
          type: 'decoration',
          zIndex: 5,
          component: 'quote_mark_accent',
          anchor: 'center',
          offsetPercent: 0
        } as IDSLDecorationLayer);
      }
    } else if (familyId === 'premium_text_only') {
      // RECIPE: Premium Text Only (For slides requiring no image but massive brand/visual identity)
      layers.push({
        id: 'premium_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        allowedAnchors: ['center', 'middle_left'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 85
      } as IDSLTextLayer);

      layers.push({
        id: 'premium_body',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'body',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      // Add one of the new premium decorators randomly or deterministically (here we add multiple but with distinct placement)
      layers.push({
        id: 'premium_deco_1',
        type: 'decoration',
        zIndex: 5,
        component: 'abstract_rings',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'premium_deco_2',
        type: 'decoration',
        zIndex: 15,
        component: slideIndex % 2 === 0 ? 'meteor_shower' : 'elegant_line_art',
        anchor: 'top_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'premium_deco_3',
        type: 'decoration',
        zIndex: 16,
        component: 'premium_stars',
        anchor: 'bottom_right',
        offsetPercent: 0
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
