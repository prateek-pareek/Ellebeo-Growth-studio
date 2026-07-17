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
