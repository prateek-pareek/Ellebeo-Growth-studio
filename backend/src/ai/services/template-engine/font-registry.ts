// ============================================================================
// font-registry.ts — Intelligence engine for typography behavior
// Defines how specific brand fonts achieve dominance, elegance, or contrast,
// and maps them to SVG execution parameters (stroke width, letter spacing, etc).
// ============================================================================

export type FontClassification = 'serif_display' | 'sans_geometric' | 'sans_grotesque' | 'script' | 'serif_text';

export interface FontBehavior {
  classification: FontClassification;
  /** Maximum safe weight this font supports (e.g. 900 for Inter, 700 for Playfair) */
  maxWeight: number;
  /** If the font lacks an ultra-bold weight, the engine will inject a stroke to fake it */
  requiresFauxStrokeForDominance?: boolean;
  /** Strategy for achieving visual dominance (scale vs weight) */
  dominanceStrategy: 'scale' | 'weight' | 'both';
  /** Ideal letter spacing for massive headlines (em) */
  headlineTracking: number;
  /** Ideal letter spacing for tiny, elegant taglines (em) */
  taglineTracking: number;
  /** Whether the font supports vertical writing / rotation gracefully */
  supportsVertical?: boolean;
  /** Mathematical baseline ratio for this font family */
  baseline: number;
}

export class FontRegistry {
  private registry: Map<string, FontBehavior> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    // Elegant Serif Display (Playfair, Lora)
    // Achieves dominance through massive scale and tight tracking, not extreme weight.
    this.registry.set('playfair display', {
      classification: 'serif_display',
      maxWeight: 700,
      requiresFauxStrokeForDominance: true,
      dominanceStrategy: 'scale',
      headlineTracking: -0.05,
      taglineTracking: 0.15,
      supportsVertical: true,
      baseline: 0.71,
    });
    this.registry.set('lora', {
      classification: 'serif_text',
      maxWeight: 700,
      dominanceStrategy: 'scale',
      headlineTracking: -0.02,
      taglineTracking: 0.1,
      supportsVertical: true,
      baseline: 0.71,
    });

    this.registry.set('cormorant', {
      classification: 'serif_display',
      maxWeight: 700,
      dominanceStrategy: 'scale',
      headlineTracking: -0.02,
      taglineTracking: 0.1,
      supportsVertical: true,
      baseline: 0.69,
    });

    // Geometric Sans (Inter, Montserrat, Roboto)
    // Achieves dominance through brutalist weight (900) and tight tracking.
    this.registry.set('inter', {
      classification: 'sans_geometric',
      maxWeight: 900,
      dominanceStrategy: 'weight',
      headlineTracking: -0.04,
      taglineTracking: 0.2,
      supportsVertical: true,
      baseline: 0.79,
    });
    this.registry.set('montserrat', {
      classification: 'sans_geometric',
      maxWeight: 900,
      dominanceStrategy: 'weight',
      headlineTracking: -0.05,
      taglineTracking: 0.25,
      supportsVertical: true,
      baseline: 0.76,
    });
    
    this.registry.set('roboto', {
      classification: 'sans_grotesque',
      maxWeight: 900,
      dominanceStrategy: 'weight',
      headlineTracking: -0.02,
      taglineTracking: 0.15,
      supportsVertical: true,
      baseline: 0.75,
    });

    this.registry.set('manrope', {
      classification: 'sans_geometric',
      maxWeight: 800,
      dominanceStrategy: 'weight',
      headlineTracking: -0.03,
      taglineTracking: 0.2,
      supportsVertical: true,
      baseline: 0.78,
    });
  }

  public getBehavior(fontName: string): FontBehavior {
    const normalizedName = (fontName || '').trim().toLowerCase();
    
    if (this.registry.has(normalizedName)) {
      return this.registry.get(normalizedName)!;
    }

    // Default fallback intelligence based on basic heuristics
    const isSerif = normalizedName.includes('serif') || normalizedName.includes('playfair') || normalizedName.includes('times');
    
    if (isSerif) {
      return {
        classification: 'serif_display',
        maxWeight: 700,
        dominanceStrategy: 'scale',
        headlineTracking: -0.02,
        taglineTracking: 0.15,
        supportsVertical: true,
        baseline: 0.72,
      };
    } else {
      // Default to Geometric Sans behavior
      return {
        classification: 'sans_geometric',
        maxWeight: 800,
        dominanceStrategy: 'weight',
        headlineTracking: -0.03,
        taglineTracking: 0.2,
        supportsVertical: true,
        baseline: 0.75,
      };
    }
  }
}
