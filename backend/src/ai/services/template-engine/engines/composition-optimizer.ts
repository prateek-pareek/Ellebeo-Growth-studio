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

    // Copy-length discipline: keep headline/tagline inside template band capacity
    const trimmedContent: ContentBundle = {
      headline: this.clampCopyWords(content?.headline, priority === 'typography_hero' ? 12 : 10),
      subheadline: this.clampCopyWords(content?.subheadline, priority === 'image_hero' ? 14 : 18),
      cta: this.clampCopyWords(content?.cta, 5),
    };
    content = trimmedContent;

    for (const layer of optimized.layers) {
      // Template slot is a starting idea — cleanliness may move type off it.
      if (!(layer as any)._templateAnchor) {
        (layer as any)._templateAnchor = (layer as any).anchor
          || (layer.allowedAnchors && layer.allowedAnchors[0])
          || undefined;
      }
      if (!(layer as any).anchor && layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        (layer as any).anchor = layer.allowedAnchors[0];
      }

      // Honor template maxWidthPercent — do NOT crush recipe measure (58% broke
      // circle/split width accuracy). Soft-clamp only extreme outliers.
      if (layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        const recipeW = Number(textLayer.maxWidthPercent) || 80;
        if (priority === 'typography_hero') {
          textLayer.maxWidthPercent = Math.min(92, Math.max(recipeW, 78));
        } else {
          textLayer.maxWidthPercent = Math.min(92, Math.max(32, recipeW));
        }
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

    // Template seeds the photo treatment (overlay / circle / split). Type may move
    // for a clean readable slide — do not treat recipe boxes as a hard lock.
    policy = LayoutEngine.seedPolicyFromTemplate(optimized, policy);

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

    // Estimate using recipe measure width so early heights match real slots
    const recipeMeasureW = Math.round(
      canvasW * (Math.max(32, Math.min(92, Number(groupedTextLayers[0]?.maxWidthPercent) || 80)) / 100),
    );
    const estimated = this.qc.estimateGroupHeight(
      roleTexts,
      typographyMetrics,
      canvasHeight,
      priority,
      recipeMeasureW,
    );
    let estimatedHeights: Record<string, number> = {};
    const estimatedFontSizes: Record<string, number> = {};
    groupedTextLayers.forEach((l, i) => {
      estimatedHeights[l.id] = estimated.heights[i] || estimated.heights[0] || Math.round(canvasHeight * 0.06);
      estimatedFontSizes[l.id] = estimated.fontSizes[i] || typographyMetrics?.heroSize || canvasHeight * 0.05;
    });
    let totalGroupHeight = estimated.total;
    const clusterGap = estimated.gap;

    // CTA prefers a real panel ONLY when the template already allows a split axis
    if (!spatialPolicy && priority === 'cta_hero' && policy.splitAxis !== 'overlay') {
      policy = {
        ...policy,
        splitAxis: 'vertical',
        textShare: Math.max(policy.textShare, 0.42),
        maxTextShare: Math.max(policy.maxTextShare, 0.58),
        preferredTextBias: 'end',
      };
      policy = LayoutEngine.seedPolicyFromTemplate(optimized, policy);
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
    const subjectHaloRatio = 0.07;
    const subjectHalo = Math.round(Math.min(canvasW, canvasHeight) * subjectHaloRatio);

    const isDedicatedPanel = regions.spatial.splitAxis !== 'overlay'
      && (regions.imageRegion.width < canvasW - 2 || regions.imageRegion.height < canvasHeight - 2);

    const obstacles: BoundingBox[] = logoBox ? [logoBox] : [];
    // Reserve bottom footer bar so headlines never collide with brand tracker
    obstacles.push({
      x: 0,
      y: canvasHeight - 80,
      width: canvasW,
      height: 80,
      role: 'obstacle',
    } as any);

    // Inset / circle / arch photos occupy real pixels — treat as obstacles so
    // headline anchors cannot sit on top of the mask (FLAWLESS-over-circle bug).
    const imageOccupied = this.estimateImageOccupiedBox(
      optimized.layers?.find((l: any) => l.type === 'image') as any,
      canvasW,
      canvasHeight,
    );
    // For before/after stitches: keep heading in the top/before band only — never over the after face
    if (imageOccupied) {
      const mask = String(
        (optimized.layers?.find((l: any) => l.type === 'image') as any)?.mask || '',
      );
      const isInsetMask = mask === 'circle' || mask === 'arch' || mask === 'polaroid'
        || (mask === 'rectangle' && Number((optimized.layers?.find((l: any) => l.type === 'image') as any)?.paddingPercent || 0) > 2);
      const isBA = mask === 'before_after_split';
      if (isBA) {
        const orientation = String(
          (optimized.layers?.find((l: any) => l.type === 'image') as any)?.orientation || 'vertical',
        );
        const afterZone: BoundingBox = orientation === 'horizontal'
          ? { x: 0, y: Math.round(canvasHeight * 0.48), width: canvasW, height: Math.round(canvasHeight * 0.52) }
          : { x: Math.round(canvasW * 0.48), y: 0, width: Math.round(canvasW * 0.52), height: canvasHeight };
        obstacles.push(afterZone);
        regions.textRegion = orientation === 'horizontal'
          ? {
            x: constraints.safeX,
            y: constraints.safeY,
            width: canvasW - constraints.safeX * 2,
            height: Math.max(120, Math.round(canvasHeight * 0.42) - constraints.safeY),
          }
          : {
            x: constraints.safeX,
            y: constraints.safeY,
            width: Math.max(140, Math.round(canvasW * 0.42) - constraints.safeX),
            height: canvasHeight - constraints.safeY - 90,
          };
        if (optimized.canvasRegions) optimized.canvasRegions.textRegion = regions.textRegion;
      } else if (isInsetMask || regions.spatial.splitAxis === 'overlay') {
        obstacles.push(imageOccupied);
      }
    }

    // Face / subject mass is a HARD obstacle. Overlay keeps the full recipe frame
    // and dodges in placeLayerBox so template anchors are not collapsed to a band.
    if (!isDedicatedPanel && sBox) {
      const faceObstacle: BoundingBox = {
        x: Math.max(0, sBox.x - subjectHalo),
        y: Math.max(0, sBox.y - subjectHalo),
        width: Math.min(canvasW, sBox.width + subjectHalo * 2),
        height: Math.min(canvasHeight, sBox.height + subjectHalo * 2),
      };
      obstacles.push(faceObstacle);
      if (regions.spatial.splitAxis !== 'overlay') {
        const carvedFace = this.carveBoxAroundObstacle(regions.textRegion, faceObstacle);
        if (carvedFace && carvedFace.width >= 100 && carvedFace.height >= 60) {
          regions.textRegion = carvedFace;
          if (optimized.canvasRegions) optimized.canvasRegions.textRegion = carvedFace;
        }
      }
    }
    for (const sub of protectedSubjects) {
      if (!isDedicatedPanel) {
        obstacles.push({
          x: Math.max(0, sub.x - subjectHalo),
          y: Math.max(0, sub.y - subjectHalo),
          width: sub.width + subjectHalo * 2,
          height: sub.height + subjectHalo * 2,
        });
      }
    }

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

    // Full safe frame for template-accurate anchors (bottom_center = bottom of canvas,
    // not bottom of a carved side pocket beside a circle).
    const fullSafe: BoundingBox = {
      x: constraints.safeX,
      y: constraints.safeY,
      width: Math.max(120, canvasW - constraints.safeX * 2),
      height: Math.max(80, canvasHeight - constraints.safeY - constraints.margins.bottom),
    };

    const recipeTextWidth = (layer: IDSLTextLayer) => {
      // Template slot width = recipe maxWidthPercent of canvas, then clamp to safe band
      const pct = Math.max(28, Math.min(92, Number(layer.maxWidthPercent) || 80));
      let w = Math.round(canvasW * (pct / 100));
      const bandW = Math.max(
        Math.round(canvasW * 0.28),
        Math.min(regions.textRegion.width, fullSafe.width),
      );
      w = Math.min(w, bandW);
      // Slight gutter so glyphs never kiss the slot edge
      w = Math.max(Math.round(canvasW * 0.28), w - Math.round(canvasW * 0.02));
      return w;
    };

    /**
     * Fit copy into the template slot using Brand DNA / geometry metrics as the size base.
     * Widen/hug the box for long/short copy; only shrink type when the slot cannot hold it.
     */
    const adaptLayerToSlot = (layer: IDSLTextLayer, box: BoundingBox) => {
      const text =
        layer.role === 'heading' ? (content?.headline || '')
          : layer.role === 'tagline' ? (content?.subheadline || '')
            : (content?.subheadline || content?.headline || '');
      if (!text.trim()) {
        (layer as any)._estimatedFontSize = estimatedFontSizes[layer.id] * groupScale;
        return box;
      }

      const isHeading = layer.role === 'heading';
      const lh = isHeading ? 1.16 : 1.28;
      const maxLines = isHeading ? 5 : 3;
      const charRatio = 0.80;
      const words = text.trim().split(/\s+/).filter(Boolean);
      const chars = text.replace(/\s+/g, '').length;
      const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), '');
      const isLong = chars > 22 || words.length > 5 || longest.length > 10;
      const isShort = chars <= 14 && words.length <= 3;

      // Max width from recipe slot — prefer template maxWidth over inventing a band
      const recipeW = recipeTextWidth(layer);
      const maxW = Math.min(
        fullSafe.width,
        Math.max(box.width, recipeW, Math.round(canvasW * (isLong ? 0.84 : 0.70))),
      );
      const minW = Math.round(canvasW * (isHeading ? 0.30 : 0.26));

      // Height budget: prefer expanding into free band over crushing type
      const footerClear = Math.max(constraints.margins.bottom, 88);
      const bandBottom = Math.min(
        fullSafe.y + fullSafe.height,
        canvasHeight - footerClear,
        regions.textRegion.y + regions.textRegion.height,
      );
      const maxH = Math.max(
        box.height,
        Math.min(
          Math.round(canvasHeight * (isHeading ? 0.30 : 0.15)),
          Math.max(48, bandBottom - box.y),
        ),
      );

      let width = Math.min(Math.max(box.width, recipeW), maxW);
      // Brand DNA / geometry metrics are the base; adapt only fits into the slot
      const metricsBase = isHeading
        ? (typographyMetrics?.heroSize || estimatedFontSizes[layer.id] || canvasHeight * 0.055)
        : (layer.role === 'tagline' || layer.role === 'cta'
          ? (typographyMetrics?.primarySize || estimatedFontSizes[layer.id] || canvasHeight * 0.03)
          : (typographyMetrics?.bodySize || estimatedFontSizes[layer.id] || canvasHeight * 0.022));
      const pickSize = (w: number) => this.qc.adaptFontSizeToContent(
        metricsBase * groupScale,
        text,
        layer.role || 'body',
        canvasHeight,
        w,
        priority,
      );
      let fontPx = pickSize(width);
      const markPreserve = (size: number) => {
        // Keep DNA size when we stayed near metrics (fit shrink < 15%)
        (layer as any)._preserveHeroSize = isHeading && size >= metricsBase * groupScale * 0.85;
      };

      const measure = (size: number, w: number) => {
        const cpl = Math.max(4, Math.floor((w * 0.96) / Math.max(1, size * charRatio)));
        let lines = Math.max(1, Math.ceil(words.reduce((n, word) => n + word.length + 1, 0) / cpl));
        if (longest.length > cpl) lines = Math.max(lines, words.length);
        lines = Math.min(maxLines, Math.max(1, lines));
        if (isLong && isHeading && lines === 1 && words.length >= 3) {
          lines = Math.min(maxLines, 2);
        }
        if (isShort && isHeading && words.length <= 2 && text.length <= cpl) {
          lines = 1;
        }
        const needH = Math.round(size * lh * lines);
        const needW = Math.ceil(Math.min(Math.max(longest.length, Math.ceil(chars / Math.max(1, lines))), cpl) * size * charRatio);
        return { lines, needH, needW, cpl };
      };

      // --- LONG: widen first, re-pick size for new width, shrink only if height overflows ---
      if (isLong) {
        width = maxW;
        fontPx = pickSize(width);
        const anchor = String(layer.anchor || '');
        if (anchor.includes('center') || (layer as any).alignment === 'center') {
          box = {
            ...box,
            width,
            x: Math.max(constraints.safeX, Math.round((canvasW - width) / 2)),
          };
        } else {
          box = { ...box, width };
        }

        let m = measure(fontPx, width);
        let guard = 0;
        const floorPx = Math.max(
          canvasHeight * (isHeading ? 0.036 : 0.02),
          metricsBase * groupScale * 0.72,
        );
        while (m.needH > maxH && fontPx > floorPx && guard < 12) {
          fontPx = Math.floor(fontPx * 0.94);
          m = measure(fontPx, width);
          guard++;
        }
        // Extra air under long lines so the text pocket doesn't feel crushed
        const height = Math.min(maxH, Math.max(box.height, m.needH + Math.round(fontPx * 0.22)));
        (layer as any)._estimatedFontSize = Math.round(fontPx);
        (layer as any)._fittedLineCount = m.lines;
        (layer as any)._copyBalance = 'long';
        markPreserve(fontPx);
        return { ...box, width, height };
      }

      // --- SHORT: keep DNA size; hug width with clean even padding (template card feel) ---
      if (isShort && isHeading) {
        fontPx = pickSize(width);
        // Cap any short bump at DNA ceiling — do not invent a larger display size
        fontPx = Math.min(fontPx, metricsBase * groupScale * 1.08);
        let m = measure(fontPx, width);
        const pad = Math.round(fontPx * 0.55);
        const huggedW = Math.min(
          maxW,
          Math.max(minW, Math.round(m.needW + pad * 2)),
        );
        const height = Math.min(
          maxH,
          Math.max(m.needH + Math.round(fontPx * 0.28), Math.round(fontPx * lh * m.lines + fontPx * 0.12)),
        );
        const recipeA = String((layer as any)._templateAnchor || layer.anchor || '');
        const x = recipeA.includes('center') || recipeA === 'center'
          ? Math.max(constraints.safeX, Math.round(box.x + (box.width - huggedW) / 2))
          : Math.max(constraints.safeX, box.x);
        (layer as any)._estimatedFontSize = Math.round(fontPx);
        (layer as any)._fittedLineCount = m.lines;
        (layer as any)._copyBalance = 'short';
        markPreserve(fontPx);
        return { x, y: box.y, width: huggedW, height };
      }

      // --- MEDIUM: DNA size + modest height fit ---
      fontPx = pickSize(width);
      let m = measure(fontPx, width);
      let guard = 0;
      const floorPx = Math.max(
        canvasHeight * (isHeading ? 0.036 : 0.02),
        metricsBase * groupScale * 0.72,
      );
      while (m.needH > maxH && fontPx > floorPx && guard < 10) {
        fontPx = Math.floor(fontPx * 0.94);
        m = measure(fontPx, width);
        guard++;
      }
      const height = Math.min(maxH, Math.max(box.height, m.needH + Math.round(fontPx * 0.22)));
      const anchor = String(layer.anchor || '');
      if (anchor.includes('center') || (layer as any).alignment === 'center') {
        box = {
          ...box,
          width,
          x: Math.max(constraints.safeX, Math.round((canvasW - width) / 2)),
          height,
        };
      } else {
        box = { ...box, width, height };
      }
      (layer as any)._estimatedFontSize = Math.round(fontPx);
      (layer as any)._fittedLineCount = m.lines;
      (layer as any)._copyBalance = 'medium';
      markPreserve(fontPx);
      return box;
    };

    const placeLayerBox = (
      layer: IDSLTextLayer,
      width: number,
      boxH: number,
      fallbackAnchor: string,
    ): BoundingBox => {
      const recipeAnchor = String((layer as any)._templateAnchor || layer.anchor || fallbackAnchor);
      const placeRegion = regions.spatial.splitAxis === 'overlay' ? fullSafe : regions.textRegion;
      let pos = layoutEngine.resolveAnchor(recipeAnchor, width, boxH, constraints, placeRegion);
      let box: BoundingBox = { x: pos.x, y: pos.y, width, height: boxH };

      const overlapsBox = (a: BoundingBox, b: BoundingBox) =>
        a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;

      const dodge = (obstacle: BoundingBox | null | undefined) => {
        if (!obstacle) return;
        if (!overlapsBox(box, obstacle)) return;
        const free = this.carveBoxAroundObstacle(fullSafe, obstacle, recipeAnchor);
        if (free && free.width >= 100 && free.height >= Math.min(60, boxH)) {
          pos = layoutEngine.resolveAnchor(
            recipeAnchor,
            Math.min(width, free.width),
            Math.min(boxH, free.height),
            constraints,
            free,
          );
          box = {
            x: pos.x,
            y: pos.y,
            width: Math.min(width, free.width),
            height: Math.min(boxH, Math.max(boxH, Math.round(free.height * 0.5))),
          };
          if (free.height >= boxH) box.height = boxH;
        }
      };

      dodge(imageOccupied);
      if (sBox) {
        dodge({
          x: Math.max(0, sBox.x - subjectHalo),
          y: Math.max(0, sBox.y - subjectHalo),
          width: sBox.width + subjectHalo * 2,
          height: sBox.height + subjectHalo * 2,
        });
      }
      for (const sub of protectedSubjects) {
        dodge({
          x: Math.max(0, sub.x - subjectHalo),
          y: Math.max(0, sub.y - subjectHalo),
          width: sub.width + subjectHalo * 2,
          height: sub.height + subjectHalo * 2,
        });
      }

      (layer as any).anchor = recipeAnchor;
      box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
      box = this.clampBoxToRegion(
        box,
        regions.spatial.splitAxis === 'overlay' ? fullSafe : regions.textRegion,
      );
      return box;
    };

    // Always resolve from recipe anchors. Stack only when a dedicated panel has
    // all text in the same vertical band (one reading column).
    const verticalZone = (anchor: string) => {
      const a = String(anchor || 'center');
      if (a.includes('top')) return 'top';
      if (a.includes('bottom')) return 'bottom';
      return 'middle';
    };
    const stackInPanel =
      isDedicatedPanel
      && new Set(groupedTextLayers.map(l => verticalZone(String(l.anchor || 'top')))).size <= 1;
    const usePerLayerAnchors = !stackInPanel;

    if (usePerLayerAnchors) {
      for (const layer of groupedTextLayers) {
        const width = recipeTextWidth(layer);
        let boxH = estimatedHeights[layer.id];
        if (priority === 'typography_hero' && layer.role === 'heading') {
          boxH = Math.max(
            boxH,
            Math.round((typographyMetrics?.heroSize || canvasHeight * 0.08) * 2.6),
          );
          boxH = Math.min(boxH, Math.round(canvasHeight * (isDedicatedPanel ? 0.45 : 0.28)));
        }
        let box = placeLayerBox(layer, width, boxH, 'center');
        box = adaptLayerToSlot(layer, box);
        box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
        box = this.clampBoxToRegion(
          box,
          regions.spatial.splitAxis === 'overlay' ? fullSafe : regions.textRegion,
        );
        const circleDisk = ['circle', 'arch', 'polaroid'].includes(
          String((optimized.layers?.find((l: any) => l.type === 'image') as any)?.mask || ''),
        );
        box = this.forceClearSubject(
          box,
          [
            ...(sBox ? [{
              x: Math.max(0, sBox.x - subjectHalo),
              y: Math.max(0, sBox.y - subjectHalo),
              width: sBox.width + subjectHalo * 2,
              height: sBox.height + subjectHalo * 2,
            }] : []),
            ...protectedSubjects.map(sub => ({
              x: Math.max(0, sub.x - subjectHalo),
              y: Math.max(0, sub.y - subjectHalo),
              width: sub.width + subjectHalo * 2,
              height: sub.height + subjectHalo * 2,
            })),
            ...(circleDisk && imageOccupied ? [imageOccupied] : []),
          ],
          fullSafe,
          constraints,
          canvasW,
          canvasHeight,
        );
        layer.allocatedBox = box;
        (layer as any)._groupScale = groupScale;
        (layer as any)._textRegion = isDedicatedPanel ? regions.textRegion : fullSafe;
        (layer as any)._templateAnchor = layer.anchor;
        currentY = box.y + box.height + clusterGap;
      }
    } else {
      for (const layer of groupedTextLayers) {
        const width = recipeTextWidth(layer);
        let boxH = estimatedHeights[layer.id];
        if (priority === 'typography_hero' && layer.role === 'heading') {
          const supportReserve = Math.round(regions.textRegion.height * 0.28);
          boxH = Math.max(
            boxH,
            Math.round(regions.textRegion.height * 0.55),
            Math.min(regions.textRegion.height - supportReserve, Math.round((typographyMetrics?.heroSize || canvasHeight * 0.1) * 2.4)),
          );
        }
        const pos = layoutEngine.resolveAnchor(
          String(layer.anchor || 'top_left'),
          width,
          boxH,
          constraints,
          regions.textRegion,
        );
        let box: BoundingBox = { x: pos.x, y: currentY, width, height: boxH };
        box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
        box = this.clampBoxToRegion(box, regions.textRegion);
        box = adaptLayerToSlot(layer, box);
        box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
        box = this.clampBoxToRegion(box, regions.textRegion);
        layer.allocatedBox = box;
        (layer as any)._groupScale = groupScale;
        (layer as any)._textRegion = regions.textRegion;
        if (priority === 'cta_hero' && layer.role === 'heading') {
          // Prefer readable ink on the panel — skip solid_card when it becomes a
          // mis-sized floating badge (common on text-only magazine/CTA slides).
          const hasPhoto = !!(optimized.layers || []).some((l: any) => l.type === 'image');
          if (hasPhoto) {
            (layer as any).component = (layer as any).component || 'solid_card';
          }
        }
        currentY = box.y + box.height + clusterGap;
      }
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
      const width = recipeTextWidth(layer);
      let box: BoundingBox;
      if (usePerLayerAnchors) {
        box = placeLayerBox(
          layer,
          width,
          h,
          layer.role === 'cta' ? 'bottom_center' : 'bottom_left',
        );
      } else {
        const pos = layoutEngine.resolveAnchor(
          String(layer.anchor || (layer.role === 'cta' ? 'bottom_center' : 'bottom_left')),
          width,
          h,
          constraints,
          regions.textRegion,
        );
        box = { x: pos.x, y: currentY, width, height: h };
        box = this.clampBoxToSafe(box, constraints, canvasW, canvasHeight);
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
      if (!usePerLayerAnchors) {
        currentY = layer.allocatedBox.y + h + clusterGap;
      }
    }

    // Capture the ACTUAL union bounding box of every layer that was just placed above
    // (groupedTextLayers / textGroupLayers / structuralLayers all got a real `allocatedBox`).
    // `regions.textRegion` is the pre-fit candidate region computed before content-fitting and
    // obstacle-avoidance ran, so it can diverge from where the glyphs really landed (obstacle
    // avoidance can pick a different y/height inside it). Consumers that need the *readability
    // scrim* to line up with the real text — not the candidate region — should read this instead.
    const placedBoxes: BoundingBox[] = [
      ...groupedTextLayers.map(l => {
        const b = l.allocatedBox;
        if (!b) return undefined;
        // Scrim/meta bounds: prefer content estimate, not occupancy-inflated pocket
        const contentH = estimatedHeights[l.id] || Math.round(canvasHeight * 0.08);
        return {
          x: b.x,
          y: b.y,
          width: b.width,
          height: Math.min(b.height, Math.max(contentH, Math.round(canvasHeight * 0.06))),
        };
      }),
      ...textGroupLayers.map(g => g.allocatedBox),
      ...structuralLayers.map(l => l.allocatedBox),
    ].filter((b): b is BoundingBox => !!b);
    const actualTextBounds: BoundingBox | undefined = placedBoxes.length
      ? {
          x: Math.min(...placedBoxes.map(b => b.x)),
          y: Math.min(...placedBoxes.map(b => b.y)),
          width: Math.max(...placedBoxes.map(b => b.x + b.width)) - Math.min(...placedBoxes.map(b => b.x)),
          height: Math.max(...placedBoxes.map(b => b.y + b.height)) - Math.min(...placedBoxes.map(b => b.y)),
        }
      : undefined;

    const qualitySubjects: BoundingBox[] = isDedicatedPanel
      ? []
      : [
          ...protectedSubjects,
          ...(sBox ? [sBox] : []),
          ...(imageOccupied ? [imageOccupied] : []),
        ];
    const quality = this.qc.evaluateVisualQuality({
      boxes: allTextLayers.map(l => ({
        role: l.role,
        box: l.allocatedBox,
        omitted: !!(l as any)._omitForComposition,
        fontSize: (l as any)._estimatedFontSize
          || (l.role === 'heading' ? typographyMetrics?.heroSize : typographyMetrics?.primarySize)
          || canvasHeight * 0.04,
        templateAnchor: String((l as any)._templateAnchor || l.anchor || ''),
      })),
      constraints,
      canvasW,
      canvasH: canvasHeight,
      subjectBoxes: qualitySubjects,
      intent: { visualPriority: priority, readingFlow: flow },
      groupScale,
    });

    // Post-QC: if type still sits on a face, force it into a clear pocket.
    if ((quality.critical || []).includes('subject_collision') && (sBox || imageOccupied)) {
      for (const layer of allTextLayers) {
        if (!(layer as any).allocatedBox || (layer as any)._omitForComposition) continue;
        if ((layer as any).role !== 'heading' && (layer as any).role !== 'tagline') continue;
        (layer as any).allocatedBox = this.forceClearSubject(
          (layer as any).allocatedBox,
          [
            ...(sBox ? [sBox] : []),
            ...(imageOccupied && ['circle', 'arch', 'polaroid'].includes(
              String((optimized.layers?.find((l: any) => l.type === 'image') as any)?.mask || ''),
            ) ? [imageOccupied] : []),
          ],
          fullSafe,
          constraints,
          canvasW,
          canvasHeight,
        );
      }
    }

    // Content integrity: measure against the REAL allocated box (not a fake ch-pocket).
    // If full hero size doesn't pack, try controlled font shrink within allowed range BEFORE rejecting.
    const headlineText = (content?.headline || '').trim();
    const headingLayer = groupedTextLayers.find(l => l.role === 'heading');
    const contentIntegrity = this.validateContentIntegrity(
      headlineText,
      headingLayer,
      estimatedFontSizes,
      regions.textRegion,
      groupScale,
      priority,
      canvasHeight,
    );

    // Prefer omit secondary over crushing hero / overcrowding the band
    const secondaryOmitActions: string[] = [];
    for (const layer of groupedTextLayers) {
      if (layer.role === 'heading') continue;
      const box = layer.allocatedBox;
      if (!box) continue;
      const text = layer.role === 'tagline'
        ? (content?.subheadline || '')
        : (content?.subheadline || content?.headline || '');
      const words = text.trim().split(/\s+/).filter(Boolean);
      const fontPx = (layer as any)._estimatedFontSize || canvasHeight * 0.028;
      const charsPerLine = Math.max(4, Math.floor(box.width / Math.max(1, fontPx * 0.55)));
      const maxLines = layer.role === 'tagline' ? 2 : 3;
      const capacity = charsPerLine * maxLines;
      const need = words.reduce((n, w) => n + w.length + 1, 0);
      if (words.length > 14 || need > capacity * 1.15 || box.height < fontPx * 1.1) {
        (layer as any)._omitForComposition = true;
        secondaryOmitActions.push(`omit_secondary:${layer.id}`);
      }
    }
    if (contentIntegrity.ok && contentIntegrity.suggestedFontScale != null && contentIntegrity.suggestedFontScale < 0.999) {
      const s = contentIntegrity.suggestedFontScale;
      if (headingLayer) {
        (headingLayer as any)._estimatedFontSize =
          ((headingLayer as any)._estimatedFontSize || estimatedFontSizes[headingLayer.id] || canvasHeight * 0.06) * s;
        (headingLayer as any)._groupScale = Math.min(groupScale, s);
      }
    }

    // GATE PREDICATE:
    // Integrity repairable failures → typography repair (NOT spatial escalation / template reject)
    const fitExhausted = fit.suggestLayoutChange && !fit.region;
    const needsTypographyRepair = !contentIntegrity.ok && !!contentIntegrity.repairable;
    let suggestLayoutChange =
      !quality.pass
      || fitExhausted
      || (!contentIntegrity.ok && !contentIntegrity.repairable)
      || !!quality.needsSpatialEscalation
      || needsTypographyRepair;

    const allFitActions = [...fitActions, ...secondaryOmitActions];
    allFitActions.push(
      `gate:pass=${quality.pass} score=${quality.score.toFixed(1)} ` +
      `threshold=${quality.passThreshold ?? 7.5} ` +
      `critical=[${(quality.critical || []).join(',') || 'none'}] ` +
      `fitExhausted=${fitExhausted} spatialEscalation=${!!quality.needsSpatialEscalation} ` +
      `typographyRepair=${needsTypographyRepair} ` +
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
        `issues=${quality.issues.join('|') || 'none'}). Triggering repair.`,
      );
    } else if (needsTypographyRepair) {
      allFitActions.push(`typography_repair:${contentIntegrity.reason}`);
      console.warn(
        `[CompositionQC] Typography repair required (not template reject): ${contentIntegrity.reason}`,
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
      suggestLayoutChange = false;
    }

    // Stack heading + supporting copy as one cluster inside the text panel.
    // Skip when layers already sit on independent template anchors across the frame.
    if (!usePerLayerAnchors) {
      this.applyTypographyGroupRhythm(
        groupedTextLayers,
        regions.textRegion,
        clusterGap,
        priority,
      );
    }

    const failureCategory = needsTypographyRepair || (!contentIntegrity.ok && contentIntegrity.repairable)
      ? 'readability'
      : !contentIntegrity.ok
        ? 'readability'
        : (quality.failureCategory || (suggestLayoutChange ? 'spatial_allocation' : 'none'));

    (optimized as any)._compositionMeta = {
      suggestLayoutChange,
      fitActions: allFitActions,
      readingFlow: flow,
      visualPriority: priority,
      groupScale,
      wrapWidthFactor,
      spatial: regions.spatial,
      textRegion: regions.textRegion,
      // Real, post-fit union bounds of the placed text layers — prefer this over `textRegion`
      // whenever you need to draw something (e.g. a readability scrim) that must align with
      // where the text actually rendered. Falls back to `textRegion` when nothing was placed.
      actualTextRegion: actualTextBounds || regions.textRegion,
      imageRegion: regions.imageRegion,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
      qualityCritical: quality.critical,
      qualityMetrics: quality.metrics,
      failureCategory,
      // Integrity/measure must NOT force axis escalation
      needsSpatialEscalation: !!quality.needsSpatialEscalation,
      needsTypographyRepair,
      contentIntegrity,
      gatePredicate: {
        pass: quality.pass,
        score: quality.score,
        threshold: quality.passThreshold ?? 7.5,
        fitExhausted,
        needsSpatialEscalation: !!quality.needsSpatialEscalation,
        needsTypographyRepair,
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
   * Estimate where an inset/circle/arch photo actually lands so text can avoid it.
   * Full-bleed / before_after stitch leave null (text is meant to overlay).
   */
  private estimateImageOccupiedBox(
    imageLayer: { mask?: string; paddingPercent?: number; anchor?: string } | undefined,
    canvasW: number,
    canvasH: number,
  ): BoundingBox | null {
    if (!imageLayer) return null;
    const mask = String(imageLayer.mask || 'rectangle');
    if (mask === 'full_bleed' || mask === 'before_after_split') return null;
    const pad = Number(imageLayer.paddingPercent ?? 0);
    if (mask !== 'circle' && mask !== 'arch' && mask !== 'polaroid' && !(mask === 'rectangle' && pad > 0)) {
      return null;
    }
    const slot = LayoutEngine.recipeImageSlot(canvasW, canvasH, imageLayer);
    if (mask === 'circle') {
      const halo = Math.round(slot.width * 0.06);
      return {
        x: Math.max(0, slot.x - halo),
        y: Math.max(0, slot.y - halo),
        width: Math.min(canvasW, slot.width + halo * 2),
        height: Math.min(canvasH, slot.height + halo * 2),
      };
    }
    return slot;
  }

  /** Move type fully off faces / photo disks. Never leave a heading on a client face. */
  private forceClearSubject(
    box: BoundingBox,
    keepOut: BoundingBox[],
    fullSafe: BoundingBox,
    constraints: LayoutConstraints,
    canvasW: number,
    canvasH: number,
  ): BoundingBox {
    const hits = (a: BoundingBox, b: BoundingBox) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    let out = { ...box };
    for (const obs of keepOut) {
      if (!obs || obs.width < 8 || obs.height < 8) continue;
      if (!hits(out, obs)) continue;
      const free = this.carveBoxAroundObstacle(fullSafe, obs, 'bottom_center');
      if (free && free.width >= 80 && free.height >= 48) {
        out = {
          x: Math.max(free.x, Math.min(Math.max(out.x, free.x), free.x + free.width - Math.min(out.width, free.width))),
          y: free.y >= obs.y ? free.y : Math.max(free.y, obs.y + obs.height + 12),
          width: Math.min(out.width, free.width),
          height: Math.min(Math.max(out.height, 48), free.height),
        };
      } else {
        const footer = Math.max(constraints.margins.bottom, 88);
        const maxY = canvasH - footer;
        const availBelow = Math.max(0, maxY - (obs.y + obs.height) - 8);
        const availAbove = Math.max(0, obs.y - constraints.safeY - 8);
        const h = Math.min(out.height, Math.round(canvasH * 0.14));
        if (availBelow >= 40) {
          out = {
            x: constraints.safeX,
            y: obs.y + obs.height + 8,
            width: Math.min(out.width, canvasW - constraints.safeX * 2),
            height: Math.min(h, availBelow),
          };
        } else if (availAbove >= 40) {
          const useH = Math.min(h, availAbove);
          out = {
            x: constraints.safeX,
            y: obs.y - 8 - useH,
            width: Math.min(out.width, canvasW - constraints.safeX * 2),
            height: useH,
          };
        }
      }
    }
    return this.clampBoxToSafe(out, constraints, canvasW, canvasH);
  }

  /** Pick the free rectangle inside `region` that best keeps the recipe text slot. */
  private carveBoxAroundObstacle(
    region: BoundingBox,
    obstacle: BoundingBox,
    recipeAnchor = 'center',
  ): BoundingBox | null {
    const gap = 16;
    const candidates: BoundingBox[] = [
      {
        x: region.x,
        y: Math.max(region.y, obstacle.y + obstacle.height + gap),
        width: region.width,
        height: 0,
      },
      {
        x: region.x,
        y: region.y,
        width: region.width,
        height: Math.min(region.height, obstacle.y - gap - region.y),
      },
      {
        x: region.x,
        y: region.y,
        width: Math.min(region.width, obstacle.x - gap - region.x),
        height: region.height,
      },
      {
        x: Math.max(region.x, obstacle.x + obstacle.width + gap),
        y: region.y,
        width: 0,
        height: region.height,
      },
    ];
    candidates[0].height = region.y + region.height - candidates[0].y;
    candidates[3].width = region.x + region.width - candidates[3].x;

    const valid = candidates
      .map(c => ({
        ...c,
        width: Math.max(0, c.width),
        height: Math.max(0, c.height),
      }))
      .filter(c => c.width >= 120 && c.height >= 80);
    if (!valid.length) return null;

    const anchor = String(recipeAnchor || 'center');
    const wantV = anchor.includes('top') ? 'top' : anchor.includes('bottom') ? 'bottom' : 'mid';
    const wantH = anchor.includes('left') ? 'left' : anchor.includes('right') ? 'right' : 'mid';
    const regionCx = region.x + region.width / 2;
    const regionCy = region.y + region.height / 2;
    const obsCx = obstacle.x + obstacle.width / 2;
    const obstacleOnLeft = obsCx < regionCx - region.width * 0.08;
    const obstacleOnRight = obsCx > regionCx + region.width * 0.08;

    const score = (c: BoundingBox) => {
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;
      const hScore = wantH === 'left'
        ? -cx
        : wantH === 'right'
          ? cx
          : obstacleOnLeft
            ? cx
            : obstacleOnRight
              ? -cx
              : -Math.abs(cx - regionCx);
      const vScore = wantV === 'top'
        ? -cy
        : wantV === 'bottom'
          ? cy
          : -Math.abs(cy - regionCy);
      return hScore + vScore * 1.15 + (c.width * c.height) / 80000;
    };
    valid.sort((a, b) => score(b) - score(a));
    return valid[0];
  }

  /**
   * Verify the allocated text box can hold the full headline after wrap + allowed shrink.
   * Measures against allocatedBox/textRegion pixels — NOT a fake "ch pocket".
   * If full size fails, try controlled font shrink within priority-allowed range (typography repair).
   */
  private validateContentIntegrity(
    headline: string,
    headingLayer: IDSLTextLayer | undefined,
    fontSizes: Record<string, number>,
    textRegion: BoundingBox,
    groupScale: number,
    priority: string = 'image_hero',
    canvasH: number = 1080,
  ): {
    ok: boolean;
    reason?: string;
    expectedWords?: number;
    estimableWords?: number;
    repairable?: boolean;
    suggestedFontScale?: number;
  } {
    if (!headline) return { ok: true };
    const words = headline.split(/\s+/).filter(Boolean);
    if (words.length === 0) return { ok: true };

    const box = headingLayer?.allocatedBox || textRegion;
    const measureW = Math.max(40, box.width);
    const measureH = Math.max(40, box.height);
    const baseFont =
      (headingLayer
        ? (fontSizes[headingLayer.id] || (headingLayer as any)._estimatedFontSize)
        : undefined)
      || Math.round(measureH * 0.35);
    const startSize = baseFont * (groupScale || 1);

    // Adapt to actual column width first (same as render path)
    const adapted = this.qc.adaptFontSizeToContent(
      startSize,
      headline,
      'heading',
      canvasH,
      measureW,
      priority,
    );

    const minRatio = priority === 'typography_hero' ? 0.065 : 0.038;
    const minFont = Math.round(canvasH * minRatio);
    const tryPack = (fontPx: number): { fitted: number; lines: number; charsPerLine: number } => {
      const avgCharW = fontPx * 0.62;
      const charsPerLine = Math.max(4, Math.floor(measureW / Math.max(1, avgCharW)));
      const lineH = fontPx * 1.15;
      const maxLines = Math.max(1, Math.floor(measureH / Math.max(1, lineH)));
      let linesUsed = 1;
      let lineChars = 0;
      let fitted = 0;
      for (const w of words) {
        const need = (lineChars === 0 ? 0 : 1) + w.length;
        if (lineChars + need <= charsPerLine) {
          lineChars += need;
          fitted++;
        } else if (linesUsed < maxLines) {
          // Word alone longer than line: still place on its own line if possible
          if (w.length > charsPerLine && linesUsed < maxLines) {
            linesUsed++;
            lineChars = w.length;
            fitted++;
          } else if (w.length <= charsPerLine) {
            linesUsed++;
            lineChars = w.length;
            fitted++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      return { fitted, lines: maxLines, charsPerLine };
    };

    let pack = tryPack(adapted);
    if (pack.fitted >= words.length) {
      return {
        ok: true,
        expectedWords: words.length,
        estimableWords: pack.fitted,
        suggestedFontScale: adapted / Math.max(1, startSize),
      };
    }

    // Controlled shrink within allowed range — typography repair, not template reject
    let lo = minFont;
    let hi = adapted;
    let bestScale: number | null = null;
    for (let i = 0; i < 8; i++) {
      const mid = Math.round((lo + hi) / 2);
      const midPack = tryPack(mid);
      if (midPack.fitted >= words.length) {
        bestScale = mid / Math.max(1, startSize);
        lo = mid + 1; // try larger
        pack = midPack;
      } else {
        hi = mid - 1;
      }
    }

    if (bestScale != null) {
      console.log(
        `[ContentIntegrity] Typography repair: full size failed, fits at scale=${bestScale.toFixed(2)} ` +
        `in ${Math.round(measureW)}x${Math.round(measureH)}px box (${pack.lines} lines × ~${pack.charsPerLine}ch)`,
      );
      return {
        ok: true,
        expectedWords: words.length,
        estimableWords: words.length,
        suggestedFontScale: bestScale,
      };
    }

    // Still can't fit even at min — repairable via relocate/wrap, not axis thrash
    const reason =
      `headline_measure:${pack.fitted}/${words.length}_words ` +
      `at~${Math.round(adapted)}px in ${Math.round(measureW)}x${Math.round(measureH)}px ` +
      `(${pack.lines}×${pack.charsPerLine}ch capacity)`;
    console.warn(`[ContentIntegrity] ${reason}`);
    return {
      ok: false,
      reason,
      expectedWords: words.length,
      estimableWords: pack.fitted,
      repairable: true,
    };
  }

  private clampCopyWords(text: string | undefined, maxWords: number): string | undefined {
    if (!text) return text;
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ');
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
    // Hard floor so large display type never kisses/clips the canvas edge
    // (seen as "FLAWLESS" chopped on the left of circle slides).
    const insetX = Math.max(constraints.safeX, Math.round(canvasW * 0.045));
    const insetTop = Math.max(constraints.safeY, Math.round(canvasH * 0.045));
    const insetBottom = Math.max(constraints.margins.bottom, Math.round(canvasH * 0.06));
    const maxX = canvasW - insetX;
    const maxY = canvasH - insetBottom;
    let { x, y, width, height } = box;
    width = Math.min(width, maxX - insetX);
    height = Math.min(height, maxY - insetTop);
    x = Math.max(insetX, Math.min(x, maxX - width));
    y = Math.max(insetTop, Math.min(y, maxY - height));
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
