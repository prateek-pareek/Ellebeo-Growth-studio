import { CanonicalGeometry } from '../interfaces';

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

/**
 * Ratio-driven spatial policy. visualPriority decides whether type owns a real panel
 * (image surrenders canvas) or only overlays a band on a full-bleed photo.
 */
export interface SpatialAllocationPolicy {
  /** Target fraction of the primary split axis reserved for text */
  textShare: number;
  minTextShare: number;
  maxTextShare: number;
  /** overlay = photo full-bleed + text band; horizontal/vertical = image surrenders space */
  splitAxis: 'horizontal' | 'vertical' | 'overlay';
  preferredTextBias: 'start' | 'end';
  /** visualPriority that authored this policy — preserved across repairs */
  visualPriority?: string;
  /**
   * When true, allocateRegions must honor preferredTextBias exactly.
   * Relocate sets this so subject-aware auto-bias cannot undo the repair.
   */
  lockTextBias?: boolean;
  /**
   * Cycle index into ranked subject-clear pockets.
   * Relocate/alternate increments this so each attempt gets different coordinates.
   */
  placementSlot?: number;
}

/** Priority-aware caps so escalation cannot destroy image_hero dominance. */
export interface PriorityShareBounds {
  maxTextShare: number;
  minImageShare: number;
  /** Same-template spatial repair attempts before template family switch */
  maxSameTemplateRepairs: number;
}

export function formatRect(r?: { x: number; y: number; width: number; height: number } | null): string {
  if (!r) return 'none';
  return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
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

    // Consistent safe margins for all text / UI — never hug the edge
    const MIN_SAFE = Math.round(Math.min(this.canvasWidth, this.canvasHeight) * 0.045);
    safeX = Math.max(MIN_SAFE, safeX);
    safeY = Math.max(MIN_SAFE, safeY);
    
    let bottomMargin = safeY;
    if (this.isStory) {
      bottomMargin = Math.max(safeY, Math.round(this.canvasHeight * 0.15));
    } else {
      bottomMargin = Math.max(safeY, 110);
    }

    if (behavior && behavior.marginHugging) {
      // Still keep a readable inset — "hugging" must not mean edge-clipped type
      safeX = Math.max(Math.round(MIN_SAFE * 0.85), 36);
      safeY = Math.max(Math.round(MIN_SAFE * 0.85), 36);
      bottomMargin = this.isStory ? Math.max(safeY, Math.round(this.canvasHeight * 0.12)) : Math.max(96, safeY);
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
   * When targetRegion is provided (priority-allocated panel), place inside that box only.
   */
  public resolveAnchor(
    anchor: string, 
    boxWidth: number, 
    boxHeight: number, 
    constraints: LayoutConstraints,
    targetRegion?: BoundingBox
  ): { x: number; y: number } {
    
    if (targetRegion) {
      let x = targetRegion.x + targetRegion.width / 2;
      let y = targetRegion.y + Math.min(40, targetRegion.height * 0.08);
      if (anchor.includes('left')) x = targetRegion.x;
      else if (anchor.includes('right')) x = targetRegion.x + Math.max(0, targetRegion.width - boxWidth);
      else x = targetRegion.x + Math.max(0, (targetRegion.width - boxWidth) / 2);

      if (anchor.includes('top')) y = targetRegion.y;
      else if (anchor.includes('bottom')) y = targetRegion.y + Math.max(0, targetRegion.height - boxHeight);
      else if (anchor === 'center' || anchor.includes('middle')) {
        y = targetRegion.y + Math.max(0, (targetRegion.height - boxHeight) / 2);
      }
      return { x, y };
    }

    // Grid alignment for left heavy layout (asymmetrical splits)
    if (anchor === 'split_left' && constraints.grid) {
        return { x: constraints.grid.tracks[0], y: constraints.safeY + 40 };
    }
    if (anchor === 'split_right' && constraints.grid) {
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
   * Derive scalable spatial ratios from visualPriority (+ whitespace / reading flow).
   * This is the structural difference between typography_hero and image_hero —
   * not a font-size knob.
   */
  public static deriveSpatialPolicy(
    visualPriority: string,
    opts?: {
      negativeSpaceMultiplier?: number;
      readingFlow?: string;
      /** ArtDirection rhythm: tight|comfortable|airy|luxury mapped via multiplier already; density high|medium|low */
      density?: string;
      whitespace?: string;
    },
  ): SpatialAllocationPolicy {
    const neg = Math.max(0.5, Math.min(2.0, opts?.negativeSpaceMultiplier ?? 1.0));
    const flow = opts?.readingFlow || 'center_down';
    const density = (opts?.density || 'medium').toLowerCase();
    const whitespace = (opts?.whitespace || '').toLowerCase();
    // tight/high density → use more of available negative space (larger band), not leave huge empty regions
    const fillBoost =
      (density === 'high' ? 1.18 : density === 'low' ? 0.92 : 1.0)
      * (whitespace === 'tight' ? 1.12 : whitespace === 'airy' || whitespace === 'luxury' ? 0.92 : 1.0);

    if (visualPriority === 'typography_hero') {
      const textShare = Math.min(0.70, Math.max(0.52, 0.58 * (0.9 + 0.15 * neg) * fillBoost));
      const splitAxis: SpatialAllocationPolicy['splitAxis'] =
        flow === 'z_pattern' || flow === 'left_right' ? 'horizontal' : 'vertical';
      return {
        textShare,
        minTextShare: 0.48,
        maxTextShare: 0.72,
        splitAxis,
        preferredTextBias: 'start',
        visualPriority,
      };
    }

    if (visualPriority === 'image_hero') {
      // Overlay band should fill available negative space under tight/high rhythm —
      // not leave a large unused lower third while type sits in a tiny top pocket.
      const textShare = Math.min(0.42, Math.max(0.26, 0.30 * (0.95 + 0.05 * neg) * fillBoost));
      return {
        textShare,
        minTextShare: 0.24,
        maxTextShare: 0.44,
        splitAxis: 'overlay',
        preferredTextBias: 'start',
        visualPriority,
      };
    }

    if (visualPriority === 'cta_hero') {
      // CTA still prefers panel when possible — overlay only as base; escalation upgrades
      const textShare = Math.min(0.48, Math.max(0.32, 0.36 * (0.95 + 0.05 * neg) * fillBoost));
      return {
        textShare,
        minTextShare: 0.30,
        maxTextShare: 0.55,
        splitAxis: 'overlay',
        preferredTextBias: 'end',
        visualPriority,
      };
    }

    return {
      textShare: Math.min(0.55, Math.max(0.40, 0.45 * (0.9 + 0.1 * neg) * fillBoost)),
      minTextShare: 0.38,
      maxTextShare: 0.58,
      splitAxis: flow === 'center_down' ? 'vertical' : 'horizontal',
      preferredTextBias: 'start',
      visualPriority,
    };
  }

  /**
   * Priority-specific share caps derived from the base policy — not absolute magic numbers.
   * image_hero keeps image dominance; typography_hero may claim a larger panel.
   */
  public static priorityShareBounds(visualPriority: string): PriorityShareBounds {
    const base = LayoutEngine.deriveSpatialPolicy(visualPriority);
    // Modest headroom above declared max for content fit; never invert priority roles.
    const headroom =
      visualPriority === 'image_hero' ? 1.08
        : visualPriority === 'cta_hero' ? 1.12
          : visualPriority === 'typography_hero' ? 1.15
            : 1.10;
    const maxTextShare = Math.min(
      visualPriority === 'image_hero' ? 0.48 : 0.72,
      Math.max(base.maxTextShare, base.textShare) * headroom,
    );
    return {
      maxTextShare,
      minImageShare: Math.max(0.28, 1 - maxTextShare),
      maxSameTemplateRepairs: visualPriority === 'image_hero' ? 3 : 4,
    };
  }

  /** Clamp any policy to the priority's max text share (preserves visualPriority intent). */
  public static clampPolicyToPriority(
    policy: SpatialAllocationPolicy,
    visualPriority: string,
  ): SpatialAllocationPolicy {
    const bounds = LayoutEngine.priorityShareBounds(visualPriority);
    const textShare = Math.min(bounds.maxTextShare, Math.max(policy.minTextShare, policy.textShare));
    return {
      ...policy,
      textShare,
      maxTextShare: Math.min(policy.maxTextShare, bounds.maxTextShare),
      visualPriority: policy.visualPriority || visualPriority,
    };
  }

  /**
   * Expand textShare to fit content need (before any font shrink), clamped to policy max.
   */
  public static fitTextShareToContent(
    policy: SpatialAllocationPolicy,
    neededTextPx: number,
    primaryAxisPx: number,
  ): SpatialAllocationPolicy {
    if (primaryAxisPx <= 0 || neededTextPx <= 0) return policy;
    const neededShare = neededTextPx / primaryAxisPx;
    const textShare = Math.min(
      policy.maxTextShare,
      Math.max(policy.textShare, neededShare * 1.08),
    );
    return { ...policy, textShare };
  }

  /**
   * Collision repair: flip bias, LOCK it, and advance placementSlot so the next
   * allocateRegions call yields different coordinates (not the same subject-derived bias).
   */
  public static relocateSpatialPolicy(
    failedPolicy: SpatialAllocationPolicy | undefined,
    priority: string,
    reason?: string,
  ): SpatialAllocationPolicy {
    const base = failedPolicy || LayoutEngine.deriveSpatialPolicy(priority);
    const nextSlot = (base.placementSlot ?? 0) + 1;
    const relocated: SpatialAllocationPolicy = {
      ...base,
      preferredTextBias: base.preferredTextBias === 'start' ? 'end' : 'start',
      lockTextBias: true,
      placementSlot: nextSlot,
      visualPriority: base.visualPriority || priority,
    };
    const clamped = LayoutEngine.clampPolicyToPriority(relocated, priority);
    console.log(
      `[SpatialRelocate] ${base.splitAxis}@${(base.textShare || 0).toFixed(2)} ` +
      `bias ${base.preferredTextBias}→${clamped.preferredTextBias} ` +
      `slot ${(base.placementSlot ?? 0)}→${nextSlot} lockBias=true ` +
      `(reason=${reason || 'collision'} priority=${priority})`,
    );
    return clamped;
  }

  /**
   * Fresh policy for an alternate template — do NOT reuse the failed allocation.
   * Derives from visualPriority and picks an unused placement slot/bias/axis hint.
   */
  public static freshPolicyForAlternate(
    priority: string,
    failedSignatures: Array<{ axis?: string; share?: number; category: string }>,
    attemptIndex: number,
  ): SpatialAllocationPolicy {
    const base = LayoutEngine.deriveSpatialPolicy(priority);
    const usedAxes = new Set(failedSignatures.map(f => f.axis).filter(Boolean));
    let splitAxis = base.splitAxis;
    // Prefer an axis not yet exhausted by failed attempts
    if (usedAxes.has(splitAxis)) {
      if (!usedAxes.has('vertical')) splitAxis = 'vertical';
      else if (!usedAxes.has('horizontal')) splitAxis = 'horizontal';
      else if (!usedAxes.has('overlay')) splitAxis = 'overlay';
      else splitAxis = splitAxis === 'vertical' ? 'horizontal' : 'vertical';
    }
    const bias: 'start' | 'end' = attemptIndex % 2 === 0 ? 'start' : 'end';
    const policy: SpatialAllocationPolicy = {
      ...base,
      splitAxis,
      preferredTextBias: bias,
      lockTextBias: true,
      placementSlot: attemptIndex,
      visualPriority: priority,
    };
    return LayoutEngine.clampPolicyToPriority(policy, priority);
  }

  /**
   * Content-integrity / insufficient text space: grow textShare on the SAME axis
   * toward the priority max — fit the full headline, do not change template or axis yet.
   */
  public static expandSpatialPolicyForContent(
    failedPolicy: SpatialAllocationPolicy | undefined,
    priority: string,
    reason?: string,
  ): SpatialAllocationPolicy {
    const base = failedPolicy || LayoutEngine.deriveSpatialPolicy(priority);
    const bounds = LayoutEngine.priorityShareBounds(priority);
    const grown = Math.min(
      bounds.maxTextShare,
      Math.max(base.textShare * 1.22, base.textShare + 0.06, base.minTextShare),
    );
    const expanded: SpatialAllocationPolicy = {
      ...base,
      textShare: grown,
      maxTextShare: Math.max(base.maxTextShare, grown),
      visualPriority: base.visualPriority || priority,
    };
    const clamped = LayoutEngine.clampPolicyToPriority(expanded, priority);
    console.log(
      `[SpatialExpand] ${base.splitAxis}@${(base.textShare || 0).toFixed(2)} ` +
      `→ ${clamped.splitAxis}@${clamped.textShare.toFixed(2)} ` +
      `(reason=${reason || 'content'} priority=${priority} max=${bounds.maxTextShare.toFixed(2)})`,
    );
    return clamped;
  }

  /**
   * Escalate to a structurally different spatial contract.
   * Reserved for spatial failures (whitespace_tight, image_underutilized, insufficient space).
   * NOT the first response to text_collision — use relocateSpatialPolicy first.
   * Always clamps to priorityShareBounds so image_hero cannot become typography-heavy.
   */
  public static escalateSpatialPolicy(
    failedPolicy: SpatialAllocationPolicy | undefined,
    priority: string,
    reason?: string,
  ): SpatialAllocationPolicy {
    const base = failedPolicy || LayoutEngine.deriveSpatialPolicy(priority);
    const bounds = LayoutEngine.priorityShareBounds(priority);
    const escalated: SpatialAllocationPolicy = {
      ...base,
      visualPriority: base.visualPriority || priority,
      lockTextBias: true,
      placementSlot: (base.placementSlot ?? 0) + 1,
    };

    const spatialReasons = new Set([
      'whitespace_tight_to_subject',
      'image_underutilized',
      'insufficient_text_space',
      'spatial_allocation',
      'same_signature_retry',
      'same_axis_family',
      'reading_flow_band',
      'whitespace_crowded',
      'geometry_violation',
      'visual_priority_violation',
      'unused_area_excessive',
      'text_image_ratio_imbalanced',
      'unchanged_text_region',
      'subject_collision_stuck_geometry',
    ]);
    // Collision must not force axis change here — callers should relocate first.
    const forceAxis =
      base.splitAxis === 'overlay'
      || spatialReasons.has(String(reason || ''))
      || reason === 'alternate_template';

    // Image dominance repair: shrink text share / flip bias — do NOT grow toward typography-heavy
    const imageDominanceRepair =
      reason === 'image_underutilized'
      || reason === 'visual_priority_violation'
      || reason === 'text_image_ratio_imbalanced'
      || reason === 'unused_area_excessive';

    if (imageDominanceRepair) {
      const basePolicy = LayoutEngine.deriveSpatialPolicy(priority);
      escalated.textShare = Math.min(
        bounds.maxTextShare,
        Math.max(basePolicy.minTextShare, Math.min(base.textShare * 0.85, basePolicy.textShare * 1.05)),
      );
      escalated.preferredTextBias = base.preferredTextBias === 'start' ? 'end' : 'start';
      // Prefer keeping a real panel if already split; if overlay+unused, try vertical with modest share
      if (base.splitAxis === 'overlay' && (reason === 'unused_area_excessive' || String(reason) === 'reading_flow_band')) {
        escalated.splitAxis = 'vertical';
        escalated.textShare = Math.min(bounds.maxTextShare, Math.max(basePolicy.textShare, basePolicy.minTextShare));
      }
    } else if (forceAxis && base.splitAxis === 'overlay') {
      // Leave overlay — image surrenders a real panel, but stay within priority max share
      escalated.splitAxis = 'vertical';
      escalated.textShare = Math.min(
        bounds.maxTextShare,
        Math.max(base.minTextShare, (base.textShare || 0.28) * 1.35),
      );
      escalated.preferredTextBias = base.preferredTextBias === 'start' ? 'end' : 'start';
    } else if (forceAxis && base.splitAxis === 'vertical') {
      escalated.splitAxis = 'horizontal';
      escalated.textShare = Math.min(
        bounds.maxTextShare,
        Math.max(base.minTextShare, base.textShare * 1.12),
      );
      escalated.preferredTextBias = base.preferredTextBias === 'start' ? 'end' : 'start';
    } else if (forceAxis) {
      escalated.splitAxis = 'vertical';
      escalated.textShare = Math.min(
        bounds.maxTextShare,
        Math.max(base.minTextShare, base.textShare * 1.15),
      );
      escalated.preferredTextBias = base.preferredTextBias === 'start' ? 'end' : 'start';
    } else {
      // Soft escalate: grow share / flip bias without axis change
      escalated.textShare = Math.min(bounds.maxTextShare, base.textShare * 1.18);
      escalated.preferredTextBias = base.preferredTextBias === 'start' ? 'end' : 'start';
    }

    escalated.minTextShare = Math.min(
      escalated.textShare,
      Math.max(base.minTextShare, escalated.textShare * 0.85),
    );
    escalated.maxTextShare = Math.min(bounds.maxTextShare, Math.max(base.maxTextShare, escalated.textShare));

    const clamped = LayoutEngine.clampPolicyToPriority(escalated, priority);

    console.log(
      `[SpatialEscalation] ${base.splitAxis}@${(base.textShare || 0).toFixed(2)} ` +
      `→ ${clamped.splitAxis}@${clamped.textShare.toFixed(2)} ` +
      `(bias=${clamped.preferredTextBias} reason=${reason || 'retry'} ` +
      `priority=${priority} maxText=${bounds.maxTextShare.toFixed(2)} minImg=${bounds.minImageShare.toFixed(2)})`,
    );

    return clamped;
  }

  /**
   * Allocates image vs text regions from visualPriority spatial policy.
   * typography_hero / composition_hero: image surrenders a real panel (non-overlapping).
   * image_hero / cta_hero: photo stays full-bleed; text gets a subject-aware overlay band.
   * Text regions are forced outside protectedZones whenever a clear pocket exists.
   */
  public allocateRegions(
    behavior: { imageBleedExtent?: string; readingJourney?: string },
    constraints: LayoutConstraints,
    visualPriority: string = 'image_hero',
    subjectHint?: BoundingBox,
    spatialPolicy?: SpatialAllocationPolicy,
  ): { imageRegion: BoundingBox; textRegion: BoundingBox; spatial: SpatialAllocationPolicy; canonicalGeometry: CanonicalGeometry } {
    const policy = LayoutEngine.clampPolicyToPriority(
      spatialPolicy || LayoutEngine.deriveSpatialPolicy(visualPriority, {
        readingFlow: behavior.readingJourney === 'z_pattern' ? 'z_pattern' : 'center_down',
      }),
      visualPriority,
    );

    // Honor explicit spatial policy axis first. Bleed hints may UPGRADE overlay→split,
    // but must NEVER downgrade an escalated vertical/horizontal panel back to overlay.
    let axis = policy.splitAxis;
    const policyWasExplicit = !!spatialPolicy;
    if (!policyWasExplicit || axis === 'overlay') {
      if (behavior.imageBleedExtent === 'asymmetrical_65' && axis === 'overlay') {
        axis = 'horizontal';
      } else if (behavior.imageBleedExtent === 'split_50' && axis === 'overlay') {
        axis = 'horizontal';
      } else if (behavior.imageBleedExtent === 'panel_surrender' && axis === 'overlay') {
        axis = 'vertical';
      } else if (
        !policyWasExplicit
        && (behavior.imageBleedExtent === 'full_bleed_band' || behavior.imageBleedExtent === 'full')
        && (visualPriority === 'image_hero' || visualPriority === 'cta_hero')
      ) {
        axis = 'overlay';
      }
    }

    const bias = this.resolveTextBias(policy.preferredTextBias, axis, subjectHint, !!policy.lockTextBias);
    const gutter = Math.max(24, Math.round(constraints.safeX * 0.5));
    const subjects = this.getAllocationSubjects(subjectHint);

    const canonicalGeometry: CanonicalGeometry = {
      faceBox: this.faceBox,
      headBox: this.faceBox ? {
        ...this.faceBox,
        y: Math.max(0, this.faceBox.y - Math.round(this.faceBox.height * 0.15)),
        height: this.faceBox.height + Math.round(this.faceBox.height * 0.15)
      } : undefined,
      subjectMass: this.subjectBox,
      protectedZones: this.protectedSubjects.length
        ? this.protectedSubjects
        : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : []),
      safeMargins: { x: constraints.safeX, y: constraints.safeY },
      splitAxis: axis,
    };

    // Ranked subject-clear pockets — relocate cycles placementSlot through these
    const pockets = this.enumerateSubjectClearPockets(constraints, axis, policy.textShare, gutter, subjects);
    const slot = Math.max(0, policy.placementSlot ?? 0);
    const preferredPocket = pockets.length > 0 ? pockets[slot % pockets.length] : null;

    let textRegion: BoundingBox;
    let imageRegion: BoundingBox;

    if (axis === 'horizontal') {
      const textW = Math.round(this.canvasWidth * policy.textShare);
      const imageW = this.canvasWidth - textW;
      if (bias === 'start') {
        textRegion = {
          x: constraints.safeX,
          y: constraints.safeY,
          width: Math.max(120, textW - constraints.safeX - gutter / 2),
          height: this.canvasHeight - constraints.safeY - constraints.margins.bottom,
        };
        imageRegion = { x: textW, y: 0, width: imageW, height: this.canvasHeight };
      } else {
        textRegion = {
          x: imageW + gutter / 2,
          y: constraints.safeY,
          width: Math.max(120, this.canvasWidth - imageW - constraints.safeX - gutter / 2),
          height: this.canvasHeight - constraints.safeY - constraints.margins.bottom,
        };
        imageRegion = { x: 0, y: 0, width: imageW, height: this.canvasHeight };
      }
    } else if (axis === 'vertical') {
      const textH = Math.round(this.canvasHeight * policy.textShare);
      const imageH = this.canvasHeight - textH;
      if (bias === 'start') {
        textRegion = {
          x: constraints.safeX,
          y: constraints.safeY,
          width: constraints.contentMaxWidth,
          height: Math.max(100, textH - constraints.safeY - gutter / 2),
        };
        imageRegion = { x: 0, y: textH, width: this.canvasWidth, height: imageH };
      } else {
        textRegion = {
          x: constraints.safeX,
          y: imageH + gutter / 2,
          width: constraints.contentMaxWidth,
          height: Math.max(100, this.canvasHeight - imageH - constraints.margins.bottom - gutter / 2),
        };
        imageRegion = { x: 0, y: 0, width: this.canvasWidth, height: imageH };
      }
    } else {
      // Overlay band
      imageRegion = { x: 0, y: 0, width: this.canvasWidth, height: this.canvasHeight };
      const bandH = Math.max(
        Math.round(this.canvasHeight * policy.textShare),
        Math.round(constraints.safeY + this.canvasHeight * 0.16),
      );
      if (bias === 'end') {
        const y = this.canvasHeight - constraints.margins.bottom - bandH;
        textRegion = {
          x: constraints.safeX,
          y: Math.max(constraints.safeY, y),
          width: constraints.contentMaxWidth,
          height: bandH,
        };
      } else {
        textRegion = {
          x: constraints.safeX,
          y: constraints.safeY,
          width: constraints.contentMaxWidth,
          height: bandH,
        };
      }
    }

    // Force subject clearance: carve, then if still overlapping use ranked clear pocket
    const beforeRect = { ...textRegion };
    textRegion = this.carveSubjectsFromRegion(textRegion, axis, subjects);
    if (this.regionIntersectsAny(textRegion, subjects)) {
      if (preferredPocket) {
        console.log(
          `[SpatialAlloc] subject overlap after carve — using clear pocket slot=${slot % Math.max(1, pockets.length)} ` +
          `{${formatRect(preferredPocket)}} (axis-native was {${formatRect(beforeRect)}})`,
        );
        textRegion = { ...preferredPocket };
        // For dedicated panels, re-derive imageRegion opposite the chosen pocket
        if (axis === 'horizontal') {
          const textOnLeft = textRegion.x + textRegion.width / 2 < this.canvasWidth / 2;
          if (textOnLeft) {
            const splitX = Math.min(this.canvasWidth - 80, textRegion.x + textRegion.width + gutter);
            imageRegion = { x: splitX, y: 0, width: this.canvasWidth - splitX, height: this.canvasHeight };
          } else {
            const splitX = Math.max(80, textRegion.x - gutter);
            imageRegion = { x: 0, y: 0, width: splitX, height: this.canvasHeight };
          }
        } else if (axis === 'vertical') {
          const textOnTop = textRegion.y + textRegion.height / 2 < this.canvasHeight / 2;
          if (textOnTop) {
            const splitY = Math.min(this.canvasHeight - 80, textRegion.y + textRegion.height + gutter);
            imageRegion = { x: 0, y: splitY, width: this.canvasWidth, height: this.canvasHeight - splitY };
          } else {
            const splitY = Math.max(80, textRegion.y - gutter);
            imageRegion = { x: 0, y: 0, width: this.canvasWidth, height: splitY };
          }
        }
      } else {
        console.warn(
          `[SpatialAlloc] NO subject-clear pocket available — textRegion still overlaps protected zones ` +
          `(text={${formatRect(textRegion)}} subjects=${subjects.map(formatRect).join('|')})`,
        );
      }
    } else if (policy.lockTextBias && preferredPocket && slot > 0) {
      // Relocate explicitly asked for a different pocket — use it even if carve already cleared
      const nativeClear = !this.regionIntersectsAny(beforeRect, subjects);
      if (!nativeClear || this.rectsDiffer(beforeRect, preferredPocket)) {
        // Prefer pocket that differs from the previous failed native region
        if (this.rectsDiffer(textRegion, preferredPocket)) {
          console.log(
            `[SpatialAlloc] relocate slot=${slot} → pocket {${formatRect(preferredPocket)}} ` +
            `(was {${formatRect(textRegion)}} bias=${bias} locked)`,
          );
          textRegion = { ...preferredPocket };
          if (axis === 'horizontal') {
            const textOnLeft = textRegion.x + textRegion.width / 2 < this.canvasWidth / 2;
            if (textOnLeft) {
              const splitX = Math.min(this.canvasWidth - 80, textRegion.x + textRegion.width + gutter);
              imageRegion = { x: splitX, y: 0, width: this.canvasWidth - splitX, height: this.canvasHeight };
            } else {
              const splitX = Math.max(80, textRegion.x - gutter);
              imageRegion = { x: 0, y: 0, width: splitX, height: this.canvasHeight };
            }
          } else if (axis === 'vertical') {
            const textOnTop = textRegion.y + textRegion.height / 2 < this.canvasHeight / 2;
            if (textOnTop) {
              const splitY = Math.min(this.canvasHeight - 80, textRegion.y + textRegion.height + gutter);
              imageRegion = { x: 0, y: splitY, width: this.canvasWidth, height: this.canvasHeight - splitY };
            } else {
              const splitY = Math.max(80, textRegion.y - gutter);
              imageRegion = { x: 0, y: 0, width: this.canvasWidth, height: splitY };
            }
          }
        }
      }
    }

    // Final safety: never inflate into subjects
    textRegion = this.carveSubjectsFromRegion(textRegion, axis, subjects);

    canonicalGeometry.imageRegion = imageRegion;
    canonicalGeometry.textRegion = textRegion;
    canonicalGeometry.splitAxis = axis;

    const stillCollides = this.regionIntersectsAny(textRegion, subjects);
    const spatialOut: SpatialAllocationPolicy = {
      ...policy,
      splitAxis: axis,
      preferredTextBias: bias,
      lockTextBias: policy.lockTextBias,
      placementSlot: policy.placementSlot,
    };

    console.log(
      `[SpatialAlloc] priority=${visualPriority} axis=${axis} bias=${bias}` +
      `${policy.lockTextBias ? '(locked)' : ''} slot=${slot} ` +
      `textShare=${policy.textShare.toFixed(2)} ` +
      `textRegion={${formatRect(textRegion)}} imageRegion={${formatRect(imageRegion)}} ` +
      `pockets=${pockets.length} subjectClear=${!stillCollides}`,
    );

    return {
      imageRegion,
      textRegion,
      spatial: spatialOut,
      canonicalGeometry,
    };
  }

  private getAllocationSubjects(subjectHint?: BoundingBox): BoundingBox[] {
    if (this.protectedSubjects.length) return this.protectedSubjects;
    if (this.subjectBox) return [this.subjectBox];
    if (this.faceBox) return [this.faceBox];
    if (subjectHint) return [subjectHint];
    return [];
  }

  private regionIntersectsAny(region: BoundingBox, subjects: BoundingBox[]): boolean {
    return subjects.some(s =>
      region.x < s.x + s.width && region.x + region.width > s.x
      && region.y < s.y + s.height && region.y + region.height > s.y,
    );
  }

  private rectsDiffer(a: BoundingBox, b: BoundingBox, tol = 8): boolean {
    return Math.abs(a.x - b.x) > tol
      || Math.abs(a.y - b.y) > tol
      || Math.abs(a.width - b.width) > tol
      || Math.abs(a.height - b.height) > tol;
  }

  /**
   * Enumerate free rectangles outside protected subjects, ranked for the active axis.
   * Relocate cycles placementSlot through this list to guarantee different coordinates.
   */
  private enumerateSubjectClearPockets(
    constraints: LayoutConstraints,
    axis: string,
    textShare: number,
    gutter: number,
    subjects: BoundingBox[],
  ): BoundingBox[] {
    const minW = Math.max(100, Math.round(this.canvasWidth * 0.16));
    const minH = Math.max(80, Math.round(this.canvasHeight * 0.12));
    const targetH = Math.max(minH, Math.round(this.canvasHeight * Math.min(0.45, Math.max(0.14, textShare))));
    const targetW = Math.max(minW, Math.round(constraints.contentMaxWidth * Math.min(1, textShare + 0.35)));
    const contentBottom = this.canvasHeight - constraints.margins.bottom;
    const contentRight = this.canvasWidth - constraints.safeX;

    const candidates: Array<{ box: BoundingBox; score: number }> = [];
    const push = (box: BoundingBox, axisAffinity: number) => {
      if (box.width < minW || box.height < minH) return;
      if (this.regionIntersectsAny(box, subjects)) return;
      const area = box.width * box.height;
      const sizeFit = Math.min(1, box.width / targetW) * Math.min(1, box.height / targetH);
      candidates.push({ box, score: area * (0.55 + 0.45 * sizeFit) * axisAffinity });
    };

    // Full-canvas side strips (work even with large subjects)
    if (subjects.length === 0) {
      push({
        x: constraints.safeX,
        y: constraints.safeY,
        width: constraints.contentMaxWidth,
        height: Math.min(targetH, contentBottom - constraints.safeY),
      }, 1);
      push({
        x: constraints.safeX,
        y: Math.max(constraints.safeY, contentBottom - targetH),
        width: constraints.contentMaxWidth,
        height: targetH,
      }, 1);
    }

    for (const s of subjects) {
      // Left of subject
      push({
        x: constraints.safeX,
        y: constraints.safeY,
        width: Math.min(targetW, s.x - constraints.safeX - gutter),
        height: contentBottom - constraints.safeY,
      }, axis === 'horizontal' ? 1.4 : 1.0);
      // Right of subject
      const rightX = s.x + s.width + gutter;
      push({
        x: rightX,
        y: constraints.safeY,
        width: Math.min(targetW, contentRight - rightX),
        height: contentBottom - constraints.safeY,
      }, axis === 'horizontal' ? 1.4 : 1.0);
      // Above subject
      push({
        x: constraints.safeX,
        y: constraints.safeY,
        width: constraints.contentMaxWidth,
        height: Math.min(targetH, s.y - constraints.safeY - gutter),
      }, axis === 'vertical' || axis === 'overlay' ? 1.4 : 1.0);
      // Below subject
      const belowY = s.y + s.height + gutter;
      push({
        x: constraints.safeX,
        y: belowY,
        width: constraints.contentMaxWidth,
        height: Math.min(targetH, contentBottom - belowY),
      }, axis === 'vertical' || axis === 'overlay' ? 1.4 : 1.0);
    }

    // Deduplicate near-identical rects, sort by score desc
    candidates.sort((a, b) => b.score - a.score);
    const unique: BoundingBox[] = [];
    for (const c of candidates) {
      if (unique.some(u => !this.rectsDiffer(u, c.box, 24))) continue;
      unique.push(c.box);
    }
    return unique;
  }

  private resolveTextBias(
    preferred: 'start' | 'end',
    axis: 'horizontal' | 'vertical' | 'overlay',
    subjectHint?: BoundingBox,
    lockBias = false,
  ): 'start' | 'end' {
    // Relocate/repair must be able to force the opposite side — do not undo it
    if (lockBias || !subjectHint) return preferred;
    if (axis === 'horizontal') {
      const cx = subjectHint.x + subjectHint.width / 2;
      return cx < this.canvasWidth * 0.5 ? 'end' : 'start';
    }
    const cy = subjectHint.y + subjectHint.height / 2;
    return cy < this.canvasHeight * 0.55 ? 'end' : 'start';
  }

  /**
   * Shrink text region away from protected subjects that intersect it.
   * Applies to ALL axes (overlay and dedicated panels). Never re-inflates into subjects.
   */
  private carveSubjectsFromRegion(
    region: BoundingBox,
    _axis: string = 'overlay',
    subjectsOverride?: BoundingBox[],
  ): BoundingBox {
    const subjects = subjectsOverride ?? (
      this.protectedSubjects.length
        ? this.protectedSubjects
        : (this.subjectBox || this.faceBox ? [this.subjectBox || this.faceBox!] : [])
    );
    if (subjects.length === 0) return region;

    let result = { ...region };
    for (const s of subjects) {
      const overlaps =
        result.x < s.x + s.width && result.x + result.width > s.x
        && result.y < s.y + s.height && result.y + result.height > s.y;
      if (!overlaps) continue;

      const spaceLeft = s.x - result.x;
      const spaceRight = (result.x + result.width) - (s.x + s.width);
      const spaceTop = s.y - result.y;
      const spaceBottom = (result.y + result.height) - (s.y + s.height);
      const best = Math.max(spaceLeft, spaceRight, spaceTop, spaceBottom);
      const minKeep = 40;

      if (best < minKeep) {
        // Cannot carve meaningfully — leave for pocket replacement
        continue;
      }

      if (best === spaceLeft && spaceLeft >= minKeep) {
        result.width = spaceLeft;
      } else if (best === spaceRight && spaceRight >= minKeep) {
        const nx = s.x + s.width;
        result.width = result.x + result.width - nx;
        result.x = nx;
      } else if (best === spaceTop && spaceTop >= minKeep) {
        result.height = spaceTop;
      } else if (best === spaceBottom && spaceBottom >= minKeep) {
        const ny = s.y + s.height;
        result.height = result.y + result.height - ny;
        result.y = ny;
      }
    }

    // Do NOT Math.max inflate back into subjects — keep carved size (floor only if still clear)
    result.width = Math.max(1, result.width);
    result.height = Math.max(1, result.height);
    if (this.regionIntersectsAny(result, subjects)) {
      // Carve failed to clear — return as-is so caller can swap to a clear pocket
      return result;
    }
    // Safe minimums only when still clear
    if (result.width < 80 && result.x + 80 <= this.canvasWidth) {
      const grown = { ...result, width: 80 };
      if (!this.regionIntersectsAny(grown, subjects)) result = grown;
    }
    if (result.height < 60 && result.y + 60 <= this.canvasHeight) {
      const grown = { ...result, height: 60 };
      if (!this.regionIntersectsAny(grown, subjects)) result = grown;
    }
    return result;
  }
}
