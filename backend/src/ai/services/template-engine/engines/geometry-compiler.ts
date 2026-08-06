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

    // 2. TYPOGRAPHY SCALING (Proportional Strategy) — graded across the full dominance
    // enum ('medium' previously no-op'd) and now also covers 'editorial'/'technical'
    // hierarchies, not just 'bold'/'minimal'.
    const baseScale = canvasWidth;
    let heroSize = behavior.heroBaseFontSize;
    let bodySize = behavior.bodyBaseFontSize;

    const dominanceScale: Record<string, number> = { low: 0.7, medium: 1.0, high: 1.3 };
    heroSize = Math.round(heroSize * (dominanceScale[designSpec?.typography?.dominance || 'medium'] ?? 1.0));

    const hierarchyBodyScale: Record<string, number> = { bold: 1.2, editorial: 1.1, technical: 0.95, minimal: 0.8 };
    if (designSpec?.typography?.hierarchy) {
      bodySize = Math.round(bodySize * (hierarchyBodyScale[designSpec.typography.hierarchy] ?? 1.0));
    }

    const typography = {
      heroSize: heroSize,
      primarySize: Math.round(bodySize * 1.5),
      secondarySize: Math.round(bodySize * 1.2),
      bodySize: bodySize,
      metadataSize: behavior.metadataBaseFontSize,
      
      heroLineHeight: behavior.lineHeightMultiplier,
      bodyLineHeight: behavior.lineHeightMultiplier,
      heroTracking: `${behavior.trackingHero}em`,
      metadataTracking: `${behavior.trackingMetadata}em`,
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
