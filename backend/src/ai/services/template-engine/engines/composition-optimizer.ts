import { ICompiledLayoutDSL, IDSLTextLayer, IDSLDecorationLayer, IDSLImageLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine } from './layout-engine';

export class CompositionOptimizer {

  /**
   * Optimizes the compiled layout DSL by calculating exact bounding boxes, 
   * balancing whitespace, and preventing overlaps, BEFORE it is passed to the renderers.
   */
  public optimize(dsl: ICompiledLayoutDSL, constraints: LayoutConstraints, canvasW: number, canvasHeight: number, faceBox?: any, visualPriority?: string, logoBox?: any): ICompiledLayoutDSL {
    let optimized = JSON.parse(JSON.stringify(dsl)) as ICompiledLayoutDSL;
    if (!optimized.layers) return optimized;

    // Apply allowed variations
    for (const layer of optimized.layers) {
      if (layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        const randomIndex = Math.floor(Math.random() * layer.allowedAnchors.length);
        (layer as any).anchor = layer.allowedAnchors[randomIndex];
      }
      
      if (visualPriority === 'image_hero' && layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        if (textLayer.maxWidthPercent > 45) {
          textLayer.maxWidthPercent = 45;
        }
      }
    }

    const layoutEngine = new LayoutEngine(canvasW, canvasHeight, faceBox);
    let imageBleedExtent = 'full_bleed';
    if (dsl.id.includes('z_pattern') || dsl.id.includes('asymmetrical')) {
      imageBleedExtent = 'asymmetrical_65';
    } else if (dsl.id.includes('split')) {
      imageBleedExtent = 'split_50';
    }
    const isZPattern = dsl.id.includes('z_pattern');
    const regions = layoutEngine.allocateRegions({ imageBleedExtent, readingJourney: isZPattern ? 'z_pattern' : 'linear' }, constraints, visualPriority);
    optimized.canvasRegions = regions;

    const roleWeight: Record<string, number> = { 'heading': 4, 'tagline': 3, 'body': 2, 'footnote': 1, 'cta': 0 };
    const allTextLayers = optimized.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    
    // Split into Grouped (Heading, Tagline, Body) and Structural (CTA, Footnote)
    const groupedTextLayers = allTextLayers.filter(l => l.role !== 'cta' && l.role !== 'footnote').sort((a, b) => (roleWeight[b.role || 'body'] || 0) - (roleWeight[a.role || 'body'] || 0));
    const structuralLayers = allTextLayers.filter(l => l.role === 'cta' || l.role === 'footnote');
    
    // Group Calculation
    let totalGroupHeight = 0;
    const estimatedHeights: Record<string, number> = {};
    for (const layer of groupedTextLayers) {
      let h = 120;
      if (layer.role === 'heading') h = 240;
      else if (layer.role === 'body') h = 120;
      estimatedHeights[layer.id] = h;
      totalGroupHeight += h + 20; // 20px gap
    }

    const intent = { readingFlow: isZPattern ? 'z_pattern' : 'center_down', visualPriority, role: 'group' };
    
    // Fallback Hierarchy
    const fBox = (layoutEngine as any).faceBox;
    const faceHalo = 40;
    let groupRegion: any = null;
    let fallbackLevel = 0;

    // Generate Candidate Regions
    const obstacles = logoBox ? [logoBox] : [];
    const candidates = layoutEngine.generateCandidateRegions(constraints, obstacles);
    
    while (!groupRegion && fallbackLevel < 4) {
      // Find candidate region that fits totalGroupHeight
      let bestCandidate: any = null;
      let bestScore = -999;
      
      for (const c of candidates) {
        if (c.height >= totalGroupHeight) {
          // Check face collision
          let hitFace = false;
          if (fBox) {
            const fx = Math.max(0, fBox.x - faceHalo);
            const fy = Math.max(0, fBox.y - faceHalo);
            const fw = fBox.width + (faceHalo * 2);
            const fh = fBox.height + (faceHalo * 2);
            const overlapX = c.x < fx + fw && c.x + c.width > fx;
            const overlapY = c.y < fy + fh && c.y + totalGroupHeight > fy;
            hitFace = overlapX && overlapY;
          }
          if (!hitFace) {
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
          console.log(`[CompositionOptimizer] Group height ${totalGroupHeight} blocked. Fallback 1: Scaling...`);
          // Scale Hierarchy: reduce total height by 20%
          totalGroupHeight = 0;
          for (const layer of groupedTextLayers) {
            let minHeight = 40;
            if (layer.role === 'heading') minHeight = 80;
            else if (layer.role === 'cta') minHeight = 60;
            estimatedHeights[layer.id] = Math.max(estimatedHeights[layer.id] * 0.8, minHeight);
            totalGroupHeight += estimatedHeights[layer.id] + 15;
          }
        } else if (fallbackLevel === 2) {
          console.log(`[CompositionOptimizer] Fallback 2: Alternate Arrangement...`);
          // Assume wider box, shorter height
        } else if (fallbackLevel === 3) {
           console.log(`[CompositionOptimizer] Fallback 3: Ignored constraints`);
           groupRegion = candidates[0] || { x: constraints.safeX, y: constraints.safeY, width: 300, height: totalGroupHeight };
        }
      }
    }

    // Allocate grouped layers
    let currentY = groupRegion ? groupRegion.y : constraints.safeY;
    const canvasWidth = (constraints.safeX * 2) + constraints.contentMaxWidth;
    
    for (const layer of groupedTextLayers) {
      let x = groupRegion ? groupRegion.x : constraints.safeX;
      let width = groupRegion ? groupRegion.width : 400;
      x = Math.max(constraints.safeX, x);
      width = Math.min(width, canvasWidth - constraints.safeX - x);

      layer.allocatedBox = {
        x,
        y: currentY,
        width,
        height: estimatedHeights[layer.id]
      };
      currentY += estimatedHeights[layer.id] + 20;
    }

    // Allocate CTA & Footnote (Structural Anchors)
    for (const layer of structuralLayers) {
      if (layer.anchor && layer.anchor !== 'bottom_edge' && layer.anchor !== 'corners') {
        // Respect DSL structural intent
        let { x, y } = layoutEngine.resolveAnchor(layer.anchor, 0, 80, constraints);
        x = Math.max(constraints.safeX, x);
        const width = Math.min(300, canvasWidth - constraints.safeX - x);
        layer.allocatedBox = { x, y, width, height: 80 };
      } else {
        // Fallback stack
        let x = groupRegion ? groupRegion.x : constraints.safeX;
        x = Math.max(constraints.safeX, x);
        const width = Math.min(groupRegion ? groupRegion.width : 300, canvasWidth - constraints.safeX - x);
        layer.allocatedBox = {
           x,
           y: currentY,
           width,
           height: 80
        };
        currentY += 100;
      }
    }

    // Global Scoring & Repair
    let { score, issues } = this.scoreComposition(optimized, constraints, canvasHeight, dsl, faceBox);
    let attempts = 0;

    while (score < 7.0 && attempts < 3) {
      console.log(`[CompositionOptimizer] Score ${score} < 7.0. Issues: ${issues.join(', ')}. Triggering repair...`);
      for (const txt of allTextLayers) {
        if (txt.allocatedBox) {
          let minH = 40;
          if (txt.role === 'heading') minH = 80;
          else if (txt.role === 'cta') minH = 60;
          txt.allocatedBox.height = Math.max(txt.allocatedBox.height * 0.85, minH);
          txt.allocatedBox.y += Math.random() > 0.5 ? 10 : -10;
          // Re-clamp bounds
          txt.allocatedBox.x = Math.max(constraints.safeX, txt.allocatedBox.x);
          txt.allocatedBox.width = Math.min(txt.allocatedBox.width, canvasWidth - constraints.safeX - txt.allocatedBox.x);
        }
      }
      const newEval = this.scoreComposition(optimized, constraints, canvasHeight, dsl, faceBox);
      score = newEval.score;
      issues = newEval.issues;
      attempts++;
    }

    if (score < 7.0) {
      console.warn(`[CompositionOptimizer] Layout unrecoverable (Score: ${score}). Forcing fail-safe centered fallback layout.`);
      // Strip complicated anchors and stack everything in the center
      let safeY = constraints.safeY + 150;
      const canvasWidth = (constraints.safeX * 2) + constraints.contentMaxWidth;
      for (const txt of allTextLayers) {
        txt.anchor = 'top_center';
        txt.alignment = 'center';
        if (txt.allocatedBox) {
           txt.allocatedBox.x = constraints.safeX;
           txt.allocatedBox.y = safeY;
           txt.allocatedBox.width = constraints.contentMaxWidth;
           safeY += txt.allocatedBox.height + 40;
        }
      }
    }

    return optimized;
  }

  private scoreComposition(dsl: ICompiledLayoutDSL, constraints: LayoutConstraints, canvasHeight: number, originalDsl: ICompiledLayoutDSL, faceBox?: any): { score: number, issues: string[] } {
    let score = 10.0;
    const issues: string[] = [];
    const allTextLayers = dsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[];

    // 1. Geometry Score
    for (let i = 0; i < allTextLayers.length; i++) {
      for (let j = i + 1; j < allTextLayers.length; j++) {
        const b1 = allTextLayers[i].allocatedBox;
        const b2 = allTextLayers[j].allocatedBox;
        if (b1 && b2) {
          if (b1.x < b2.x + b2.width && b1.x + b1.width > b2.x && b1.y < b2.y + b2.height && b1.y + b1.height > b2.y) {
            score -= 2.5;
            issues.push(`Text collision`);
          }
        }
      }
      
      const box = allTextLayers[i].allocatedBox;
      if (box && faceBox) {
         if (box.x < faceBox.x + faceBox.width && box.x + box.width > faceBox.x && box.y < faceBox.y + faceBox.height && box.y + box.height > faceBox.y) {
            score -= 4.0;
            issues.push('Face collision');
         }
      }

      if (box) {
        const canvasWidth = (constraints.safeX * 2) + constraints.contentMaxWidth;
        if (box.y < constraints.safeY || (box.y + box.height) > (canvasHeight - constraints.safeY)) {
          score -= 1.5;
          issues.push(`Vertical margin violation on layer ${allTextLayers[i].id} (${box.y}, ${box.height})`);
        }
        if (box.x < constraints.safeX || (box.x + box.width) > (canvasWidth - constraints.safeX)) {
          score -= 2.5;
          issues.push(`Horizontal margin violation on layer ${allTextLayers[i].id} (${box.x}, ${box.width})`);
        }
      }
    }

    // 2. Hierarchy Score
    const heading = allTextLayers.find(l => l.role === 'heading');
    const cta = allTextLayers.find(l => l.role === 'cta');
    if (heading && cta && heading.allocatedBox && cta.allocatedBox) {
       if (heading.allocatedBox.height < cta.allocatedBox.height) {
          score -= 2.0;
          issues.push('Hierarchy violation: CTA larger than Heading');
       }
    }

    // 3. Semantic Intent Score
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
