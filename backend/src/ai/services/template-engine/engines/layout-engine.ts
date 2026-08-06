export type LayoutFamily = 'editorial' | 'architectural' | 'minimal' | 'vintage' | 'luxury' | 'clinical' | 'scrapbook' | 'premium' | 'split' | string;
export type NegativeSpace = 'dense' | 'balanced' | 'generous' | 'extreme';

export interface GeometrySignature {
  baseMarginX: number;
  baseMarginY: number;
  maxTextCoverage: number;
  faceHaloPadding: number;
  allowHeroOverlap: boolean;
  columnCount: number;
}

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
  private isStory: boolean;

  constructor(canvasWidth: number, canvasHeight: number, faceBox?: BoundingBox) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.faceBox = faceBox;
    this.isStory = (canvasHeight / canvasWidth) > 1.3; // Detect 9:16 or similar vertical layouts
  }

  private getGeometrySignature(family: LayoutFamily): GeometrySignature {
    // Default safe signature
    const sig: GeometrySignature = {
      baseMarginX: 60,
      baseMarginY: this.isStory ? 220 : 100,
      maxTextCoverage: 0.6,
      faceHaloPadding: 40,
      allowHeroOverlap: false,
      columnCount: 12
    };

    if (family === 'editorial') {
      sig.baseMarginY = this.isStory ? 240 : 140;
      sig.allowHeroOverlap = true; // Editorial tension allows some overlap
      sig.faceHaloPadding = 20;
    } else if (family === 'clinical') {
      sig.baseMarginX = 80; // stricter margins
      sig.maxTextCoverage = 0.5;
      sig.faceHaloPadding = 60; // clinical strictly avoids face
      sig.allowHeroOverlap = false;
    } else if (family === 'premium') {
      sig.baseMarginX = 120; // huge luxury margins
      sig.baseMarginY = this.isStory ? 300 : 180;
      sig.maxTextCoverage = 0.4;
      sig.faceHaloPadding = 80;
    } else if (family === 'scrapbook') {
      sig.baseMarginX = 40; // tight margins, messy feel
      sig.baseMarginY = this.isStory ? 160 : 80;
      sig.faceHaloPadding = 30;
      sig.allowHeroOverlap = true; // overlapping is allowed
    } else if (family === 'split') {
      sig.baseMarginX = 50;
      sig.maxTextCoverage = 0.45;
    } else if (family === 'architectural') {
      sig.baseMarginX = 40; 
      sig.baseMarginY = 80;
    }
    return sig;
  }

  public calculateConstraints(family: LayoutFamily, negativeSpace: NegativeSpace, tension: boolean = false, behavior?: any): LayoutConstraints {
    const signature = this.getGeometrySignature(family);
    
    let multiplier = 1.0;
    if (behavior && behavior.negativeSpaceMultiplier) {
      multiplier = behavior.negativeSpaceMultiplier;
    } else {
      const spaceMultipliers: Record<string, number> = {
        low: 0.7,
        dense: 0.7,
        medium: 1.0,
        balanced: 1.0,
        high: 1.3,
        generous: 1.3,
        massive: 1.6,
        extreme: 1.6
      };
      // Map behavior.whitespace or fallback to negativeSpace
      const spaceTag = behavior?.whitespace || negativeSpace;
      multiplier = spaceMultipliers[spaceTag] || 1.0;
    }

    let safeX = tension ? Math.round(signature.baseMarginX * 0.3) : Math.round(signature.baseMarginX * multiplier);
    let safeY = tension ? Math.round(signature.baseMarginY * 0.3) : Math.round(signature.baseMarginY * multiplier);
    
    if (behavior && behavior.marginHugging) {
      safeX = 10;
      safeY = 10;
    }

    // Apply Density (from ArtDirection Engine) to text width constraints
    let densityMultiplier = 1.0;
    if (behavior?.density === 'low') densityMultiplier = 0.6; // Narrower text column
    else if (behavior?.density === 'high') densityMultiplier = 1.0; // Fill available space
    else if (behavior?.density === 'medium') densityMultiplier = 0.8;

    const baseContentMaxWidth = this.canvasWidth - (safeX * 2);
    const contentMaxWidth = Math.round(Math.min(baseContentMaxWidth * densityMultiplier, this.canvasWidth * signature.maxTextCoverage));

    // Calculate grid for anchoring
    const columns = signature.columnCount;
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
  public resolveFaceCollision(targetBox: BoundingBox, constraints: LayoutConstraints, family: LayoutFamily = 'minimal'): BoundingBox {
    if (!this.faceBox) return targetBox; // No face, no collision

    const signature = this.getGeometrySignature(family);
    
    // Calculate the protected halo around the face
    const halo = signature.faceHaloPadding;
    const faceSafeZone: BoundingBox = {
      x: this.faceBox.x - halo,
      y: this.faceBox.y - halo,
      width: this.faceBox.width + (halo * 2),
      height: this.faceBox.height + (halo * 2)
    };
    
    // Check intersection
    const overlapsX = targetBox.x < faceSafeZone.x + faceSafeZone.width && targetBox.x + targetBox.width > faceSafeZone.x;
    const overlapsY = targetBox.y < faceSafeZone.y + faceSafeZone.height && targetBox.y + targetBox.height > faceSafeZone.y;

    if (!(overlapsX && overlapsY)) return targetBox; // No collision with halo

    if (signature.allowHeroOverlap) {
      // Family explicitly allows tension/overlap with hero subject
      return targetBox; 
    }

    // Constraint Solver Degradation sequence:
    // 1. Shrink width
    const remainingWidthLeft = faceSafeZone.x - targetBox.x;
    if (remainingWidthLeft > 150) {
       // We can just shrink the text box to fit on the left
       return { ...targetBox, width: remainingWidthLeft - 20 };
    }

    const remainingWidthRight = (targetBox.x + targetBox.width) - (faceSafeZone.x + faceSafeZone.width);
    if (remainingWidthRight > 150 && targetBox.x >= faceSafeZone.x + faceSafeZone.width - 20) {
       // It's mostly on the right, push it right and shrink
       return { ...targetBox, x: faceSafeZone.x + faceSafeZone.width + 20, width: remainingWidthRight - 20 };
    }

    // 2. Shift slightly vertically if it's close to the edge
    if (targetBox.y > faceSafeZone.y && targetBox.y < faceSafeZone.y + 60) {
       // Push below face
       let newY = faceSafeZone.y + faceSafeZone.height + 20;
       if (newY + targetBox.height <= this.canvasHeight - constraints.safeY) {
         return { ...targetBox, y: newY };
       }
    }

    if (targetBox.y + targetBox.height > faceSafeZone.y - 60 && targetBox.y < faceSafeZone.y) {
       // Push above face
       let newY = faceSafeZone.y - targetBox.height - 20;
       if (newY >= constraints.safeY) {
         return { ...targetBox, y: newY };
       }
    }

    // Last Resort: Fallback to a completely safe region (e.g. top center or bottom center)
    // For now, if we can't cleanly shift/shrink, we push it down forcefully (legacy fallback)
    let newY = faceSafeZone.y + faceSafeZone.height + 20;
    if (newY + targetBox.height > this.canvasHeight - constraints.safeY) {
      newY = Math.max(constraints.safeY, faceSafeZone.y - targetBox.height - 20);
    }
    return { ...targetBox, y: newY };
  }

  /**
   * Calculates the largest safe whitespace block strictly within a semantic quadrant.
   */
  public calculateSemanticWhitespace(
    anchor: string,
    constraints: LayoutConstraints
  ): BoundingBox {
    let minX = constraints.safeX;
    let maxX = this.canvasWidth - constraints.safeX;
    let minY = constraints.safeY;
    let maxY = this.canvasHeight - constraints.safeY;

    // Constrain to semantic regions
    if (anchor.includes('left')) maxX = Math.floor(this.canvasWidth / 2);
    if (anchor.includes('right')) minX = Math.floor(this.canvasWidth / 2);
    if (anchor.includes('top')) maxY = Math.floor(this.canvasHeight / 2);
    if (anchor.includes('bottom')) minY = Math.floor(this.canvasHeight / 2);

    let semanticRegion = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

    // Resolve Face Collision strictly within this semantic quadrant
    if (this.faceBox) {
       const faceX = this.faceBox.x;
       const faceY = this.faceBox.y;
       const faceW = this.faceBox.width;
       const faceH = this.faceBox.height;

       const overlapX = faceX < minX + semanticRegion.width && faceX + faceW > minX;
       const overlapY = faceY < minY + semanticRegion.height && faceY + faceH > minY;

       if (overlapX && overlapY) {
         // Carve out whitespace inside the semantic region
         const spaceLeft = faceX - minX;
         const spaceRight = maxX - (faceX + faceW);
         const spaceTop = faceY - minY;
         const spaceBottom = maxY - (faceY + faceH);
         
         const maxSpace = Math.max(spaceLeft, spaceRight, spaceTop, spaceBottom);
         
         if (maxSpace === spaceLeft) semanticRegion.width = spaceLeft;
         else if (maxSpace === spaceRight) {
           semanticRegion.x = faceX + faceW;
           semanticRegion.width = spaceRight;
         }
         else if (maxSpace === spaceTop) semanticRegion.height = spaceTop;
         else if (maxSpace === spaceBottom) {
           semanticRegion.y = faceY + faceH;
           semanticRegion.height = spaceBottom;
         }
       }
    }
    
    // Apply breathing room padding based on constraints (tension vs generous)
    const padding = constraints.safeX / 2;
    semanticRegion.x += padding;
    semanticRegion.width -= padding * 2;
    // Don't pad Y as heavily since text wraps vertically
    semanticRegion.y += 10;
    semanticRegion.height -= 20;

    return semanticRegion;
  }

  /**
   * Resolves absolute X, Y coordinates from semantic layout anchors using Whitespace Topology.
   */
  public resolveAnchor(
    anchor: string, 
    boxWidth: number, 
    boxHeight: number, 
    constraints: LayoutConstraints,
    targetRegion?: BoundingBox
  ): { x: number; y: number } {
    
    // Grid alignment for left heavy layout (asymmetrical splits)
    if (anchor === 'split_left' && constraints.grid && !targetRegion) {
        return { x: constraints.grid.tracks[0], y: constraints.safeY + 40 };
    }
    if (anchor === 'split_right' && constraints.grid && !targetRegion) {
        return { x: constraints.grid.tracks[6], y: constraints.safeY + 40 };
    }

    // Constraint Solver: Calculate best geometric pocket within semantic anchor
    const whitespace = this.calculateSemanticWhitespace(anchor, constraints);
    
    let x = whitespace.x + (whitespace.width / 2);
    let y = whitespace.y + (whitespace.height / 2);

    if (anchor.includes('left')) x = whitespace.x;
    if (anchor.includes('right')) x = whitespace.x + whitespace.width;
    
    if (anchor.includes('top')) y = whitespace.y;
    if (anchor.includes('bottom')) y = whitespace.y + whitespace.height - boxHeight;

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
