import { IDesignLanguage } from './art-direction-engine';
import { ISemanticDesignSpec } from '../interfaces';
import { LayoutEngine, SpatialAllocationPolicy } from './layout-engine';

export interface IGeometryOutput {
  canvasWidth: number;
  canvasHeight: number;
  safeX: number;
  safeY: number;
  contentMaxWidth: number;
  /** First-class spatial allocation driven by visualPriority — used before typography fitting */
  spatial: SpatialAllocationPolicy;
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
   * visualPriority is a first-class input to spatial allocation — not only a font multiplier.
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

    const negativeSpaceScale: Record<string, number> = { minimal: 0.6, medium: 1.0, large: 1.25, massive: 1.5 };
    const spaceScale = negativeSpaceScale[designSpec?.composition?.negativeSpace || 'medium'] ?? 1.0;
    safeX = Math.round(safeX * spaceScale);
    safeY = Math.round(safeY * spaceScale);

    if (behavior.marginHugging) {
      safeX = Math.round(safeX * 0.3);
      safeY = Math.round(safeY * 0.3);
    }

    // Floor so type never hugs the edge
    const minSafe = Math.round(Math.min(canvasWidth, canvasHeight) * 0.045);
    safeX = Math.max(minSafe, safeX);
    safeY = Math.max(minSafe, safeY);

    const contentMaxWidth = canvasWidth - (safeX * 2);

    const visualPriority =
      intent?.visualPriority || designSpec?.composition?.visualPriority || 'image_hero';

    // 1b. SPATIAL POLICY — structural composition difference by priority
    const spatial = LayoutEngine.deriveSpatialPolicy(visualPriority, {
      negativeSpaceMultiplier: behavior.negativeSpaceMultiplier,
      readingFlow: intent?.readingFlow,
    });

    // Expected text-panel size on the primary split axis (before subject carve)
    const primaryAxis =
      spatial.splitAxis === 'horizontal' ? canvasWidth : canvasHeight;
    const expectedTextExtent = primaryAxis * spatial.textShare;

    // 2. TYPOGRAPHY SCALING — sized relative to the text panel it will live in
    let heroSize = Math.round(behavior.heroBaseFontSize * (behavior.typographyScaleMultiplier || 1.0));

    let dominanceScale = 1.0;
    if (designSpec?.typography?.dominance === 'high' || visualPriority === 'typography_hero') {
      dominanceScale = 1.25;
    } else if (designSpec?.typography?.dominance === 'low' || visualPriority === 'image_hero') {
      dominanceScale = 0.94;
    } else if (visualPriority === 'cta_hero') {
      dominanceScale = 0.9;
    }
    
    heroSize = Math.round(heroSize * dominanceScale);

    let curve = { primary: 0.45, secondary: 0.30, body: 0.18, metadata: 0.12 };
    let trackingHero: string | number = behavior.trackingHero;
    let trackingMetadata: string | number = behavior.trackingMetadata;

    if (designSpec?.typography?.hierarchy === 'editorial') {
      heroSize = Math.round(heroSize * 1.3);
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

    // Caps relative to the TEXT PANEL (not the whole canvas) so typography_hero
    // can keep its intended size once space is actually allocated.
    const isStory = canvasHeight > canvasWidth;
    const panelH =
      spatial.splitAxis === 'vertical' || spatial.splitAxis === 'overlay'
        ? expectedTextExtent
        : canvasHeight - safeY * 2;

    let maxHeroRatio: number;
    let minHeroRatio: number;
    if (visualPriority === 'typography_hero') {
      maxHeroRatio = isStory ? 0.28 : 0.32; // of text panel
      minHeroRatio = 0.12;
    } else if (visualPriority === 'image_hero') {
      maxHeroRatio = isStory ? 0.55 : 0.58; // of smaller overlay band
      minHeroRatio = 0.22;
    } else {
      maxHeroRatio = isStory ? 0.22 : 0.26;
      minHeroRatio = 0.10;
    }

    const maxHero = Math.round(panelH * maxHeroRatio);
    const minHero = Math.round(panelH * minHeroRatio);
    // Also never exceed ~12% of full canvas for readability/aesthetic ceiling
    const canvasCeiling = Math.round(canvasHeight * (visualPriority === 'typography_hero' ? 0.14 : visualPriority === 'image_hero' ? 0.09 : 0.11));
    heroSize = Math.max(minHero, Math.min(heroSize, maxHero, canvasCeiling));

    let bodySize = Math.round(heroSize * curve.body);
    if (bodySize < 16) bodySize = 16;

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

    let alignment: 'left' | 'center' | 'right' = 'left';
    if (intent.readingFlow === 'center_down') alignment = 'center';
    if (intent.readingFlow === 'z_pattern') alignment = 'left';
    if (designSpec?.typography?.alignment) alignment = designSpec.typography.alignment;

    let padding = Math.round(30 * behavior.negativeSpaceMultiplier);
    
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
      spatial,
      typography,
      alignment,
      padding,
      grid
    };
  }
}
