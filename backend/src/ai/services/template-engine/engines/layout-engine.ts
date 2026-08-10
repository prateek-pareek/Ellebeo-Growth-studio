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
  /** Broader subject/body mass — text should clear this, not only eyes/mouth. */
  private subjectBox?: BoundingBox;
  /** All protected visual subjects (face, product, hands, treatment area, etc.) */
  private protectedSubjects: BoundingBox[] = [];
  private isStory: boolean;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    faceBox?: BoundingBox,
    subjectBox?: BoundingBox,
    additionalSubjects: BoundingBox[] = [],
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.faceBox = faceBox;
    this.subjectBox = subjectBox || (faceBox ? LayoutEngine.expandFaceToSubject(faceBox, canvasWidth, canvasHeight) : undefined);
    this.isStory = (canvasHeight / canvasWidth) > 1.3;

    const subjects: BoundingBox[] = [];
    if (this.subjectBox) subjects.push(this.subjectBox);
    else if (faceBox) subjects.push(faceBox);
    for (const s of additionalSubjects) {
      if (s && s.width > 0 && s.height > 0) subjects.push(s);
    }
    this.protectedSubjects = LayoutEngine.mergeOverlappingBoxes(subjects);
  }

  /**
   * Expand facial landmarks into a subject protection zone (shoulders / upper torso)
   * so type clears the client image, not only the face rectangle.
   */
  public static expandFaceToSubject(face: BoundingBox, canvasW: number, canvasH: number): BoundingBox {
    const footerReserve = Math.round(canvasH * 0.12);
    const extendDown = Math.round(Math.max(face.height * 1.75, canvasH * 0.22));
    const extendUp = Math.round(face.height * 0.2);
    const widen = Math.round(face.width * 0.18);
    const y = Math.max(0, face.y - extendUp);
    const bottom = Math.min(canvasH - footerReserve, face.y + face.height + extendDown);
    const x = Math.max(0, face.x - widen);
    const width = Math.min(canvasW - x, face.width + widen * 2);
    return { x, y, width, height: Math.max(face.height, bottom - y) };
  }

  /** Merge overlapping boxes into unions — scalable multi-subject protection. */
  public static mergeOverlappingBoxes(boxes: BoundingBox[]): BoundingBox[] {
    if (boxes.length <= 1) return boxes.slice();
    const result: BoundingBox[] = boxes.map(b => ({ ...b }));
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const a = result[i];
          const b = result[j];
          const overlap =
            a.x < b.x + b.width && a.x + a.width > b.x &&
            a.y < b.y + b.height && a.y + a.height > b.y;
          // Also merge if nearly adjacent (small gap)
          const gapX = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)));
          const gapY = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
          const near = gapX < 24 && gapY < 24 &&
            (a.x < b.x + b.width + 24 && a.x + a.width + 24 > b.x) &&
            (a.y < b.y + b.height + 24 && a.y + a.height + 24 > b.y);
          if (overlap || near) {
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const right = Math.max(a.x + a.width, b.x + b.width);
            const bottom = Math.max(a.y + a.height, b.y + b.height);
            result[i] = { x, y, width: right - x, height: bottom - y };
            result.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }
    return result;
  }

  /**
   * Map a %-based vision subject box onto canvas coords for fit:contain letterboxing.
   */
  public static mapPercentBoxToCanvas(
    pct: { centerXPercent: number; centerYPercent: number; widthPercent: number; heightPercent: number },
    canvasW: number,
    canvasH: number,
    drawnW: number,
    drawnH: number,
    offsetX: number,
    offsetY: number,
  ): BoundingBox {
    const w = Math.round(drawnW * (Math.min(90, Math.max(8, pct.widthPercent)) / 100));
    const h = Math.round(drawnH * (Math.min(90, Math.max(8, pct.heightPercent)) / 100));
    const cx = offsetX + (pct.centerXPercent / 100) * drawnW;
    const cy = offsetY + (pct.centerYPercent / 100) * drawnH;
    const x = Math.max(0, Math.min(canvasW - w, Math.round(cx - w / 2)));
    const y = Math.max(0, Math.min(canvasH - h, Math.round(cy - h / 2)));
    return { x, y, width: w, height: h };
  }

  public getSubjectBox(): BoundingBox | undefined {
    return this.subjectBox;
  }

  public getFaceBox(): BoundingBox | undefined {
    return this.faceBox;
  }

  public getProtectedSubjects(): BoundingBox[] {
    return this.protectedSubjects;
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
      // Editorial can hug margins, but must never cover faces
      sig.allowHeroOverlap = false;
      sig.faceHaloPadding = 48;
    } else if (family === 'clinical') {
      sig.baseMarginX = 80; // stricter margins
      sig.maxTextCoverage = 0.5;
      sig.faceHaloPadding = 72; // clinical strictly avoids face
      sig.allowHeroOverlap = false;
    } else if (family === 'premium') {
      sig.baseMarginX = 120; // huge luxury margins
      sig.baseMarginY = this.isStory ? 300 : 180;
      sig.maxTextCoverage = 0.4;
      sig.faceHaloPadding = 64;
      sig.allowHeroOverlap = false;
    } else if (family === 'scrapbook') {
      sig.baseMarginX = 40; // tight margins, messy feel
      sig.baseMarginY = this.isStory ? 160 : 80;
      sig.faceHaloPadding = 48;
      sig.allowHeroOverlap = false; // scrapbook clutter still must clear faces
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
    } else {
      // Feed: keep clear of the pinned branding footer strip (~70–96px)
      bottomMargin = Math.max(safeY, 110);
    }

    if (behavior && behavior.marginHugging) {
      safeX = 10;
      safeY = 10;
      // Still reserve the branding footer so hugged layouts don't collide with it
      bottomMargin = this.isStory ? Math.max(10, Math.round(this.canvasHeight * 0.12)) : 96;
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
    const subjects = this.protectedSubjects.length
      ? this.protectedSubjects
      : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : []);
    if (subjects.length === 0) return targetBox;

    const signature = this.getGeometrySignature(family);
    let current = { ...targetBox };

    for (const protectedBox of subjects) {
      const halo = signature.faceHaloPadding;
      const faceSafeZone: BoundingBox = {
        x: protectedBox.x - halo,
        y: protectedBox.y - halo,
        width: protectedBox.width + (halo * 2),
        height: protectedBox.height + (halo * 2),
      };

      const overlapsX = current.x < faceSafeZone.x + faceSafeZone.width && current.x + current.width > faceSafeZone.x;
      const overlapsY = current.y < faceSafeZone.y + faceSafeZone.height && current.y + current.height > faceSafeZone.y;
      if (!(overlapsX && overlapsY)) continue;

      const remainingWidthLeft = faceSafeZone.x - current.x;
      if (remainingWidthLeft > 140) {
        current = { ...current, width: remainingWidthLeft - 20 };
        continue;
      }

      const spaceRightStart = faceSafeZone.x + faceSafeZone.width + 20;
      if (spaceRightStart < this.canvasWidth - constraints.safeX - 140) {
        const newWidth = Math.min(current.width, this.canvasWidth - constraints.safeX - spaceRightStart);
        if (newWidth > 140) {
          current = { ...current, x: spaceRightStart, width: newWidth };
          continue;
        }
      }

      const bottomClear = Math.max(constraints.margins?.bottom ?? constraints.safeY, 96) + 16;
      const spaceBelow = (this.canvasHeight - bottomClear) - (faceSafeZone.y + faceSafeZone.height);
      const spaceAbove = faceSafeZone.y - constraints.safeY;
      const needH = current.height;

      if (spaceBelow >= needH + 16 && spaceBelow >= spaceAbove) {
        current = { ...current, y: faceSafeZone.y + faceSafeZone.height + 16 };
        continue;
      }
      if (spaceAbove >= needH + 16) {
        current = { ...current, y: Math.max(constraints.safeY, faceSafeZone.y - needH - 16) };
        continue;
      }
      if (spaceBelow >= 60) {
        current = { ...current, y: faceSafeZone.y + faceSafeZone.height + 12, height: Math.min(needH, spaceBelow - 12) };
        continue;
      }
      if (spaceAbove >= 60) {
        const newH = Math.min(needH, spaceAbove - 12);
        current = { ...current, y: Math.max(constraints.safeY, faceSafeZone.y - newH - 12), height: newH };
        continue;
      }

      current = {
        ...current,
        y: Math.max(constraints.safeY, this.canvasHeight - bottomClear - needH),
        width: Math.min(current.width, constraints.contentMaxWidth),
        x: constraints.safeX,
      };
    }

    return current;
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

    // Resolve all protected subjects within this semantic quadrant
    const subjects = this.protectedSubjects.length
      ? this.protectedSubjects
      : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : []);
    for (const obstacle of subjects) {
       const faceX = obstacle.x;
       const faceY = obstacle.y;
       const faceW = obstacle.width;
       const faceH = obstacle.height;

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

    // All protected visual subjects (face, torso, product, hands, treatment…) as obstacles
    const subjects = this.protectedSubjects.length
      ? this.protectedSubjects
      : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : []);
    const halo = Math.round(Math.min(this.canvasWidth, this.canvasHeight) * 0.04);
    for (const subject of subjects) {
      obstacles.push({
        x: Math.max(0, subject.x - halo),
        y: Math.max(0, subject.y - halo),
        width: subject.width + halo * 2,
        height: subject.height + halo * 2,
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
    const area = candidate.width * candidate.height;
    const canvasArea = this.canvasWidth * this.canvasHeight;
    score += (area / canvasArea) * 2.0;

    // 2. Subject clearance — prefer pockets away from ALL protected visual subjects
    const subjects = this.protectedSubjects.length
      ? this.protectedSubjects
      : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : []);
    if (subjects.length > 0) {
      const cMidY = candidate.y + candidate.height / 2;
      const cMidX = candidate.x + candidate.width / 2;
      let bestSubjectScore = -999;
      for (const subject of subjects) {
        const sMidY = subject.y + subject.height / 2;
        const sMidX = subject.x + subject.width / 2;
        const normDist = Math.hypot(cMidX - sMidX, cMidY - sMidY) / Math.hypot(this.canvasWidth, this.canvasHeight);
        let local = normDist * 8.0;

        const aboveSubject = candidate.y + Math.min(layerHeight, candidate.height) <= subject.y - 12;
        const belowSubject = candidate.y >= subject.y + subject.height + 12;
        const besideSubject =
          (candidate.x + candidate.width <= subject.x - 12) ||
          (candidate.x >= subject.x + subject.width + 12);

        if (intent.visualPriority === 'image_hero') {
          if (aboveSubject || belowSubject) local += 7.0;
          else if (besideSubject) local += 4.0;
          else local -= 6.0;
        } else {
          if (aboveSubject || belowSubject) local += 3.0;
          else if (besideSubject) local += 2.0;
        }
        bestSubjectScore = Math.max(bestSubjectScore, local);
      }
      score += bestSubjectScore;
    }

    // 3. Reading Flow
    const isTopHalf = candidate.y < this.canvasHeight / 2;
    const isBottomHalf = candidate.y + candidate.height > this.canvasHeight / 2;
    const isLeftHalf = candidate.x < this.canvasWidth / 2;
    const topBand = candidate.y < this.canvasHeight * 0.28;
    const bottomBand = candidate.y + Math.min(layerHeight, candidate.height) > this.canvasHeight * 0.72;
    
    if (intent.readingFlow === 'z_pattern') {
      if (intent.role === 'heading' && isTopHalf && isLeftHalf) score += 6.0;
      if (intent.role === 'footnote' && isBottomHalf) score += 6.0;
    } else if (intent.readingFlow === 'center_down') {
      const isCentered = candidate.x + (candidate.width / 2) > (this.canvasWidth / 2) - 100 &&
                         candidate.x + (candidate.width / 2) < (this.canvasWidth / 2) + 100;
      if (intent.visualPriority === 'image_hero') {
        // Image-first: prefer edge/band placement over dead-center overlay
        if (topBand || bottomBand || !isCentered) score += 4.0;
        else score -= 2.0;
      } else if (isCentered) {
        score += 6.0;
      } else {
        score -= 5.0;
      }
      if (intent.role === 'heading' && isTopHalf) score += 3.0;
    }

    // 4. Role-specific heuristics
    if (intent.role === 'heading' || intent.role === 'group') {
      if (candidate.height < layerHeight) score -= 10.0;
      if (isBottomHalf && !isTopHalf && intent.visualPriority !== 'image_hero') score -= 2.0;
      if (intent.visualPriority === 'image_hero' && topBand) score += 2.5;
    }

    if (intent.role === 'footnote' || intent.role === 'tagline') {
      if (isTopHalf && !isBottomHalf) score -= 1.0;
      if (bottomBand) score += 2.0;
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
