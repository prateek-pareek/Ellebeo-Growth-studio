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
}

export interface ITemplateRetriever {
  retrieveCandidates(context: ITemplateContext): Promise<ITemplateCandidate[]>;
}

export type LayoutAnchor = 'center' | 'top_left' | 'top_right' | 'top_center' | 'bottom_left' | 'bottom_right' | 'bottom_center' | 'bottom_edge' | 'corners' | 'edges' | 'middle_left' | 'middle_right' | 'center_left' | 'center_right';

export interface IDSLBaseLayer {
  id: string; // e.g., "hero-image", "main-heading"
  zIndex: number; // explicit render order (e.g., 10, 20, 30)
  attachTo?: string; // ID of another layer to relatively position against
  attachPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'overlap';
  attachOffset?: number; // pixel offset from the attached position
}

export interface IDSLImageLayer extends IDSLBaseLayer {
  type: 'image';
  mask: 'rectangle' | 'circle' | 'arch' | 'die_cut' | 'split' | 'polaroid';
  paddingPercent: number; // e.g., 0 for full-bleed, 10 for inset
  anchor?: LayoutAnchor; // Used for corner positioning
  component?: string; // Optional device frame component (e.g. desktop_monitor_mockup, tablet_device_mockup)
}

export interface IDSLDecorationLayer extends IDSLBaseLayer {
  type: 'decoration';
  component: 'wax_seal' | 'ticket_notches' | 'film_sprockets' | 'gallery_frame' | 'masking_tape' | 'gold_accents' | 'glass_card' | '3d_ribbon' | 'metric_panel' | 'editorial_sidebar' | 'status_chip' | 'divider' | 'chapter_tabs' | 'measurement_lines' | 'blueprint_grid' | 'museum_border' | 'thin_divider' | 'editorial_badge';
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
}

export type IDSLSceneLayer = IDSLImageLayer | IDSLDecorationLayer | IDSLTextLayer;

export interface ICompiledLayoutDSL {
  schemaVersion: "1.0";
  layoutVersion: "1.0";
  id: string; // e.g. "wax_seal_emblem"
  layers: IDSLSceneLayer[]; // Scene Graph approach
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

export interface ISemanticDesignSpec {
  composition: {
    hero: CompositionHero;
    balance: CompositionBalance;
    negativeSpace: NegativeSpace;
  };
  photo: {
    role: PhotoRole;
    treatment: PhotoTreatment;
  };
  typography: {
    hierarchy: TypographyHierarchy;
    dominance: TypographyDominance;
  };
  decorations: {
    density: DecorationDensity;
  };
  style: {
    mood: string;
  };
}
