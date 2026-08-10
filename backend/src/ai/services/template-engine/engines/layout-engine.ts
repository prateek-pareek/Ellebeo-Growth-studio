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
    
    let bottomMargin = safeY;
    if (this.isStory) {
      // 15% footer reserve for Instagram Story UI (P1 Fix)
      bottomMargin = Math.max(safeY, Math.round(this.canvasHeight * 0.15));
    }

    if (behavior && behavior.marginHugging) {
      safeX = 10;
      safeY = 10;
      bottomMargin = 10;
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
        bottom: bottomMargin,
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
   * Generates all maximal empty rectangles (candidate regions) in the canvas by subtracting obstacles.
   */
  public generateCandidateRegions(constraints: LayoutConstraints, occupiedRegions: BoundingBox[] = []): BoundingBox[] {
    const safeZone: BoundingBox = {
      x: constraints.safeX,
      y: constraints.safeY,
      width: this.canvasWidth - (constraints.safeX * 2),
      height: this.canvasHeight - (constraints.safeY * 2)
    };

    let candidates = [safeZone];
    const obstacles = [...occupiedRegions];

    // Add face box as an obstacle with a halo
    if (this.faceBox) {
      const halo = 40; // Default face halo
      obstacles.push({
        x: Math.max(0, this.faceBox.x - halo),
        y: Math.max(0, this.faceBox.y - halo),
        width: this.faceBox.width + (halo * 2),
        height: this.faceBox.height + (halo * 2)
      });
    }

    for (const obs of obstacles) {
      let nextCandidates: BoundingBox[] = [];
      for (const c of candidates) {
        const overlapX = obs.x < c.x + c.width && obs.x + obs.width > c.x;
        const overlapY = obs.y < c.y + c.height && obs.y + obs.height > c.y;

        if (overlapX && overlapY) {
          // Split candidate into up to 4 sub-rectangles avoiding the obstacle
          if (obs.y > c.y) {
            nextCandidates.push({ x: c.x, y: c.y, width: c.width, height: obs.y - c.y });
          }
          if (obs.y + obs.height < c.y + c.height) {
            nextCandidates.push({ x: c.x, y: obs.y + obs.height, width: c.width, height: (c.y + c.height) - (obs.y + obs.height) });
          }
          if (obs.x > c.x) {
            nextCandidates.push({ x: c.x, y: c.y, width: obs.x - c.x, height: c.height });
          }
          if (obs.x + obs.width < c.x + c.width) {
            nextCandidates.push({ x: obs.x + obs.width, y: c.y, width: (c.x + c.width) - (obs.x + obs.width), height: c.height });
          }
        } else {
          nextCandidates.push(c);
        }
      }
      
      // Filter subsumed rectangles
      candidates = nextCandidates.filter((c1, i, arr) => {
        // Is c1 strictly contained in any other rectangle c2?
        return !arr.some((c2, j) => 
          i !== j &&
          c1.x >= c2.x &&
          c1.y >= c2.y &&
          c1.x + c1.width <= c2.x + c2.width &&
          c1.y + c1.height <= c2.y + c2.height
        );
      });
    }

    // Filter out candidates that are too small to be useful (e.g. height < 80)
    return candidates.filter(c => c.height >= 80 && c.width >= 100);
  }

  /**
   * Evaluates a candidate region based on semantic intent and returns a score.
   */
  public scoreRegion(
    candidate: BoundingBox, 
    intent: { readingFlow?: string; visualPriority?: string; role?: string },
    layerHeight: number
  ): number {
    let score = 10.0;
    
    // 1. Whitespace Quality (Size)
    // Larger regions are generally better, especially for heroes
    const area = candidate.width * candidate.height;
    const canvasArea = this.canvasWidth * this.canvasHeight;
    score += (area / canvasArea) * 2.0; // Reduced from +5 to let intent dominate

    // 2. Face Safety is inherently guaranteed by generateCandidateRegions

    // 3. Reading Flow
    const isTopHalf = candidate.y < this.canvasHeight / 2;
    const isBottomHalf = candidate.y + candidate.height > this.canvasHeight / 2;
    const isLeftHalf = candidate.x < this.canvasWidth / 2;
    
    if (intent.readingFlow === 'z_pattern') {
      if (intent.role === 'heading' && isTopHalf && isLeftHalf) score += 6.0;
      if (intent.role === 'footnote' && isBottomHalf) score += 6.0;
    } else if (intent.readingFlow === 'center_down') {
      const isCentered = candidate.x + (candidate.width / 2) > (this.canvasWidth / 2) - 100 &&
                         candidate.x + (candidate.width / 2) < (this.canvasWidth / 2) + 100;
      if (isCentered) {
        score += 6.0;
      } else {
        score -= 5.0; // Heavy penalty for off-center candidates when center_anchored requested
      }
      if (intent.role === 'heading' && isTopHalf) score += 3.0;
    }

    // 4. Role-specific heuristics
    if (intent.role === 'heading') {
      if (candidate.height < layerHeight) score -= 10.0; // Cannot fit
      // Headings prefer top/middle
      if (isBottomHalf && !isTopHalf) score -= 2.0; 
    }

    if (intent.role === 'footnote' || intent.role === 'tagline') {
      // Secondary elements usually don't want to float at the very top unless it's a specific layout
      if (isTopHalf && !isBottomHalf) score -= 1.0;
    }

    return score;
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
    constraints: LayoutConstraints,
    visualPriority: string = 'image_hero'
  ): { imageRegion: BoundingBox; textRegion: BoundingBox } {
    const isZPattern = behavior.readingJourney === 'z_pattern';
    
    // Default: Full bleed (text overlays image directly, requires scrims)
    let imageRegion: BoundingBox = { x: 0, y: 0, width: this.canvasWidth, height: this.canvasHeight };
    let textRegion: BoundingBox = { x: constraints.safeX, y: constraints.safeY, width: constraints.contentMaxWidth, height: this.canvasHeight - constraints.safeY * 2 };

    // Phase 6: Dynamic Typography Scaling
    // Maximum Text Area = Visual Priority × Whitespace × Image Importance
    let textRatio = 0.50; // Base 50/50 split
    if (visualPriority === 'typography_hero') textRatio = 0.65;
    else if (visualPriority === 'image_hero') textRatio = 0.30;
    else if (visualPriority === 'cta_hero') textRatio = 0.55;

    // Introduce slight randomness or saliency-based jitter to the ratio so it feels organic
    textRatio += (Math.random() * 0.08) - 0.04;

    if (behavior.imageBleedExtent === 'asymmetrical_65') {
      const splitW = Math.floor(this.canvasWidth * (isZPattern ? textRatio : (1.0 - textRatio)));
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
