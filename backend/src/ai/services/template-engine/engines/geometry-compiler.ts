import { IDesignLanguage } from './art-direction-engine';
import { ISemanticDesignSpec } from '../interfaces';

export interface IGeometryOutput {
  canvasWidth: number;
  canvasHeight: number;
  safeX: number;
  safeY: number;
  contentMaxWidth: number;
  typography: {
    heroSize: number;
    primarySize: number;
    secondarySize: number;
    bodySize: number;
    metadataSize: number;
    heroLineHeight: number;
    bodyLineHeight: number;
    heroTracking: string;
    metadataTracking: string;
  };
  alignment: 'left' | 'center' | 'right';
  padding: number; // inner padding between elements
  grid: {
    columns: number;
    columnWidth: number;
    gutter: number;
    tracks: number[]; // X coordinates for each column start
  };
}

export class GeometryCompiler {
  /**
   * Compiles high-level Design Language into hard pixel coordinates and bounding boxes.
   */
  public compile(
    preset: IDesignLanguage,
    canvasWidth: number,
    canvasHeight: number,
    designSpec?: ISemanticDesignSpec
  ): IGeometryOutput {
    const intent = preset.intent;
    const behavior = preset.behavior;
    
    // 1. SAFE ZONES (Whitespace Strategy) — graded across the full negativeSpace enum;
    // previously only 'massive'/'minimal' had any effect and 'medium'/'large' silently
    // no-op'd even though the LLM picks them just as often.
    let safeX = Math.round(60 * behavior.negativeSpaceMultiplier);
    let safeY = Math.round(80 * behavior.negativeSpaceMultiplier);

    const negativeSpaceScale: Record<string, number> = { minimal: 0.6, medium: 1.0, large: 1.25, massive: 1.5 };
    const spaceScale = negativeSpaceScale[designSpec?.composition?.negativeSpace || 'medium'] ?? 1.0;
    safeX = Math.round(safeX * spaceScale);
    safeY = Math.round(safeY * spaceScale);

    if (behavior.marginHugging) {
      safeX = Math.round(safeX * 0.3);
      safeY = Math.round(safeY * 0.3);
    }

    const contentMaxWidth = canvasWidth - (safeX * 2);

    // 2. TYPOGRAPHY SCALING (Top-Down Hierarchy Curve Strategy)
    // Note: baseScale is available for future proportional calculations if needed
    const baseScale = canvasWidth;
    let heroSize = Math.round(behavior.heroBaseFontSize * (behavior.typographyScaleMultiplier || 1.0));

    // A. Visual Dominance — placement priority, not micro-type punishment
    // Prefer designLanguage intent; fall back to designSpec composition tags.
    const visualPriority =
      intent?.visualPriority || designSpec?.composition?.visualPriority;
    let dominanceScale = 1.0;
    if (designSpec?.typography?.dominance === 'high' || visualPriority === 'typography_hero') {
      dominanceScale = 1.25;
    } else if (designSpec?.typography?.dominance === 'low' || visualPriority === 'image_hero') {
      // Slight yield only — image_hero wins frame via bands, type stays readable
      dominanceScale = 0.94;
    } else if (visualPriority === 'cta_hero') {
      dominanceScale = 0.9;
    }
    
    heroSize = Math.round(heroSize * dominanceScale);

    // B. Typography Hierarchy Curve (Determine derivatives from Hero)
    let curve = { primary: 0.45, secondary: 0.30, body: 0.18, metadata: 0.12 };
    let trackingHero: string | number = behavior.trackingHero;
    let trackingMetadata: string | number = behavior.trackingMetadata;

    if (designSpec?.typography?.hierarchy === 'editorial') {
      heroSize = Math.round(heroSize * 1.3); // Editorials have massive heroes
      curve = { primary: 0.45, secondary: 0.30, body: 0.18, metadata: 0.12 };
      trackingHero = 'wide';
    } else if (designSpec?.typography?.hierarchy === 'bold') {
      heroSize = Math.round(heroSize * 1.15);
      curve = { primary: 0.50, secondary: 0.35, body: 0.22, metadata: 0.15 };
      trackingHero = 'tight';
    } else if (designSpec?.typography?.hierarchy === 'minimal') {
      heroSize = Math.round(heroSize * 0.9);
      curve = { primary: 0.55, secondary: 0.40, body: 0.28, metadata: 0.16 };
      trackingHero = 'standard';
    } else if (designSpec?.typography?.hierarchy === 'technical') {
      curve = { primary: 0.50, secondary: 0.35, body: 0.25, metadata: 0.15 };
      trackingHero = 'standard';
    }

    // Hard caps: image_hero still keeps readable presence (~7–9% of canvas)
    const isStory = canvasHeight > canvasWidth;
    const imageFirst = visualPriority === 'image_hero';
    const maxHeroRatio = imageFirst ? (isStory ? 0.075 : 0.09) : (isStory ? 0.09 : 0.11);
    const maxHero = Math.round(canvasHeight * maxHeroRatio);
    const minHero = Math.round(canvasHeight * (imageFirst ? 0.04 : 0.038));
    heroSize = Math.max(minHero, Math.min(heroSize, maxHero));

    // Recalculate body from clamped hero so hierarchy stays proportional
    let bodySize = Math.round(heroSize * curve.body);
    if (bodySize < 16) bodySize = 16;
    // Don't inflate hero back up when body hits the floor — that was re-exploding sizes

    const typography = {
      heroSize: heroSize,
      primarySize: Math.min(Math.round(heroSize * curve.primary), Math.round(heroSize * 0.55)),
      secondarySize: Math.min(Math.round(heroSize * curve.secondary), Math.round(heroSize * 0.40)),
      bodySize: bodySize,
      metadataSize: Math.max(12, Math.min(Math.round(heroSize * curve.metadata), 22)),
      
      heroLineHeight: behavior.lineHeightMultiplier,
      bodyLineHeight: behavior.lineHeightMultiplier,
      heroTracking: typeof trackingHero === 'number' ? `${trackingHero}em` : trackingHero,
      metadataTracking: typeof trackingMetadata === 'number' ? `${trackingMetadata}em` : trackingMetadata,
    };

    // 3. ALIGNMENT (Composition Strategy) — an explicit designSpec.typography.alignment
    // is a more direct signal than reading flow and wins when present; otherwise fall
    // back to the reading-flow-derived default as before.
    let alignment: 'left' | 'center' | 'right' = 'left';
    if (intent.readingFlow === 'center_down') alignment = 'center';
    if (intent.readingFlow === 'z_pattern') alignment = 'left'; // z-pattern starts left
    if (designSpec?.typography?.alignment) alignment = designSpec.typography.alignment;

    // 4. RHYTHM & PADDING (Whitespace padding between elements)
    let padding = Math.round(30 * behavior.negativeSpaceMultiplier);
    
    // 5. EDITORIAL GRID (Anchoring system)
    const columns = 12;
    const gutter = padding;
    const columnWidth = (contentMaxWidth - (gutter * (columns - 1))) / columns;
    const tracks = [];
    for (let i = 0; i < columns; i++) {
      tracks.push(safeX + (i * (columnWidth + gutter)));
    }
    const grid = { columns, columnWidth, gutter, tracks };
    
    return {
      canvasWidth,
      canvasHeight,
      safeX,
      safeY,
      contentMaxWidth,
      typography,
      alignment,
      padding,
      grid
    };
  }
}
