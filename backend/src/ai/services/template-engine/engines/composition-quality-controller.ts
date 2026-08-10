import { LayoutConstraints, LayoutEngine, BoundingBox } from './layout-engine';
import { ColorPalette } from './color-composition-engine';

export type VisualPriority = 'image_hero' | 'typography_hero' | 'composition_hero' | 'cta_hero' | string;
export type ReadingFlow = 'center_down' | 'z_pattern' | 'center_anchored' | 'left_right' | string;

export interface TypographyMetricsHint {
  heroSize?: number;
  primarySize?: number;
  bodySize?: number;
  metadataSize?: number;
}

export interface CompositionIntent {
  visualPriority?: VisualPriority;
  readingFlow?: ReadingFlow;
  family?: string;
}

export interface ContentBundle {
  headline?: string;
  subheadline?: string;
  cta?: string;
}

export interface FitActionLog {
  stage: 'wrap' | 'scale' | 'relocate' | 'layout_change';
  detail: string;
}

/**
 * Adaptive composition / quality-control layer.
 * Ratio- and intent-driven — avoids magic pixel hardcoding so it scales across
 * feed/story sizes and BrandDNA layouts.
 */
export class CompositionQualityController {
  /**
   * Rotate BrandDNA ink roles (primary / secondary / accent / depth) for visual
   * variety. Canvas background stays locked and is NEVER returned as a text ink.
   */
  public rotateInkPalette(palette: ColorPalette, rotationIndex: number): ColorPalette {
    const brand = palette.brandColor;
    const secondary = palette.secondaryColor;
    const accent = palette.accentColor || brand;
    const depth = palette.depthColor || brand;
    const bg = palette.backgroundColor;

    const rotatable = [brand, secondary, accent, depth];
    const n = ((rotationIndex % 4) + 4) % 4;

    return {
      brandColor: rotatable[(0 + n) % 4],
      secondaryColor: rotatable[(1 + n) % 4],
      accentColor: rotatable[(2 + n) % 4],
      depthColor: rotatable[(3 + n) % 4],
      backgroundColor: bg, // locked — canvas surface only
      textColor: rotatable[(3 + n) % 4], // depth slot after rotation
    };
  }

  /**
   * Content-aware type scale: longer copy yields proportionally smaller base size
   * within the available safe region (never below a readable ratio of canvas).
   */
  public adaptFontSizeToContent(
    baseSize: number,
    text: string,
    role: string,
    canvasH: number,
    safeWidth: number,
  ): number {
    const words = text.split(/\s+/).filter(Boolean);
    const chars = text.replace(/\s+/g, '').length;
    let size = baseSize;

    // Density curve — scalable, not pixel-hardcoded
    if (role === 'heading') {
      if (chars > 18) size *= Math.max(0.70, 1 - (chars - 18) * 0.011);
      if (words.length > 5) size *= Math.max(0.78, 1 - (words.length - 5) * 0.04);
    } else if (role === 'tagline' || role === 'body') {
      if (chars > 40) size *= Math.max(0.82, 1 - (chars - 40) * 0.006);
    }

    // Safe-width fit for longest whole word (never break words)
    const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), '');
    if (longest.length > 0 && safeWidth > 0) {
      const charRatio = 0.64; // conservative uppercase estimate
      const maxForWord = safeWidth / (longest.length * charRatio);
      if (size > maxForWord) size = maxForWord;
    }

    // Canvas-relative floors/ceilings (ratios, not fixed px)
    const minRatio = role === 'heading' ? 0.032 : 0.016;
    const maxRatio = role === 'heading' ? 0.10 : 0.045;
    const minPx = canvasH * minRatio;
    const maxPx = canvasH * maxRatio;
    return Math.max(minPx, Math.min(size, maxPx));
  }

  /**
   * Estimate stacked group height from content + metrics (content-aware).
   */
  public estimateGroupHeight(
    roles: Array<{ role: string; text: string }>,
    metrics: TypographyMetricsHint | undefined,
    canvasH: number,
    visualPriority?: VisualPriority,
  ): { heights: number[]; total: number; gap: number } {
    const gapRatio = visualPriority === 'image_hero' ? 0.018 : 0.014;
    const gap = Math.round(canvasH * gapRatio);
    const heights: number[] = [];

    for (const item of roles) {
      const base =
        item.role === 'heading'
          ? metrics?.heroSize || canvasH * 0.06
          : item.role === 'tagline' || item.role === 'cta'
            ? metrics?.primarySize || canvasH * 0.028
            : metrics?.bodySize || canvasH * 0.02;
      const adapted = this.adaptFontSizeToContent(base, item.text || 'X', item.role, canvasH, canvasH * 0.7);
      const lineEstimate = Math.max(1, Math.ceil((item.text || '').split(/\s+/).filter(Boolean).length / (item.role === 'heading' ? 3 : 6)));
      const lineHeight = item.role === 'heading' ? 1.15 : 1.3;
      heights.push(Math.round(adapted * lineHeight * Math.min(lineEstimate, item.role === 'heading' ? 4 : 2)));
    }

    const total = heights.reduce((a, b) => a + b, 0) + Math.max(0, heights.length - 1) * gap;
    return { heights, total, gap };
  }

  /**
   * Group fit cascade (caller-owned layout swap is the last stage):
   * 1) wrap budget (narrower max width → more lines, shorter width)
   * 2) proportional scale
   * 3) relocate to another whitespace region
   * 4) suggest layout change
   */
  public fitGroupIntoSafeRegions(params: {
    layoutEngine: LayoutEngine;
    constraints: LayoutConstraints;
    candidates: BoundingBox[];
    neededHeight: number;
    preferredWidth: number;
    intent: CompositionIntent;
    subjectHits: (region: BoundingBox, heightNeed: number) => boolean;
  }): {
    region: BoundingBox | null;
    wrapWidthFactor: number;
    scale: number;
    suggestLayoutChange: boolean;
    actions: FitActionLog[];
  } {
    const actions: FitActionLog[] = [];
    const { layoutEngine, constraints, candidates, intent, subjectHits } = params;
    let neededHeight = params.neededHeight;
    let wrapWidthFactor = 1.0;
    let scale = 1.0;

    const scoreIntent = {
      readingFlow: intent.readingFlow || 'center_down',
      visualPriority: intent.visualPriority || 'image_hero',
      role: 'group' as const,
    };

    const pickBest = (heightNeed: number, widthFactor: number): BoundingBox | null => {
      let best: BoundingBox | null = null;
      let bestScore = -999;
      for (const c of candidates) {
        const effectiveW = c.width * widthFactor;
        if (c.height < heightNeed * 0.92) continue;
        if (effectiveW < constraints.contentMaxWidth * 0.25) continue;
        if (subjectHits(c, heightNeed)) continue;
        const score = layoutEngine.scoreRegion(c, scoreIntent, heightNeed);
        // Prefer regions that match reading-flow / priority
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      return best;
    };

    // Stage 1 — WRAP: try progressively tighter wrap widths (more vertical stacking)
    for (const factor of [1.0, 0.85, 0.72, 0.6]) {
      // Tighter wrap → slightly taller stack estimate
      const wrapHeightBoost = 1 + (1 - factor) * 0.35;
      const tryH = neededHeight * wrapHeightBoost;
      const region = pickBest(tryH, factor);
      if (region) {
        actions.push({ stage: 'wrap', detail: `Accepted wrapWidthFactor=${factor.toFixed(2)}` });
        return { region, wrapWidthFactor: factor, scale: 1, suggestLayoutChange: false, actions };
      }
      wrapWidthFactor = factor;
    }
    actions.push({ stage: 'wrap', detail: 'No region at wrap adjustments; proceeding to scale' });

    // Stage 2 — SCALE: proportionally shrink group until a region accepts it
    for (const s of [0.92, 0.85, 0.78, 0.72]) {
      const tryH = neededHeight * s;
      const region = pickBest(tryH, wrapWidthFactor);
      if (region) {
        actions.push({ stage: 'scale', detail: `Proportional scale=${s.toFixed(2)}` });
        return { region, wrapWidthFactor, scale: s, suggestLayoutChange: false, actions };
      }
      scale = s;
    }
    actions.push({ stage: 'scale', detail: 'Scale exhausted; relocating' });

    // Stage 3 — RELOCATE: furthest clear pocket even if slightly short
    let safest: BoundingBox | null = null;
    let bestDist = -1;
    const subject = params.layoutEngine.getSubjectBox() || params.layoutEngine.getFaceBox();
    for (const c of candidates) {
      if (subjectHits(c, neededHeight * scale)) continue;
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;
      const sx = subject ? subject.x + subject.width / 2 : constraints.contentMaxWidth / 2;
      const sy = subject ? subject.y + subject.height / 2 : constraints.safeY * 4;
      const dist = Math.hypot(cx - sx, cy - sy);
      if (dist > bestDist) {
        bestDist = dist;
        safest = c;
      }
    }
    if (safest) {
      // Fit scale to region height if needed
      if (safest.height < neededHeight * scale && neededHeight > 0) {
        scale = Math.max(0.7, safest.height / neededHeight);
      }
      actions.push({ stage: 'relocate', detail: `Moved to safest whitespace (dist=${bestDist.toFixed(0)})` });
      return { region: safest, wrapWidthFactor, scale, suggestLayoutChange: false, actions };
    }

    // Stage 4 — LAYOUT CHANGE signal
    actions.push({ stage: 'layout_change', detail: 'No valid whitespace; caller should swap layout' });
    return {
      region: null,
      wrapWidthFactor,
      scale,
      suggestLayoutChange: true,
      actions,
    };
  }

  /**
   * Quality score for an allocated text composition (adaptive thresholds).
   */
  public scoreComposition(params: {
    boxes: Array<{ role?: string; box?: BoundingBox; omitted?: boolean }>;
    constraints: LayoutConstraints;
    canvasW: number;
    canvasH: number;
    subjectBox?: BoundingBox;
    intent?: CompositionIntent;
  }): { score: number; issues: string[] } {
    let score = 10;
    const issues: string[] = [];
    const active = params.boxes.filter(b => b.box && !b.omitted);

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i].box!;
        const b = active[j].box!;
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          score -= 2.5;
          issues.push('text_collision');
        }
      }

      const box = active[i].box!;
      if (params.subjectBox) {
        const s = params.subjectBox;
        if (box.x < s.x + s.width && box.x + box.width > s.x && box.y < s.y + s.height && box.y + box.height > s.y) {
          score -= 4;
          issues.push('subject_overlap');
        }
      }

      // Clip against canvas safe region (strict — no 20px bleed tolerance)
      if (
        box.x < params.constraints.safeX - 1 ||
        box.y < params.constraints.safeY - 1 ||
        box.x + box.width > params.canvasW - params.constraints.safeX + 1 ||
        box.y + box.height > params.canvasH - params.constraints.margins.bottom + 1
      ) {
        score -= 3;
        issues.push('canvas_clip');
      }
    }

    const heading = active.find(b => b.role === 'heading');
    const tagline = active.find(b => b.role === 'tagline');
    if (heading?.box && tagline?.box && heading.box.height < tagline.box.height) {
      score -= 2;
      issues.push('hierarchy_inversion');
    }

    // Reading-flow awareness: heading should sit in preferred band
    if (params.intent?.readingFlow === 'z_pattern' && heading?.box) {
      if (heading.box.x > params.canvasW * 0.55) {
        score -= 1;
        issues.push('reading_flow_miss');
      }
    }

    return { score: Math.max(0, score), issues };
  }

  /** Deterministic rotation index from layout + brand seed (stable per slide). */
  public hashRotationIndex(seed: string): number {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0) % 4;
  }
}
