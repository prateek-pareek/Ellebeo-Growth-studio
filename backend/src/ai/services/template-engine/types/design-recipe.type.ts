/**
 * Simplified Design Recipe Type
 * PRINCIPLE: Every property must directly change rendered pixels
 * If it doesn't change output, it doesn't belong here
 */

export interface DesignFamilyRecipe {
  // Identity
  id: string;  // "editorial", "clinical", "premium", etc.
  name: string;
  description?: string;

  // Spacing (directly affects layout pixels)
  spacing: {
    verticalRhythm: number;    // baseline grid (24px standard)
    horizontalGutter: number;  // column spacing (32px standard)
    whitespaceRatio: number;   // 0.45 = 45% of canvas is whitespace
    topBuffer: number;         // 0.08 = 8% of height
    bottomBuffer: number;      // 0.12 = 12% of height
    sideBuffer: number;        // 0.06 = 6% of width
  };

  // Typography (directly affects text rendering)
  typographyScale: {
    ratios: [number, number, number, number, number];  // [dominant, secondary, supporting, meta, caption]
    fontWeights: [number, number, number, number, number];
    lineHeights: [number, number, number, number, number];
    trackings?: [number, number, number, number, number]; // letter-spacing
    casings?: ["none" | "uppercase" | "lowercase" | "capitalize", "none" | "uppercase" | "lowercase" | "capitalize", "none" | "uppercase" | "lowercase" | "capitalize", "none" | "uppercase" | "lowercase" | "capitalize", "none" | "uppercase" | "lowercase" | "capitalize"];
    alignment?: "left" | "center" | "right";
    fontFamilies: {
      headline: string;  // e.g. "Georgia" or "Playfair"
      body: string;      // e.g. "Inter" or "Helvetica Neue"
    };
  };

  readingFlow: {
    type: "z_pattern" | "center_down" | "center_anchored" | "diagonal" | "bottom_left";
    elementSequence: string[];  // ["logo", "image", "headline", "body", "cta"]
  };

  // Colors (directly affects rendered pixels)
  colors: {
    headline: string;      // hex color for headlines
    body: string;          // hex color for body text
    supporting: string;    // hex color for secondary text
    decorative: string;    // hex color for rules/borders (usually subtle)
  };

  // Dominance (affects what gets priority in composition)
  dominance: {
    type: "image_hero" | "typography_hero" | "balanced";
    imageRatio: number;  // 0.65 = 65% of composition
  };

  // Primitives (directly affects rendered decorations)
  primitives: {
    [primitiveId: string]: {
      type: "border" | "rule" | "frame" | "badge" | "card";
      opacity: number;
      thickness?: number;
      color?: "primary" | "secondary" | "neutral";
      visibility: "always" | "conditional" | "never";
    };
  };

  // Logo placement (directly affects logo position)
  logo: {
    position: "top_left" | "top_right" | "top_center" | "bottom_center";
    offset: { x: number; y: number };
    maxWidth: number;
    reserved: true;  // Always protected
  };

  // Face safety (affects text positioning constraints)
  faceHandling: {
    avoidOcclusion: boolean;
    excludionBuffer: number;  // pixels around face
    preferredTextZones: string[];
  };

  // Reflow rules (when content doesn't fit)
  reflowRules: {
    maxHeadlineLines: number;
    minBodyFontSize: number;
    maxTextCoverage: number;  // 0.4 = max 40% of canvas
  };
}

export interface VariantRecipe {
  id: string;  // "editorial_magazine_cover"
  name: string;
  extendsFamily: string;  // "editorial"
  description?: string;

  // Override ONLY what differs (10% of properties)
  overrides: Partial<DesignFamilyRecipe>;
}

export interface CompositionPlan {
  // Element positions (deterministic)
  layout: {
    logo: Bounds & { zIndex: number };
    image: Bounds & { zIndex: number; mask: string };
    headline: Bounds & { zIndex: number };
    body: Bounds & { zIndex: number };
    cta?: Bounds & { zIndex: number };
    decorations: Array<Bounds & { id: string; zIndex: number }>;
  };

  // Typography specs (from recipe scale)
  typography: {
    headline: TextSpec;
    body: TextSpec;
    cta?: TextSpec;
    caption?: TextSpec;
  };

  // Primitives to render
  primitives: Array<{
    id: string;
    type: string;
    bounds: Bounds;
    opacity: number;
    thickness?: number;
    color: string;
  }>;

  // Constraints (what renderer MUST respect)
  constraints: {
    faceExclusionZones: Bounds[];
    logoReservedZone: Bounds;
    textContentZone: Bounds;
  };

  // Validation rules
  validation: {
    minHeadlineSize: number;
    minBodySize: number;
    minContrast: number;
    maxTextOverlap: number;
  };

  // Metadata
  metadata: {
    family: string;
    variant: string;
    readingFlow: string;
    hierarchy: "single" | "dual" | "triple" | "quad";
  };

  // NEW: Scene Graph for rendering (this is what renderer actually uses)
  sceneGraph: SceneGraph;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpec {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  fontFamily: string;
  color: string;
  alignment: "left" | "center" | "right";
  letterSpacing: number;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  maxWidth: number;
  maxLines?: number;
}

/**
 * Scene Graph Layer - Generic rendering primitive
 * Renderer loops through layers and calls draw() for each
 * This is how Figma works - scalable to infinite layer types
 */
export interface SceneGraphLayer {
  id: string;
  type: 'background' | 'image' | 'primitive' | 'text' | 'mask' | 'overlay';
  zIndex: number;

  // Bounds where this layer should render
  bounds: Bounds;

  // Safe zones this layer MUST respect (faces, logos, etc)
  constraintZones: Bounds[];

  // Layer-specific properties (polymorphic based on type)
  properties: {
    // For image layers
    imageUrl?: string;
    masking?: 'circle' | 'rectangle' | 'custom';

    // For primitive layers
    primitiveType?: 'rule' | 'frame' | 'badge' | 'card' | 'border' | 'shadow' | 'grid' | 'decoration';
    primitiveOpacity?: number;
    primitiveColor?: string;
    primitiveThickness?: number;
    primitiveStyle?: Record<string, any>;

    // For text layers
    text?: string;
    textSpec?: TextSpec;
    avoidRegions?: Bounds[]; // Face exclusion zones for text

    // For background/overlay
    color?: string;
    opacity?: number;
  };

  // Rendering hints
  renderingHint?: {
    isStructural: boolean; // Should this primitive be clearly visible?
    isDecorative: boolean; // Background decoration?
    canOverlapText: boolean; // Can text go over this?
    priority: 'critical' | 'important' | 'secondary'; // Rendering priority
  };
}

export interface SceneGraph {
  layers: SceneGraphLayer[];
  canvasBounds: Bounds;
  composition: {
    family: string;
    variant: string;
    readingFlow: string;
  };
}
