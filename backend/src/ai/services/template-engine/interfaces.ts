export interface BoundingBox {
  yMinPercent: number; // 0-100
  yMaxPercent: number; // 0-100
}

export interface ITemplateMetadata {
  id: string;
  category: string;
  concept: string;
  best_use_cases: string[];
  
  // Structured Filter Flags (Inferred or mapped from JSON)
  macroFaceSafe: boolean; // Cannot be split or have heavy overlays
  requiresText: boolean; // Needs text to look good
  supportsNoText: boolean; // Can look good with 0 text
  textDensity: 'low' | 'medium' | 'high';
  isCarouselOnly: boolean;
  premiumStyleScore: number; // 1-10
  occupiedTextZones: BoundingBox[]; // Used for collision avoidance
  
  // HYBRID ARCHITECTURE FIELDS
  type: 'rigid' | 'procedural'; // Rigid = fixed compiled layout. Procedural = generated via Design Family.
  familyConfig?: IDesignFamily; // Only present if type === 'procedural'
}

export interface IDesignFamily {
  id: string;
  allowedBackgrounds: string[];
  allowedMasks: string[];
  allowedDecorations: string[];
  typographySystems: string[];
}

export interface ITemplateCandidate extends ITemplateMetadata {
  score?: number;
  diversityPenalty?: number;
  finalRank?: number;
}

export interface ITemplateContext {
  brief: string;
  brandName: string;
  aesthetic: string;
  textLength: number;
  slideIndex: number;
  totalSlides: number;
  visionResult?: any;
  templateIntent?: 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';
  visualRanking?: string[];
  activeTheme?: string;
}

export interface ITemplateRetriever {
  retrieveCandidates(context: ITemplateContext): Promise<ITemplateCandidate[]>;
}

export type LayoutAnchor = 'center' | 'top_left' | 'top_right' | 'top_center' | 'bottom_left' | 'bottom_right' | 'bottom_center' | 'bottom_edge' | 'corners' | 'edges' | 'middle_left' | 'middle_right' | 'center_left' | 'center_right';

export interface IDSLBaseLayer {
  id: string; // e.g., "hero-image", "main-heading"
  zIndex: number; // explicit render order (e.g., 10, 20, 30)
  allowedAnchors?: LayoutAnchor[]; // Used for layout variation picking by the optimizer
  attachTo?: string; // ID of another layer to relatively position against
  attachPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'overlap';
  attachOffset?: number; // pixel offset from the attached position
  allocatedBox?: { x: number; y: number; width: number; height: number; }; // allocated by CompositionOptimizer
  orientation?: 'horizontal' | 'vertical'; // Used by before_after_split (image) + transformation_arrow (decoration) to keep the photo seam and the arrow in sync
}

export interface IDSLImageLayer extends IDSLBaseLayer {
  type: 'image';
  mask: 'full_bleed' | 'rectangle' | 'circle' | 'arch' | 'die_cut' | 'split' | 'polaroid' | 'before_after_split';
  paddingPercent: number; // e.g., 0 for full-bleed, 10 for inset
  anchor?: LayoutAnchor; // Used for corner positioning
  component?: string; // Optional device frame component (e.g. desktop_monitor_mockup, tablet_device_mockup)
}

export interface IDSLDecorationLayer extends IDSLBaseLayer {
  type: 'decoration';
  component: 'wax_seal' | 'ticket_notches' | 'film_sprockets' | 'gallery_frame' | 'masking_tape' | 'gold_accents' | 'glass_card' | '3d_ribbon' | 'metric_panel' | 'editorial_sidebar' | 'status_chip' | 'divider' | 'chapter_tabs' | 'measurement_lines' | 'blueprint_grid' | 'museum_border' | 'thin_divider' | 'editorial_badge' | 'oversized_index' | 'quote_marks' | 'grain_overlay' | 'minimal_grid' | 'metadata_label' | 'ghost_headline' | 'outline_headline' | 'vertical_label' | 'running_header' | 'pull_quote' | 'organic_blob' | 'torn_paper' | 'pill_tag' | 'double_divider' | 'margin_rule' | 'accent_rule' | 'noise_texture' | 'paper_texture' | 'light_leak' | 'organic_accent' | 'structural_border' | 'handmade_mark' | 'margin_notes' | 'ink_stamp' | 'fold_line' | 'editorial_number_block' | 'corner_frame' | 'clinical_callout_box' | 'step_badge' | 'metric_label' | 'large_numeral_bullet' | 'myth_fact_badge' | 'quote_mark_accent' | 'meteor_shower' | 'elegant_line_art' | 'premium_stars' | 'abstract_rings' | 'split_seam_line' | 'countdown_urgency_badge' | 'product_halo_ring' | 'transformation_arrow' | 'star_rating_row' | 'editorial_tape' | 'geometric_badge' | 'timeline_track' | 'polaroid_frame' | 'sticker' | 'notification_icon_badge' | 'announcement_banner_ribbon' | 'starburst_badge';
  anchor: LayoutAnchor;
  offsetPercent: number; // distance from the anchor
}

export interface IDSLTextLayer extends IDSLBaseLayer {
  type: 'text';
  role: 'heading' | 'tagline' | 'watermark' | 'footnote' | 'body';
  anchor: LayoutAnchor;
  alignment: 'left' | 'center' | 'right';
  maxWidthPercent: number; // restricts text from hitting edges
  component?: string; // Optional background decoration component (e.g. editorial_title, oversized_index, metadata_label)
  rotation?: number; // Optional rotation in degrees (e.g. 90, -90)
}

export type IDSLSceneLayer = IDSLImageLayer | IDSLDecorationLayer | IDSLTextLayer;

export interface ICompiledLayoutDSL {
  schemaVersion: "1.0";
  layoutVersion: "1.0";
  id: string; // e.g. "wax_seal_emblem"
  layers: IDSLSceneLayer[]; // Scene Graph approach
  canvasRegions?: {
    imageRegion: { x: number; y: number; width: number; height: number };
    textRegion: { x: number; y: number; width: number; height: number };
  };
}

// ============================================================================
// PHASE 2: SEMANTIC DESIGN SPECIFICATION CONTRACT
// ============================================================================

export type CompositionHero = 'headline' | 'image' | 'badge' | 'balanced';
export type CompositionBalance = 'symmetrical' | 'asymmetrical';
export type NegativeSpace = 'minimal' | 'medium' | 'large' | 'massive';

export type PhotoRole = 'hero' | 'supporting' | 'background' | 'texture';
export type PhotoTreatment = 'full_bleed' | 'framed' | 'die_cut' | 'floating';

export type TypographyHierarchy = 'editorial' | 'minimal' | 'bold' | 'technical';
export type TypographyDominance = 'low' | 'medium' | 'high';

export type DecorationDensity = 'none' | 'low' | 'medium' | 'high';

export type DesignReadingFlow = 'z_pattern' | 'center_down' | 'circular' | 'center_outward' | 'diagonal' | 'bottom_left' | 'scattered';
export type SceneElement = 'image' | 'headline' | 'body' | 'cta' | 'badge';
export type WhitespaceFeel = 'tight' | 'balanced' | 'generous' | 'luxury';
export type CompositionRhythm = 'compact' | 'standard' | 'relaxed';
export type ContrastStrategy = 'high_impact' | 'soft_minimal' | 'tonal';
export type DesignGroundingSource = 'mined_exact' | 'mined_family_stats' | 'llm_inferred';

export interface ISemanticDesignSpec {
  composition: {
    hero: CompositionHero;
    balance: CompositionBalance;
    negativeSpace: NegativeSpace;
    readingFlow?: DesignReadingFlow; // grounded reading flow, optional for back-compat with older callers
  };
  photo: {
    role: PhotoRole;
    treatment: PhotoTreatment;
    imageExecution?: 'triptych' | 'standard';
  };
  typography: {
    hierarchy: TypographyHierarchy;
    dominance: TypographyDominance;
    headlineTreatment?: 'experimental' | 'standard';
    alignment?: 'left' | 'center' | 'right';
  };
  decorations: {
    density: DecorationDensity;
  };
  style: {
    mood: string;
  };
  // What content leads/follows visually — lets the renderer decide sizing/ordering instead of guessing
  hierarchy?: {
    primaryElement: SceneElement;
    secondaryElement?: SceneElement;
    tertiaryElement?: SceneElement;
  };
  // Graded spacing feel — replaces the extremes-only negativeSpace enum for finer renderer control
  spacing?: {
    whitespaceFeel: WhitespaceFeel;
    rhythm: CompositionRhythm;
  };
  // What should visually pop, and how
  emphasis?: {
    focalPoint: CompositionHero;
    contrastStrategy: ContrastStrategy;
  };
  // 1-2 sentence human-readable design rationale (supersedes the bare "reasoning" string)
  philosophy?: string;
  // Where this spec's structural fields came from — lets downstream code trust mined data over LLM guesses
  groundedIn?: {
    source: DesignGroundingSource;
    sampleFraction?: string; // e.g. "9/13" real mined samples agreeing on this reading flow
    energy?: string; // raw mined visualLanguage.energy ("calm"/"energetic"/"youthful") — mapped to engine energy downstream
  };
  // Extensibility seam: a future BrandDNA Agent's output merges here before composition. No-op today.
  brandOverrides?: {
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: { headline?: string; body?: string };
  };
}

export interface IDesignIntent {
  family: string;
  energy: 'bold' | 'calm' | 'structured' | 'minimal' | 'playful';
  balance: 'symmetrical' | 'asymmetrical' | 'dynamic';
  readingFlow: 'z_pattern' | 'center_down' | 'circular' | 'scattered' | 'center_anchored';
  visualPriority: 'typography_hero' | 'image_hero' | 'composition_hero' | 'cta_hero';
  whitespace: 'tight' | 'comfortable' | 'airy' | 'luxury';
  mood: 'luxury' | 'organic' | 'clinical' | 'pop' | 'minimalist';
  primitives: {
    cards: 'solid' | 'glass' | 'outlined' | 'floating' | 'none';
    textureIntensity: 'none' | 'subtle' | 'medium' | 'heavy';
    density: DecorationDensity;
  };
}

export interface ILayoutRegion {
  id: string; // The layer ID (e.g., 'main-heading')
  role: string; // The layer role (e.g., 'heading', 'ghost_headline')
  x: number; // Absolute X coordinate of the top-left corner
  y: number; // Absolute Y coordinate of the top-left corner
  width: number; // Width of the bounding box
  height: number; // Height of the bounding box
  baseline?: number; // Absolute Y coordinate of the text baseline
  fontSize?: number; // The actual rendered font size
  lineHeight?: number; // The actual rendered line height
  zIndex: number; // The render order depth
  visualWeight?: string; // e.g., '900', 'bold', 'light'
  opticalCenter?: { x: number; y: number }; // The perceptual center (ignoring ascenders/descenders)
}

// ==========================================
// SPRINT 4: VISUAL RECIPE ARCHITECTURE
// ==========================================

export interface VisualRecipe {
  color: ColorRecipe;
  typography: TypographyRecipe;
  primitive: PrimitiveRecipe;
  texture: TextureRecipe;
  hero: HeroRecipe;
}

export interface ColorRecipe {
  surfaceDominance: 'light' | 'dark' | 'brand_heavy' | 'split';
  contrastPreference: 'high_impact' | 'soft_minimal';
  warmth: 'warm' | 'cool' | 'neutral'; // Drives premium `#FCFBF8` vs `#FFFFFF`
  accentStrategy: 'minimal' | 'balanced' | 'dominant';
  depth: 'flat' | 'subtle' | 'layered' | 'editorial';
  dominanceRatios: { primary: number; secondary: number; accent: number };
}

export interface TypographyRecipe {
  hierarchy: 'editorial' | 'minimal' | 'bold' | 'technical';
  dominance: 'low' | 'medium' | 'high';
}

export interface PrimitiveRecipe {
  cardStyle: 'solid' | 'glass' | 'outlined' | 'floating' | 'none';
  borderStyle: 'none' | 'thin' | 'thick' | 'architectural';
  paper_texture?: { opacity?: number; blendMode?: string };
  split_seam_line?: { opacity?: number; strokeWidth?: number };
  margin_notes?: { opacity?: number };
}

export interface TextureRecipe {
  style: 'none' | 'paper' | 'linen' | 'grain' | 'noise';
  intensity: 'subtle' | 'medium' | 'heavy';
}

export interface HeroRecipe {
  focalPoint: 'photography' | 'typography' | 'product' | 'composition';
}

export interface ILayoutState {
  occupiedRegions: ILayoutRegion[];
  family?: string; // Optional family identifier (e.g., 'editorial', 'clinical')
}

// ============================================================================
// PHASE 3: DESIGN RECIPE & TOKEN ARCHITECTURE
// ============================================================================

export interface TypographyTokens {
  headlineWeight: 'light' | 'medium' | 'heavy' | 'hero';
  bodyWeight: 'light' | 'medium' | 'heavy';
  tracking: 'tight' | 'standard' | 'airy' | 'wide';
  casing: 'force_uppercase' | 'force_lowercase' | 'sentence' | 'natural';
  contrast: 'low' | 'medium' | 'high';
}

export interface VisualTokens {
  texture: 'paper' | 'noise' | 'grain' | 'none';
  decorationDensity: 'minimal' | 'medium' | 'heavy';
}

export interface CompositionTokens {
  imageDominance: number; // 0.0 to 1.0
  whitespace: 'minimal' | 'medium' | 'high' | 'massive';
  alignment: 'center' | 'offset' | 'dynamic';
}

export interface ReadingFlowTokens {
  type: 'center_down' | 'z_pattern' | 'circular' | 'left_right';
}

export interface PrimitiveTokens {
  rings: boolean;
  stars: boolean;
  borders: boolean;
  ghostHeadline: boolean;
  cornerBadges: boolean;
}

export interface ImageTreatmentTokens {
  crop: 'portrait' | 'landscape' | 'square' | 'circle';
  mask: 'soft_edge' | 'hard_edge' | 'polaroid';
  protectFace: boolean;
}

export interface DesignRecipe {
  layoutId: string;
  typography: TypographyTokens;
  visual: VisualTokens;
  composition: CompositionTokens;
  readingFlow: ReadingFlowTokens;
  primitives: PrimitiveTokens;
  imageTreatment: ImageTreatmentTokens;
}
