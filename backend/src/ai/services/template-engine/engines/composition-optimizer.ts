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

export interface ITextCopyHint {
  headline?: string;
  subheadline?: string;
  cta?: string;
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
    additionalSubjects?: BoundingBox[],
  ): ICompiledLayoutDSL {
    return this.optimizeWithMeta(
      dsl, constraints, canvasW, canvasHeight, faceBox, visualPriority,
      logoBox, typographyMetrics, subjectBox, readingFlow, content, additionalSubjects,
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
        // Deterministic: first preferred — never Math.random (was fighting QC placement)
        (layer as any).anchor = pool[0];
      }

      // image_hero: slightly narrower text so photo dominates — type stays large
      if (priority === 'image_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (textLayer.maxWidthPercent > 58) textLayer.maxWidthPercent = 58;
      } else if (priority === 'typography_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (!textLayer.maxWidthPercent || textLayer.maxWidthPercent < 70) {
          textLayer.maxWidthPercent = Math.max(textLayer.maxWidthPercent || 0, 72);
        }
      }
    }

    const layoutEngine = new LayoutEngine(canvasW, canvasHeight, faceBox, subjectBox, additionalSubjects);
    let imageBleedExtent = 'full_bleed';
    if (flow === 'z_pattern' || dsl.id.includes('asymmetrical')) {
      imageBleedExtent = 'asymmetrical_65';
    } else if (dsl.id.includes('split') || flow === 'left_right') {
      imageBleedExtent = 'split_50';
    } else if (priority === 'image_hero' || priority === 'cta_hero') {
      // Keep photo full-bleed but allocate a dedicated text band (top/bottom)
      imageBleedExtent = 'full_bleed_band';
    }

    const regions = layoutEngine.allocateRegions(
      { imageBleedExtent, readingJourney: flow === 'z_pattern' ? 'z_pattern' : 'linear' },
      constraints,
      priority,
      subjectBox || faceBox,
    );
    optimized.canvasRegions = regions;

    const roleWeight: Record<string, number> = { heading: 4, tagline: 3, body: 2, footnote: 1, cta: 0 };

    let currentYOffset = regions.textRegion.y;

    // Visual Weight Sorting: Sort text layers by dominance (Heading -> Tagline -> Body -> CTA)
    const sortedTextLayers = optimized.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    sortedTextLayers.sort((a, b) => (roleWeight[b.role || 'body'] || 0) - (roleWeight[a.role || 'body'] || 0));

    let headingBox: any = null;
    const behaviorProfile: any = (optimized as any)?.behavior;

    for (const txtLayer of sortedTextLayers) {
      const fallbackHeight = txtLayer.role === 'heading' ? 300 : txtLayer.role === 'body' ? 180 : 120;
      const fontSizeForRole = txtLayer.role === 'heading'
        ? (behaviorProfile?.heroBaseFontSize || 100)
        : txtLayer.role === 'body'
          ? (behaviorProfile?.bodyBaseFontSize || 32)
          : (behaviorProfile?.metadataBaseFontSize || 24);
      const maxWidthPx = regions.textRegion.width * ((txtLayer.maxWidthPercent || 100) / 100);
      let estimatedHeight = this.estimateTextBlockHeight(
        this.copyForRole(txtLayer.role, content),
        fontSizeForRole,
        maxWidthPx,
        fallbackHeight
      );

      let targetRegion: any = regions.textRegion;
      let x = 0, y = 0;

      // If this is a secondary element and we have a heading, cluster it
      if (headingBox && txtLayer.role !== 'heading' && !txtLayer.anchor?.includes('bottom_edge')) {
        // Cluster relative to heading
        x = headingBox.x;
        // Stack below the heading
        y = headingBox.y + headingBox.height + 20;

        // If the heading was centered, keep this centered
        if (txtLayer.anchor === 'center' || txtLayer.anchor?.includes('center')) {
          // Leave x as is, TypograpyEngine handles center text-anchor internally
        }
      } else {
        // Primary placement (Heading) using Semantic Whitespace Topology
        const anchorResult = layoutEngine.resolveAnchor(
          txtLayer.anchor || 'middle_left',
          0,
          estimatedHeight,
          constraints,
          targetRegion
        );
        x = anchorResult.x;
        y = anchorResult.y;
      }

      // Allocate strict bounding box inside textRegion
      txtLayer.allocatedBox = {
        x,
        y,
        width: regions.textRegion.width,
        height: estimatedHeight
      };

      const family = (dsl as any).id?.split('_')[0] || 'minimal';
      const originalY = txtLayer.allocatedBox.y;
      txtLayer.allocatedBox = layoutEngine.resolveFaceCollision(txtLayer.allocatedBox, constraints, family as any);
      
      if (txtLayer.allocatedBox.y !== originalY) {
        console.log(`[CompositionOptimizer] Text collision detected with face box! Moved '${txtLayer.role}' text from Y=${originalY} to Y=${txtLayer.allocatedBox.y}`);
      }

      if (txtLayer.role === 'heading') {
        headingBox = txtLayer.allocatedBox;
      }
    }

    // Balance Checks: Is whitespace balanced? Does the headline overpower?
    // (This is a simplified optimization pass that adjusts properties based on semantic rules)
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
    const estimatedFontSizes: Record<string, number> = {};
    groupedTextLayers.forEach((l, i) => {
      estimatedHeights[l.id] = estimated.heights[i] || estimated.heights[0] || Math.round(canvasHeight * 0.06);
      estimatedFontSizes[l.id] = estimated.fontSizes[i] || typographyMetrics?.heroSize || canvasHeight * 0.05;
    });
    let totalGroupHeight = estimated.total;
    const clusterGap = estimated.gap;

    const protectedSubjects = layoutEngine.getProtectedSubjects();
    const sBox = layoutEngine.getSubjectBox() || layoutEngine.getFaceBox();
    const subjectHaloRatio = 0.035;
    const subjectHalo = Math.round(Math.min(canvasW, canvasHeight) * subjectHaloRatio);

    // Obstacles: logo + protected subjects + photo core when text has a dedicated band/panel
    const obstacles: BoundingBox[] = logoBox ? [logoBox] : [];
    const textPanelDistinct =
      regions.textRegion
      && (regions.imageRegion.width < canvasW - 2
        || regions.textRegion.height < canvasHeight * 0.55);

    if (textPanelDistinct) {
      // Treat everything outside the text band as an obstacle so candidates stay in negative space
      const tr = regions.textRegion;
      // Top strip above text band
      if (tr.y > constraints.safeY) {
        obstacles.push({ x: 0, y: 0, width: canvasW, height: tr.y });
      }
      // Bottom strip below text band
      const belowY = tr.y + tr.height;
      if (belowY < canvasHeight) {
        obstacles.push({ x: 0, y: belowY, width: canvasW, height: canvasHeight - belowY });
      }
      // Side strips outside text band
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

    let candidates = layoutEngine.generateCandidateRegions(constraints, obstacles);
    // Prefer candidates that intersect the dedicated text region
    if (regions.textRegion) {
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
      // Last resort: use dedicated textRegion band (never random mid-photo)
      const tr = regions.textRegion;
      groupRegion = {
        x: tr?.x ?? constraints.safeX,
        y: tr?.y ?? constraints.safeY,
        width: Math.round((tr?.width ?? constraints.contentMaxWidth) * wrapWidthFactor),
        height: Math.min(totalGroupHeight, tr?.height ?? totalGroupHeight),
      };
      if (sBox && hitsSubject(groupRegion, totalGroupHeight) && tr) {
        // Flip to opposite band if subject occupies preferred band
        const altY = tr.y < canvasHeight / 2
          ? Math.max(constraints.safeY, canvasHeight - constraints.margins.bottom - totalGroupHeight)
          : constraints.safeY;
        groupRegion.y = altY;
      }
    }

    // Clamp group into textRegion if present
    if (regions.textRegion && groupRegion) {
      const tr = regions.textRegion;
      groupRegion = {
        x: Math.max(tr.x, Math.min(groupRegion.x, tr.x + tr.width - Math.min(groupRegion.width, tr.width))),
        y: Math.max(tr.y, Math.min(groupRegion.y, tr.y + tr.height - Math.min(groupRegion.height, tr.height))),
        width: Math.min(groupRegion.width, tr.width),
        height: Math.min(groupRegion.height || totalGroupHeight, tr.height),
      };
    }

    let currentY = groupRegion.y;
    const canvasWidth = constraints.safeX * 2 + constraints.contentMaxWidth;
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
      // Stay inside the chosen pocket — do NOT face-nudge out of allocated negative space
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      if (regions.textRegion) {
        box = this.clampBoxToRegion(box, regions.textRegion);
      }
      layer.allocatedBox = box;
      (layer as any)._groupScale = groupScale;
      (layer as any)._estimatedFontSize = estimatedFontSizes[layer.id] * groupScale;
      // CTA / last-slide contrast: card behind text when over photo
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
        height: Math.min(totalGroupHeight, groupRegion.height || totalGroupHeight),
      };
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      if (regions.textRegion) {
        box = this.clampBoxToRegion(box, regions.textRegion);
      }
      group.allocatedBox = box;
      (group as any)._groupScale = groupScale;
      (group as any)._wrapWidthFactor = wrapWidthFactor;
      (group as any)._suggestLayoutChange = fit.suggestLayoutChange;
    }

    for (const layer of structuralLayers) {
      const h = Math.round(canvasHeight * 0.045);
      // Stack from the text cluster — do not re-resolve random anchors
      let x = groupRegion.x;
      x = Math.max(constraints.safeX, x);
      const width = Math.min(regionWidth, canvasWidth - constraints.safeX - x);
      let box: BoundingBox = { x, y: currentY, width, height: h };
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      if (regions.textRegion) {
        box = this.clampBoxToRegion(box, regions.textRegion);
      }
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

    // Final VISUAL QUALITY gate — geometric fit alone is not acceptance
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
      subjectBoxes: protectedSubjects,
      intent: { visualPriority: priority, readingFlow: flow },
      groupScale,
    });

    let suggestLayoutChange = fit.suggestLayoutChange || !groupRegion;
    const allFitActions = [...fitActions];

    if (!quality.pass) {
      allFitActions.push(`quality_reject:score=${quality.score.toFixed(1)};issues=${quality.issues.join(',')}`);
      // Do not auto-accept a geometrically packed but visually weak result
      suggestLayoutChange = true;
      for (const group of textGroupLayers) {
        (group as any)._suggestLayoutChange = true;
      }
      console.warn(
        `[CompositionQC] Visual gate FAILED (score=${quality.score.toFixed(1)}). ` +
        `Critical=${quality.critical.join('|') || 'none'} Issues=${quality.issues.join('|')}. Triggering alternate layout.`,
      );
    } else {
      allFitActions.push(`quality_pass:score=${quality.score.toFixed(1)}`);
    }

    (optimized as any)._compositionMeta = {
      suggestLayoutChange,
      fitActions: allFitActions,
      readingFlow: flow,
      visualPriority: priority,
      groupScale,
      wrapWidthFactor,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
      qualityCritical: quality.critical,
      qualityMetrics: quality.metrics,
    };

    return {
      dsl: optimized,
      suggestLayoutChange,
      fitActions: allFitActions,
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

  private copyForRole(role: string | undefined, copy?: ITextCopyHint): string | undefined {
    if (!copy) return undefined;
    if (role === 'heading') return copy.headline;
    if (role === 'tagline' || role === 'body') return copy.subheadline;
    if (role === 'footnote' || role === 'watermark') return copy.cta;
    return undefined;
  }

  private estimateTextBlockHeight(text: string | undefined, fontSize: number, maxWidthPx: number, fallback: number): number {
    if (!text || !fontSize || !maxWidthPx) return fallback;
    const avgCharWidth = fontSize * 0.58;
    const charsPerLine = Math.max(1, Math.floor(maxWidthPx / avgCharWidth));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    const lineHeight = fontSize * 1.15;
    return Math.round(lines * lineHeight + fontSize * 0.4);
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
