export type LayoutFamily = 'editorial' | 'architectural' | 'minimal' | 'vintage' | 'luxury';
export type NegativeSpace = 'dense' | 'balanced' | 'generous' | 'extreme';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutConstraints {
  safeX: number;
  safeY: number;
  maxWidth: number;
  contentMaxWidth: number; // for text blocks
  margins: { top: number; bottom: number; left: number; right: number };
  grid?: {
    columns: number;
    columnWidth: number;
    gutter: number;
    tracks: number[];
  };
}

export class LayoutEngine {
  private canvasWidth: number;
  private canvasHeight: number;
  private faceBox?: BoundingBox;

  constructor(canvasWidth: number, canvasHeight: number, faceBox?: BoundingBox) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.faceBox = faceBox;
  }

  public calculateConstraints(family: LayoutFamily, negativeSpace: NegativeSpace, tension: boolean = false, behavior?: any): LayoutConstraints {
    let baseMarginX = 60;
    let baseMarginY = 100;

    let multiplier = 1.0;
    if (behavior && behavior.negativeSpaceMultiplier) {
      multiplier = behavior.negativeSpaceMultiplier;
    } else {
      const spaceMultipliers: Record<NegativeSpace, number> = {
        dense: 0.6,    
        balanced: 1.0, 
        generous: 1.15,
        extreme: 1.25  
      };
      multiplier = spaceMultipliers[negativeSpace] || 1.0;
    }

    if (family === 'editorial') {
      baseMarginY = 140; 
    } else if (family === 'architectural') {
      baseMarginX = 40; 
      baseMarginY = 80;
    }

    let safeX = tension ? Math.round(baseMarginX * 0.3) : Math.round(baseMarginX * multiplier);
    let safeY = tension ? Math.round(baseMarginY * 0.3) : Math.round(baseMarginY * multiplier);
    
    if (behavior && behavior.marginHugging) {
      safeX = 10;
      safeY = 10;
    }

    const contentMaxWidth = this.canvasWidth - (safeX * 2);

    // Calculate grid for anchoring
    const columns = 12;
    const padding = Math.round(30 * multiplier);
    const gutter = padding;
    const columnWidth = (contentMaxWidth - (gutter * (columns - 1))) / columns;
    const tracks = [];
    for (let i = 0; i < columns; i++) {
      tracks.push(safeX + (i * (columnWidth + gutter)));
    }

    return {
      safeX,
      safeY,
      maxWidth: contentMaxWidth,
      contentMaxWidth,
      margins: {
        top: safeY,
        bottom: safeY,
        left: safeX,
        right: safeX
      },
      grid: {
        columns,
        columnWidth,
        gutter,
        tracks
      }
    };
  }

  /**
   * Adjusts the Y coordinate of a bounding box if it collides with the detected face.
   * Returns a new Y coordinate that pushes the element into a safe zone.
   */
  public resolveFaceCollision(targetBox: BoundingBox, constraints: LayoutConstraints): number {
    if (!this.faceBox) return targetBox.y; // No face, no collision

    const face = this.faceBox;
    
    // Check intersection
    const overlapsX = targetBox.x < face.x + face.width && targetBox.x + targetBox.width > face.x;
    const overlapsY = targetBox.y < face.y + face.height && targetBox.y + targetBox.height > face.y;

    if (overlapsX && overlapsY) {
      // Collision detected! Decide where to push it.
      // Usually we push down, but if the face is at the bottom, we push up.
      let newY = face.y + face.height + 60; // push below face
      
      if (newY + targetBox.height > this.canvasHeight - constraints.safeY) {
        // Pushing down clips the bottom edge, push to top instead
        newY = Math.max(constraints.safeY, face.y - targetBox.height - 40);
      }
      return newY;
    }

    return targetBox.y;
  }

  /**
   * Resolves absolute X, Y coordinates from semantic layout anchors.
   * Forces alignment strictly onto the Editorial Grid tracks or within a targetRegion.
   */
  public resolveAnchor(
    anchor: string, 
    boxWidth: number, 
    boxHeight: number, 
    constraints: LayoutConstraints,
    targetRegion?: BoundingBox
  ): { x: number; y: number } {
    const contextW = targetRegion ? targetRegion.width : this.canvasWidth;
    const contextH = targetRegion ? targetRegion.height : this.canvasHeight;
    const contextX = targetRegion ? targetRegion.x : 0;
    const contextY = targetRegion ? targetRegion.y : 0;
    
    // Default to center
    let x = contextX + (contextW / 2);
    let y = contextY + (contextH / 2);

    const { safeX, safeY, grid } = constraints;
    
    // If targetRegion is provided, we don't apply global canvas safe margins again 
    // to the edges of the region since the region should already be safe.
    const padX = targetRegion ? 0 : safeX;
    const padY = targetRegion ? 0 : safeY;

    if (anchor.includes('left') || anchor === 'edges') x = contextX + padX;
    
    // Grid alignment for left heavy layout (asymmetrical splits)
    if (anchor === 'split_left' && grid && !targetRegion) {
        x = grid.tracks[0];
    }
    if (anchor === 'split_right' && grid && !targetRegion) {
        // Start right text at column 7
        x = grid.tracks[6];
    }

    if (anchor.includes('right')) x = contextX + contextW - padX;
    
    if (anchor.includes('top')) y = contextY + padY;
    if (anchor.includes('bottom')) y = contextY + contextH - padY - 40;
    if (anchor === 'bottom_edge' || anchor === 'edges') y = contextY + contextH - 80;

    return { x, y };
  }

  /**
   * Deterministically allocates canvas space into non-overlapping regions for Image and Text.
   * This ensures text never floats randomly over photo content unless explicitly designed (full bleed).
   */
  public allocateRegions(
    behavior: { imageBleedExtent?: string; readingJourney?: string },
    constraints: LayoutConstraints
  ): { imageRegion: BoundingBox; textRegion: BoundingBox } {
    const isZPattern = behavior.readingJourney === 'z_pattern';
    
    // Default: Full bleed (text overlays image directly, requires scrims)
    let imageRegion: BoundingBox = { x: 0, y: 0, width: this.canvasWidth, height: this.canvasHeight };
    let textRegion: BoundingBox = { x: constraints.safeX, y: constraints.safeY, width: constraints.contentMaxWidth, height: this.canvasHeight - constraints.safeY * 2 };

    if (behavior.imageBleedExtent === 'asymmetrical_65') {
      const splitW = Math.floor(this.canvasWidth * (isZPattern ? 0.65 : 0.35));
      if (isZPattern) {
        // Image on Left, Text on Right
        imageRegion = { x: 0, y: 0, width: splitW, height: this.canvasHeight };
        textRegion = { x: splitW + 40, y: constraints.safeY, width: (this.canvasWidth - splitW) - 40 - constraints.safeX, height: this.canvasHeight - constraints.safeY * 2 };
      } else {
        // Text on Left, Image on Right
        imageRegion = { x: this.canvasWidth - splitW, y: 0, width: splitW, height: this.canvasHeight };
        textRegion = { x: constraints.safeX, y: constraints.safeY, width: (this.canvasWidth - splitW) - 40 - constraints.safeX, height: this.canvasHeight - constraints.safeY * 2 };
      }
    } else if (behavior.imageBleedExtent === 'split_50') {
      const splitW = Math.floor(this.canvasWidth / 2);
      if (isZPattern) {
        imageRegion = { x: 0, y: 0, width: splitW, height: this.canvasHeight };
        textRegion = { x: splitW + 40, y: constraints.safeY, width: splitW - 40 - constraints.safeX, height: this.canvasHeight - constraints.safeY * 2 };
      } else {
        imageRegion = { x: splitW, y: 0, width: splitW, height: this.canvasHeight };
        textRegion = { x: constraints.safeX, y: constraints.safeY, width: splitW - 40 - constraints.safeX, height: this.canvasHeight - constraints.safeY * 2 };
      }
    }

    return { imageRegion, textRegion };
  }
}
