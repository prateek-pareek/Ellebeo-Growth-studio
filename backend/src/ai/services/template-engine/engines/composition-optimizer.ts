import { ICompiledLayoutDSL, IDSLTextLayer, IDSLTextGroupLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine, BoundingBox } from './layout-engine';

type TypographyMetrics = {
  heroSize?: number;
  primarySize?: number;
  bodySize?: number;
  metadataSize?: number;
};

export class CompositionOptimizer {

  /**
   * Optimizes the compiled layout DSL by calculating exact bounding boxes,
   * balancing whitespace, and preventing overlaps — treating headline+tagline
   * as a typographic group with premium rhythm (drop secondary before crush).
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
  ): ICompiledLayoutDSL {
    let optimized = JSON.parse(JSON.stringify(dsl)) as ICompiledLayoutDSL;
    if (!optimized.layers) return optimized;

    for (const layer of optimized.layers) {
      if (layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        const randomIndex = Math.floor(Math.random() * layer.allowedAnchors.length);
        (layer as any).anchor = layer.allowedAnchors[randomIndex];
      }

      // Image-hero: keep type readable but leave the photo dominant
      if (visualPriority === 'image_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (textLayer.maxWidthPercent > 52) {
          textLayer.maxWidthPercent = 52;
        }
      }
    }

    const layoutEngine = new LayoutEngine(canvasW, canvasHeight, faceBox, subjectBox);
    let imageBleedExtent = 'full_bleed';
    if (dsl.id.includes('z_pattern') || dsl.id.includes('asymmetrical')) {
      imageBleedExtent = 'asymmetrical_65';
    } else if (dsl.id.includes('split')) {
      imageBleedExtent = 'split_50';
    }
    const isZPattern = dsl.id.includes('z_pattern');
    const regions = layoutEngine.allocateRegions(
      { imageBleedExtent, readingJourney: isZPattern ? 'z_pattern' : 'linear' },
      constraints,
      visualPriority || 'image_hero',
    );
    optimized.canvasRegions = regions;

    const roleWeight: Record<string, number> = { heading: 4, tagline: 3, body: 2, footnote: 1, cta: 0 };
    const allTextLayers = optimized.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    const textGroupLayers = optimized.layers.filter(l => l.type === 'text_group') as IDSLTextGroupLayer[];

    let groupedTextLayers = allTextLayers
      .filter(l => l.role !== 'cta' && l.role !== 'footnote')
      .sort((a, b) => (roleWeight[b.role || 'body'] || 0) - (roleWeight[a.role || 'body'] || 0));
    const structuralLayers = allTextLayers.filter(l => l.role === 'cta' || l.role === 'footnote');

    // Premium rhythm: generous cluster gaps (don't pack type onto the photo)
    const clusterGap = visualPriority === 'image_hero' ? 28 : 22;
    const heroH = Math.min(
      Math.round(canvasHeight * 0.14),
      Math.max(64, Math.round((typographyMetrics?.heroSize || 64) * 1.85)),
    );
    const primaryH = Math.min(
      Math.round(canvasHeight * 0.07),
      Math.max(36, Math.round((typographyMetrics?.primarySize || 28) * 1.45)),
    );
    const bodyH = Math.min(
      Math.round(canvasHeight * 0.06),
      Math.max(32, Math.round((typographyMetrics?.bodySize || 18) * 2.0)),
    );

    const estimateHeights = (layers: IDSLTextLayer[]) => {
      const heights: Record<string, number> = {};
      let total = 0;
      for (const layer of layers) {
        let h = bodyH;
        if (layer.role === 'heading') h = heroH;
        else if (layer.role === 'tagline') h = primaryH;
        else if (layer.role === 'body') h = bodyH;
        heights[layer.id] = h;
        total += h + clusterGap;
      }
      if (layers.length > 0) total -= clusterGap; // no trailing gap
      return { heights, total };
    };

    let { heights: estimatedHeights, total: totalGroupHeight } = estimateHeights(groupedTextLayers);

    const intent = {
      readingFlow: isZPattern ? 'z_pattern' : 'center_down',
      visualPriority: visualPriority || 'image_hero',
      role: 'group',
    };

    const sBox = layoutEngine.getSubjectBox() || layoutEngine.getFaceBox();
    const subjectHalo = 48;
    let groupRegion: BoundingBox | null = null;
    let fallbackLevel = 0;

    const obstacles = logoBox ? [logoBox] : [];
    const candidates = layoutEngine.generateCandidateRegions(constraints, obstacles);

    const hitsSubject = (region: BoundingBox, heightNeed: number) => {
      if (!sBox) return false;
      const fx = Math.max(0, sBox.x - subjectHalo);
      const fy = Math.max(0, sBox.y - subjectHalo);
      const fw = sBox.width + subjectHalo * 2;
      const fh = sBox.height + subjectHalo * 2;
      const overlapX = region.x < fx + fw && region.x + region.width > fx;
      const overlapY = region.y < fy + fh && region.y + heightNeed > fy;
      return overlapX && overlapY;
    };

    // Prefer dropping secondary copy over crushing everything into the photo
    const dropSecondaryUntilFits = () => {
      while (groupedTextLayers.length > 1 && fallbackLevel > 0) {
        const dropIdx = groupedTextLayers.findIndex(l => l.role === 'body' || l.role === 'tagline');
        if (dropIdx < 0) break;
        const dropped = groupedTextLayers.splice(dropIdx, 1)[0];
        // Mark omitted so renderer skips (empty allocated / flag)
        (dropped as any)._omitForComposition = true;
        delete dropped.allocatedBox;
        console.log(`[CompositionOptimizer] Omitting secondary '${dropped.role}' (${dropped.id}) to preserve premium hierarchy`);
        ({ heights: estimatedHeights, total: totalGroupHeight } = estimateHeights(groupedTextLayers));
        break; // one drop per fallback step
      }
    };

    while (!groupRegion && fallbackLevel < 5) {
      let bestCandidate: BoundingBox | null = null;
      let bestScore = -999;

      for (const c of candidates) {
        if (c.height >= totalGroupHeight) {
          if (!hitsSubject(c, totalGroupHeight)) {
            const score = layoutEngine.scoreRegion(c, intent as any, totalGroupHeight);
            if (score > bestScore) {
              bestScore = score;
              bestCandidate = c;
            }
          }
        }
      }

      if (bestCandidate) {
        groupRegion = bestCandidate;
      } else {
        fallbackLevel++;
        if (fallbackLevel === 1) {
          console.log(`[CompositionOptimizer] Group height ${totalGroupHeight} blocked. Fallback 1: Drop body/tagline before shrink`);
          dropSecondaryUntilFits();
        } else if (fallbackLevel === 2) {
          console.log(`[CompositionOptimizer] Fallback 2: Mild scale + prefer clear bands`);
          for (const layer of groupedTextLayers) {
            if (layer.role === 'heading') {
              estimatedHeights[layer.id] = Math.max(estimatedHeights[layer.id] * 0.9, 64);
            } else {
              estimatedHeights[layer.id] = Math.max(estimatedHeights[layer.id] * 0.85, 32);
            }
          }
          totalGroupHeight = Object.values(estimatedHeights).reduce((a, b) => a + b, 0)
            + Math.max(0, groupedTextLayers.length - 1) * clusterGap;

          let altBest: BoundingBox | null = null;
          let altScore = -999;
          for (const c of candidates) {
            if (!hitsSubject(c, Math.min(totalGroupHeight, c.height))) {
              const score = layoutEngine.scoreRegion(c, intent as any, Math.min(totalGroupHeight, c.height));
              if (score > altScore) {
                altScore = score;
                altBest = c;
              }
            }
          }
          if (altBest) groupRegion = altBest;
        } else if (fallbackLevel === 3) {
          console.log(`[CompositionOptimizer] Fallback 3: Drop another secondary`);
          dropSecondaryUntilFits();
        } else if (fallbackLevel === 4) {
          console.log(`[CompositionOptimizer] Fallback 4: Furthest clear pocket from subject`);
          let safest: BoundingBox | null = null;
          let bestDist = -1;
          for (const c of candidates) {
            if (hitsSubject(c, Math.min(totalGroupHeight, c.height))) continue;
            const cx = c.x + c.width / 2;
            const cy = c.y + c.height / 2;
            const sx = sBox ? sBox.x + sBox.width / 2 : canvasW / 2;
            const sy = sBox ? sBox.y + sBox.height / 2 : canvasHeight / 2;
            const dist = Math.hypot(cx - sx, cy - sy);
            if (dist > bestDist) {
              bestDist = dist;
              safest = c;
            }
          }
          groupRegion = safest || {
            x: constraints.safeX,
            y: constraints.safeY,
            width: Math.min(420, constraints.contentMaxWidth),
            height: Math.max(totalGroupHeight, 120),
          };
          if (sBox && hitsSubject(groupRegion, totalGroupHeight)) {
            const below = sBox.y + sBox.height + subjectHalo + 20;
            const aboveSpace = sBox.y - constraints.safeY;
            if (aboveSpace >= totalGroupHeight + 16) {
              groupRegion = { ...groupRegion, y: constraints.safeY, height: aboveSpace };
            } else {
              groupRegion = {
                ...groupRegion,
                y: Math.min(canvasHeight - constraints.margins.bottom - totalGroupHeight, below),
              };
            }
          }
        }
      }
    }

    let currentY = groupRegion ? groupRegion.y : constraints.safeY;
    const canvasWidth = constraints.safeX * 2 + constraints.contentMaxWidth;
    const family = (dsl as any)?.family || 'minimal';

    // Group-level allocation: shared X/width, stacked Y with premium gaps
    for (const layer of groupedTextLayers) {
      if ((layer as any)._omitForComposition) continue;

      let x = groupRegion ? groupRegion.x : constraints.safeX;
      let width = groupRegion ? groupRegion.width : 400;
      x = Math.max(constraints.safeX, x);
      width = Math.min(width, canvasWidth - constraints.safeX - x);

      // Taglines get a slim height budget so they don't inflate and then crush-fit
      const height = estimatedHeights[layer.id];
      let box: BoundingBox = { x, y: currentY, width, height };
      box = layoutEngine.resolveFaceCollision(box, constraints, family);
      layer.allocatedBox = box;
      currentY = box.y + box.height + clusterGap;
    }

    // Mark omitted secondaries so typography can skip without empty boxes
    for (const layer of allTextLayers) {
      if ((layer as any)._omitForComposition) {
        layer.allocatedBox = undefined;
        (layer as any).opacity = 0;
      }
    }

    // Allocate text_group layers as a single cluster box
    for (const group of textGroupLayers) {
      const gH = Math.max(totalGroupHeight, heroH + primaryH + clusterGap);
      let box: BoundingBox = {
        x: groupRegion ? groupRegion.x : constraints.safeX,
        y: groupRegion ? groupRegion.y : constraints.safeY,
        width: groupRegion ? groupRegion.width : constraints.contentMaxWidth,
        height: Math.min(gH, groupRegion?.height || gH),
      };
      box = layoutEngine.resolveFaceCollision(box, constraints, family);
      group.allocatedBox = box;
    }

    for (const layer of structuralLayers) {
      if (layer.anchor && layer.anchor !== 'bottom_edge' && layer.anchor !== 'corners') {
        let { x, y } = layoutEngine.resolveAnchor(layer.anchor, 0, 64, constraints);
        x = Math.max(constraints.safeX, x);
        const width = Math.min(280, canvasWidth - constraints.safeX - x);
        let box: BoundingBox = { x, y, width, height: 64 };
        box = layoutEngine.resolveFaceCollision(box, constraints, family);
        layer.allocatedBox = box;
      } else {
        let x = groupRegion ? groupRegion.x : constraints.safeX;
        x = Math.max(constraints.safeX, x);
        const width = Math.min(groupRegion ? groupRegion.width : 280, canvasWidth - constraints.safeX - x);
        let box: BoundingBox = { x, y: currentY, width, height: 64 };
        box = layoutEngine.resolveFaceCollision(box, constraints, family);
        layer.allocatedBox = box;
        currentY = box.y + 88;
      }
    }

    let { score, issues } = this.scoreComposition(optimized, constraints, canvasHeight, dsl, sBox || faceBox);
    let attempts = 0;

    while (score < 7.0 && attempts < 3) {
      console.log(`[CompositionOptimizer] Score ${score} < 7.0. Issues: ${issues.join(', ')}. Repairing…`);
      for (const txt of allTextLayers) {
        if (!txt.allocatedBox || (txt as any)._omitForComposition) continue;
        if (txt.role !== 'heading') {
          // Prefer omitting crushed secondaries over salvage shrink
          if (issues.includes('Face collision') || issues.some(i => i.includes('margin'))) {
            (txt as any)._omitForComposition = true;
            txt.allocatedBox = undefined;
            continue;
          }
        }
        let minH = txt.role === 'heading' ? 64 : 32;
        txt.allocatedBox.height = Math.max(txt.allocatedBox.height * 0.92, minH);
        txt.allocatedBox.x = Math.max(constraints.safeX, txt.allocatedBox.x);
        txt.allocatedBox.width = Math.min(
          txt.allocatedBox.width,
          canvasWidth - constraints.safeX - txt.allocatedBox.x,
        );
        txt.allocatedBox = layoutEngine.resolveFaceCollision(txt.allocatedBox, constraints, family);
      }
      const newEval = this.scoreComposition(optimized, constraints, canvasHeight, dsl, sBox || faceBox);
      score = newEval.score;
      issues = newEval.issues;
      attempts++;
    }

    if (score < 7.0) {
      console.warn(`[CompositionOptimizer] Unrecoverable (${score}). Stack clear of subject.`);
      let safeY = constraints.safeY + 48;
      if (sBox && sBox.y < canvasHeight * 0.4) {
        safeY = Math.max(safeY, sBox.y + sBox.height + 28);
      } else if (sBox && sBox.y > canvasHeight * 0.45) {
        safeY = constraints.safeY + 40;
      }
      for (const txt of allTextLayers) {
        if ((txt as any)._omitForComposition) continue;
        if (txt.role !== 'heading' && txt.role !== 'cta') {
          // Keep only hero (+ optional CTA) in fail-safe for premium clarity
          (txt as any)._omitForComposition = true;
          txt.allocatedBox = undefined;
          continue;
        }
        txt.anchor = 'top_center';
        txt.alignment = 'center';
        if (txt.allocatedBox) {
          txt.allocatedBox.x = constraints.safeX;
          txt.allocatedBox.y = safeY;
          txt.allocatedBox.width = Math.min(constraints.contentMaxWidth, Math.round(canvasW * 0.7));
          txt.allocatedBox = layoutEngine.resolveFaceCollision(txt.allocatedBox, constraints, family);
          safeY = txt.allocatedBox.y + txt.allocatedBox.height + clusterGap + 8;
        }
      }
    }

    return optimized;
  }

  private scoreComposition(
    dsl: ICompiledLayoutDSL,
    constraints: LayoutConstraints,
    canvasHeight: number,
    originalDsl: ICompiledLayoutDSL,
    subjectOrFace?: any,
  ): { score: number; issues: string[] } {
    let score = 10.0;
    const issues: string[] = [];
    const allTextLayers = (dsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[])
      .filter(l => !(l as any)._omitForComposition);

    for (let i = 0; i < allTextLayers.length; i++) {
      for (let j = i + 1; j < allTextLayers.length; j++) {
        const b1 = allTextLayers[i].allocatedBox;
        const b2 = allTextLayers[j].allocatedBox;
        if (b1 && b2) {
          if (b1.x < b2.x + b2.width && b1.x + b1.width > b2.x && b1.y < b2.y + b2.height && b1.y + b1.height > b2.y) {
            score -= 2.5;
            issues.push('Text collision');
          }
        }
      }

      const box = allTextLayers[i].allocatedBox;
      if (box && subjectOrFace) {
        if (
          box.x < subjectOrFace.x + subjectOrFace.width &&
          box.x + box.width > subjectOrFace.x &&
          box.y < subjectOrFace.y + subjectOrFace.height &&
          box.y + box.height > subjectOrFace.y
        ) {
          score -= 4.0;
          issues.push('Face collision');
        }
      }

      if (box) {
        const canvasWidth = constraints.safeX * 2 + constraints.contentMaxWidth;
        if (box.y < constraints.safeY || box.y + box.height > canvasHeight - constraints.safeY) {
          score -= 1.5;
          issues.push(`Vertical margin violation on layer ${allTextLayers[i].id}`);
        }
        if (box.x < constraints.safeX || box.x + box.width > canvasWidth - constraints.safeX) {
          score -= 2.5;
          issues.push(`Horizontal margin violation on layer ${allTextLayers[i].id}`);
        }
      }
    }

    const heading = allTextLayers.find(l => l.role === 'heading');
    const cta = allTextLayers.find(l => l.role === 'cta');
    if (heading && cta && heading.allocatedBox && cta.allocatedBox) {
      if (heading.allocatedBox.height < cta.allocatedBox.height) {
        score -= 2.0;
        issues.push('Hierarchy violation: CTA larger than Heading');
      }
    }

    if (cta && cta.allocatedBox) {
      const originalCta = originalDsl.layers.find(l => l.id === cta.id) as IDSLTextLayer;
      if (originalCta && originalCta.anchor && originalCta.anchor !== cta.anchor) {
        score -= 1.0;
        issues.push('Semantic violation: CTA anchor changed');
      }
    }

    return { score: Math.max(0, score), issues };
  }
}
