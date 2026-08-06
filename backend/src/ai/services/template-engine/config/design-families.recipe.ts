/**
 * Design Family Recipes - Base Definitions
 * PRINCIPLE: Recipes pulled from Brand DNA at runtime
 * These are templates; actual values come from brandDNA.colors, brandDNA.aestheticDirection
 */

import { DesignFamilyRecipe } from '../types/design-recipe.type';

// ============================================================================
// EDITORIAL FAMILY - Magazine aesthetic, image-hero, serif accents
// ============================================================================
export const editorialFamilyRecipe: DesignFamilyRecipe = {
  id: 'editorial',
  name: 'Editorial Magazine',
  description: 'Magazine-style layouts with image hero and serif typography',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 32,
    whitespaceRatio: 0.45,
    topBuffer: 0.08,
    bottomBuffer: 0.12,
    sideBuffer: 0.06,
  },

  typographyScale: {
    ratios: [3.5, 2.5, 1.5, 1.0, 0.75],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.1, 1.2, 1.3, 1.4, 1.6],
    fontFamilies: {
      headline: 'Georgia, Playfair Display, serif',
      body: 'Inter, Helvetica Neue, sans-serif',
    },
  },

  readingFlow: {
    type: 'z_pattern',
    elementSequence: ['logo', 'image', 'headline', 'body', 'cta'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#cccccc',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.65,
  },

  primitives: {
    top_rule: {
      type: 'rule',
      opacity: 0.3,
      thickness: 1,
      color: 'secondary',
      visibility: 'always',
    },
    image_frame: {
      type: 'frame',
      opacity: 0.8,
      thickness: 2,
      color: 'primary',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_left',
    offset: { x: 20, y: 20 },
    maxWidth: 100,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 50,
    preferredTextZones: ['bottom_left', 'bottom_right', 'top_left'],
  },

  reflowRules: {
    maxHeadlineLines: 3,
    minBodyFontSize: 16,
    maxTextCoverage: 0.4,
  },
};

// ============================================================================
// CLINICAL FAMILY - Grid-based, symmetrical, scientific
// ============================================================================
export const clinicalFamilyRecipe: DesignFamilyRecipe = {
  id: 'clinical',
  name: 'Clinical Minimalist',
  description: 'Structured, symmetrical layouts with grid alignment',

  spacing: {
    verticalRhythm: 20,
    horizontalGutter: 24,
    whitespaceRatio: 0.38,
    topBuffer: 0.1,
    bottomBuffer: 0.1,
    sideBuffer: 0.08,
  },

  typographyScale: {
    ratios: [3.0, 2.2, 1.4, 1.0, 0.8],
    fontWeights: [600, 500, 400, 400, 300],
    lineHeights: [1.2, 1.25, 1.35, 1.45, 1.5],
    fontFamilies: {
      headline: 'Helvetica Neue, Inter, sans-serif',
      body: 'Inter, Roboto, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'image', 'headline', 'body', 'cta'],
  },

  colors: {
    headline: '#000000',
    body: '#1a1a1a',
    supporting: '#555555',
    decorative: '#dddddd',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.5,
  },

  primitives: {
    grid_line: {
      type: 'rule',
      opacity: 0.15,
      thickness: 1,
      color: 'neutral',
      visibility: 'conditional',
    },
    content_border: {
      type: 'border',
      opacity: 0.3,
      thickness: 1,
      color: 'neutral',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 20 },
    maxWidth: 120,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['bottom_center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 14,
    maxTextCoverage: 0.35,
  },
};

// ============================================================================
// PREMIUM FAMILY - Luxury aesthetic, depth, cards
// ============================================================================
export const premiumFamilyRecipe: DesignFamilyRecipe = {
  id: 'premium',
  name: 'Premium Luxury',
  description: 'High-end layouts with depth, shadows, and card elements',

  spacing: {
    verticalRhythm: 28,
    horizontalGutter: 40,
    whitespaceRatio: 0.52,
    topBuffer: 0.12,
    bottomBuffer: 0.15,
    sideBuffer: 0.1,
  },

  typographyScale: {
    ratios: [4.0, 2.8, 1.6, 1.0, 0.7],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.15, 1.25, 1.35, 1.5, 1.6],
    fontFamilies: {
      headline: 'Playfair Display, Georgia, serif',
      body: 'Inter, Lora, serif-sans-hybrid',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'image', 'headline', 'cta', 'body'],
  },

  colors: {
    headline: '#0d0d0d',
    body: '#2a2a2a',
    supporting: '#666666',
    decorative: '#b8b8b8',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.6,
  },

  primitives: {
    card_shadow: {
      type: 'card',
      opacity: 0.15,
      color: 'primary',
      visibility: 'always',
    },
    accent_line: {
      type: 'rule',
      opacity: 0.4,
      thickness: 2,
      color: 'primary',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 30 },
    maxWidth: 140,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 60,
    preferredTextZones: ['bottom_center', 'sides'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 18,
    maxTextCoverage: 0.35,
  },
};

// ============================================================================
// MINIMALIST FAMILY - Huge whitespace, typography hero, zen
// ============================================================================
export const minimalistFamilyRecipe: DesignFamilyRecipe = {
  id: 'minimalist',
  name: 'Minimalist',
  description: 'Sparse layouts with generous whitespace and typography focus',

  spacing: {
    verticalRhythm: 32,
    horizontalGutter: 48,
    whitespaceRatio: 0.65,
    topBuffer: 0.2,
    bottomBuffer: 0.2,
    sideBuffer: 0.15,
  },

  typographyScale: {
    ratios: [5.0, 3.0, 1.5, 1.0, 0.6],
    fontWeights: [600, 400, 400, 300, 300],
    lineHeights: [1.0, 1.1, 1.3, 1.5, 1.6],
    fontFamilies: {
      headline: 'Playfair Display, Georgia, serif',
      body: 'Inter, Open Sans, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'headline', 'image', 'body'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#555555',
    supporting: '#888888',
    decorative: '#e8e8e8',
  },

  dominance: {
    type: 'typography_hero',
    imageRatio: 0.3,
  },

  primitives: {},  // No decorative primitives

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 40 },
    maxWidth: 80,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 30,
    preferredTextZones: ['center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 18,
    maxTextCoverage: 0.25,
  },
};

// ============================================================================
// TESTIMONIAL FAMILY - Circular frame, quotation marks, social proof
// ============================================================================
export const testimonialFamilyRecipe: DesignFamilyRecipe = {
  id: 'testimonial',
  name: 'Testimonial',
  description: 'Portrait-focused with quotation elements',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 32,
    whitespaceRatio: 0.4,
    topBuffer: 0.1,
    bottomBuffer: 0.15,
    sideBuffer: 0.08,
  },

  typographyScale: {
    ratios: [2.5, 2.0, 1.3, 1.0, 0.8],
    fontWeights: [700, 500, 400, 400, 300],
    lineHeights: [1.2, 1.3, 1.4, 1.45, 1.5],
    fontFamilies: {
      headline: 'Georgia, serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'image', 'quote', 'attribution', 'cta'],
  },

  colors: {
    headline: '#0d0d0d',
    body: '#333333',
    supporting: '#666666',
    decorative: '#d4d4d4',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.5,
  },

  primitives: {
    quotation_marks: {
      type: 'badge',
      opacity: 0.3,
      color: 'primary',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 20 },
    maxWidth: 100,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: false,
    excludionBuffer: 0,
    preferredTextZones: ['bottom_center'],
  },

  reflowRules: {
    maxHeadlineLines: 4,
    minBodyFontSize: 16,
    maxTextCoverage: 0.5,
  },
};

// ============================================================================
// SPLIT FAMILY - Left-right balance, divided layout
// ============================================================================
export const splitFamilyRecipe: DesignFamilyRecipe = {
  id: 'split',
  name: 'Split Layout',
  description: 'Divided left-right or top-bottom compositions',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 0,  // Split layout has no gutter between halves
    whitespaceRatio: 0.35,
    topBuffer: 0.08,
    bottomBuffer: 0.1,
    sideBuffer: 0.04,
  },

  typographyScale: {
    ratios: [3.0, 2.2, 1.4, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.1, 1.25, 1.35, 1.45, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'diagonal',
    elementSequence: ['logo', 'image', 'headline', 'body'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#d0d0d0',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.5,
  },

  primitives: {
    divider: {
      type: 'rule',
      opacity: 0.2,
      thickness: 1,
      color: 'neutral',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_left',
    offset: { x: 15, y: 15 },
    maxWidth: 90,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['opposite_side'],
  },

  reflowRules: {
    maxHeadlineLines: 3,
    minBodyFontSize: 15,
    maxTextCoverage: 0.45,
  },
};

// ============================================================================
// BEFORE-AFTER FAMILY - Side-by-side comparison
// ============================================================================
export const beforeAfterFamilyRecipe: DesignFamilyRecipe = {
  id: 'before_after',
  name: 'Before-After',
  description: 'Side-by-side transformation comparison',

  spacing: {
    verticalRhythm: 20,
    horizontalGutter: 4,  // Tight middle for split
    whitespaceRatio: 0.3,
    topBuffer: 0.1,
    bottomBuffer: 0.12,
    sideBuffer: 0.04,
  },

  typographyScale: {
    ratios: [2.5, 2.0, 1.2, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.0, 1.15, 1.3, 1.4, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'before', 'after', 'headline'],
  },

  colors: {
    headline: '#000000',
    body: '#1a1a1a',
    supporting: '#555555',
    decorative: '#e0e0e0',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.85,
  },

  primitives: {
    comparison_arrow: {
      type: 'badge',
      opacity: 1.0,
      color: 'primary',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 15 },
    maxWidth: 100,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 50,
    preferredTextZones: ['top_center', 'bottom_center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 14,
    maxTextCoverage: 0.3,
  },
};

// ============================================================================
// COUNTDOWN-PROMO FAMILY - Urgency, badges, time-limited
// ============================================================================
export const countdownPromoFamilyRecipe: DesignFamilyRecipe = {
  id: 'countdown_promo',
  name: 'Countdown Promo',
  description: 'Promotion-focused with urgency badges',

  spacing: {
    verticalRhythm: 22,
    horizontalGutter: 28,
    whitespaceRatio: 0.32,
    topBuffer: 0.08,
    bottomBuffer: 0.1,
    sideBuffer: 0.06,
  },

  typographyScale: {
    ratios: [3.5, 2.5, 1.4, 1.0, 0.75],
    fontWeights: [800, 700, 500, 400, 300],
    lineHeights: [1.0, 1.1, 1.3, 1.45, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'z_pattern',
    elementSequence: ['logo', 'image', 'urgency_badge', 'headline', 'cta'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#f0f0f0',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.6,
  },

  primitives: {
    urgency_badge: {
      type: 'badge',
      opacity: 1.0,
      color: 'primary',
      visibility: 'always',
    },
    cta_button: {
      type: 'card',
      opacity: 0.95,
      color: 'primary',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_left',
    offset: { x: 15, y: 15 },
    maxWidth: 90,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['bottom_left', 'bottom_right'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 14,
    maxTextCoverage: 0.35,
  },
};

// ============================================================================
// PRODUCT-SHOWCASE FAMILY - Product-centric, clean, detail-focused
// ============================================================================
export const productShowcaseFamilyRecipe: DesignFamilyRecipe = {
  id: 'product_showcase',
  name: 'Product Showcase',
  description: 'Product-focused layouts with clean composition',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 32,
    whitespaceRatio: 0.45,
    topBuffer: 0.1,
    bottomBuffer: 0.12,
    sideBuffer: 0.08,
  },

  typographyScale: {
    ratios: [3.0, 2.2, 1.4, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.15, 1.25, 1.35, 1.45, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'product_image', 'headline', 'features', 'cta'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#e8e8e8',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.65,
  },

  primitives: {
    product_frame: {
      type: 'frame',
      opacity: 0.3,
      thickness: 1,
      color: 'neutral',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 20 },
    maxWidth: 110,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: false,
    excludionBuffer: 0,
    preferredTextZones: ['bottom_center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 16,
    maxTextCoverage: 0.35,
  },
};

// ============================================================================
// QUADRANT FAMILY - Four-section grid layout
// ============================================================================
export const quadrantFamilyRecipe: DesignFamilyRecipe = {
  id: 'quadrant',
  name: 'Quadrant Grid',
  description: 'Four-section grid-based layout',

  spacing: {
    verticalRhythm: 16,
    horizontalGutter: 8,
    whitespaceRatio: 0.2,
    topBuffer: 0.06,
    bottomBuffer: 0.08,
    sideBuffer: 0.04,
  },

  typographyScale: {
    ratios: [2.0, 1.6, 1.2, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.0, 1.1, 1.2, 1.3, 1.4],
    fontFamilies: {
      headline: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'quad1', 'quad2', 'quad3', 'quad4'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#e0e0e0',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.8,
  },

  primitives: {
    grid_separator: {
      type: 'rule',
      opacity: 0.2,
      thickness: 1,
      color: 'neutral',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 10 },
    maxWidth: 80,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: false,
    excludionBuffer: 0,
    preferredTextZones: [],
  },

  reflowRules: {
    maxHeadlineLines: 1,
    minBodyFontSize: 12,
    maxTextCoverage: 0.25,
  },
};

// ============================================================================
// SCRAPBOOK FAMILY - Playful, organic, mixed arrangement
// ============================================================================
export const scrapbookFamilyRecipe: DesignFamilyRecipe = {
  id: 'scrapbook',
  name: 'Scrapbook',
  description: 'Playful, organic, collage-style layout',

  spacing: {
    verticalRhythm: 20,
    horizontalGutter: 16,
    whitespaceRatio: 0.35,
    topBuffer: 0.08,
    bottomBuffer: 0.1,
    sideBuffer: 0.06,
  },

  typographyScale: {
    ratios: [2.8, 2.0, 1.3, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.15, 1.2, 1.3, 1.4, 1.5],
    fontFamilies: {
      headline: 'Georgia, serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'diagonal',
    elementSequence: ['logo', 'images', 'headline', 'body'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#f5f5f5',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.7,
  },

  primitives: {
    decorative_frame: {
      type: 'frame',
      opacity: 0.4,
      thickness: 2,
      color: 'secondary',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_left',
    offset: { x: 12, y: 12 },
    maxWidth: 85,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 35,
    preferredTextZones: ['bottom_center', 'sides'],
  },

  reflowRules: {
    maxHeadlineLines: 3,
    minBodyFontSize: 14,
    maxTextCoverage: 0.4,
  },
};

// ============================================================================
// TEXT-ONLY FAMILY - Typography-focused, minimal imagery
// ============================================================================
export const textOnlyFamilyRecipe: DesignFamilyRecipe = {
  id: 'text_only',
  name: 'Text Only',
  description: 'Typography-focused layouts with minimal or no imagery',

  spacing: {
    verticalRhythm: 28,
    horizontalGutter: 40,
    whitespaceRatio: 0.6,
    topBuffer: 0.2,
    bottomBuffer: 0.2,
    sideBuffer: 0.1,
  },

  typographyScale: {
    ratios: [5.0, 3.5, 1.5, 1.0, 0.6],
    fontWeights: [700, 500, 400, 300, 300],
    lineHeights: [1.0, 1.1, 1.3, 1.5, 1.6],
    fontFamilies: {
      headline: 'Playfair Display, Georgia, serif',
      body: 'Inter, Open Sans, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'headline', 'body', 'cta'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#555555',
    supporting: '#888888',
    decorative: '#f0f0f0',
  },

  dominance: {
    type: 'typography_hero',
    imageRatio: 0.0,
  },

  primitives: {
    accent_line: {
      type: 'rule',
      opacity: 0.3,
      thickness: 2,
      color: 'secondary',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 40 },
    maxWidth: 80,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: false,
    excludionBuffer: 0,
    preferredTextZones: [],
  },

  reflowRules: {
    maxHeadlineLines: 3,
    minBodyFontSize: 18,
    maxTextCoverage: 0.4,
  },
};

// ============================================================================
// TRANSFORMATION FAMILY - Journey, progress, timeline
// ============================================================================
export const transformationFamilyRecipe: DesignFamilyRecipe = {
  id: 'transformation',
  name: 'Transformation Journey',
  description: 'Process and timeline focused layouts',

  spacing: {
    verticalRhythm: 20,
    horizontalGutter: 24,
    whitespaceRatio: 0.35,
    topBuffer: 0.1,
    bottomBuffer: 0.15,
    sideBuffer: 0.08,
  },

  typographyScale: {
    ratios: [3.0, 2.2, 1.4, 1.0, 0.8],
    fontWeights: [700, 600, 500, 400, 300],
    lineHeights: [1.1, 1.25, 1.35, 1.45, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'headline', 'timeline', 'body', 'cta'],
  },

  colors: {
    headline: '#1a1a1a',
    body: '#333333',
    supporting: '#666666',
    decorative: '#e0e0e0',
  },

  dominance: {
    type: 'balanced',
    imageRatio: 0.5,
  },

  primitives: {
    timeline_track: {
      type: 'rule',
      opacity: 1.0,
      color: 'primary',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_left',
    offset: { x: 20, y: 20 },
    maxWidth: 90,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['bottom_center', 'top_center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 15,
    maxTextCoverage: 0.4,
  },
};

// ============================================================================
// POLAROID FAMILY - Nostalgic, physical photo aesthetic
// ============================================================================
export const polaroidFamilyRecipe: DesignFamilyRecipe = {
  id: 'polaroid',
  name: 'Polaroid Memories',
  description: 'Nostalgic layouts mimicking physical taped or pinned photos',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 32,
    whitespaceRatio: 0.45,
    topBuffer: 0.12,
    bottomBuffer: 0.15,
    sideBuffer: 0.1,
  },

  typographyScale: {
    ratios: [3.5, 2.5, 1.5, 1.0, 0.75],
    fontWeights: [600, 500, 400, 400, 300],
    lineHeights: [1.1, 1.2, 1.4, 1.5, 1.6],
    fontFamilies: {
      headline: 'Georgia, serif',
      body: 'Caveat, Gochi Hand, handwritten',
    },
  },

  readingFlow: {
    type: 'center_anchored',
    elementSequence: ['logo', 'polaroid_image', 'handwritten_caption', 'cta'],
  },

  colors: {
    headline: '#0d0d0d',
    body: '#222222',
    supporting: '#555555',
    decorative: '#fdfdfd',
  },

  dominance: {
    type: 'image_hero',
    imageRatio: 0.6,
  },

  primitives: {
    polaroid_frame: {
      type: 'card',
      opacity: 1.0,
      color: 'neutral',
      visibility: 'always',
    },
    tape_accent: {
      type: 'badge',
      opacity: 0.85,
      color: 'neutral',
      visibility: 'conditional',
    },
  },

  logo: {
    position: 'top_right',
    offset: { x: 20, y: 20 },
    maxWidth: 90,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: false,
    excludionBuffer: 0,
    preferredTextZones: ['bottom_center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 18,
    maxTextCoverage: 0.3,
  },
};

// ============================================================================
// NOTIFICATION CARD FAMILY - UI-inspired pop-ups
// ============================================================================
export const notificationCardFamilyRecipe: DesignFamilyRecipe = {
  id: 'notification_card',
  name: 'Notification Card',
  description: 'UI-inspired layouts emphasizing a floating notification bubble',

  spacing: {
    verticalRhythm: 16,
    horizontalGutter: 24,
    whitespaceRatio: 0.5,
    topBuffer: 0.2,
    bottomBuffer: 0.2,
    sideBuffer: 0.1,
  },

  typographyScale: {
    ratios: [2.5, 2.0, 1.3, 1.0, 0.8],
    fontWeights: [600, 500, 400, 400, 300],
    lineHeights: [1.2, 1.3, 1.4, 1.5, 1.5],
    fontFamilies: {
      headline: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'notification_badge', 'headline', 'body', 'cta'],
  },

  colors: {
    headline: '#000000',
    body: '#333333',
    supporting: '#666666',
    decorative: '#ffffff',
  },

  dominance: {
    type: 'typography_hero',
    imageRatio: 0.3,
  },

  primitives: {
    notification_icon_badge: {
      type: 'badge',
      opacity: 1.0,
      color: 'primary',
      visibility: 'always',
    },
    card_shadow: {
      type: 'card',
      opacity: 0.15,
      color: 'neutral',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 20 },
    maxWidth: 80,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['center'],
  },

  reflowRules: {
    maxHeadlineLines: 2,
    minBodyFontSize: 14,
    maxTextCoverage: 0.25,
  },
};

// ============================================================================
// ANNOUNCEMENT FAMILY - Banners, megaphones, high contrast
// ============================================================================
export const announcementFamilyRecipe: DesignFamilyRecipe = {
  id: 'announcement',
  name: 'Announcement',
  description: 'Bold, high-contrast layouts for major news or promotions',

  spacing: {
    verticalRhythm: 24,
    horizontalGutter: 32,
    whitespaceRatio: 0.3,
    topBuffer: 0.05,
    bottomBuffer: 0.1,
    sideBuffer: 0.05,
  },

  typographyScale: {
    ratios: [4.0, 2.8, 1.6, 1.0, 0.7],
    fontWeights: [800, 700, 500, 400, 300],
    lineHeights: [1.0, 1.15, 1.3, 1.4, 1.5],
    fontFamilies: {
      headline: 'Inter, Helvetica Neue, sans-serif',
      body: 'Inter, sans-serif',
    },
  },

  readingFlow: {
    type: 'center_down',
    elementSequence: ['logo', 'banner_ribbon', 'headline', 'body', 'cta'],
  },

  colors: {
    headline: '#ffffff', // High contrast defaults
    body: '#f0f0f0',
    supporting: '#cccccc',
    decorative: '#1a1a1a',
  },

  dominance: {
    type: 'typography_hero',
    imageRatio: 0.4,
  },

  primitives: {
    announcement_banner_ribbon: {
      type: 'badge',
      opacity: 1.0,
      color: 'primary',
      visibility: 'always',
    },
  },

  logo: {
    position: 'top_center',
    offset: { x: 0, y: 15 },
    maxWidth: 100,
    reserved: true,
  },

  faceHandling: {
    avoidOcclusion: true,
    excludionBuffer: 40,
    preferredTextZones: ['bottom_center', 'center'],
  },

  reflowRules: {
    maxHeadlineLines: 3,
    minBodyFontSize: 16,
    maxTextCoverage: 0.45,
  },
};

// ============================================================================
// EXPORT ALL RECIPES
// ============================================================================
export const designFamilyRecipes: Record<string, DesignFamilyRecipe> = {
  editorial: editorialFamilyRecipe,
  clinical: clinicalFamilyRecipe,
  premium: premiumFamilyRecipe,
  minimalist: minimalistFamilyRecipe,
  testimonial: testimonialFamilyRecipe,
  split: splitFamilyRecipe,
  before_after: beforeAfterFamilyRecipe,
  countdown_promo: countdownPromoFamilyRecipe,
  product_showcase: productShowcaseFamilyRecipe,
  quadrant: quadrantFamilyRecipe,
  scrapbook: scrapbookFamilyRecipe,
  text_only: textOnlyFamilyRecipe,
  transformation: transformationFamilyRecipe,
  polaroid: polaroidFamilyRecipe,
  notification_card: notificationCardFamilyRecipe,
  announcement: announcementFamilyRecipe,
};
