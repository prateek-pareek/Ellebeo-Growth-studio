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
    isFirstSlide: boolean
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
      layers.push({ id: 'port_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
      layers.push({ id: 'port_caption', type: 'text', zIndex: 31, anchor: 'bottom_center', role: 'tagline', alignment: 'center', maxWidthPercent: 60 } as IDSLTextLayer);

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
        anchor: 'top_center',
        allowedAnchors: ['top_center', 'center']
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
        anchor: 'center',
        allowedAnchors: ['center', 'bottom_center'],
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 70
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
      layers.push({ id: 'prem_cta_title', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 90 } as IDSLTextLayer);
      layers.push({ id: 'prem_cta_caption', type: 'text', zIndex: 31, anchor: 'bottom_center', role: 'footnote', alignment: 'center', maxWidthPercent: 50 } as IDSLTextLayer);
      layers.push({ id: 'prem_cta_badge', type: 'decoration', zIndex: 35, component: 'handmade_mark', anchor: 'top_right' } as IDSLDecorationLayer);

      // ==========================================
      // FALLBACK
      // ==========================================
    } else {
      layers.push({ id: 'fb_image', type: 'image', zIndex: 10, mask: 'rectangle', anchor: 'center', paddingPercent: 10 } as IDSLImageLayer);
      layers.push({ id: 'fb_text', type: 'text', zIndex: 30, anchor: 'center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer);
    }

    return {
      schemaVersion: '1.0',
      layoutVersion: '1.0',
      id: recipeId,
      layers
    };
  }
}
