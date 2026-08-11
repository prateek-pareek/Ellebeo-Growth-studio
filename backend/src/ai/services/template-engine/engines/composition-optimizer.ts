import { ICompiledLayoutDSL, IDSLTextLayer, IDSLTextGroupLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine, BoundingBox, SpatialAllocationPolicy } from './layout-engine';
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
   * Priority-aware composition: spatial allocation FIRST (visualPriority),
   * then typography fitting inside the real text panel.
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
    additionalSubjects?: BoundingBox[],
    spatialPolicy?: SpatialAllocationPolicy,
  ): ICompiledLayoutDSL {
    return this.optimizeWithMeta(
      dsl, constraints, canvasW, canvasHeight, faceBox, visualPriority,
      logoBox, typographyMetrics, subjectBox, readingFlow, content, additionalSubjects,
      spatialPolicy,
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
    additionalSubjects: BoundingBox[] = [],
    spatialPolicy?: SpatialAllocationPolicy,
  ): OptimizeResult {
    let optimized = JSON.parse(JSON.stringify(dsl)) as ICompiledLayoutDSL;
    if (!optimized.layers) return { dsl: optimized, suggestLayoutChange: false, fitActions: [] };

    const priority = (visualPriority || 'image_hero') as VisualPriority;
    const flow = (readingFlow
      || (dsl.id.includes('z_pattern') ? 'z_pattern' : 'center_down')) as ReadingFlow;

    for (const layer of optimized.layers) {
      if (layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        const preferred = this.preferredAnchorsForFlow(flow, priority, layer.allowedAnchors);
        const pool = preferred.length > 0 ? preferred : layer.allowedAnchors;
        (layer as any).anchor = pool[0];
      }

      if (priority === 'image_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (textLayer.maxWidthPercent > 58) textLayer.maxWidthPercent = 58;
      } else if (priority === 'typography_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        // Own the panel — wide measure so hero size does not need crush-to-fit
        textLayer.maxWidthPercent = Math.max(textLayer.maxWidthPercent || 0, 82);
      }
    }

    const layoutEngine = new LayoutEngine(canvasW, canvasHeight, faceBox, subjectBox, additionalSubjects);

    // --- SPATIAL ALLOCATION (before typography fitting) ---
    const behaviorProfile = (optimized as any)?.behavior;
    let policy = spatialPolicy || LayoutEngine.deriveSpatialPolicy(priority, {
      negativeSpaceMultiplier: behaviorProfile?.negativeSpaceMultiplier ?? 1,
      readingFlow: flow,
      density: behaviorProfile?.density,
      whitespace: behaviorProfile?.whitespace
        || (behaviorProfile?.negativeSpaceMultiplier >= 1.5 ? 'airy'
          : behaviorProfile?.negativeSpaceMultiplier <= 0.7 ? 'tight' : 'comfortable'),
    });

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

    // Estimate at FULL intended hero size (scale=1) so space expands first
    const estimated = this.qc.estimateGroupHeight(roleTexts, typographyMetrics, canvasHeight, priority);
    let estimatedHeights: Record<string, number> = {};
    const estimatedFontSizes: Record<string, number> = {};
    groupedTextLayers.forEach((l, i) => {
      estimatedHeights[l.id] = estimated.heights[i] || estimated.heights[0] || Math.round(canvasHeight * 0.06);
      estimatedFontSizes[l.id] = estimated.fontSizes[i] || typographyMetrics?.heroSize || canvasHeight * 0.05;
    });
    let totalGroupHeight = estimated.total;
    const clusterGap = estimated.gap;

    // CTA / subject-present: prefer a real panel so type is not merely enlarged over the photo
    if (!spatialPolicy && (priority === 'cta_hero' || (priority === 'image_hero' && (subjectBox || additionalSubjects.length)))) {
      if (priority === 'cta_hero') {
        policy = {
          ...policy,
          splitAxis: 'vertical',
          textShare: Math.max(policy.textShare, 0.42),
          maxTextShare: Math.max(policy.maxTextShare, 0.58),
          preferredTextBias: 'end',
        };
      }
    }
    const primaryAxis = policy.splitAxis === 'horizontal' ? canvasW : canvasHeight;
    const contentNeedPx = policy.splitAxis === 'horizontal'
      ? totalGroupHeight // still drive vertical need inside column via later fit
      : totalGroupHeight;
    if (policy.splitAxis === 'overlay') {
      policy = LayoutEngine.fitTextShareToContent(policy, totalGroupHeight, canvasHeight);
    } else if (policy.splitAxis === 'vertical') {
      policy = LayoutEngine.fitTextShareToContent(policy, totalGroupHeight, primaryAxis);
    } else {
      // horizontal split: ensure column is wide enough for hero measure
      const neededW = Math.round((typographyMetrics?.heroSize || canvasHeight * 0.08) * 8);
      policy = LayoutEngine.fitTextShareToContent(policy, neededW, canvasW);
    }

    let imageBleedExtent = 'full_bleed';
    if (policy.splitAxis === 'horizontal') {
      imageBleedExtent = 'asymmetrical_65';
    } else if (policy.splitAxis === 'vertical') {
      imageBleedExtent = 'panel_surrender';
    } else if (priority === 'image_hero' || priority === 'cta_hero') {
      imageBleedExtent = 'full_bleed_band';
    }

    const regions = layoutEngine.allocateRegions(
      { imageBleedExtent, readingJourney: flow === 'z_pattern' ? 'z_pattern' : 'linear' },
      constraints,
      priority,
      subjectBox || faceBox,
      policy,
    );
    optimized.canvasRegions = regions;
    optimized.canonicalGeometry = regions.canonicalGeometry;
    (optimized as any)._spatialPolicy = regions.spatial;

    console.log(
      `[SpatialAlloc] priority=${priority} axis=${regions.spatial.splitAxis} ` +
      `textShare=${regions.spatial.textShare.toFixed(2)} ` +
      `textRegion=${Math.round(regions.textRegion.width)}x${Math.round(regions.textRegion.height)} ` +
      `imageRegion=${Math.round(regions.imageRegion.width)}x${Math.round(regions.imageRegion.height)}`,
    );

    const protectedSubjects = layoutEngine.getProtectedSubjects();
    const sBox = layoutEngine.getSubjectBox() || layoutEngine.getFaceBox();
    const subjectHaloRatio = 0.035;
    const subjectHalo = Math.round(Math.min(canvasW, canvasHeight) * subjectHaloRatio);

    const isDedicatedPanel = regions.spatial.splitAxis !== 'overlay'
      && (regions.imageRegion.width < canvasW - 2 || regions.imageRegion.height < canvasHeight - 2);

    const obstacles: BoundingBox[] = logoBox ? [logoBox] : [];
    if (!isDedicatedPanel) {
      const tr = regions.textRegion;
      if (tr.y > constraints.safeY) {
        obstacles.push({ x: 0, y: 0, width: canvasW, height: tr.y });
      }
      const belowY = tr.y + tr.height;
      if (belowY < canvasHeight) {
        obstacles.push({ x: 0, y: belowY, width: canvasW, height: canvasHeight - belowY });
      }
      if (tr.x > 0) {
        obstacles.push({ x: 0, y: tr.y, width: tr.x, height: tr.height });
      }
      if (tr.x + tr.width < canvasW) {
        obstacles.push({
          x: tr.x + tr.width,
          y: tr.y,
          width: canvasW - (tr.x + tr.width),
          height: tr.height,
        });
      }
    }

    let candidates = isDedicatedPanel
      ? [regions.textRegion]
      : layoutEngine.generateCandidateRegions(constraints, obstacles);

    if (!isDedicatedPanel && regions.textRegion) {
      const tr = regions.textRegion;
      const intersecting = candidates.filter(c =>
        c.x < tr.x + tr.width && c.x + c.width > tr.x
        && c.y < tr.y + tr.height && c.y + c.height > tr.y,
      ).map(c => ({
        x: Math.max(c.x, tr.x),
        y: Math.max(c.y, tr.y),
        width: Math.min(c.x + c.width, tr.x + tr.width) - Math.max(c.x, tr.x),
        height: Math.min(c.y + c.height, tr.y + tr.height) - Math.max(c.y, tr.y),
      })).filter(c => c.width >= 100 && c.height >= 60);
      if (intersecting.length > 0) candidates = intersecting;
    }

    const hitsSubject = (region: BoundingBox, heightNeed: number) => {
      if (isDedicatedPanel) return false;
      const subjects = protectedSubjects.length ? protectedSubjects : (sBox ? [sBox] : []);
      if (subjects.length === 0) return false;
      for (const sub of subjects) {
        const fx = Math.max(0, sub.x - subjectHalo);
        const fy = Math.max(0, sub.y - subjectHalo);
        const fw = sub.width + subjectHalo * 2;
        const fh = sub.height + subjectHalo * 2;
        if (region.x < fx + fw && region.x + region.width > fx
          && region.y < fy + fh && region.y + heightNeed > fy) {
          return true;
        }
      }
      return false;
    };

    // typography_hero: preserve intended size — scale is last resort
    const minAcceptScale = priority === 'typography_hero' ? 0.92 : 0.82;

    const fit = this.qc.fitGroupIntoSafeRegions({
      layoutEngine,
      constraints,
      candidates,
      neededHeight: totalGroupHeight,
      preferredWidth: regions.textRegion.width,
      intent: { visualPriority: priority, readingFlow: flow },
      subjectHits: hitsSubject,
      minAcceptScale,
    });

    const fitActions = fit.actions.map(a => `${a.stage}:${a.detail}`);
    let groupRegion = fit.region;
    let groupScale = fit.scale;
    const wrapWidthFactor = fit.wrapWidthFactor;

    // Dedicated panel already fits content → force preserve hero size
    if (isDedicatedPanel && regions.textRegion.height >= totalGroupHeight * 0.95) {
      groupScale = 1;
      groupRegion = {
        x: regions.textRegion.x,
        y: regions.textRegion.y,
        width: regions.textRegion.width,
        height: regions.textRegion.height,
      };
      fitActions.push('spatial:dedicated_panel_preserve_scale=1');
    }

    if (groupScale < 1) {
      for (const id of Object.keys(estimatedHeights)) {
        estimatedHeights[id] = Math.round(estimatedHeights[id] * groupScale);
      }
      totalGroupHeight = Math.round(totalGroupHeight * groupScale);
    }

    if (wrapWidthFactor < 1) {
      for (const layer of groupedTextLayers) {
        const cur = layer.maxWidthPercent || 80;
        layer.maxWidthPercent = Math.max(
          priority === 'typography_hero' ? 55 : 40,
          Math.round(cur * wrapWidthFactor),
        );
      }
    }

    if (!groupRegion) {
      const tr = regions.textRegion;
      groupRegion = {
        x: tr.x,
        y: tr.y,
        width: Math.round(tr.width * wrapWidthFactor),
        height: Math.min(Math.max(totalGroupHeight, tr.height * 0.5), tr.height),
      };
    }

    groupRegion = this.clampBoxToRegion(groupRegion, regions.textRegion);
    // Pass actual text-region dimensions to typography
    groupRegion.width = regions.textRegion.width;
    groupRegion.x = regions.textRegion.x;
    if (isDedicatedPanel || priority === 'typography_hero') {
      groupRegion.height = Math.max(
        groupRegion.height,
        Math.min(totalGroupHeight, regions.textRegion.height),
      );
    }

    let currentY = groupRegion.y;
    const regionWidth = Math.round(groupRegion.width * Math.min(1, wrapWidthFactor));

    for (const layer of groupedTextLayers) {
      let x = groupRegion.x;
      let width = Math.max(Math.round(canvasW * 0.28), Math.min(regionWidth, regions.textRegion.width));
      x = Math.max(regions.textRegion.x, x);

      let box: BoundingBox = {
        x,
        y: currentY,
        width,
        height: estimatedHeights[layer.id],
      };
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      box = this.clampBoxToRegion(box, regions.textRegion);
      layer.allocatedBox = box;
      (layer as any)._groupScale = groupScale;
      (layer as any)._estimatedFontSize = estimatedFontSizes[layer.id] * groupScale;
      (layer as any)._preserveHeroSize = priority === 'typography_hero' && groupScale >= 0.92;
      if (priority === 'cta_hero' && layer.role === 'heading') {
        (layer as any).component = (layer as any).component || 'solid_card';
      }
      currentY = box.y + box.height + clusterGap;
    }

    for (const group of textGroupLayers) {
      let box: BoundingBox = {
        x: groupRegion.x,
        y: groupRegion.y,
        width: regionWidth,
        height: Math.min(Math.max(totalGroupHeight, groupRegion.height * 0.5), regions.textRegion.height),
      };
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      box = this.clampBoxToRegion(box, regions.textRegion);
      group.allocatedBox = box;
      (group as any)._groupScale = groupScale;
      (group as any)._wrapWidthFactor = wrapWidthFactor;
      (group as any)._suggestLayoutChange = fit.suggestLayoutChange;
      (group as any)._preserveHeroSize = priority === 'typography_hero' && groupScale >= 0.92;
    }

    for (const layer of structuralLayers) {
      const h = Math.round(canvasHeight * 0.045);
      let x = Math.max(regions.textRegion.x, groupRegion.x);
      const width = Math.min(regionWidth, regions.textRegion.width);
      let box: BoundingBox = { x, y: currentY, width, height: h };
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      box = this.clampBoxToRegion(box, regions.textRegion);
      layer.allocatedBox = box;
      if (layer.role === 'cta') {
        (layer as any).component = (layer as any).component || 'pill_label';
        (layer as any)._estimatedFontSize = Math.max(
          canvasHeight * 0.028,
          (typographyMetrics?.primarySize || canvasHeight * 0.035) * 0.85,
        );
      }
      currentY = layer.allocatedBox.y + h + clusterGap;
    }

    const quality = this.qc.evaluateVisualQuality({
      boxes: allTextLayers.map(l => ({
        role: l.role,
        box: l.allocatedBox,
        omitted: !!(l as any)._omitForComposition,
        fontSize: (l as any)._estimatedFontSize
          || (l.role === 'heading' ? typographyMetrics?.heroSize : typographyMetrics?.primarySize)
          || canvasHeight * 0.04,
      })),
      constraints,
      canvasW,
      canvasH: canvasHeight,
      subjectBoxes: isDedicatedPanel ? [] : protectedSubjects,
      intent: { visualPriority: priority, readingFlow: flow },
      groupScale,
    });

    // Content integrity: required headline words must survive allocation estimates
    const headlineText = (content?.headline || '').trim();
    const contentIntegrity = this.validateContentIntegrity(
      headlineText,
      groupedTextLayers.find(l => l.role === 'heading'),
      estimatedFontSizes,
      regions.textRegion,
      groupScale,
    );

    // GATE PREDICATE (single source of truth):
    // suggestLayoutChange iff quality fails OR fit found no region OR content truncated
    // OR soft spatial issues require geometry change.
    // Do NOT keep fit.suggestLayoutChange when quality.pass and content is intact
    // unless spatial escalation is needed.
    const fitExhausted = fit.suggestLayoutChange && !fit.region;
    let suggestLayoutChange =
      !quality.pass
      || fitExhausted
      || !contentIntegrity.ok
      || !!quality.needsSpatialEscalation;

    const allFitActions = [...fitActions];
    allFitActions.push(
      `gate:pass=${quality.pass} score=${quality.score.toFixed(1)} ` +
      `threshold=${quality.passThreshold ?? 7.5} ` +
      `critical=[${(quality.critical || []).join(',') || 'none'}] ` +
      `fitExhausted=${fitExhausted} spatialEscalation=${!!quality.needsSpatialEscalation} ` +
      `contentIntegrity=${contentIntegrity.ok ? 'ok' : contentIntegrity.reason}`,
    );

    if (!quality.pass) {
      allFitActions.push(`quality_reject:score=${quality.score.toFixed(1)};issues=${quality.issues.join(',')}`);
      for (const group of textGroupLayers) {
        (group as any)._suggestLayoutChange = true;
      }
      console.warn(
        `[CompositionQC] Visual gate FAILED (score=${quality.score.toFixed(1)} ` +
        `threshold=${quality.passThreshold ?? 7.5} critical=${quality.critical.join('|') || 'none'} ` +
        `issues=${quality.issues.join('|') || 'none'}). Triggering alternate/spatial escalation.`,
      );
    } else if (quality.needsSpatialEscalation) {
      allFitActions.push(`quality_soft_fail:spatial_escalation;issues=${quality.issues.join(',')}`);
      console.warn(
        `[CompositionQC] Score PASSED (${quality.score.toFixed(1)}≥${quality.passThreshold ?? 7.5}) ` +
        `but spatial escalation required (issues=${quality.issues.join(',')}).`,
      );
    } else if (!contentIntegrity.ok) {
      allFitActions.push(`content_integrity_fail:${contentIntegrity.reason}`);
      console.warn(`[CompositionQC] Content integrity FAILED: ${contentIntegrity.reason}`);
    } else {
      allFitActions.push(`quality_pass:score=${quality.score.toFixed(1)}`);
      // Clear stale fit suggestion when quality+content are fine
      suggestLayoutChange = false;
    }

    // Stack heading + supporting copy as one cluster inside the text panel
    this.applyTypographyGroupRhythm(
      groupedTextLayers,
      regions.textRegion,
      clusterGap,
      priority,
    );

    (optimized as any)._compositionMeta = {
      suggestLayoutChange,
      fitActions: allFitActions,
      readingFlow: flow,
      visualPriority: priority,
      groupScale,
      wrapWidthFactor,
      spatial: regions.spatial,
      textRegion: regions.textRegion,
      imageRegion: regions.imageRegion,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
      qualityCritical: quality.critical,
      qualityMetrics: quality.metrics,
      failureCategory: !contentIntegrity.ok
        ? 'renderer'
        : (quality.failureCategory || (suggestLayoutChange ? 'spatial_allocation' : 'none')),
      needsSpatialEscalation: !!quality.needsSpatialEscalation || !contentIntegrity.ok,
      contentIntegrity,
      gatePredicate: {
        pass: quality.pass,
        score: quality.score,
        threshold: quality.passThreshold ?? 7.5,
        fitExhausted,
        needsSpatialEscalation: !!quality.needsSpatialEscalation,
        contentOk: contentIntegrity.ok,
        suggestLayoutChange,
      },
    };

    return {
      dsl: optimized,
      suggestLayoutChange,
      fitActions: allFitActions,
    };
  }

  /**
   * Ensure heading + tagline/body share one vertical rhythm inside the text panel
   * (controlled gaps, no overlapping hierarchy).
   */
  private applyTypographyGroupRhythm(
    layers: IDSLTextLayer[],
    textRegion: BoundingBox,
    clusterGap: number,
    priority: string,
  ): void {
    const heading = layers.find(l => l.role === 'heading' && l.allocatedBox);
    if (!heading?.allocatedBox) return;

    let y = heading.allocatedBox.y + heading.allocatedBox.height;
    const supportGap = Math.max(
      clusterGap,
      Math.round(textRegion.height * (priority === 'typography_hero' ? 0.06 : 0.04)),
    );

    for (const layer of layers) {
      if (layer.role === 'heading' || !layer.allocatedBox) continue;
      if (layer.role !== 'tagline' && layer.role !== 'body') continue;

      const box = layer.allocatedBox;
      const nextY = y + supportGap;
      // Keep support copy inside panel and below heading — never overlap hero
      box.y = Math.min(
        nextY,
        textRegion.y + textRegion.height - box.height,
      );
      box.y = Math.max(box.y, heading.allocatedBox.y + heading.allocatedBox.height + Math.round(supportGap * 0.75));
      box.x = textRegion.x;
      box.width = Math.min(box.width, textRegion.width);
      y = box.y + box.height;
    }
  }

  /**
   * Verify the allocated pocket can hold the full headline (word count / measure),
   * not just the first token.
   */
  private validateContentIntegrity(
    headline: string,
    headingLayer: IDSLTextLayer | undefined,
    fontSizes: Record<string, number>,
    textRegion: BoundingBox,
    groupScale: number,
  ): { ok: boolean; reason?: string; expectedWords?: number; estimableWords?: number } {
    if (!headline) return { ok: true };
    const words = headline.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { ok: true };

    const fontSize = (headingLayer
      ? (fontSizes[headingLayer.id] || (headingLayer as any)._estimatedFontSize)
      : undefined) || textRegion.height * 0.2;
    const scaled = fontSize * (groupScale || 1);
    const avgCharW = scaled * 0.62;
    const maxCharsPerLine = Math.max(4, Math.floor(textRegion.width / Math.max(1, avgCharW)));
    const lineH = scaled * 1.15;
    const maxLines = Math.max(1, Math.floor(textRegion.height / Math.max(1, lineH)));

    // Greedy whole-word pack estimate
    let linesUsed = 1;
    let lineChars = 0;
    let fitted = 0;
    for (const w of words) {
      const need = (lineChars === 0 ? 0 : 1) + w.length;
      if (lineChars + need <= maxCharsPerLine) {
        lineChars += need;
        fitted++;
      } else if (linesUsed < maxLines && w.length <= maxCharsPerLine) {
        linesUsed++;
        lineChars = w.length;
        fitted++;
      } else if (linesUsed < maxLines) {
        // word alone too wide — still count as needing space (integrity fail if we can't fit)
        break;
      } else {
        break;
      }
    }

    if (fitted < words.length) {
      return {
        ok: false,
        reason: `headline_truncated:${fitted}/${words.length}_words fit in ${maxLines}×${maxCharsPerLine}ch pocket`,
        expectedWords: words.length,
        estimableWords: fitted,
      };
    }
    return { ok: true, expectedWords: words.length, estimableWords: fitted };
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

  private clampBoxToRegion(box: BoundingBox, region: BoundingBox): BoundingBox {
    const maxX = region.x + region.width;
    const maxY = region.y + region.height;
    let { x, y, width, height } = box;
    width = Math.min(width, region.width);
    height = Math.min(height, region.height);
    x = Math.max(region.x, Math.min(x, maxX - width));
    y = Math.max(region.y, Math.min(y, maxY - height));
    return { x, y, width, height };
  }
}
