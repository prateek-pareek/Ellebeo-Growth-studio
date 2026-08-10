import { IDSLTextLayer, TypographyTokens } from '../interfaces';
import { LayoutConstraints, LayoutEngine } from './layout-engine';
import { DesignTokens } from './theme-engine';
import { FontRegistry } from '../font-registry';

export interface TypographyContext {
  w: number;
  h: number;
  brandFont: string;
  dynamicFontSize: number;
  dynamicTextColor: string;
  validSecondaryColor: string;
  validBackgroundColor: string;
  overlayText?: string;
  structuredText?: { headline?: string; subheadline?: string; cta?: string; };
  faceCoordinates?: any;
  escapeXml?: (str: string) => string;
  constraints: LayoutConstraints;
  layoutEngine: LayoutEngine;
  designTokens?: DesignTokens;
  typographyTokens?: TypographyTokens; // NEW ARCHITECTURE
  layoutState?: import('../interfaces').ILayoutState;
  colorHierarchy?: import('./color-composition-engine').ColorHierarchy;
  designSpec?: import('../interfaces').ISemanticDesignSpec;
  typographyMetrics?: {
    heroSize: number;
    primarySize: number;
    secondarySize: number;
    bodySize: number;
    metadataSize: number;
    heroLineHeight: number;
    bodyLineHeight: number;
    heroTracking: string;
    metadataTracking: string;
  };
}

// ai-image-generation.service.ts's overlayBrandingAndText() always draws a
// branding footer band (business name + slide counter) across the bottom of
// the canvas, independently of this engine's own layout/safe-zone math — the
// two systems don't share state. That footer isn't fixed-height: the fallback
// tracker sits at a flat h-85, but the randomized "classic bar" variant
// (1-in-5 chance per slide) positions itself at
// h - (geometryOut.safeY + 80) - 60, and safeY itself is
// round(80 * behavior.negativeSpaceMultiplier) — up to 80*1.8=144 for
// "expansive" (calm/quiet) families like Testimonial. Worst case the footer's
// top edge lands at h - (144+80) - 60 = h - 284. Reserving only ~100-120px
// (an earlier, too-narrow guess) still let a 2-line heading's second line
// dip into it. This engine has no access to that behavior profile to compute
// the exact figure, so reserve generously for the worst case instead of
// precisely replicating cross-file math here.
const BRANDING_FOOTER_RESERVE_PX = 120;

export class TypographyEngine {
  private fontRegistry: FontRegistry;

  constructor() {
    this.fontRegistry = new FontRegistry();
  }

  /**
   * Main text rendering entry point that handles wrapping, styling, and safe-zone collision
   */
  public renderTextLayer(ctx: TypographyContext, layer: IDSLTextLayer): string {
    // 1. Map text layer ID to structured text fields if available
    let rawText = '';

    if (ctx.structuredText && (ctx.structuredText.headline || ctx.structuredText.subheadline || ctx.structuredText.cta)) {
      if (layer.id === 'headline' || layer.role === 'heading') rawText = ctx.structuredText.headline || '';
      else if (layer.id === 'subheadline' || layer.role === 'tagline') rawText = ctx.structuredText.subheadline || '';
      else if (layer.id === 'cta' || layer.role === 'footnote') rawText = ctx.structuredText.cta || '';
      else if (layer.role === 'body') {
        let overlay = ctx.overlayText || '';
        if (ctx.structuredText.headline && overlay.includes(ctx.structuredText.headline)) {
          overlay = overlay.replace(ctx.structuredText.headline, '').trim();
        }
        rawText = ctx.structuredText.subheadline || overlay;
      }

      // Deduplication safeguard: Prevent the CTA/Tagline from rendering the exact same massive string as the Headline
      if (layer.role !== 'heading' && ctx.structuredText.headline && rawText === ctx.structuredText.headline) {
        rawText = '';
      }
    } else {
      rawText = ctx.overlayText || '';
    }

    if (!rawText) return '';

    // STRICT DEDUPLICATION SAFEGUARD:
    // If the pipeline passes down a single flat string (overlayText) and this layout has multiple
    // text layers (e.g. heading + footnote), they will BOTH fall back to the exact same string.
    // We check our LayoutState and abort if we've already rendered this exact string on this slide.
    if (ctx.layoutState?.renderedStrings?.includes(rawText)) {
      return '';
    }
    
    // Register the string so subsequent layers on this slide don't duplicate it
    if (ctx.layoutState && ctx.layoutState.renderedStrings) {
      ctx.layoutState.renderedStrings.push(rawText);
    }

    const casingRule = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
    if (casingRule === 'force_uppercase') {
      rawText = rawText.toUpperCase();
    } else if (casingRule === 'force_lowercase') {
      rawText = rawText.toLowerCase();
    }

    const isHeroHeading = layer.role === 'heading';
    // Remove "first word" chunking; we'll do balanced line splitting later in wrapText
    let textToWrap = rawText;

    // 2. Resolve Base Style
    const style = this.resolveStyle(layer, ctx, textToWrap);

    // 3. Pre-calculate line height & wrapping bounds
    let lineHeightMultiplier = 1.35;
    let explicitLineHeight = false;
    let absoluteLineHeight = 26;

    if ((layer as any).lineHeight !== undefined) {
      lineHeightMultiplier = (layer as any).lineHeight;
      explicitLineHeight = true;
    } else if (layer.role === 'heading') {
      lineHeightMultiplier = ctx.typographyMetrics?.heroLineHeight || 1.18;
      explicitLineHeight = true;
    } else if (layer.role === 'body') {
      lineHeightMultiplier = ctx.typographyMetrics?.bodyLineHeight || 1.35;
      explicitLineHeight = true;
    }

    const isStoryLH = ctx.h > ctx.w;
    if (isStoryLH && layer.role === 'heading') lineHeightMultiplier *= 1.2;

    let lineHeight = Math.round(style.fontSize * lineHeightMultiplier);
    if (!explicitLineHeight && (layer.role === 'tagline' || layer.role === 'footnote')) {
      lineHeight = absoluteLineHeight;
    }

    // Pre-calculate X and alignment based on allocated box or anchor
    let anchor = 'start';
    if (layer.alignment === 'center' || layer.anchor.includes('center')) anchor = 'middle';
    if (layer.alignment === 'right' || layer.anchor.includes('right')) anchor = 'end';
    if (layer.alignment === 'left' || layer.anchor.includes('left')) anchor = 'start';

    let layerMaxWidth = ctx.constraints.contentMaxWidth;
    if (layer.allocatedBox) {
      layerMaxWidth = layer.allocatedBox.width;
    } else if ((layer as any).maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
    }
    const maxW = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);

    let effectiveMaxW = layer.allocatedBox ? layer.allocatedBox.width : maxW;

    // If we don't have a rigid allocated box, dynamically constrain the width based on the anchor position
    if (!layer.allocatedBox) {
      const tempAnchor = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, 0, ctx.constraints);
      if (anchor === 'start') {
        const availableW = (ctx.w - ctx.constraints.safeX) - tempAnchor.x;
        if (availableW > 100 && availableW < effectiveMaxW) effectiveMaxW = availableW;
      } else if (anchor === 'middle') {
        const distToLeft = tempAnchor.x - ctx.constraints.safeX;
        const distToRight = (ctx.w - ctx.constraints.safeX) - tempAnchor.x;
        const availableW = Math.min(distToLeft, distToRight) * 2;
        if (availableW > 100 && availableW < effectiveMaxW) effectiveMaxW = availableW;
      } else if (anchor === 'end') {
        const availableW = tempAnchor.x - ctx.constraints.safeX;
        if (availableW > 100 && availableW < effectiveMaxW) effectiveMaxW = availableW;
      }
    }

    // Wrap text to determine actual lines and height BEFORE Y calculation
    let escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW);
    let textHeight = escapedLines.length * lineHeight;

    // VERTICAL OVERFLOW PROTECTION
    if (layer.allocatedBox && textHeight > layer.allocatedBox.height) {
      let attempts = 0;
      let currentFontSize = style.fontSize;
      const minFontSize = style.fontSize * 0.40; // Max 60% shrink
      const originalLineHeightMultiplier = lineHeight / style.fontSize;

      while (textHeight > layer.allocatedBox.height && currentFontSize > minFontSize && attempts < 10) {
        currentFontSize = Math.floor(currentFontSize * 0.90); // 10% shrink per iteration
        lineHeight = Math.floor(currentFontSize * originalLineHeightMultiplier);
        style.fontSize = currentFontSize;
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW);
        textHeight = escapedLines.length * lineHeight;
        attempts++;
      }

      // If it still overflows after maximum shrinkage, we gracefully accept the overflow instead of mutating the copy.
      // We do NOT truncate the string with '...'.
    }

    let x = ctx.w / 2;
    let y = ctx.h / 2;

    if (layer.allocatedBox) {
      x = layer.allocatedBox.x;
      y = layer.allocatedBox.y;

      // Adjust X for SVG text-anchor relative to the box left edge
      if (anchor === 'middle') x = layer.allocatedBox.x + layer.allocatedBox.width / 2;
      if (anchor === 'end') x = layer.allocatedBox.x + layer.allocatedBox.width;
    } else {
      const baseAnchorResult = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, textHeight, ctx.constraints);
      x = baseAnchorResult.x;
      y = baseAnchorResult.y;

      // Non-negotiable Face Avoidance: Ensure text doesn't overlap facial regions
      const targetBox = { x, y, width: effectiveMaxW, height: textHeight };
      const resolvedBox = ctx.layoutEngine.resolveFaceCollision(targetBox, ctx.constraints, (ctx as any).family);
      x = resolvedBox.x;
      y = resolvedBox.y;
      effectiveMaxW = resolvedBox.width;

      const anchorStr = (layer.anchor as string) || '';
      // Fix bug: isCenterAnchor must check HORIZONTAL centering (_center, center, middle), 
      // NOT vertical keywords like 'top' or 'bottom' which misclassified top_left / bottom_left as centered!
      const isCenterAnchor = anchorStr.endsWith('_center') || anchorStr === 'center' || anchorStr === 'top_center' || anchorStr === 'bottom_center' || anchorStr === 'middle_center';

      if (anchor === 'middle') {
        if (layer.anchor.includes('left')) x = ctx.constraints.safeX + effectiveMaxW / 2;
        else if (layer.anchor.includes('right')) x = ctx.w - ctx.constraints.safeX - effectiveMaxW / 2;
        else x = ctx.w / 2;
      } else if (anchor === 'end') {
        if (layer.anchor.includes('left')) x = ctx.constraints.safeX + effectiveMaxW;
        else if (isCenterAnchor) x = ctx.w / 2 + effectiveMaxW / 2;
        else x = ctx.w - ctx.constraints.safeX;
      } else if (anchor === 'start') {
        if (isCenterAnchor) x = ctx.w / 2 - effectiveMaxW / 2;
      }
    }

    // PHASE 2.5: SMART COMPOSITION (No Shrinking, No Failing)

    // 1. Vertical Validation & Clamping
    // We now respect the LayoutEngine's constraints directly instead of artificially clamping
    // Sequential Y Stacking: Check if previous text regions already occupy space
    // and push this layer below them to prevent text collision
    if (!layer.allocatedBox && ctx.layoutState && ctx.layoutState.occupiedRegions.length > 0) {
      const textRegions = ctx.layoutState.occupiedRegions.filter(r => r.role === 'heading' || r.role === 'tagline' || r.role === 'body' || r.role === 'footnote');
      if (textRegions.length > 0) {
        const lastTextRegion = textRegions[textRegions.length - 1];
        
        // Vertical Rhythm & Cluster Spacing (DesignSpec Driven)
        let rhythmMultiplier = 0.6;
        if (ctx.layoutState?.family === 'typography_hero') rhythmMultiplier = 0.4;
        else if (ctx.layoutState?.family === 'image_hero') rhythmMultiplier = 0.8;
        
        const isStoryRhythm = ctx.h > ctx.w;
        if (isStoryRhythm) rhythmMultiplier *= 0.75;

        if (ctx.designSpec?.composition?.negativeSpace === 'large' || ctx.designSpec?.composition?.negativeSpace === 'massive') {
          rhythmMultiplier *= 1.5; // Huge breathing room between elements
        } else if (ctx.designSpec?.composition?.negativeSpace === 'minimal') {
          rhythmMultiplier *= 0.5; // Tight clustering
        }

        // Density affects rhythm too
        const density = ctx.designSpec?.decorations?.density || 'medium';
        if (density === 'high') rhythmMultiplier *= 0.7;
        if (density === 'low' || density === 'none') rhythmMultiplier *= 1.3;

        const interElementGap = Math.round(style.fontSize * rhythmMultiplier); // Rhythmic gap based on font size
        const stackedY = lastTextRegion.y + (lastTextRegion.height || 0) + interElementGap;
        // Only stack if the new layer would collide with the previous one
        if (Math.abs(y - lastTextRegion.y) < (lastTextRegion.height || 60) + 20) {
          y = stackedY;
        }
      }
    }

    if (y + textHeight > ctx.h - ctx.constraints.margins.bottom) {
      y = ctx.h - textHeight - ctx.constraints.margins.bottom;
    }
    if (y < ctx.constraints.safeY) {
      y = ctx.constraints.safeY;
    }

    // 2. Horizontal Validation & Clamping
    // The vertical clamp above doesn't fix horizontal overflow (boxX off the left/right edge).
    // Clamp x to the safe area based on text-anchor mode.
    const minX = ctx.constraints.safeX;
    const maxX = ctx.w - ctx.constraints.safeX;
    if (anchor === 'middle') {
      x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
    } else if (anchor === 'end') {
      x = Math.max(x, minX + effectiveMaxW);
      x = Math.min(x, maxX);
    } else {
      x = Math.min(x, maxX - effectiveMaxW);
      x = Math.max(x, minX);
    }

    let boxX = x;
    if (anchor === 'middle') boxX = x - effectiveMaxW / 2;
    else if (anchor === 'end') boxX = x - effectiveMaxW;

    // Horizontal overflow guard: clamp boxX (and x) back into the safe area if it
    // would bleed off the left/right edge — previously caused text like "FLAWLESS
    // GLOW" to render cut off at the canvas edge instead of being pulled back in bounds.
    if (boxX < ctx.constraints.safeX - 20 || boxX + effectiveMaxW > ctx.w - ctx.constraints.safeX + 20) {
      const minX = ctx.constraints.safeX;
      const maxX = ctx.w - ctx.constraints.safeX;
      if (anchor === 'middle') {
        x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
      } else if (anchor === 'end') {
        x = Math.max(x, minX + effectiveMaxW);
        x = Math.min(x, maxX);
      } else {
        x = Math.min(x, maxX - effectiveMaxW);
        x = Math.max(x, minX);
      }
      boxX = anchor === 'middle' ? x - effectiveMaxW / 2 : anchor === 'end' ? x - effectiveMaxW : x;
    }

    let finalSvg = '';

    // Geometry locked. Get Font metrics for baseline.
    const fontBehavior = this.fontRegistry.getBehavior(ctx.brandFont);
    const baselineRatio = fontBehavior.baseline || 0.75;
    const baselineY = y + style.fontSize * baselineRatio;

    // 5. Generate SVG
    const content = escapedLines.map((line: string, idx: number) => {
      return `<tspan x="${x}" dy="${idx === 0 ? 0 : lineHeight}">${line}</tspan>`;
    }).join('');

    let strokeAddition = '';
    if (layer.role === 'heading' && fontBehavior.requiresFauxStrokeForDominance) {
      strokeAddition = ` stroke="${style.fill}" stroke-width="2" stroke-linejoin="round" `;
    }

    let transformStr = '';
    if (layer.rotation) {
      transformStr = ` transform="rotate(${layer.rotation} ${x} ${baselineY})"`;
    }

    let opacityStr = '';
    if ((layer as any).opacity !== undefined) {
      opacityStr = ` opacity="${(layer as any).opacity}"`;
    } else if (style.opacity !== undefined && style.opacity !== 1.0) {
      opacityStr = ` opacity="${style.opacity}"`;
    }
    let containerSvg = '';
    if (layer.component === 'pill_label' || layer.component === 'solid_card' || layer.component === 'inset_card') {
      const padX = layer.component === 'pill_label' ? 24 : 40;
      const padY = layer.component === 'pill_label' ? 12 : 30;
      const radius = layer.component === 'pill_label' ? (textHeight + padY * 2) / 2 : (layer.component === 'inset_card' ? 8 : 0);

      let bgFill = '#FFFFFF';
      if (ctx.colorHierarchy) {
        bgFill = layer.role === 'heading' ? ctx.colorHierarchy.cardSurface : ctx.colorHierarchy.accent;
        // Ensure text contrasts with the new background
        style.fill = layer.role === 'heading' ? ctx.colorHierarchy.primaryText : ctx.colorHierarchy.primaryBackground;
      }

      containerSvg = `
          <!-- Structural Container: ${layer.component} -->
          <rect x="${boxX - padX}" y="${y - padY}" width="${effectiveMaxW + padX * 2}" height="${textHeight + padY * 2}" rx="${radius}" fill="${bgFill}" filter="url(#premium_shadow)" />
        `;
    }

    finalSvg = `${containerSvg}<text x="${x}" y="${baselineY}" text-anchor="${anchor}" class="overlay-text" style="font-family: ${style.fontFamily}; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};" filter="url(#premium_shadow)"${strokeAddition}${transformStr}${opacityStr}>${content}</text>`;

    // Write to Shared Layout State
    if (ctx.layoutState) {
      ctx.layoutState.occupiedRegions.push({
        id: layer.id,
        role: layer.role,
        x: boxX,
        y: y,
        width: maxW,
        height: textHeight,
        baseline: baselineY,
        fontSize: style.fontSize,
        lineHeight: lineHeight,
        zIndex: layer.zIndex,
        visualWeight: style.fontWeight,
        opticalCenter: { x: boxX + maxW / 2, y: y + textHeight / 2 }
      });
    }

    return finalSvg;
  }

  public renderTextGroupLayer(ctx: TypographyContext, groupLayer: import('../interfaces').IDSLTextGroupLayer): string {
    let groupSvg = '';
    let currentLocalY = 0;
    let groupMaxWidth = 0;
    
    interface ChildRenderData {
      svg: string;
      localY: number;
      localX: number;
      width: number;
      height: number;
    }
    
    const childrenData: ChildRenderData[] = [];
    const maxW = groupLayer.maxWidthPercent ? Math.round(ctx.w * (groupLayer.maxWidthPercent / 100)) : ctx.constraints.contentMaxWidth;

    // 1. Process each child text layer to calculate local layout
    for (const child of groupLayer.children) {
      // Resolve text content first (same logic as single layer)
      let rawText = '';
      if (ctx.structuredText && (ctx.structuredText.headline || ctx.structuredText.subheadline || ctx.structuredText.cta)) {
        if (child.role === 'heading') rawText = ctx.structuredText.headline || '';
        else if (child.role === 'tagline') rawText = ctx.structuredText.subheadline || '';
        else if (child.role === 'footnote') rawText = ctx.structuredText.cta || '';
        else if (child.role === 'body') {
          let overlay = ctx.overlayText || '';
          if (ctx.structuredText.headline && overlay.includes(ctx.structuredText.headline)) {
            overlay = overlay.replace(ctx.structuredText.headline, '').trim();
          }
          rawText = ctx.structuredText.subheadline || overlay;
        }
        if (child.role !== 'heading' && ctx.structuredText.headline && rawText === ctx.structuredText.headline) {
          rawText = ''; // Deduplication
        }
      } else {
        rawText = ctx.overlayText || '';
      }

      if (!rawText || ctx.layoutState?.renderedStrings?.includes(rawText)) continue;
      if (ctx.layoutState && ctx.layoutState.renderedStrings) {
        ctx.layoutState.renderedStrings.push(rawText);
      }

      const style = this.resolveStyle(child, ctx, rawText);
      let lineHeightMultiplier = 1.35;
      if ((child as any).lineHeight !== undefined) lineHeightMultiplier = (child as any).lineHeight;
      else if (child.role === 'heading') lineHeightMultiplier = ctx.typographyMetrics?.heroLineHeight || 1.18;
      else if (child.role === 'body') lineHeightMultiplier = ctx.typographyMetrics?.bodyLineHeight || 1.35;
      
      const isStoryLHChild = ctx.h > ctx.w;
      if (isStoryLHChild && child.role === 'heading') lineHeightMultiplier *= 1.2;
      
      const escapedLines = this.wrapText(rawText, style.fontSize, child, ctx, maxW);
      const lineHeight = Math.round(style.fontSize * lineHeightMultiplier);
      const textHeight = escapedLines.length * lineHeight;
      const childMaxW = Math.min(...escapedLines.map(l => l.length * (style.fontSize * 0.6))); // Rough width estimation

      if (childMaxW > groupMaxWidth) groupMaxWidth = childMaxW;

      let opacityStr = '';
      if (style.opacity !== undefined && style.opacity !== 1.0) opacityStr = ` opacity="${style.opacity}"`;

      let childSvg = `<text font-family="${style.fontFamily}" font-size="${style.fontSize}px" font-weight="${style.fontWeight}" font-style="${style.fontStyle}" fill="${style.fill}" letter-spacing="${style.letterSpacing}" text-anchor="${groupLayer.alignment === 'center' ? 'middle' : groupLayer.alignment === 'right' ? 'end' : 'start'}"${opacityStr}>`;
      for (let i = 0; i < escapedLines.length; i++) {
        const line = escapedLines[i];
        let dx = '0';
        if (groupLayer.alignment === 'center') dx = '50%';
        else if (groupLayer.alignment === 'right') dx = '100%';
        childSvg += `<tspan x="${dx}" dy="${i === 0 ? '1em' : lineHeight}">${ctx.escapeXml ? ctx.escapeXml(line) : line}</tspan>`;
      }
      childSvg += `</text>`;

      childrenData.push({
        svg: childSvg,
        localY: currentLocalY,
        localX: 0,
        width: childMaxW,
        height: textHeight
      });

      // Add inter-element rhythmic gap for next child
      let rhythmMult = 0.6;
      if (ctx.layoutState?.family === 'typography_hero') rhythmMult = 0.4;
      else if (ctx.layoutState?.family === 'image_hero') rhythmMult = 0.8;
      
      const isStoryGap = ctx.h > ctx.w;
      if (isStoryGap) rhythmMult *= 0.75;
      
      const interElementGap = Math.round(style.fontSize * rhythmMult);
      currentLocalY += textHeight + interElementGap;
    }

    if (childrenData.length === 0) return '';

    // Remove the trailing gap from the total height
    const lastChild = childrenData[childrenData.length - 1];
    let totalGroupHeight = lastChild.localY + lastChild.height;

    // GLOBAL GROUP SHRINKAGE: Ensure text doesn't overflow canvas vertically while perfectly preserving the Golden Ratio hierarchy
    let groupShrinkageMultiplier = 1.0;
    const effectiveFooterReserve = ctx.h > 1300 ? Math.round(ctx.h * 0.20) : 120;
    const maxAllowedHeight = groupLayer.allocatedBox ? groupLayer.allocatedBox.height : (ctx.h - effectiveFooterReserve - ctx.constraints.safeY);

    if (totalGroupHeight > maxAllowedHeight) {
      groupShrinkageMultiplier = maxAllowedHeight / totalGroupHeight;
      if (groupShrinkageMultiplier < 0.5) groupShrinkageMultiplier = 0.5; // Cap maximum shrinkage
      totalGroupHeight *= groupShrinkageMultiplier;
      groupMaxWidth *= groupShrinkageMultiplier;
    }

    // 2. Global Positioning for the ENTIRE Group
    const baseAnchorResult = ctx.layoutEngine.resolveAnchor(groupLayer.anchor, 0, totalGroupHeight, ctx.constraints);
    let x = baseAnchorResult.x;
    let y = baseAnchorResult.y;

    const targetBox = { x, y, width: groupMaxWidth, height: totalGroupHeight };
    const resolvedBox = ctx.layoutEngine.resolveFaceCollision(targetBox, ctx.constraints, (ctx as any).family);
    x = resolvedBox.x;
    y = resolvedBox.y;
    groupMaxWidth = resolvedBox.width;

    // Alignment offsets relative to the anchor
    const anchorStr = (groupLayer.anchor as string) || '';
    const isCenterAnchor = anchorStr.endsWith('_center') || anchorStr === 'center' || anchorStr === 'top_center' || anchorStr === 'bottom_center' || anchorStr === 'middle_center';
    
    if (groupLayer.alignment === 'center') {
      if (groupLayer.anchor.includes('left')) x = ctx.constraints.safeX + groupMaxWidth / 2;
      else if (groupLayer.anchor.includes('right')) x = ctx.w - ctx.constraints.safeX - groupMaxWidth / 2;
      else x = ctx.w / 2;
    } else if (groupLayer.alignment === 'right') {
      if (groupLayer.anchor.includes('left')) x = ctx.constraints.safeX + groupMaxWidth;
      else if (isCenterAnchor) x = ctx.w / 2 + groupMaxWidth / 2;
      else x = ctx.w - ctx.constraints.safeX;
    } else if (groupLayer.alignment === 'left') {
      if (isCenterAnchor) x = ctx.w / 2 - groupMaxWidth / 2;
    }

    // 3. Render the group
    const scaleStr = groupShrinkageMultiplier !== 1.0 ? ` scale(${groupShrinkageMultiplier})` : '';
    groupSvg += `<g transform="translate(${x}, ${y})${scaleStr}">`;
    for (const child of childrenData) {
      groupSvg += `<g transform="translate(0, ${child.localY})">${child.svg}</g>`;
    }
    groupSvg += `</g>`;

    // 4. Update Layout State
    if (ctx.layoutState) {
      ctx.layoutState.occupiedRegions.push({
        id: groupLayer.id,
        role: groupLayer.role,
        x, y,
        width: groupMaxWidth,
        height: totalGroupHeight,
        zIndex: groupLayer.zIndex
      });
    }

    return groupSvg;
  }

  /**
   * Resolves the font properties depending on the typographical system, layer role, and DSL properties.
   */
  private resolveStyle(layer: IDSLTextLayer, ctx: TypographyContext, text: string) {
    const role = layer.role;
    let fontSize = ctx.dynamicFontSize;
    let fontWeight = 'normal';
    let fontStyle = 'normal';
    let fill = ctx.dynamicTextColor;
    // Use ColorHierarchy for brand-aware contrast (from BrandDNA palette)
    if (ctx.colorHierarchy) {
      fill = ctx.colorHierarchy.primaryText;
    }
    let letterSpacing = 'normal';
    let fontFamily = `'${ctx.brandFont}', sans-serif`;

    const fontBehavior = this.fontRegistry.getBehavior(ctx.brandFont);

    // 1. DSL Layer Direct Property Overrides (if defined)
    const layerObj = layer as any;
    if (layerObj.fontSize) {
      fontSize = layerObj.fontSize;
    }

    if (layerObj.tracking !== undefined) {
      letterSpacing = `${layerObj.tracking}em`;
    }

    // Default legacy sizes if not provided
    if (!layerObj.fontSize) {
      if (role === 'heading') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.heroSize : 72;
      } else if (role === 'tagline') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.primarySize : 36;
      } else if (role === 'footnote') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.metadataSize : 16;
      } else if (role === 'body') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.bodySize : 18;
      } else if (role === 'cta') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.primarySize * 0.75 : 24;
      }
    }

    // NEW ARCHITECTURE: Configuration-Driven Design Recipe
    // Safe default if tokens are missing
    const tokens = ctx.typographyTokens || {
      headlineWeight: 'medium',
      bodyWeight: 'medium',
      tracking: 'standard',
      casing: 'natural',
      contrast: 'medium'
    } as TypographyTokens;

    const weightMap: Record<string, string> = {
      'light': '300',
      'medium': '500',
      'heavy': '700',
      'hero': '900'
    };

    const trackingMap: Record<string, string> = {
      'tight': '-0.04em',
      'standard': '0em',
      'airy': '0.03em',
      'wide': '0.08em'
    };

    if (role === 'heading') {
      fontWeight = weightMap[tokens.headlineWeight] || '700';
      letterSpacing = trackingMap[tokens.tracking] || '0em';
      layerObj.capitalizationRule = tokens.casing;
      fill = ctx.colorHierarchy ? ctx.colorHierarchy.primaryText : ctx.dynamicTextColor;
    } else if (role === 'body') {
      fontWeight = weightMap[tokens.bodyWeight] || '400';
      fill = ctx.colorHierarchy ? ctx.colorHierarchy.secondaryText : ctx.dynamicTextColor;
    } else if (role === 'tagline' || role === 'footnote' || role === 'cta') {
      // Metadata is usually slightly bolder and wider than body, but smaller
      fontWeight = weightMap[tokens.bodyWeight] === 'light' ? '400' : '600';
      letterSpacing = trackingMap['wide'];
      layerObj.capitalizationRule = tokens.casing;
      fill = ctx.colorHierarchy ? ctx.colorHierarchy.secondaryText : (ctx.validSecondaryColor || ctx.dynamicTextColor);
    }

    // Inject serif font if the brand font is an editorial serif and it requires support
    if (tokens.headlineWeight === 'light' && tokens.tracking === 'wide') {
      // Very crude heuristic to add elegant fallbacks if it's an editorial recipe
      fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', 'Times New Roman', serif`;
    }

    // TYPOGRAPHY PHILOSOPHY INJECTION
    const family = ctx.layoutState?.family || 'default';
    if (role === 'heading') {
      if (family === 'editorial') {
        fontSize *= 1.3; // Dramatic majestic scale
        letterSpacing = '-0.05em'; // Tight tracking for dramatic tension
      } else if (family === 'minimalist') {
        fontSize *= 0.85; // Quiet, small scale
        letterSpacing = '0.1em'; // Wide tracking for negative space
      } else if (family === 'premium') {
        fontSize *= 1.1; // Moderate dominant scale
      }
    }
    
    // STORY BOOST: heroSize format-aware scaling
    const isStorySize = ctx.h > ctx.w;
    if (isStorySize && role === 'heading') {
      fontSize = Math.round(fontSize * 1.15);
    }

    // HEADLINE TREATMENTS: Semantic intent overrides for typography
    const headlineTreatment = ctx.designSpec?.typography?.headlineTreatment;
    if (role === 'heading' && headlineTreatment) {
      if (headlineTreatment === 'modern_minimal') {
        layerObj.alignment = layerObj.alignment || 'left';
        letterSpacing = '0.05em';
        layerObj.maxWidthPercent = layerObj.maxWidthPercent || 50;
      } else if (headlineTreatment === 'editorial_serif') {
        layerObj.alignment = layerObj.alignment || 'center';
        letterSpacing = '0em';
        layerObj.maxWidthPercent = layerObj.maxWidthPercent || 80;
        fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', 'Times New Roman', serif`;
      } else if (headlineTreatment === 'bold_condensed') {
        layerObj.alignment = layerObj.alignment || 'left';
        letterSpacing = '-0.05em';
        layerObj.capitalizationRule = 'uppercase';
      }
    }
    
    // FORMAT-AWARE OPACITY CASCADE
    let opacity = 1.0;
    if (role === 'tagline' || role === 'cta') opacity = 0.95;
    else if (role === 'body') opacity = 0.85;
    else if (role === 'footnote') opacity = 0.70;

    // DENSITY MODIFIERS: Apply tracking based on density
    const density = ctx.designSpec?.decorations?.density || 'medium';
    if (density === 'low' || density === 'none') {
      if (letterSpacing === '0em') letterSpacing = '0.04em'; // Breathe out
      if (letterSpacing === '0.08em') letterSpacing = '0.12em';
    } else if (density === 'high') {
      if (letterSpacing === '0.08em') letterSpacing = '0.04em'; // Tighten
      if (letterSpacing === '0em') letterSpacing = '-0.02em';
    }

    // DYNAMIC CLAMPING: Prevent single long words from bleeding off the canvas
    // Split by whitespace and hyphens to handle compound words like PRESS-POINT
    const words = text.split(/[\s\-]+/);
    const longestWord = words.reduce((a, b) => a.length > b.length ? a : b, '');
    if (longestWord.length > 0) {
      let layerMaxWidth = ctx.constraints.contentMaxWidth;
      if ((layer as any).maxWidthPercent) layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
      const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);

      // Use realistic char ratio (0.62 for uppercase bold headlines)
      const maxFontSizeForLongestWord = maxAvailableWidth / (longestWord.length * 0.62);
      if (fontSize > maxFontSizeForLongestWord) {
        fontSize = Math.floor(maxFontSizeForLongestWord);
      }
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing, fontFamily, opacity };
  }

  /**
   * Handles text wrapping based on layout constraints and DSL layer bounds.
   */
  private wrapText(text: string, fontSize: number, layer: IDSLTextLayer, ctx: TypographyContext, resolvedMaxWidth?: number): string[] {
    // Realistic character width multiplier for uppercase/bold fonts
    const estimatedCharWidth = fontSize * 0.62;

    let layerMaxWidth = resolvedMaxWidth || ctx.constraints.contentMaxWidth;
    if (!resolvedMaxWidth && (layer as any).maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
    }

    const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
    let maxCharsPerLine = Math.max(8, Math.floor(maxAvailableWidth / estimatedCharWidth));

    // BEHAVIORAL DESIGN: Dominance Stacking
    // Premium editorial design forces massive headlines to stack vertically rather than stretch wide.
    if (layer.role === 'heading') {
      if (ctx.typographyTokens?.headlineWeight === 'light' && ctx.typographyTokens?.tracking === 'wide') {
        maxCharsPerLine = Math.min(maxCharsPerLine, 12); // Extremely tight word wrap for tall, blocky editorial text
      } else if (fontSize >= 80) {
        maxCharsPerLine = Math.min(maxCharsPerLine, 18);
      }
    }

    const words = text.split(/\s+/);
    let smartLines: string[] = [];

    // Phase 2: Balanced Line Splitting for Headings (Character-based)
    if (layer.role === 'heading' && words.length > 1 && text.length <= maxCharsPerLine * 2.5) {
      // Try to split into 2 visually balanced lines around the midpoint
      let bestSplitIndex = 0;
      let minDiff = Infinity;
      const targetLength = text.length / 2;
      let currentLength = 0;
      for (let i = 0; i < words.length - 1; i++) {
        currentLength += words[i].length + 1; // +1 for space
        const diff = Math.abs(currentLength - targetLength);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplitIndex = i;
        }
      }

      const line1 = words.slice(0, bestSplitIndex + 1).join(' ');
      const line2 = words.slice(bestSplitIndex + 1).join(' ');

      if (line1.length <= maxCharsPerLine && line2.length <= maxCharsPerLine) {
        smartLines = [line1, line2];
      }
    }

    // Fallback to greedy wrap if balanced wrap wasn't applied or lines were too long
    if (smartLines.length === 0) {
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + word).length > maxCharsPerLine && currentLine.length > 0) {
          smartLines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine) smartLines.push(currentLine.trim());
    }

    const defaultEscape = (str: string) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const esc = ctx.escapeXml || defaultEscape;

    return smartLines.map(line => {
      let transformed = line;
      const casingRule = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
      if (casingRule === 'force_uppercase') {
        transformed = line.toUpperCase();
      } else if (casingRule === 'force_lowercase') {
        transformed = line.toLowerCase();
      }
      return esc(transformed);
    });
  }

  // ==========================================
  // TYPOGRAPHY PRIMITIVES
  // ==========================================

  public renderOversizedIndex(index: string, ctx: TypographyContext): string {
    const { safeX, safeY } = ctx.constraints;
    return `
      <!-- Oversized Background Index Number -->
      <text x="${safeX}" y="${safeY + 120}" font-family="${ctx.brandFont}, sans-serif" font-size="180px" fill="${ctx.dynamicTextColor}" opacity="0.05" font-weight="900" letter-spacing="-0.05em">${index}</text>
    `;
  }

  public renderMetadataLabel(label: string, value: string, ctx: TypographyContext): string {
    return `
      <!-- Technical Metadata Label -->
      <g opacity="0.8">
        <text x="0" y="0" font-family="monospace, ${ctx.brandFont}" font-size="10px" fill="${ctx.validSecondaryColor}" letter-spacing="0.1em" text-transform="uppercase">${label}</text>
        <text x="0" y="14" font-family="${ctx.brandFont}, sans-serif" font-size="12px" fill="${ctx.dynamicTextColor}" font-weight="bold">${value}</text>
      </g>
    `;
  }

  public renderEditorialTitle(title: string, ctx: TypographyContext): string {
    const { safeX, safeY } = ctx.constraints;
    return `
      <!-- High Fashion Editorial Title -->
      <text x="${ctx.w / 2}" y="${ctx.h / 2}" text-anchor="middle" font-family="${ctx.brandFont}, serif" font-size="64px" fill="${ctx.dynamicTextColor}" font-weight="300" letter-spacing="-0.02em">${title}</text>
    `;
  }
}
