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
  stage: 'wrap' | 'scale' | 'relocate' | 'layout_change' | 'quality_reject';
  detail: string;
}

export interface AllocatedTextBox {
  role?: string;
  box?: BoundingBox;
  omitted?: boolean;
  /** Estimated rendered font size (px) — used for readable-size / hierarchy gates */
  fontSize?: number;
  fill?: string;
}

export interface VisualQualityResult {
  pass: boolean;
  score: number;
  issues: string[];
  critical: string[];
  metrics: Record<string, number>;
}

/**
 * Adaptive composition / quality-control layer.
 *
 * Geometric fit alone is not enough — the final gate evaluates visual quality
 * (clipping, readable size, hierarchy, contrast, subject collision, whitespace,
 * dominance, reading flow). Ratio-driven so it scales across canvas sizes.
 */
export class CompositionQualityController {
  /** Minimum heading size as fraction of canvas height — even for image_hero. */
  private static readonly MIN_HEADING_RATIO = 0.038;
  /** Absolute floor ratio for secondary type */
  private static readonly MIN_SECONDARY_RATIO = 0.022;
  /** Heading must be at least this × secondary height (hierarchy) */
  private static readonly MIN_HIERARCHY_RATIO = 1.55;
  /** Soft fail below this score; critical issues always fail */
  private static readonly PASS_SCORE = 7.5;
  /** Proportional group scale must not go below this or type becomes decoration */
  private static readonly MIN_ACCEPT_SCALE = 0.82;

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
      backgroundColor: bg,
      textColor: rotatable[(3 + n) % 4],
    };
  }

  public adaptFontSizeToContent(
    baseSize: number,
    text: string,
    role: string,
    canvasH: number,
    safeWidth: number,
    visualPriority?: VisualPriority,
  ): number {
    const words = text.split(/\s+/).filter(Boolean);
    const chars = text.replace(/\s+/g, '').length;
    let size = baseSize;

    if (role === 'heading') {
      if (chars > 18) size *= Math.max(0.78, 1 - (chars - 18) * 0.009);
      if (words.length > 5) size *= Math.max(0.82, 1 - (words.length - 5) * 0.03);
    } else if (role === 'tagline' || role === 'body') {
      if (chars > 40) size *= Math.max(0.85, 1 - (chars - 40) * 0.005);
    }

    const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), '');
    if (longest.length > 0 && safeWidth > 0) {
      const charRatio = 0.64;
      const maxForWord = safeWidth / (longest.length * charRatio);
      if (size > maxForWord) size = maxForWord;
    }

    // image_hero: place type in clear bands — do NOT crush to micro type
    const minRatio = role === 'heading'
      ? CompositionQualityController.MIN_HEADING_RATIO
      : CompositionQualityController.MIN_SECONDARY_RATIO;
    const maxRatio = role === 'heading'
      ? (visualPriority === 'typography_hero' ? 0.11 : visualPriority === 'image_hero' ? 0.09 : 0.10)
      : 0.045;

    return Math.max(canvasH * minRatio, Math.min(size, canvasH * maxRatio));
  }

  public estimateGroupHeight(
    roles: Array<{ role: string; text: string }>,
    metrics: TypographyMetricsHint | undefined,
    canvasH: number,
    visualPriority?: VisualPriority,
  ): { heights: number[]; total: number; gap: number; fontSizes: number[] } {
    const gapRatio = visualPriority === 'image_hero' ? 0.02 : 0.014;
    const gap = Math.round(canvasH * gapRatio);
    const heights: number[] = [];
    const fontSizes: number[] = [];

    for (const item of roles) {
      const base =
        item.role === 'heading'
          ? metrics?.heroSize || canvasH * 0.065
          : item.role === 'tagline' || item.role === 'cta'
            ? metrics?.primarySize || canvasH * 0.03
            : metrics?.bodySize || canvasH * 0.022;
      const adapted = this.adaptFontSizeToContent(
        base,
        item.text || 'X',
        item.role,
        canvasH,
        canvasH * 0.7,
        visualPriority,
      );
      fontSizes.push(adapted);
      const lineEstimate = Math.max(
        1,
        Math.ceil((item.text || '').split(/\s+/).filter(Boolean).length / (item.role === 'heading' ? 3 : 6)),
      );
      const lineHeight = item.role === 'heading' ? 1.15 : 1.3;
      heights.push(
        Math.round(adapted * lineHeight * Math.min(lineEstimate, item.role === 'heading' ? 4 : 2)),
      );
    }

    const total = heights.reduce((a, b) => a + b, 0) + Math.max(0, heights.length - 1) * gap;
    return { heights, total, gap, fontSizes };
  }

  /**
   * Cascade: wrap → scale → relocate.
   * Does NOT auto-accept a weak relocate with crushing scale — that becomes layout_change.
   */
  public fitGroupIntoSafeRegions(params: {
    layoutEngine: LayoutEngine;
    constraints: LayoutConstraints;
    candidates: BoundingBox[];
    neededHeight: number;
    preferredWidth: number;
    intent: CompositionIntent;
    subjectHits: (region: BoundingBox, heightNeed: number) => boolean;
    /** Override readable scale floor (typography_hero uses a higher floor) */
    minAcceptScale?: number;
  }): {
    region: BoundingBox | null;
    wrapWidthFactor: number;
    scale: number;
    suggestLayoutChange: boolean;
    actions: FitActionLog[];
  } {
    const actions: FitActionLog[] = [];
    const { layoutEngine, constraints, candidates, intent, subjectHits } = params;
    const neededHeight = params.neededHeight;
    const minAccept = params.minAcceptScale ?? CompositionQualityController.MIN_ACCEPT_SCALE;
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
        if (c.height < heightNeed * 0.92) continue;
        if (c.width * widthFactor < constraints.contentMaxWidth * 0.28) continue;
        if (subjectHits(c, heightNeed)) continue;
        const score = layoutEngine.scoreRegion(c, scoreIntent, heightNeed);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      return best;
    };

    // Stage 1 — WRAP (preferred over scale for typography_hero)
    const wrapFactors = intent.visualPriority === 'typography_hero'
      ? [1.0, 0.92, 0.84, 0.76]
      : [1.0, 0.88, 0.76, 0.65];
    for (const factor of wrapFactors) {
      const wrapHeightBoost = 1 + (1 - factor) * 0.3;
      const tryH = neededHeight * wrapHeightBoost;
      const region = pickBest(tryH, factor);
      if (region) {
        actions.push({ stage: 'wrap', detail: `wrapWidthFactor=${factor.toFixed(2)}` });
        return { region, wrapWidthFactor: factor, scale: 1, suggestLayoutChange: false, actions };
      }
      wrapWidthFactor = factor;
    }
    actions.push({ stage: 'wrap', detail: 'wrap exhausted' });

    // Stage 2 — SCALE (last resort for typography_hero — higher floor)
    const scaleSteps = intent.visualPriority === 'typography_hero'
      ? [0.96, 0.92]
      : [0.94, 0.88, 0.82];
    for (const s of scaleSteps) {
      if (s < minAccept) continue;
      const tryH = neededHeight * s;
      const region = pickBest(tryH, wrapWidthFactor);
      if (region) {
        actions.push({ stage: 'scale', detail: `scale=${s.toFixed(2)}` });
        return { region, wrapWidthFactor, scale: s, suggestLayoutChange: false, actions };
      }
      scale = s;
    }
    actions.push({ stage: 'scale', detail: `scale exhausted at floor=${minAccept.toFixed(2)}` });

    // Stage 3 — RELOCATE
    let safest: BoundingBox | null = null;
    let bestDist = -1;
    const subjects = params.layoutEngine.getProtectedSubjects();
    for (const c of candidates) {
      if (subjectHits(c, neededHeight * minAccept)) continue;
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;
      let dist = 0;
      if (subjects.length === 0) {
        dist = Math.hypot(cx - constraints.contentMaxWidth / 2, cy - constraints.safeY * 4);
      } else {
        dist = Math.min(
          ...subjects.map(s => Math.hypot(cx - (s.x + s.width / 2), cy - (s.y + s.height / 2))),
        );
      }
      if (dist > bestDist) {
        bestDist = dist;
        safest = c;
      }
    }

    if (safest) {
      let relocateScale = scale;
      if (safest.height < neededHeight * relocateScale && neededHeight > 0) {
        relocateScale = safest.height / neededHeight;
      }
      if (relocateScale >= minAccept) {
        actions.push({ stage: 'relocate', detail: `safest pocket scale=${relocateScale.toFixed(2)}` });
        return { region: safest, wrapWidthFactor, scale: relocateScale, suggestLayoutChange: false, actions };
      }
      actions.push({
        stage: 'quality_reject',
        detail: `relocate would require scale=${relocateScale.toFixed(2)} < readable floor`,
      });
    }

    actions.push({ stage: 'layout_change', detail: 'wrap+scale+relocate exhausted — alternate layout required' });
    return {
      region: null,
      wrapWidthFactor,
      scale,
      suggestLayoutChange: true,
      actions,
    };
  }

  /**
   * Final visual-quality gate. Geometric packing can pass fit and still fail here.
   */
  public evaluateVisualQuality(params: {
    boxes: AllocatedTextBox[];
    constraints: LayoutConstraints;
    canvasW: number;
    canvasH: number;
    subjectBoxes?: BoundingBox[];
    intent?: CompositionIntent;
    groupScale?: number;
    surfaceLuminance?: number; // 0–1
    textLuminance?: number; // 0–1
  }): VisualQualityResult {
    let score = 10;
    const issues: string[] = [];
    const critical: string[] = [];
    const metrics: Record<string, number> = {};
    const priority = params.intent?.visualPriority || 'image_hero';
    const flow = params.intent?.readingFlow || 'center_down';
    const active = params.boxes.filter(b => b.box && !b.omitted);
    const subjects = params.subjectBoxes || [];

    // --- 1. Text clipping ---
    for (const item of active) {
      const box = item.box!;
      if (
        box.x < params.constraints.safeX - 1 ||
        box.y < params.constraints.safeY - 1 ||
        box.x + box.width > params.canvasW - params.constraints.safeX + 1 ||
        box.y + box.height > params.canvasH - params.constraints.margins.bottom + 1
      ) {
        score -= 3.5;
        issues.push('text_clipping');
        critical.push('text_clipping');
      }
    }

    // --- 2. Minimum readable size ---
    const heading = active.find(b => b.role === 'heading');
    const minHeading = params.canvasH * CompositionQualityController.MIN_HEADING_RATIO;
    if (heading?.fontSize != null && heading.fontSize < minHeading) {
      score -= 3;
      issues.push('unreadable_heading');
      critical.push('unreadable_heading');
      metrics.headingSize = heading.fontSize;
      metrics.minHeading = minHeading;
    } else if (heading?.box && heading.box.height < minHeading * 0.9) {
      score -= 2.5;
      issues.push('unreadable_heading');
      critical.push('unreadable_heading');
    }

    for (const item of active) {
      if (item.role === 'heading') continue;
      const minSec = params.canvasH * CompositionQualityController.MIN_SECONDARY_RATIO;
      if (item.fontSize != null && item.fontSize < minSec * 0.85) {
        score -= 1.5;
        issues.push('unreadable_secondary');
      }
    }

    // --- 3. Hierarchy ratio ---
    const tagline = active.find(b => b.role === 'tagline' || b.role === 'body');
    if (heading && tagline) {
      const hSize = heading.fontSize || heading.box?.height || 1;
      const tSize = tagline.fontSize || tagline.box?.height || 1;
      const ratio = hSize / Math.max(1, tSize);
      metrics.hierarchyRatio = ratio;
      if (ratio < CompositionQualityController.MIN_HIERARCHY_RATIO) {
        score -= 2.5;
        issues.push('hierarchy_ratio');
        if (ratio < 1.2) critical.push('hierarchy_ratio');
      }
    }

    // --- 4. Contrast (when luminances provided) ---
    if (params.surfaceLuminance != null && params.textLuminance != null) {
      const L1 = Math.max(params.surfaceLuminance, params.textLuminance);
      const L2 = Math.min(params.surfaceLuminance, params.textLuminance);
      const contrast = (L1 + 0.05) / (L2 + 0.05);
      metrics.contrast = contrast;
      if (contrast < 3.0) {
        score -= 3;
        issues.push('contrast');
        critical.push('contrast');
      } else if (contrast < 4.5) {
        score -= 1;
        issues.push('contrast_soft');
      }
    }

    // --- 5. Visual-subject collision ---
    for (const item of active) {
      const box = item.box!;
      for (const s of subjects) {
        if (box.x < s.x + s.width && box.x + box.width > s.x && box.y < s.y + s.height && box.y + box.height > s.y) {
          score -= 4;
          issues.push('subject_collision');
          critical.push('subject_collision');
          break;
        }
      }
    }

    // --- 6. Whitespace quality ---
    if (active.length > 0) {
      const textArea = active.reduce((sum, b) => sum + (b.box!.width * b.box!.height), 0);
      const canvasArea = params.canvasW * params.canvasH;
      const coverage = textArea / canvasArea;
      metrics.textCoverage = coverage;
      const maxCoverage = priority === 'image_hero' ? 0.28 : priority === 'typography_hero' ? 0.45 : 0.36;
      if (coverage > maxCoverage) {
        score -= 2;
        issues.push('whitespace_crowded');
      }
      // Cluster should have breathing room from subject
      if (subjects.length > 0 && heading?.box) {
        const hb = heading.box;
        let minGap = Infinity;
        for (const s of subjects) {
          const gapX = Math.max(0, Math.max(s.x - (hb.x + hb.width), hb.x - (s.x + s.width)));
          const gapY = Math.max(0, Math.max(s.y - (hb.y + hb.height), hb.y - (s.y + s.height)));
          // If overlapping axes, use the non-overlap axis gap; else hypot
          const overlapsX = hb.x < s.x + s.width && hb.x + hb.width > s.x;
          const overlapsY = hb.y < s.y + s.height && hb.y + hb.height > s.y;
          const gap = overlapsX ? gapY : overlapsY ? gapX : Math.hypot(gapX, gapY);
          minGap = Math.min(minGap, gap);
        }
        metrics.subjectGap = minGap === Infinity ? -1 : minGap;
        const minBreath = Math.min(params.canvasW, params.canvasH) * 0.02;
        if (minGap < minBreath) {
          score -= 1.5;
          issues.push('whitespace_tight_to_subject');
        }
      }
    }

    // --- 7. Visual dominance ---
    // image_hero: photo leads via placement, but heading must still command attention (readable)
    // typography_hero: heading must be large enough to own the frame
    if (priority === 'image_hero' && heading?.fontSize != null) {
      const ideal = params.canvasH * 0.055;
      if (heading.fontSize < ideal * 0.75) {
        score -= 2;
        issues.push('dominance_type_too_weak');
        critical.push('dominance_type_too_weak');
      }
    }
    if (priority === 'typography_hero' && heading?.fontSize != null) {
      const ideal = params.canvasH * 0.07;
      if (heading.fontSize < ideal * 0.85) {
        score -= 2;
        issues.push('dominance_type_underpowered');
      }
    }
    if (params.groupScale != null && params.groupScale < CompositionQualityController.MIN_ACCEPT_SCALE) {
      score -= 2.5;
      issues.push('dominance_over_scaled');
      critical.push('dominance_over_scaled');
      metrics.groupScale = params.groupScale;
    }

    // --- 8. Reading flow ---
    if (heading?.box) {
      const hx = heading.box.x + heading.box.width / 2;
      const hy = heading.box.y + heading.box.height / 2;
      if (flow === 'z_pattern' && hx > params.canvasW * 0.62) {
        score -= 1.5;
        issues.push('reading_flow');
      } else if (flow === 'center_down' || flow === 'center_anchored') {
        // image_hero prefers band placement (top/bottom) — center-X is fine, mid-Y over subject is not
        if (priority !== 'image_hero') {
          const centered = Math.abs(hx - params.canvasW / 2) < params.canvasW * 0.22;
          if (!centered) {
            score -= 1;
            issues.push('reading_flow');
          }
        } else {
          const inBand = hy < params.canvasH * 0.32 || hy > params.canvasH * 0.68;
          if (!inBand) {
            score -= 1.5;
            issues.push('reading_flow_band');
          }
        }
      } else if (flow === 'left_right' && hx > params.canvasW * 0.55) {
        score -= 1.2;
        issues.push('reading_flow');
      }
    }

    // Text-text collisions
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i].box!;
        const b = active[j].box!;
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          score -= 2.5;
          issues.push('text_collision');
          critical.push('text_collision');
        }
      }
    }

    score = Math.max(0, Math.min(10, score));
    const pass = score >= CompositionQualityController.PASS_SCORE && critical.length === 0;
    return { pass, score, issues: [...new Set(issues)], critical: [...new Set(critical)], metrics };
  }

  /** @deprecated Use evaluateVisualQuality — kept for callers during transition */
  public scoreComposition(params: {
    boxes: AllocatedTextBox[];
    constraints: LayoutConstraints;
    canvasW: number;
    canvasH: number;
    subjectBox?: BoundingBox;
    intent?: CompositionIntent;
  }): { score: number; issues: string[] } {
    const result = this.evaluateVisualQuality({
      ...params,
      subjectBoxes: params.subjectBox ? [params.subjectBox] : [],
    });
    return { score: result.score, issues: result.issues };
  }

  public hashRotationIndex(seed: string): number {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0) % 4;
  }

  /**
   * Pick alternate layout IDs when the current arrangement fails visual QC.
   * Preference: same family → same reading flow → different flow — never hardcodes slide coords.
   */
  public suggestAlternateLayouts(
    currentLayoutId: string,
    availableIds: string[],
    intent: CompositionIntent,
    max = 4,
  ): string[] {
    const flow = String(intent.readingFlow || 'center_down');
    const familyHint = intent.family || this.inferFamilyFromLayoutId(currentLayoutId);
    const others = availableIds.filter(id => id !== currentLayoutId);
    const scored = others
      .map(id => {
        let s = 1; // every alternate is eligible — never hardcode slide coords
        if (familyHint && id.toLowerCase().includes(String(familyHint).toLowerCase())) s += 5;
        if (id.includes(flow)) s += 4;
        if (flow === 'center_down' && id.includes('z_pattern')) s += 3;
        if (flow === 'z_pattern' && (id.includes('center_down') || id.includes('center'))) s += 3;
        if (intent.visualPriority === 'image_hero' && (id.includes('hero') || id.includes('editorial') || id.includes('bleed'))) s += 2;
        if (intent.visualPriority === 'typography_hero' && (id.includes('quote') || id.includes('minimal') || id.includes('type'))) s += 2;
        // Prefer a different reading-flow family when current arrangement failed
        if (familyHint && !id.toLowerCase().includes(String(familyHint).toLowerCase())) s += 1;
        return { id, s };
      })
      .sort((a, b) => b.s - a.s);

    return scored.slice(0, max).map(x => x.id);
  }

  private inferFamilyFromLayoutId(id: string): string | null {
    const families = ['editorial', 'minimalist', 'minimal', 'clinical', 'premium', 'scrapbook', 'architectural', 'split', 'luxury', 'vintage'];
    return families.find(f => id.includes(f)) || null;
  }
}
