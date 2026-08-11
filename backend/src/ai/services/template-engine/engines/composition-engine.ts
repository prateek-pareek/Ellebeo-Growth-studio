import { ICompiledLayoutDSL, IDSLSceneLayer, IDSLImageLayer, IDSLTextLayer, IDSLDecorationLayer, CompositionTokens } from '../interfaces';
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
    tokens: CompositionTokens | DesignTokens,
    intent: TemplateIntent,
    isFirstSlide: boolean,
    faceCoordinates?: { eyesYPercent: number; mouthYPercent?: number; }
  ): CompositionMetadata {

    // Helper to determine if we are using new or legacy tokens
    const isNewArchitecture = 'imageDominance' in tokens;

    // 1. Base initialization from Design Tokens
    const metadata: CompositionMetadata = {
      dominantElement: isNewArchitecture 
        ? ((tokens as CompositionTokens).imageDominance < 0.5 ? 'typography' : 'image')
        : ((tokens as DesignTokens).headlinePresence === 'hero' ? 'typography' : 'image'),
      whitespaceRatio: isNewArchitecture
        ? ((tokens as CompositionTokens).whitespace === 'massive' || (tokens as CompositionTokens).whitespace === 'high' ? 'high' : ((tokens as CompositionTokens).whitespace === 'minimal' ? 'low' : 'medium'))
        : ((tokens as DesignTokens).spacing === 'airy' ? 'high' : ((tokens as DesignTokens).spacing === 'dense' ? 'low' : 'medium')),
      elementOverlap: isNewArchitecture ? (tokens as CompositionTokens).alignment === 'dynamic' : (tokens as DesignTokens).layerDepth === 'high',
      maskPreference: 'full_bleed',
      injectedFeatures: []
    };

    // 2. Adjust Mask Preference based on Tokens
    if ('borderRadius' in tokens && tokens.borderRadius === 'soft') metadata.maskPreference = 'rectangle';
    if ('borderRadius' in tokens && tokens.borderRadius === 'pill') metadata.maskPreference = 'arch'; // Simple mapping for now

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
        if ('layerDepth' in tokens && tokens.layerDepth === 'high') metadata.maskPreference = 'polaroid';
        break;
    }

    // Cover slides generally get more punchy visual weight
    if (isFirstSlide && metadata.dominantElement !== 'typography') {
      if (!isNewArchitecture && (tokens as DesignTokens).contrast === 'high') {
        metadata.dominantElement = 'typography';
      } else if (isNewArchitecture && (tokens as CompositionTokens).whitespace === 'massive') {
        metadata.dominantElement = 'typography';
      }
    }

    return metadata;
  }

  /**
   * Builds the structural DSL for a design family variant. Every literal below (mask,
   * anchor, zIndex, which primitive component) is genuine family DNA — a structural
   * fact about this specific variant, not a per-generation creative choice, so it stays
   * hardcoded here by design. Intent-driven values (alignment, whitespace/negativeSpace,
   * photo treatment, typography scale, decoration density, mood) are deliberately NOT
   * duplicated across these ~45 branches — they're applied once, generically, to every
   * recipe (rigid or procedural) by DesignCompiler/GeometryCompiler downstream, which is
   * what actually reads the Template Agent's Design Intent (see art-direction-engine.ts,
   * design-compiler.ts, geometry-compiler.ts).
   */
  public buildRecipe(layoutId: string, slideIndex: number, brandName: string): ICompiledLayoutDSL {
    const layers: IDSLSceneLayer[] = [];
    const recipeId = `${layoutId}_${slideIndex}`;

    // ==========================================
    // 1. EDITORIAL FAMILY
    // ==========================================
    if (layoutId === 'editorial_magazine_cover') {
      layers.push({ id: 'mag_hero', type: 'image', zIndex: 10, mask: 'full_bleed', paddingPercent: 0, anchor: 'center' } as IDSLImageLayer);
      layers.push({ id: 'mag_masthead', type: 'text', zIndex: 30, anchor: 'top_center', role: 'heading', alignment: 'center', maxWidthPercent: 90 } as IDSLTextLayer);
      layers.push({ id: 'mag_caption', type: 'text', zIndex: 31, anchor: 'bottom_left', role: 'body', alignment: 'left', maxWidthPercent: 50 } as IDSLTextLayer);

    } else if (layoutId === 'editorial_portrait_hero') {
      layers.push({ id: 'port_image', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'top_center', paddingPercent: 5, allowedAnchors: ['top_center'] } as IDSLImageLayer);
      layers.push({ id: 'port_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 85 } as IDSLTextLayer);
      layers.push({ id: 'port_caption', type: 'text', zIndex: 31, anchor: 'bottom_center', role: 'tagline', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);

    } else if (layoutId === 'editorial_split') {
      layers.push({ id: 'split_image', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'middle_left', paddingPercent: 0 } as IDSLImageLayer);
      layers.push({ id: 'split_title', type: 'text', zIndex: 30, anchor: 'middle_right', role: 'heading', alignment: 'left', maxWidthPercent: 45 } as IDSLTextLayer);
      layers.push({ id: 'split_border', type: 'decoration', zIndex: 25, component: 'structural_border', anchor: 'center' } as IDSLDecorationLayer);

    } else if (layoutId === 'editorial_full_bleed') {
      layers.push({ id: 'fb_image', type: 'image', zIndex: 10, mask: 'full_bleed', paddingPercent: 0, anchor: 'center' } as IDSLImageLayer);
      layers.push({ id: 'fb_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 85 } as IDSLTextLayer);

    } else if (layoutId === 'editorial_feature_story') {
      layers.push({ id: 'feature_image', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'middle_right', paddingPercent: 10 } as IDSLImageLayer);
      layers.push({ id: 'feature_title', type: 'text', zIndex: 30, anchor: 'bottom_left', role: 'heading', alignment: 'left', maxWidthPercent: 50 } as IDSLTextLayer);
      layers.push({ id: 'feature_caption', type: 'text', zIndex: 31, anchor: 'top_left', role: 'body', alignment: 'left', maxWidthPercent: 30 } as IDSLTextLayer);
      layers.push({ id: 'feature_rule', type: 'decoration', zIndex: 20, component: 'accent_rule', anchor: 'bottom_left', offsetPercent: 5 } as IDSLDecorationLayer);

      // ==========================================
      // 2. CLINICAL FAMILY
      // ==========================================
    } else if (layoutId === 'clinical_hero') {
      layers.push({ id: 'clin_hero_img', type: 'image', zIndex: 10, mask: 'split', anchor: 'middle_right', paddingPercent: 5 } as IDSLImageLayer);
      layers.push({ id: 'clin_hero_title', type: 'text', zIndex: 30, anchor: 'top_left', role: 'heading', alignment: 'left', maxWidthPercent: 40 } as IDSLTextLayer);
      layers.push({ id: 'clin_hero_callout', type: 'decoration', zIndex: 20, component: 'clinical_callout_box', anchor: 'middle_left', offsetPercent: 5 } as IDSLDecorationLayer);

    } else if (layoutId === 'clinical_procedure_steps') {
      layers.push({ id: 'clin_step_img', type: 'image', zIndex: 10, mask: 'circle', anchor: 'middle_right', paddingPercent: 10 } as IDSLImageLayer);
      layers.push({ id: 'clin_step_title', type: 'text', zIndex: 30, anchor: 'top_left', role: 'heading', alignment: 'left', maxWidthPercent: 40 } as IDSLTextLayer);
      layers.push({ id: 'clin_step_badge', type: 'decoration', zIndex: 35, component: 'step_badge', anchor: 'top_left', offsetPercent: 2 } as IDSLDecorationLayer);
      layers.push({ id: 'clin_step_body', type: 'text', zIndex: 31, anchor: 'middle_left', role: 'body', alignment: 'left', maxWidthPercent: 40 } as IDSLTextLayer);
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

    } else if (layoutId === 'testimonial_z_pattern') {
      // RECIPE: Testimonial Z-Pattern
      // Avatar top left, large quote center right, name/title bottom left.
      layers.push({
        id: 'test_z_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 12,
        anchor: 'top_left',
        allowedAnchors: ['top_left', 'top_right']
      } as IDSLImageLayer);

      layers.push({
        id: 'test_z_quote_mark',
        type: 'decoration',
        zIndex: 15,
        component: 'quote_marks',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'test_z_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        allowedAnchors: ['center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'test_z_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        role: 'tagline',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

    } else if (layoutId === 'split_vertical_stack') {
      // RECIPE: Split - Vertical Stack
      // Heading block on top ~40%, circle-masked photo filling the bottom ~40-95%
      layers.push({
        id: 'split_stack_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 10,
        anchor: 'bottom_center',
        allowedAnchors: ['bottom_center', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'split_stack_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'top_left'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'split_stack_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'top_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      layers.push({
        id: 'split_stack_divider',
        type: 'decoration',
        zIndex: 20,
        component: 'thin_divider',
        anchor: 'center',
        offsetPercent: 40
      } as IDSLDecorationLayer);

    } else if (layoutId === 'split_horizontal_band') {
      // RECIPE: Split - Horizontal Band
      // Full-width photo band on top third, solid text block on the bottom two-thirds, divider at the seam
      layers.push({
        id: 'split_band_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'top_center',
        allowedAnchors: ['top_center']
      } as IDSLImageLayer);

      layers.push({
        id: 'split_band_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        allowedAnchors: ['center', 'bottom_center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'split_band_body',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'split_band_divider',
        type: 'decoration',
        zIndex: 20,
        component: 'divider',
        anchor: 'top_center',
        offsetPercent: 33
      } as IDSLDecorationLayer);

    } else if (layoutId === 'split_left_right') {
      // RECIPE: Split - Left/Right
      // Circle photo occupying the right half, heading+tagline anchored bottom-left, decorative background texture
      layers.push({
        id: 'split_lr_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 8,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'top_right']
      } as IDSLImageLayer);

      layers.push({
        id: 'split_lr_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_left',
        allowedAnchors: ['bottom_left', 'middle_left'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

      layers.push({
        id: 'split_lr_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        role: 'tagline',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'split_lr_texture',
        type: 'decoration',
        zIndex: 5,
        component: 'grain_overlay',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

    } else if (layoutId === 'countdown_promo_frames') {
      // RECIPE: Countdown Promo - Stacked Frames
      // Left 60% text stack, right 40% overlapping polaroid-style photo frames, CTA-style accent chip
      layers.push({
        id: 'promo_frames_image',
        type: 'image',
        zIndex: 10,
        mask: 'polaroid',
        paddingPercent: 5,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'top_right']
      } as IDSLImageLayer);

      layers.push({
        id: 'promo_frames_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left', 'top_left'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 55
      } as IDSLTextLayer);

      layers.push({
        id: 'promo_frames_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_left',
        role: 'tagline',
        alignment: 'left',
        maxWidthPercent: 50
      } as IDSLTextLayer);

      layers.push({
        id: 'promo_frames_cta',
        type: 'decoration',
        zIndex: 35,
        component: 'status_chip',
        anchor: 'bottom_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

    } else if (layoutId === 'countdown_promo_headline') {
      // RECIPE: Countdown Promo - Photo/Headline Split
      // Left half full-bleed photo, right half single large centered headline, minimal decoration
      layers.push({
        id: 'promo_headline_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left']
      } as IDSLImageLayer);

      layers.push({
        id: 'promo_headline_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'promo_headline_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'middle_right',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 35
      } as IDSLTextLayer);

      layers.push({
        id: 'promo_headline_divider',
        type: 'decoration',
        zIndex: 20,
        component: 'divider',
        anchor: 'center',
        offsetPercent: 50
      } as IDSLDecorationLayer);

    } else if (layoutId === 'countdown_promo_circle') {
      // RECIPE: Countdown Promo - Circle Minimal
      // Circle-cropped photo centered on a flat background, minimal decoration, tight negative space
      layers.push({
        id: 'promo_circle_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 15,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'promo_circle_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'promo_circle_accent',
        type: 'decoration',
        zIndex: 5,
        component: 'product_halo_ring',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

    } else if (layoutId === 'product_showcase_overlay') {
      // RECIPE: Product Showcase - Full-Bleed Overlay
      // Full-bleed background photo with headline+tagline text overlaid directly on top
      layers.push({
        id: 'showcase_overlay_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'showcase_overlay_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'showcase_overlay_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'top_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      layers.push({
        id: 'showcase_overlay_grain',
        type: 'decoration',
        zIndex: 15,
        component: 'grain_overlay',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

    } else if (layoutId === 'product_showcase_halo') {
      // RECIPE: Product Showcase - Halo Circle
      // Circle-cropped product photo with a larger decorative "halo" ring behind it
      layers.push({
        id: 'showcase_halo_ring',
        type: 'decoration',
        zIndex: 5,
        component: 'product_halo_ring',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'showcase_halo_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 20,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'showcase_halo_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

    } else if (layoutId === 'product_showcase_band') {
      // RECIPE: Product Showcase - 3-Band with CTA
      // Heading/tagline band over a photo starting mid-canvas, divider at the seam, CTA chip at the bottom
      layers.push({
        id: 'showcase_band_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'bottom_center',
        allowedAnchors: ['bottom_center']
      } as IDSLImageLayer);

      layers.push({
        id: 'showcase_band_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'showcase_band_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'top_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      layers.push({
        id: 'showcase_band_divider',
        type: 'decoration',
        zIndex: 20,
        component: 'divider',
        anchor: 'center',
        offsetPercent: 40
      } as IDSLDecorationLayer);

      layers.push({
        id: 'showcase_band_cta',
        type: 'decoration',
        zIndex: 35,
        component: 'status_chip',
        anchor: 'bottom_center',
        offsetPercent: 10
      } as IDSLDecorationLayer);

    } else if (layoutId === 'before_after_side_by_side') {
      // RECIPE: Before/After - Side by Side
      // Real before-photo and after-photo stitched vertically (left/right), arrow marking the seam, heading below
      layers.push({
        id: 'ba_side_image',
        type: 'image',
        zIndex: 10,
        mask: 'before_after_split',
        orientation: 'vertical',
        paddingPercent: 0,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'ba_side_arrow',
        type: 'decoration',
        zIndex: 25,
        component: 'transformation_arrow',
        orientation: 'vertical',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'ba_side_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        allowedAnchors: ['bottom_center', 'top_center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'ba_side_texture',
        type: 'decoration',
        zIndex: 5,
        component: 'paper_texture',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

    } else if (layoutId === 'before_after_stacked') {
      // RECIPE: Before/After - Stacked
      // Real before-photo and after-photo stitched horizontally (top/bottom), arrow marking the seam, heading at the bottom
      layers.push({
        id: 'ba_stack_image',
        type: 'image',
        zIndex: 10,
        mask: 'before_after_split',
        orientation: 'horizontal',
        paddingPercent: 0,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'ba_stack_arrow',
        type: 'decoration',
        zIndex: 25,
        component: 'transformation_arrow',
        orientation: 'horizontal',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'ba_stack_border',
        type: 'decoration',
        zIndex: 20,
        component: 'structural_border',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'ba_stack_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

    } else if (layoutId === 'before_after_labeled') {
      // RECIPE: Before/After - Labeled Reveal
      // Side-by-side split with a masking-tape accent and a heading+tagline stack, evoking a pinned-up transformation card
      layers.push({
        id: 'ba_labeled_image',
        type: 'image',
        zIndex: 10,
        mask: 'before_after_split',
        orientation: 'vertical',
        paddingPercent: 5,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'ba_labeled_tape',
        type: 'decoration',
        zIndex: 35,
        component: 'editorial_tape',
        anchor: 'top_center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'ba_labeled_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'bottom_center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'ba_labeled_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      // ==========================================
      // TESTIMONIAL FAMILY
      // ==========================================
    } else if (layoutId === 'testimonial_quote_portrait') {
      // RECIPE: Testimonial - Quote with Portrait
      // Circle-masked client portrait, quote marks accent, heading carries the quote, tagline carries attribution
      layers.push({
        id: 'testi_portrait_image',
        type: 'image',
        zIndex: 10,
        mask: 'circle',
        paddingPercent: 12,
        // Locked to top_center (no allowedAnchors variation): the circle mask
        // is always 60% of the canvas's shorter dimension (fixed in the
        // renderer, not something this recipe controls), so at 'center' it
        // would sit even lower and leave LESS room for the heading/tagline
        // below it than 'top_center' already does — the opposite of a safe
        // variation.
        anchor: 'top_center'
      } as IDSLImageLayer);

      layers.push({
        id: 'testi_portrait_quote',
        type: 'decoration',
        zIndex: 20,
        component: 'quote_marks',
        anchor: 'top_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'testi_portrait_heading',
        type: 'text',
        zIndex: 30,
        // 'center' used to be offered as a variation here, but
        // testi_portrait_image is a top-anchored circle at 60% of the
        // canvas's shorter dimension — vertical-center always lands inside
        // that circle, guaranteeing a heading/photo collision, not an
        // occasional one. bottom_center is the only safe position given
        // this recipe's fixed photo geometry.
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        // Widened from 70 -> 88: a narrower box wraps to more lines, and
        // every extra line eats further into the tight clearance between
        // the (fixed-size) circle photo above and the footer reserve below.
        maxWidthPercent: 88
      } as IDSLTextLayer);

      layers.push({
        id: 'testi_portrait_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 50
      } as IDSLTextLayer);

    } else if (layoutId === 'testimonial_star_card') {
      // RECIPE: Testimonial - Star Rating Card
      // Glass card treatment with a 5-star rating row leading, quote below, client name as tagline
      layers.push({
        id: 'testi_star_card',
        type: 'decoration',
        zIndex: 15,
        component: 'glass_card',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'testi_star_rating',
        type: 'decoration',
        zIndex: 30,
        component: 'star_rating_row',
        anchor: 'top_center',
        offsetPercent: 15
      } as IDSLDecorationLayer);

      layers.push({
        id: 'testi_star_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 65
      } as IDSLTextLayer);

      layers.push({
        id: 'testi_star_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 45
      } as IDSLTextLayer);

    } else if (layoutId === 'testimonial_minimal_quote') {
      // RECIPE: Testimonial - Minimal Quote (no image required)
      // Pure typography quote for appointments/slides without a usable client photo, small star row for social proof
      layers.push({
        id: 'testi_min_accent',
        type: 'decoration',
        zIndex: 20,
        component: 'quote_mark_accent',
        anchor: 'top_center',
        offsetPercent: 10
      } as IDSLDecorationLayer);

      layers.push({
        id: 'testi_min_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

      layers.push({
        id: 'testi_min_stars',
        type: 'decoration',
        zIndex: 30,
        component: 'star_rating_row',
        anchor: 'bottom_center',
        offsetPercent: 15
      } as IDSLDecorationLayer);

      // ==========================================
      // SCRAPBOOK FAMILY
      // ==========================================
    } else if (layoutId === 'scrapbook_collage') {
      // RECIPE: Scrapbook - Taped Photo Collage
      // Polaroid-masked photo pinned with a masking-tape accent, torn-paper texture, heading below like a caption card
      layers.push({
        id: 'scrap_collage_image',
        type: 'image',
        zIndex: 10,
        mask: 'polaroid',
        paddingPercent: 8,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'scrap_collage_tape',
        type: 'decoration',
        zIndex: 35,
        component: 'editorial_tape',
        anchor: 'top_center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'scrap_collage_torn',
        type: 'decoration',
        zIndex: 5,
        component: 'torn_paper',
        anchor: 'bottom_center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'scrap_collage_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

    } else if (layoutId === 'scrapbook_journal_entry') {
      // RECIPE: Scrapbook - Journal Entry
      // Inset rectangle photo with a divider and handwritten-feel margin notes, like a personal journal spread
      layers.push({
        id: 'scrap_journal_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 12,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left', 'top_left']
      } as IDSLImageLayer);

      layers.push({
        id: 'scrap_journal_notes',
        type: 'decoration',
        zIndex: 20,
        component: 'margin_notes',
        anchor: 'middle_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'scrap_journal_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_right',
        allowedAnchors: ['middle_right', 'bottom_right'],
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 40
      } as IDSLTextLayer);

      layers.push({
        id: 'scrap_journal_divider',
        type: 'decoration',
        zIndex: 20,
        component: 'divider',
        anchor: 'center',
        offsetPercent: 50
      } as IDSLDecorationLayer);

      // ==========================================
      // QUADRANT FAMILY
      // ==========================================
    } else if (layoutId === 'quadrant_grid') {
      // RECIPE: Quadrant - Grid Overlay
      // Full photo with a subtle quadrant grid overlay and a corner badge, evoking a 4-panel structure on a single hero image
      layers.push({
        id: 'quad_grid_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'quad_grid_lines',
        type: 'decoration',
        zIndex: 20,
        component: 'minimal_grid',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'quad_grid_badge',
        type: 'decoration',
        zIndex: 35,
        component: 'geometric_badge',
        anchor: 'top_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'quad_grid_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_left',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 60
      } as IDSLTextLayer);

    } else if (layoutId === 'quadrant_badge_focus') {
      // RECIPE: Quadrant - Badge Focus
      // Arch-masked photo with a prominent geometric badge and grain texture, heading+tagline stacked below
      layers.push({
        id: 'quad_badge_image',
        type: 'image',
        zIndex: 10,
        mask: 'arch',
        paddingPercent: 10,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'quad_badge_geo',
        type: 'decoration',
        zIndex: 35,
        component: 'geometric_badge',
        anchor: 'top_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'quad_badge_grain',
        type: 'decoration',
        zIndex: 5,
        component: 'grain_overlay',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'quad_badge_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'quad_badge_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 50
      } as IDSLTextLayer);

      // ==========================================
      // TRANSFORMATION FAMILY
      // ==========================================
    } else if (layoutId === 'transformation_timeline') {
      // RECIPE: Transformation - Timeline
      // Hero photo on top, horizontal milestone timeline marking the journey, heading + tagline below
      layers.push({
        id: 'trans_tl_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 5,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'trans_tl_track',
        type: 'decoration',
        zIndex: 25,
        component: 'timeline_track',
        anchor: 'center',
        offsetPercent: 62
      } as IDSLDecorationLayer);

      layers.push({
        id: 'trans_tl_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'trans_tl_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

    } else if (layoutId === 'transformation_journey_arc') {
      // RECIPE: Transformation - Journey Arc
      // Arch-masked photo with a step badge marking progress, heading and tagline stacked below, structured/bold energy
      layers.push({
        id: 'trans_arc_image',
        type: 'image',
        zIndex: 10,
        mask: 'arch',
        paddingPercent: 10,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'trans_arc_badge',
        type: 'decoration',
        zIndex: 35,
        component: 'step_badge',
        anchor: 'top_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'trans_arc_rule',
        type: 'decoration',
        zIndex: 20,
        component: 'accent_rule',
        anchor: 'bottom_center',
        offsetPercent: 30
      } as IDSLDecorationLayer);

      layers.push({
        id: 'trans_arc_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

      layers.push({
        id: 'trans_arc_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 55
      } as IDSLTextLayer);

    } else if (layoutId === 'transformation_stat_reveal') {
      // RECIPE: Transformation - Stat Reveal
      // Single hero photo with a numeral watermark and a stat/metric callout, no dual-photo split (distinct from before_after)
      layers.push({
        id: 'trans_stat_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'center',
        allowedAnchors: ['center']
      } as IDSLImageLayer);

      layers.push({
        id: 'trans_stat_numeral',
        type: 'decoration',
        zIndex: 15,
        component: 'large_numeral_bullet',
        anchor: 'top_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'trans_stat_metric',
        type: 'decoration',
        zIndex: 35,
        component: 'metric_label',
        anchor: 'bottom_center',
        offsetPercent: 12
      } as IDSLDecorationLayer);

      layers.push({
        id: 'trans_stat_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

      // ==========================================
      // MAGAZINE FAMILY
      // ==========================================
    } else if (layoutId === 'magazine_masthead_cover') {
      // RECIPE: Magazine - Masthead Cover
      // Full-bleed hero photo, large masthead headline, issue-style running header, sidebar rule down the left margin
      layers.push({
        id: 'mag_mh_image',
        type: 'image',
        zIndex: 10,
        mask: 'full_bleed',
        paddingPercent: 0,
        anchor: 'center'
      } as IDSLImageLayer);

      layers.push({
        id: 'mag_mh_sidebar',
        type: 'decoration',
        zIndex: 20,
        component: 'editorial_sidebar',
        anchor: 'middle_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_mh_header',
        type: 'decoration',
        zIndex: 25,
        component: 'running_header',
        anchor: 'top_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_mh_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'top_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 90
      } as IDSLTextLayer);

      layers.push({
        id: 'mag_mh_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

    } else if (layoutId === 'magazine_pull_quote_spread') {
      // RECIPE: Magazine - Pull Quote Spread
      // Photo occupies one half, large italic pull-quote treatment on the other, vertical brand label along the edge
      layers.push({
        id: 'mag_pq_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 0,
        anchor: 'middle_left',
        allowedAnchors: ['middle_left', 'middle_right']
      } as IDSLImageLayer);

      layers.push({
        id: 'mag_pq_quote',
        type: 'decoration',
        zIndex: 20,
        component: 'pull_quote',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_pq_label',
        type: 'decoration',
        zIndex: 25,
        component: 'vertical_label',
        anchor: 'middle_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_pq_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_right',
        role: 'heading',
        alignment: 'left',
        maxWidthPercent: 45
      } as IDSLTextLayer);

    } else if (layoutId === 'magazine_contents_grid') {
      // RECIPE: Magazine - Contents Grid
      // Text-forward contents-page feel: stacked chapter tabs and an oversized index numeral frame the headline, no image required
      layers.push({
        id: 'mag_cg_tabs',
        type: 'decoration',
        zIndex: 20,
        component: 'chapter_tabs',
        anchor: 'top_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_cg_index',
        type: 'decoration',
        zIndex: 5,
        component: 'oversized_index',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'mag_cg_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'mag_cg_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 55
      } as IDSLTextLayer);

      // ==========================================
      // POLAROID FAMILY
      // ==========================================
    } else if (layoutId === 'polaroid_wall') {
      // RECIPE: Polaroid - Wall
      // Single snapshot dressed with a real polaroid frame and a pin/tape accent, plus a small sticker accent suggesting a wider pinned-up wall
      layers.push({
        id: 'polaroid_wall_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 14,
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center']
      } as IDSLImageLayer);

      layers.push({
        id: 'polaroid_wall_frame',
        type: 'decoration',
        zIndex: 15,
        component: 'polaroid_frame',
        anchor: 'top_center',
        offsetPercent: 3
      } as IDSLDecorationLayer);

      layers.push({
        id: 'polaroid_wall_tape',
        type: 'decoration',
        zIndex: 35,
        component: 'editorial_tape',
        anchor: 'top_center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'polaroid_wall_sticker',
        type: 'decoration',
        zIndex: 20,
        component: 'sticker',
        anchor: 'bottom_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'polaroid_wall_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

    } else if (layoutId === 'polaroid_stacked_caption') {
      // RECIPE: Polaroid - Stacked Caption
      // Single centered polaroid-framed photo with a handwritten-feel caption strip below the frame
      layers.push({
        id: 'polaroid_sc_image',
        type: 'image',
        zIndex: 10,
        mask: 'rectangle',
        paddingPercent: 16,
        anchor: 'center',
        allowedAnchors: ['center', 'top_center']
      } as IDSLImageLayer);

      layers.push({
        id: 'polaroid_sc_frame',
        type: 'decoration',
        zIndex: 15,
        component: 'polaroid_frame',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'polaroid_sc_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'bottom_center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
      } as IDSLTextLayer);

      layers.push({
        id: 'polaroid_sc_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 50
      } as IDSLTextLayer);

      // ==========================================
      // NOTIFICATION CARD FAMILY
      // ==========================================
    } else if (layoutId === 'notification_card_alert') {
      // RECIPE: Notification Card - Alert
      // Pure text alert card: icon badge at top center, glass-card panel behind the title, timestamp/subtext below
      layers.push({
        id: 'notif_alert_panel',
        type: 'decoration',
        zIndex: 10,
        component: 'glass_card',
        anchor: 'bottom_left',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'notif_alert_icon',
        type: 'decoration',
        zIndex: 35,
        component: 'notification_icon_badge',
        anchor: 'top_center',
        offsetPercent: 8
      } as IDSLDecorationLayer);

      layers.push({
        id: 'notif_alert_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

      layers.push({
        id: 'notif_alert_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 55
      } as IDSLTextLayer);

    } else if (layoutId === 'notification_card_banner') {
      // RECIPE: Notification Card - Banner
      // Top banner bar: icon badge and status chip anchor the top edge, heading and subtext stacked below
      layers.push({
        id: 'notif_banner_icon',
        type: 'decoration',
        zIndex: 35,
        component: 'notification_icon_badge',
        anchor: 'top_left',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'notif_banner_chip',
        type: 'decoration',
        zIndex: 30,
        component: 'status_chip',
        anchor: 'top_right',
        offsetPercent: 5
      } as IDSLDecorationLayer);

      layers.push({
        id: 'notif_banner_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'notif_banner_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

      // ==========================================
      // ANNOUNCEMENT FAMILY
      // ==========================================
    } else if (layoutId === 'announcement_banner') {
      // RECIPE: Announcement - Banner
      // Solid megaphone banner ribbon across the top, bold headline and tagline stacked below
      layers.push({
        id: 'announce_banner_ribbon',
        type: 'decoration',
        zIndex: 20,
        component: 'announcement_banner_ribbon',
        anchor: 'top_center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'announce_banner_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      } as IDSLTextLayer);

      layers.push({
        id: 'announce_banner_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 60
      } as IDSLTextLayer);

    } else if (layoutId === 'announcement_spotlight') {
      // RECIPE: Announcement - Spotlight
      // Centered starburst spotlight badge behind the headline, tagline below, no image required
      layers.push({
        id: 'announce_spot_burst',
        type: 'decoration',
        zIndex: 10,
        component: 'starburst_badge',
        anchor: 'center',
        offsetPercent: 0
      } as IDSLDecorationLayer);

      layers.push({
        id: 'announce_spot_heading',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 75
      } as IDSLTextLayer);

      layers.push({
        id: 'announce_spot_tagline',
        type: 'text',
        zIndex: 31,
        anchor: 'bottom_center',
        role: 'tagline',
        alignment: 'center',
        maxWidthPercent: 55
      } as IDSLTextLayer);

    } else if (layoutId.startsWith('clinical')) {
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

    } else if (layoutId === 'clinical_benefits_grid') {
      layers.push({ id: 'clin_grid_title', type: 'text', zIndex: 30, anchor: 'top_center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'clin_grid_body', type: 'text', zIndex: 31, anchor: 'center', role: 'body', alignment: 'center', maxWidthPercent: 70 } as IDSLTextLayer);
      layers.push({ id: 'clin_grid_metric', type: 'decoration', zIndex: 35, component: 'metric_label', anchor: 'bottom_center', offsetPercent: 10 } as IDSLDecorationLayer);

    } else if (layoutId === 'clinical_ingredient_focus') {
      layers.push({ id: 'clin_ing_img', type: 'image', zIndex: 10, mask: 'arch', anchor: 'center', paddingPercent: 15 } as IDSLImageLayer);
      layers.push({ id: 'clin_ing_title', type: 'text', zIndex: 30, anchor: 'bottom_center', role: 'heading', alignment: 'center', maxWidthPercent: 60 } as IDSLTextLayer);
      layers.push({ id: 'clin_ing_badge', type: 'decoration', zIndex: 35, component: 'myth_fact_badge', anchor: 'top_center', offsetPercent: 5 } as IDSLDecorationLayer);

    } else if (layoutId === 'clinical_before_after') {
      layers.push({ id: 'clin_ba_img', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'center', paddingPercent: 0 } as IDSLImageLayer);
      layers.push({ id: 'clin_ba_title', type: 'text', zIndex: 30, anchor: 'bottom_center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'clin_ba_rule', type: 'decoration', zIndex: 25, component: 'structural_border', anchor: 'center' } as IDSLDecorationLayer);

      // ==========================================
      // 3. MINIMALIST FAMILY
      // ==========================================
    } else if (layoutId === 'minimalist_centered_quote') {
      layers.push({ id: 'min_cq_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 70 } as IDSLTextLayer);

    } else if (layoutId === 'minimalist_offset_quote') {
      layers.push({ id: 'min_oq_title', type: 'text', zIndex: 30, anchor: 'middle_right', role: 'heading', alignment: 'right', maxWidthPercent: 60 } as IDSLTextLayer);
      layers.push({ id: 'min_oq_caption', type: 'text', zIndex: 31, anchor: 'bottom_right', role: 'tagline', alignment: 'right', maxWidthPercent: 40 } as IDSLTextLayer);

    } else if (layoutId === 'minimalist_quote_image') {
      layers.push({ id: 'min_qi_img', type: 'image', zIndex: 10, mask: 'split', anchor: 'middle_left', paddingPercent: 20 } as IDSLImageLayer);
      layers.push({ id: 'min_qi_title', type: 'text', zIndex: 30, anchor: 'middle_right', role: 'heading', alignment: 'left', maxWidthPercent: 45 } as IDSLTextLayer);

    } else if (layoutId === 'minimalist_bottom_caption') {
      layers.push({ id: 'min_bc_img', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'top_center', paddingPercent: 5 } as IDSLImageLayer);
      layers.push({ id: 'min_bc_caption', type: 'text', zIndex: 30, anchor: 'bottom_center', role: 'tagline', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);

    } else if (layoutId === 'minimalist_floating_card') {
      layers.push({ id: 'min_fc_img', type: 'image', zIndex: 10, mask: 'full_bleed', paddingPercent: 0, anchor: 'center' } as IDSLImageLayer);
      layers.push({ id: 'min_fc_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 60 } as IDSLTextLayer);

      // ==========================================
      // 4. PREMIUM TEXT FAMILY
      // ==========================================
    } else if (layoutId === 'premium_hero_statement') {
      layers.push({ id: 'prem_hs_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 90 } as IDSLTextLayer);

    } else if (layoutId === 'premium_stacked_typography') {
      layers.push({ id: 'prem_st_title', type: 'text', zIndex: 30, anchor: 'top_left', role: 'heading', alignment: 'left', maxWidthPercent: 85 } as IDSLTextLayer);
      layers.push({ id: 'prem_st_body', type: 'text', zIndex: 31, anchor: 'middle_left', role: 'body', alignment: 'left', maxWidthPercent: 85 } as IDSLTextLayer);
      layers.push({ id: 'prem_st_rule', type: 'decoration', zIndex: 25, component: 'accent_rule', anchor: 'bottom_left', offsetPercent: 5 } as IDSLDecorationLayer);

    } else if (layoutId === 'premium_manifesto') {
      layers.push({ id: 'prem_man_title', type: 'text', zIndex: 30, anchor: 'top_center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'prem_man_body', type: 'text', zIndex: 31, anchor: 'center', role: 'body', alignment: 'center', maxWidthPercent: 75 } as IDSLTextLayer);
      layers.push({ id: 'prem_man_rings', type: 'decoration', zIndex: 10, component: 'abstract_rings', anchor: 'center' } as IDSLDecorationLayer);

    } else if (layoutId === 'premium_quote_poster') {
      layers.push({ id: 'prem_qp_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'prem_qp_stars', type: 'decoration', zIndex: 15, component: 'premium_stars', anchor: 'top_left' } as IDSLDecorationLayer);
      layers.push({ id: 'prem_qp_quote', type: 'decoration', zIndex: 16, component: 'pull_quote', anchor: 'center' } as IDSLDecorationLayer);

    } else if (layoutId === 'premium_cta_poster') {
      layers.push({ id: 'prem_cta_bg', type: 'image', zIndex: 10, mask: 'full_bleed', paddingPercent: 0, anchor: 'center' } as IDSLImageLayer);
      layers.push({ id: 'prem_cta_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 90 } as IDSLTextLayer);
      // Upgraded role from footnote to body to ensure CTA is highly visible and legible.
      layers.push({ id: 'prem_cta_caption', type: 'text', zIndex: 31, anchor: 'bottom_center', role: 'body', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'prem_cta_badge', type: 'decoration', zIndex: 35, component: 'handmade_mark', anchor: 'top_right' } as IDSLDecorationLayer);

      // ==========================================
      // FALLBACK
      // ==========================================
    } else {
      layers.push({ id: 'fb_image', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'center', paddingPercent: 10 } as IDSLImageLayer);
      layers.push({ id: 'fb_text', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
    }

    // Preserve ALL recipe-defined layers (including decoration primitives like premium_stars).
    // The old filter aggressively stripped non-structural decorations, causing recipe-defined
    // primitives to silently disappear from the render pipeline.
    const filteredLayers = [...layers];

    // Dynamically inject family primitives (additive — skips components already present)
    const familyId = layoutId.split('_')[0];
    this.injectFamilyPrimitives(familyId, filteredLayers);

    return {
      schemaVersion: '1.0',
      layoutVersion: '1.0',
      id: recipeId,
      layers: filteredLayers
    };
  }

  private injectFamilyPrimitives(familyId: string, layers: IDSLSceneLayer[]) {
    const anchors: Array<'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'> = ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'center'];
    const randomAnchor = () => anchors[Math.floor(Math.random() * anchors.length)];

    let primitivesToInject: string[] = [];

    if (familyId === 'editorial') {
      primitivesToInject = ['accent_rule', 'editorial_badge', 'thin_divider', 'museum_border'];
    } else if (familyId === 'clinical') {
      primitivesToInject = ['step_badge', 'metric_label', 'clinical_callout_box', 'measurement_lines'];
    } else if (familyId === 'scrapbook') {
      primitivesToInject = ['editorial_tape', 'torn_paper', 'handmade_mark', 'ink_stamp', 'polaroid_frame'];
    } else if (familyId === 'minimalist') {
      primitivesToInject = ['minimal_grid', 'margin_rule', 'ghost_headline'];
    } else if (familyId === 'premium') {
      primitivesToInject = ['premium_stars', 'elegant_line_art'];
    } else if (familyId === 'split') {
      primitivesToInject = ['split_seam_line', 'divider'];
    } else if (familyId === 'countdown') {
      primitivesToInject = ['countdown_urgency_badge', 'status_chip'];
    } else if (familyId === 'product') {
      primitivesToInject = ['product_halo_ring', 'geometric_badge'];
    } else if (familyId === 'before') { // before_after
      primitivesToInject = ['transformation_arrow', 'editorial_tape'];
    } else if (familyId === 'testimonial') {
      primitivesToInject = ['quote_marks', 'star_rating_row', 'pull_quote'];
    } else if (familyId === 'quadrant') {
      primitivesToInject = ['blueprint_grid', 'corner_frame'];
    } else if (familyId === 'transformation') {
      primitivesToInject = ['timeline_track', 'step_badge'];
    } else if (familyId === 'magazine') {
      primitivesToInject = ['editorial_sidebar', 'running_header', 'oversized_index'];
    } else if (familyId === 'polaroid') {
      primitivesToInject = ['polaroid_frame', 'sticker', 'editorial_tape'];
    } else if (familyId === 'notification') {
      primitivesToInject = ['notification_icon_badge', 'status_chip'];
    } else if (familyId === 'announcement') {
      primitivesToInject = ['announcement_banner_ribbon', 'starburst_badge'];
    }

    if (primitivesToInject.length > 0) {
      // Collect components already present in the recipe-defined layers
      const existingComponents = new Set(
        layers.filter((l: any) => l.type === 'decoration' && l.component)
              .map((l: any) => l.component)
      );

      // Only inject primitives not already present
      const candidates = primitivesToInject.filter(p => !existingComponents.has(p));
      if (candidates.length > 0) {
        const numToInject = Math.min(candidates.length, Math.floor(Math.random() * 2) + 1);
        for (let i = 0; i < numToInject; i++) {
          const primitive = candidates[Math.floor(Math.random() * candidates.length)];
          layers.push({
            id: `dyn_prim_${familyId}_${i}`,
            type: 'decoration',
            zIndex: 25 + i, // Above images, below top text
            component: primitive as any,
            anchor: randomAnchor(),
            offsetPercent: Math.floor(Math.random() * 10)
          } as IDSLDecorationLayer);
        }
      }
    }
  }
}
