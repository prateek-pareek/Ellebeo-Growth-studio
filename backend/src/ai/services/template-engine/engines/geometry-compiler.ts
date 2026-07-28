import { IDesignLanguage } from './art-direction-engine';

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
    canvasHeight: number
  ): IGeometryOutput {
    const intent = preset.intent;
    const behavior = preset.behavior;
    
    // 1. SAFE ZONES (Whitespace Strategy)
    let safeX = Math.round(60 * behavior.negativeSpaceMultiplier);
    let safeY = Math.round(80 * behavior.negativeSpaceMultiplier);

    if (behavior.marginHugging) {
      safeX = Math.round(safeX * 0.3);
      safeY = Math.round(safeY * 0.3);
    }

    const contentMaxWidth = canvasWidth - (safeX * 2);

    // 2. TYPOGRAPHY SCALING (Proportional Strategy)
    const baseScale = canvasWidth;

    const typography = {
      heroSize: Math.round(behavior.heroScaleRatio * baseScale * 0.12),
      primarySize: Math.round(behavior.metadataScaleRatio * 3 * baseScale * 0.12),
      secondarySize: Math.round(behavior.metadataScaleRatio * 2 * baseScale * 0.12),
      bodySize: Math.round(behavior.metadataScaleRatio * 1.5 * baseScale * 0.12),
      metadataSize: Math.max(12, Math.round(behavior.metadataScaleRatio * baseScale * 0.12)),
      
      heroLineHeight: behavior.lineHeightMultiplier,
      bodyLineHeight: behavior.lineHeightMultiplier,
      heroTracking: `${behavior.trackingHero}em`,
      metadataTracking: `${behavior.trackingMetadata}em`,
    };

    // 3. ALIGNMENT (Composition Strategy)
    let alignment: 'left' | 'center' | 'right' = 'left';
    if (intent.readingJourney === 'center_down') alignment = 'center';
    if (intent.readingJourney === 'z_pattern') alignment = 'left'; // z-pattern starts left

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
