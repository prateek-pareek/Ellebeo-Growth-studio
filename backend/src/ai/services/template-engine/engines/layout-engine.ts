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

  /**
   * Calculates structural constraints based on layout family and desired negative space.
   */
  public calculateConstraints(family: LayoutFamily, negativeSpace: NegativeSpace): LayoutConstraints {
    let baseMarginX = 60;
    let baseMarginY = 100;

    // Apply Negative Space Multipliers
    const spaceMultipliers: Record<NegativeSpace, number> = {
      dense: 0.6,
      balanced: 1.0,
      generous: 1.5,
      extreme: 2.2
    };
    const multiplier = spaceMultipliers[negativeSpace] || 1.0;

    // Apply Family Rules
    if (family === 'editorial') {
      baseMarginY = 140; // Editorial loves massive vertical breathing room
    } else if (family === 'architectural') {
      baseMarginX = 40; // Architectural uses tight structural grids
      baseMarginY = 80;
    }

    const safeX = Math.round(baseMarginX * multiplier);
    const safeY = Math.round(baseMarginY * multiplier);

    return {
      safeX,
      safeY,
      maxWidth: this.canvasWidth - (safeX * 2),
      contentMaxWidth: this.canvasWidth - (safeX * 2),
      margins: {
        top: safeY,
        bottom: safeY,
        left: safeX,
        right: safeX
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
   */
  public resolveAnchor(anchor: string, boxWidth: number, boxHeight: number, constraints: LayoutConstraints): { x: number; y: number } {
    let x = this.canvasWidth / 2;
    let y = this.canvasHeight / 2;

    const { safeX, safeY } = constraints;

    if (anchor.includes('left') || anchor === 'edges') x = safeX;
    if (anchor.includes('right')) x = this.canvasWidth - safeX;
    
    if (anchor.includes('top')) y = safeY;
    if (anchor.includes('bottom')) y = this.canvasHeight - safeY - 40;
    if (anchor === 'bottom_edge' || anchor === 'edges') y = this.canvasHeight - 80;

    return { x, y };
  }
}
