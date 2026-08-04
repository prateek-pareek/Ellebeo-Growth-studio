import { ICompiledLayoutDSL, IDSLTextLayer, IDSLDecorationLayer, IDSLImageLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine } from './layout-engine';

export class CompositionOptimizer {
  
  /**
   * Optimizes the compiled layout DSL by calculating exact bounding boxes, 
   * balancing whitespace, and preventing overlaps, BEFORE it is passed to the renderers.
   */
  public optimize(dsl: ICompiledLayoutDSL, constraints: LayoutConstraints, canvasW: number, canvasHeight: number): ICompiledLayoutDSL {
    const optimized = JSON.parse(JSON.stringify(dsl)) as ICompiledLayoutDSL;
    
    if (!optimized.layers) return optimized;

    // Apply allowed variations for generative variety without losing family identity
    for (const layer of optimized.layers) {
      if (layer.allowedAnchors && layer.allowedAnchors.length > 0) {
        // Pseudo-random selection from allowed variations
        const randomIndex = Math.floor(Math.random() * layer.allowedAnchors.length);
        (layer as any).anchor = layer.allowedAnchors[randomIndex];
      }
    }

    // First pass: Calculate explicit Text and Image regions
    // This allows TypographyEngine to simply render inside its allocated box.
    const layoutEngine = new LayoutEngine(canvasW, canvasHeight);
    
    // Check if there is an image bleed behavior specified in a decoration or layer (or infer from family)
    // For now, if we have an image with an anchor, we can infer behavior, but let's default to full bleed
    // unless we detect a split pattern in the DSL (we can check the layout ID or layers)
    let imageBleedExtent = 'full_bleed';
    if (dsl.id.includes('z_pattern') || dsl.id.includes('asymmetrical')) {
      imageBleedExtent = 'asymmetrical_65';
    } else if (dsl.id.includes('split')) {
      imageBleedExtent = 'split_50';
    }

    const isZPattern = dsl.id.includes('z_pattern');
    const regions = layoutEngine.allocateRegions({ imageBleedExtent, readingJourney: isZPattern ? 'z_pattern' : 'linear' }, constraints);
    
    // Store regions in the DSL for Renderers to use
    optimized.canvasRegions = regions;

    let currentYOffset = regions.textRegion.y;
    
    for (const layer of optimized.layers) {
      if (layer.type === 'text') {
        const txtLayer = layer as IDSLTextLayer;
        // Basic height estimation since we don't have exact font metrics here,
        // but we assign a bounding box region that the TypographyEngine must respect.
        
        let estimatedHeight = 120;
        if (txtLayer.role === 'heading') estimatedHeight = 300;
        else if (txtLayer.role === 'body') estimatedHeight = 180;
        
        let { x, y } = layoutEngine.resolveAnchor(
          txtLayer.anchor || 'middle_left', 
          0, 
          estimatedHeight, 
          constraints,
          regions.textRegion
        );

        // Resolve face collision to carve out No-Text Zones
        y = layoutEngine.resolveFaceCollision({ x, y, width: regions.textRegion.width, height: estimatedHeight }, constraints);

        // Allocate strict bounding box inside textRegion
        txtLayer.allocatedBox = {
          x,
          y,
          width: regions.textRegion.width,
          height: estimatedHeight
        };
      }
    }
    
    // Balance Checks: Is whitespace balanced? Does the headline overpower?
    // (This is a simplified optimization pass that adjusts properties based on semantic rules)
    const textLayers = optimized.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    const imgLayer = optimized.layers.find(l => l.type === 'image') as IDSLImageLayer;
    
    if (imgLayer && imgLayer.mask === 'rectangle' && textLayers.length > 0) {
      // If we have a massive rectangle image, make sure typography anchors don't sit behind it
      // unless it's a full bleed.
      for (const txt of textLayers) {
        if (txt.allocatedBox && imgLayer.anchor === 'middle_right' && txt.anchor?.includes('right')) {
          // Force text to left if image is on the right
          txt.anchor = txt.anchor.replace('right', 'left') as import('../interfaces').LayoutAnchor;
          const { x, y } = layoutEngine.resolveAnchor(txt.anchor, 0, txt.allocatedBox.height, constraints);
          txt.allocatedBox.x = x;
          txt.allocatedBox.y = y;
        }
      }
    }
    
    // PHASE 4: Self-Correcting Scoring Loop (Contrast, Hierarchy, Whitespace)
    let { score, issues } = this.scoreComposition(optimized, constraints, canvasHeight);
    let attempts = 0;
    
    while (score < 7.0 && attempts < 3) {
      console.log(`[CompositionOptimizer] Score ${score} < 7.0. Issues: ${issues.join(', ')}. Triggering repair loop (Attempt ${attempts + 1})...`);
      
      // Repair Strategy: Adjust scale and distribute whitespace
      for (const txt of textLayers) {
        if (txt.allocatedBox) {
           // Shrink bounding box request slightly to allow TypographyEngine to drop font sizes
           txt.allocatedBox.height = Math.max(txt.allocatedBox.height * 0.85, 40); 
           // Nudge down to break overlaps
           txt.allocatedBox.y += Math.random() > 0.5 ? 15 : -15; 
        }
      }
      
      const newEval = this.scoreComposition(optimized, constraints, canvasHeight);
      score = newEval.score;
      issues = newEval.issues;
      attempts++;
    }
    
    if (score < 7.0) {
      console.warn(`[CompositionOptimizer] Repair loop failed to reach 7.0 (Final Score: ${score}). Proceeding with best effort.`);
    } else if (attempts > 0) {
      console.log(`[CompositionOptimizer] Repair successful! Final Score: ${score}`);
    }
    
    return optimized;
  }

  /**
   * Evaluates the composed DSL against core design principles (Hierarchy, Whitespace, Overlaps).
   */
  private scoreComposition(dsl: ICompiledLayoutDSL, constraints: LayoutConstraints, canvasHeight: number): { score: number, issues: string[] } {
    let score = 10.0;
    const issues: string[] = [];
    
    const textLayers = dsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    
    // Check Overlaps (Hierarchy Failure)
    for (let i = 0; i < textLayers.length; i++) {
      for (let j = i + 1; j < textLayers.length; j++) {
        const b1 = textLayers[i].allocatedBox;
        const b2 = textLayers[j].allocatedBox;
        if (b1 && b2) {
          const overlapX = b1.x < b2.x + b2.width && b1.x + b1.width > b2.x;
          const overlapY = b1.y < b2.y + b2.height && b1.y + b1.height > b2.y;
          if (overlapX && overlapY) {
            score -= 2.5;
            issues.push(`Text collision (${textLayers[i].id} & ${textLayers[j].id})`);
          }
        }
      }
    }
    
    // Check Whitespace Density
    if (textLayers.length > 3) {
       score -= 1.0;
       issues.push("Whitespace crowding (too many distinct text blocks)");
    }
    
    // Check Margin Violations
    for (const txt of textLayers) {
      if (txt.allocatedBox) {
        if (txt.allocatedBox.y < constraints.safeY || (txt.allocatedBox.y + txt.allocatedBox.height) > (canvasHeight - constraints.safeY)) {
          score -= 1.5;
          issues.push(`Margin violation (${txt.id})`);
        }
      }
    }
    
    return { score: Math.max(0, score), issues };
  }
}
