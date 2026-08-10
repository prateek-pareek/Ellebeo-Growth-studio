import { ICompiledLayoutDSL, IDSLTextLayer, IDSLTextGroupLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine, BoundingBox } from './layout-engine';
import {
  CompositionQualityController,
  ContentBundle,
  ReadingFlow,
  VisualPriority,
} from './composition-quality-controller';

type TypographyMetrics = {
  heroSize?: number;
  primarySize?: number;
  bodySize?: number;
  metadataSize?: number;
};

export interface OptimizeResult {
  dsl: ICompiledLayoutDSL;
  suggestLayoutChange: boolean;
  fitActions: string[];
}

export class CompositionOptimizer {
  private qc = new CompositionQualityController();

  /**
   * Priority-aware composition: allocates boxes using readingFlow + visualPriority,
   * content-aware heights, and the wrap → scale → relocate → layout-change cascade.
   */
  public optimize(
    dsl: ICompiledLayoutDSL,
    constraints: LayoutConstraints,
    canvasW: number,
    canvasHeight: number,
    faceBox?: any,
    visualPriority?: string,
    logoBox?: any,
    typographyMetrics?: TypographyMetrics,
    subjectBox?: BoundingBox,
    readingFlow?: ReadingFlow,
    content?: ContentBundle,
  ): ICompiledLayoutDSL {
    return this.optimizeWithMeta(
      dsl, constraints, canvasW, canvasHeight, faceBox, visualPriority,
      logoBox, typographyMetrics, subjectBox, readingFlow, content,
    ).dsl;
  }

  public optimizeWithMeta(
    dsl: ICompiledLayoutDSL,
    constraints: LayoutConstraints,
    canvasW: number,
    canvasHeight: number,
    faceBox?: any,
    visualPriority?: string,
    logoBox?: any,
    typographyMetrics?: TypographyMetrics,
    subjectBox?: BoundingBox,
    readingFlow?: ReadingFlow,
    content?: ContentBundle,
  ): OptimizeResult {
    let optimized = JSON.parse(JSON.stringify(dsl)) as ICompiledLayoutDSL;
    if (!optimized.layers) return { dsl: optimized, suggestLayoutChange: false, fitActions: [] };

    const priority = (visualPriority || 'image_hero') as VisualPriority;
    const flow = (readingFlow
      || (dsl.id.includes('z_pattern') ? 'z_pattern' : 'center_down')) as ReadingFlow;

    for (const layer of optimized.layers) {
      if (layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        // Prefer anchors that match reading flow instead of pure random
        const preferred = this.preferredAnchorsForFlow(flow, priority, layer.allowedAnchors);
        const pool = preferred.length > 0 ? preferred : layer.allowedAnchors;
        const randomIndex = Math.floor(Math.random() * pool.length);
        (layer as any).anchor = pool[randomIndex];
      }

      if (priority === 'image_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        // Cap as ratio of content — leaves photo dominant
        if (textLayer.maxWidthPercent > 55) textLayer.maxWidthPercent = 55;
      } else if (priority === 'typography_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (!textLayer.maxWidthPercent || textLayer.maxWidthPercent < 70) {
          textLayer.maxWidthPercent = Math.max(textLayer.maxWidthPercent || 0, 72);
        }
      }
    }

    const layoutEngine = new LayoutEngine(canvasW, canvasHeight, faceBox, subjectBox);
    let imageBleedExtent = 'full_bleed';
    if (flow === 'z_pattern' || dsl.id.includes('asymmetrical')) {
      imageBleedExtent = 'asymmetrical_65';
    } else if (dsl.id.includes('split') || flow === 'left_right') {
      imageBleedExtent = 'split_50';
    }

    const regions = layoutEngine.allocateRegions(
      { imageBleedExtent, readingJourney: flow === 'z_pattern' ? 'z_pattern' : 'linear' },
      constraints,
      priority,
    );
    optimized.canvasRegions = regions;

    const roleWeight: Record<string, number> = { heading: 4, tagline: 3, body: 2, footnote: 1, cta: 0 };
    const allTextLayers = optimized.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    const textGroupLayers = optimized.layers.filter(l => l.type === 'text_group') as IDSLTextGroupLayer[];

    let groupedTextLayers = allTextLayers
      .filter(l => l.role !== 'cta' && l.role !== 'footnote')
      .sort((a, b) => (roleWeight[b.role || 'body'] || 0) - (roleWeight[a.role || 'body'] || 0));
    const structuralLayers = allTextLayers.filter(l => l.role === 'cta' || l.role === 'footnote');

    const roleTexts = groupedTextLayers.map(l => ({
      role: l.role || 'body',
      text:
        l.role === 'heading' ? (content?.headline || 'Headline')
          : l.role === 'tagline' ? (content?.subheadline || 'Tagline')
            : (content?.subheadline || content?.headline || 'Body'),
    }));

    const estimated = this.qc.estimateGroupHeight(roleTexts, typographyMetrics, canvasHeight, priority);
    let estimatedHeights: Record<string, number> = {};
    groupedTextLayers.forEach((l, i) => {
      estimatedHeights[l.id] = estimated.heights[i] || estimated.heights[0] || Math.round(canvasHeight * 0.06);
    });
    let totalGroupHeight = estimated.total;
    const clusterGap = estimated.gap;

    const sBox = layoutEngine.getSubjectBox() || layoutEngine.getFaceBox();
    const subjectHaloRatio = 0.04;
    const subjectHalo = Math.round(Math.min(canvasW, canvasHeight) * subjectHaloRatio);

    const obstacles = logoBox ? [logoBox] : [];
    const candidates = layoutEngine.generateCandidateRegions(constraints, obstacles);

    const hitsSubject = (region: BoundingBox, heightNeed: number) => {
      if (!sBox) return false;
      const fx = Math.max(0, sBox.x - subjectHalo);
      const fy = Math.max(0, sBox.y - subjectHalo);
      const fw = sBox.width + subjectHalo * 2;
      const fh = sBox.height + subjectHalo * 2;
      return region.x < fx + fw && region.x + region.width > fx
        && region.y < fy + fh && region.y + heightNeed > fy;
    };

    const fit = this.qc.fitGroupIntoSafeRegions({
      layoutEngine,
      constraints,
      candidates,
      neededHeight: totalGroupHeight,
      preferredWidth: constraints.contentMaxWidth,
      intent: { visualPriority: priority, readingFlow: flow },
      subjectHits: hitsSubject,
    });

    const fitActions = fit.actions.map(a => `${a.stage}:${a.detail}`);
    let groupRegion = fit.region;
    const groupScale = fit.scale;
    const wrapWidthFactor = fit.wrapWidthFactor;

    if (groupScale < 1) {
      for (const id of Object.keys(estimatedHeights)) {
        estimatedHeights[id] = Math.round(estimatedHeights[id] * groupScale);
      }
      totalGroupHeight = Math.round(totalGroupHeight * groupScale);
    }

    // Apply wrap width factor to maxWidthPercent for content-aware wrapping
    if (wrapWidthFactor < 1) {
      for (const layer of groupedTextLayers) {
        const cur = layer.maxWidthPercent || 80;
        layer.maxWidthPercent = Math.max(40, Math.round(cur * wrapWidthFactor));
      }
    }

    if (!groupRegion) {
      // Last-resort pocket above or below subject
      groupRegion = {
        x: constraints.safeX,
        y: constraints.safeY,
        width: Math.round(constraints.contentMaxWidth * wrapWidthFactor),
        height: totalGroupHeight,
      };
      if (sBox && hitsSubject(groupRegion, totalGroupHeight)) {
        const below = sBox.y + sBox.height + subjectHalo;
        if (below + totalGroupHeight < canvasHeight - constraints.margins.bottom) {
          groupRegion.y = below;
        } else {
          groupRegion.y = constraints.safeY;
        }
      }
    }

    let currentY = groupRegion.y;
    const canvasWidth = constraints.safeX * 2 + constraints.contentMaxWidth;
    const family = (dsl as any)?.family || 'minimal';
    const regionWidth = Math.round(groupRegion.width * wrapWidthFactor);

    for (const layer of groupedTextLayers) {
      let x = groupRegion.x;
      let width = Math.min(regionWidth, canvasWidth - constraints.safeX - x);
      x = Math.max(constraints.safeX, x);
      width = Math.max(Math.round(canvasW * 0.28), width);

      let box: BoundingBox = {
        x,
        y: currentY,
        width,
        height: estimatedHeights[layer.id],
      };
      box = layoutEngine.resolveFaceCollision(box, constraints, family);
      // Strict canvas clamp — never clip
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      layer.allocatedBox = box;
      (layer as any)._groupScale = groupScale;
      currentY = box.y + box.height + clusterGap;
    }

    for (const group of textGroupLayers) {
      let box: BoundingBox = {
        x: groupRegion.x,
        y: groupRegion.y,
        width: regionWidth,
        height: Math.min(totalGroupHeight, groupRegion.height || totalGroupHeight),
      };
      box = layoutEngine.resolveFaceCollision(box, constraints, family);
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      group.allocatedBox = box;
      (group as any)._groupScale = groupScale;
      (group as any)._wrapWidthFactor = wrapWidthFactor;
      (group as any)._suggestLayoutChange = fit.suggestLayoutChange;
    }

    for (const layer of structuralLayers) {
      const h = Math.round(canvasHeight * 0.045);
      if (layer.anchor && layer.anchor !== 'bottom_edge' && layer.anchor !== 'corners') {
        let { x, y } = layoutEngine.resolveAnchor(layer.anchor, 0, h, constraints);
        x = Math.max(constraints.safeX, x);
        const width = Math.min(Math.round(canvasW * 0.35), canvasWidth - constraints.safeX - x);
        let box: BoundingBox = { x, y, width, height: h };
        box = layoutEngine.resolveFaceCollision(box, constraints, family);
        layer.allocatedBox = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      } else {
        let x = groupRegion.x;
        x = Math.max(constraints.safeX, x);
        const width = Math.min(regionWidth, canvasWidth - constraints.safeX - x);
        let box: BoundingBox = { x, y: currentY, width, height: h };
        box = layoutEngine.resolveFaceCollision(box, constraints, family);
        layer.allocatedBox = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
        currentY = layer.allocatedBox.y + h + clusterGap;
      }
    }

    // Adaptive QC loop
    let { score, issues } = this.qc.scoreComposition({
      boxes: allTextLayers.map(l => ({ role: l.role, box: l.allocatedBox, omitted: !!(l as any)._omitForComposition })),
      constraints,
      canvasW,
      canvasH: canvasHeight,
      subjectBox: sBox,
      intent: { visualPriority: priority, readingFlow: flow },
    });

    let attempts = 0;
    while (score < 7.0 && attempts < 3) {
      for (const txt of allTextLayers) {
        if (!txt.allocatedBox) continue;
        if (issues.includes('subject_overlap') || issues.includes('canvas_clip')) {
          txt.allocatedBox = layoutEngine.resolveFaceCollision(txt.allocatedBox, constraints, family);
          txt.allocatedBox = this.clampBoxToSafe(txt.allocatedBox, constraints, canvasW, canvasHeight);
        }
        if (issues.includes('hierarchy_inversion') && txt.role === 'tagline' && txt.allocatedBox) {
          txt.allocatedBox.height = Math.round(txt.allocatedBox.height * 0.85);
        }
      }
      const next = this.qc.scoreComposition({
        boxes: allTextLayers.map(l => ({ role: l.role, box: l.allocatedBox })),
        constraints,
        canvasW,
        canvasH: canvasHeight,
        subjectBox: sBox,
        intent: { visualPriority: priority, readingFlow: flow },
      });
      score = next.score;
      issues = next.issues;
      attempts++;
    }

    (optimized as any)._compositionMeta = {
      suggestLayoutChange: fit.suggestLayoutChange,
      fitActions,
      readingFlow: flow,
      visualPriority: priority,
      groupScale,
      wrapWidthFactor,
      qualityScore: score,
    };

    return {
      dsl: optimized,
      suggestLayoutChange: fit.suggestLayoutChange,
      fitActions,
    };
  }

  private preferredAnchorsForFlow(
    flow: ReadingFlow,
    priority: VisualPriority,
    allowed: string[],
  ): string[] {
    const prefer: string[] = [];
    if (flow === 'z_pattern') {
      prefer.push('top_left', 'top_center', 'bottom_right');
    } else if (flow === 'left_right') {
      prefer.push('middle_left', 'center_left', 'top_left');
    } else if (priority === 'image_hero') {
      prefer.push('top_center', 'top_left', 'bottom_center', 'top_right');
    } else if (priority === 'typography_hero') {
      prefer.push('center', 'top_center', 'middle_left');
    } else {
      prefer.push('top_center', 'center');
    }
    return prefer.filter(a => allowed.includes(a as any));
  }

  private clampBoxToSafe(
    box: BoundingBox,
    constraints: LayoutConstraints,
    canvasW: number,
    canvasH: number,
  ): BoundingBox {
    const maxX = canvasW - constraints.safeX;
    const maxY = canvasH - constraints.margins.bottom;
    let { x, y, width, height } = box;
    width = Math.min(width, maxX - constraints.safeX);
    height = Math.min(height, maxY - constraints.safeY);
    x = Math.max(constraints.safeX, Math.min(x, maxX - width));
    y = Math.max(constraints.safeY, Math.min(y, maxY - height));
    return { x, y, width, height };
  }
}
