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
   * Forces alignment strictly onto the Editorial Grid tracks to prevent floating text.
   */
  public resolveAnchor(anchor: string, boxWidth: number, boxHeight: number, constraints: LayoutConstraints): { x: number; y: number } {
    let x = this.canvasWidth / 2;
    let y = this.canvasHeight / 2;

    const { safeX, safeY, grid } = constraints;

    if (anchor.includes('left') || anchor === 'edges') x = safeX;
    
    // Grid alignment for left heavy layout (asymmetrical splits)
    if (anchor === 'split_left' && grid) {
        x = grid.tracks[0];
    }
    if (anchor === 'split_right' && grid) {
        // Start right text at column 7
        x = grid.tracks[6];
    }

    if (anchor.includes('right')) x = this.canvasWidth - safeX;
    
    if (anchor.includes('top')) y = safeY;
    if (anchor.includes('bottom')) y = this.canvasHeight - safeY - 40;
    if (anchor === 'bottom_edge' || anchor === 'edges') y = this.canvasHeight - 80;

    return { x, y };
  }
}
