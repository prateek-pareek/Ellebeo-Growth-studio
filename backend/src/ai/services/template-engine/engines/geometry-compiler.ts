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
    
    // 1. SAFE ZONES (Whitespace Strategy)
    let safeX = Math.round(60 * behavior.negativeSpaceMultiplier);
    let safeY = Math.round(80 * behavior.negativeSpaceMultiplier);

    if (designSpec?.composition?.negativeSpace === 'massive') {
      safeX = Math.round(safeX * 1.5);
      safeY = Math.round(safeY * 1.5);
    } else if (designSpec?.composition?.negativeSpace === 'minimal') {
      safeX = Math.round(safeX * 0.6);
      safeY = Math.round(safeY * 0.6);
    }

    if (behavior.marginHugging) {
      safeX = Math.round(safeX * 0.3);
      safeY = Math.round(safeY * 0.3);
    }

    const contentMaxWidth = canvasWidth - (safeX * 2);

    // 2. TYPOGRAPHY SCALING (Proportional Strategy)
    const baseScale = canvasWidth;
    let heroSize = Math.round(behavior.heroBaseFontSize * (behavior.typographyScaleMultiplier || 1.0));
    let bodySize = Math.round(behavior.bodyBaseFontSize * (behavior.typographyScaleMultiplier || 1.0));

    if (designSpec?.typography?.dominance === 'high') {
      heroSize = Math.round(heroSize * 1.3);
    } else if (designSpec?.typography?.dominance === 'low') {
      heroSize = Math.round(heroSize * 0.7);
    }

    if (designSpec?.typography?.hierarchy === 'bold') {
      bodySize = Math.round(bodySize * 1.2);
    } else if (designSpec?.typography?.hierarchy === 'minimal') {
      bodySize = Math.round(bodySize * 0.8);
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

    // 3. ALIGNMENT (Composition Strategy)
    let alignment: 'left' | 'center' | 'right' = 'left';
    if (intent.readingFlow === 'center_down') alignment = 'center';
    if (intent.readingFlow === 'z_pattern') alignment = 'left'; // z-pattern starts left

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
