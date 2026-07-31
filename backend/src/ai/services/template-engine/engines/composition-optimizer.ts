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
    
    return optimized;
  }
}
