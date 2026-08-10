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

// overlayBrandingAndText() pins the branding footer to the absolute bottom of
 // the canvas (fixed ~70px strip). Keep text clear of that band plus a small gap
 // so multi-line headlines never collide with the business name / slide counter.
const BRANDING_FOOTER_RESERVE_PX = 96;
const FOOTER_GAP_PX = 16;

export class TypographyEngine {
  private fontRegistry: FontRegistry;

  constructor() {
    this.fontRegistry = new FontRegistry();
  }

  /**
   * Main text rendering entry point that handles wrapping, styling, and safe-zone collision
   */
  public renderTextLayer(ctx: TypographyContext, layer: IDSLTextLayer): string {
    // Composition optimizer may omit secondary copy to protect premium hierarchy / photo
    if ((layer as any)._omitForComposition || (layer as any).opacity === 0) {
      return '';
    }

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
    const trackingEm = this.parseTrackingEm(style.letterSpacing);
    let escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
    let textHeight = escapedLines.length * lineHeight;

    // VERTICAL OVERFLOW PROTECTION
    // Headlines may shrink modestly; secondary/tagline must NOT crush to fit —
    // truncate or omit instead (preserves premium visual communication).
    if (layer.allocatedBox && textHeight > layer.allocatedBox.height) {
      const isSecondary = layer.role === 'tagline' || layer.role === 'body' || layer.role === 'footnote';
      let attempts = 0;
      let currentFontSize = style.fontSize;
      // Secondary: allow at most ~12% shrink. Heading: up to ~30%.
      const minFontSize = isSecondary
        ? Math.max(18, Math.round(style.fontSize * 0.88))
        : Math.max(22, Math.round(style.fontSize * 0.70));
      const originalLineHeightMultiplier = lineHeight / style.fontSize;
      const maxAttempts = isSecondary ? 4 : 10;

      while (textHeight > layer.allocatedBox.height && currentFontSize > minFontSize && attempts < maxAttempts) {
        currentFontSize = Math.floor(currentFontSize * (isSecondary ? 0.96 : 0.90));
        lineHeight = Math.max(1, Math.floor(currentFontSize * originalLineHeightMultiplier));
        style.fontSize = currentFontSize;
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
        textHeight = escapedLines.length * lineHeight;
        attempts++;
      }

      if (textHeight > layer.allocatedBox.height && lineHeight > 0) {
        const maxLines = Math.max(1, Math.floor(layer.allocatedBox.height / lineHeight));
        // Premium: taglines stay ≤2 lines; bodies ≤3; never wall-of-text
        const roleCap = layer.role === 'tagline' ? 2 : layer.role === 'heading' ? 4 : 3;
        const capped = Math.min(maxLines, roleCap);
        if (escapedLines.length > capped) {
          escapedLines = escapedLines.slice(0, capped);
          const last = escapedLines[capped - 1] || '';
          if (last && !last.endsWith('…') && !last.endsWith('...')) {
            escapedLines[capped - 1] = last.replace(/[.,;:\s]+$/, '') + '…';
          }
          textHeight = escapedLines.length * lineHeight;
        }
      }

      // Still oversized secondary → omit entirely (better than micro-type on the photo)
      if (isSecondary && textHeight > layer.allocatedBox.height * 1.05) {
        return '';
      }
    }

    let x = ctx.w / 2;
    let y = ctx.h / 2;

    if (layer.allocatedBox) {
      x = layer.allocatedBox.x;
      y = layer.allocatedBox.y;

      // Adjust X for SVG text-anchor relative to the box left edge
      if (anchor === 'middle') x = layer.allocatedBox.x + layer.allocatedBox.width / 2;
      if (anchor === 'end') x = layer.allocatedBox.x + layer.allocatedBox.width;

      // CRITICAL: allocatedBox used to skip face avoidance entirely, so headlines
      // from the optimizer still landed on eyes/mouth. Always resolve collisions.
      const faceResolved = ctx.layoutEngine.resolveFaceCollision(
        { x: layer.allocatedBox.x, y: layer.allocatedBox.y, width: effectiveMaxW, height: textHeight },
        ctx.constraints,
        (ctx.layoutState?.family as any) || 'minimal'
      );
      if (faceResolved.y !== layer.allocatedBox.y || faceResolved.x !== layer.allocatedBox.x || faceResolved.width !== effectiveMaxW) {
        y = faceResolved.y;
        effectiveMaxW = faceResolved.width;
        if (anchor === 'middle') x = faceResolved.x + faceResolved.width / 2;
        else if (anchor === 'end') x = faceResolved.x + faceResolved.width;
        else x = faceResolved.x;
        // Re-wrap if width was shrunk to clear the face
        if (faceResolved.width < layer.allocatedBox.width - 8) {
          escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
          textHeight = escapedLines.length * lineHeight;
        }
      }
    } else {
      const baseAnchorResult = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, textHeight, ctx.constraints);
      x = baseAnchorResult.x;
      y = baseAnchorResult.y;

      // Non-negotiable Face Avoidance: Ensure text doesn't overlap facial regions
      const targetBox = { x, y, width: effectiveMaxW, height: textHeight };
      const resolvedBox = ctx.layoutEngine.resolveFaceCollision(targetBox, ctx.constraints, (ctx.layoutState?.family as any) || 'minimal');
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
        // Premium compositions need breathing room between headline and tagline
        let rhythmMultiplier = 0.85;
        if (ctx.layoutState?.family === 'typography_hero') rhythmMultiplier = 0.55;
        else if (ctx.layoutState?.family === 'image_hero' || ctx.designSpec?.composition?.visualPriority === 'image_hero') {
          rhythmMultiplier = 1.05;
        }
        
        const isStoryRhythm = ctx.h > ctx.w;
        if (isStoryRhythm) rhythmMultiplier *= 0.85;

        if (ctx.designSpec?.composition?.negativeSpace === 'large' || ctx.designSpec?.composition?.negativeSpace === 'massive') {
          rhythmMultiplier *= 1.45;
        } else if (ctx.designSpec?.composition?.negativeSpace === 'minimal') {
          rhythmMultiplier *= 0.65;
        }

        const density = ctx.designSpec?.decorations?.density || 'medium';
        if (density === 'high') rhythmMultiplier *= 0.75;
        if (density === 'low' || density === 'none') rhythmMultiplier *= 1.25;

        const interElementGap = Math.max(18, Math.round(style.fontSize * rhythmMultiplier));
        const stackedY = lastTextRegion.y + (lastTextRegion.height || 0) + interElementGap;
        // Stack if we'd collide OR land inside the previous cluster's vertical band
        if (Math.abs(y - lastTextRegion.y) < (lastTextRegion.height || 60) + interElementGap) {
          y = stackedY;
        }
      }
    }

    // Keep clear of the pinned branding footer AND the layout margin.
    const bottomClearance = Math.max(
      ctx.constraints.margins.bottom,
      BRANDING_FOOTER_RESERVE_PX
    ) + FOOTER_GAP_PX;

    if (y + textHeight > ctx.h - bottomClearance) {
      y = ctx.h - textHeight - bottomClearance;
    }
    if (y < ctx.constraints.safeY) {
      y = ctx.constraints.safeY;
    }

    // If the box still can't fit after clamping, shrink/cap again so we never
    // draw through the footer or off the top safe edge.
    const availableHeight = (ctx.h - bottomClearance) - Math.max(y, ctx.constraints.safeY);
    if (textHeight > availableHeight && availableHeight > 0) {
      const isSecondary = layer.role === 'tagline' || layer.role === 'body' || layer.role === 'footnote';
      const originalLineHeightMultiplier = lineHeight / Math.max(1, style.fontSize);
      let currentFontSize = style.fontSize;
      const minFontSize = isSecondary
        ? Math.max(18, Math.round(style.fontSize * 0.88))
        : Math.max(22, Math.round(style.fontSize * 0.70));
      let attempts = 0;
      while (textHeight > availableHeight && currentFontSize > minFontSize && attempts < (isSecondary ? 4 : 8)) {
        currentFontSize = Math.floor(currentFontSize * (isSecondary ? 0.96 : 0.90));
        lineHeight = Math.max(1, Math.floor(currentFontSize * originalLineHeightMultiplier));
        style.fontSize = currentFontSize;
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
        textHeight = escapedLines.length * lineHeight;
        attempts++;
      }
      if (textHeight > availableHeight && lineHeight > 0) {
        const roleCap = layer.role === 'tagline' ? 2 : layer.role === 'heading' ? 4 : 3;
        const maxLines = Math.min(roleCap, Math.max(1, Math.floor(availableHeight / lineHeight)));
        escapedLines = escapedLines.slice(0, maxLines);
        textHeight = escapedLines.length * lineHeight;
      }
      if (isSecondary && textHeight > availableHeight) {
        return '';
      }
      if (y + textHeight > ctx.h - bottomClearance) {
        y = Math.max(ctx.constraints.safeY, ctx.h - textHeight - bottomClearance);
      }
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
    if ((groupLayer as any)._omitForComposition) return '';

    interface ChildRenderData {
      role: string;
      svg: string;
      localY: number;
      width: number;
      height: number;
      fontSize: number;
    }

    const childrenData: ChildRenderData[] = [];
    const family = (ctx.layoutState?.family as any) || 'minimal';
    const isImageHero = family === 'image_hero' || ctx.designSpec?.composition?.visualPriority === 'image_hero';
    const maxW = groupLayer.allocatedBox
      ? groupLayer.allocatedBox.width
      : (groupLayer.maxWidthPercent
        ? Math.round(ctx.w * (groupLayer.maxWidthPercent / 100))
        : ctx.constraints.contentMaxWidth);

    // Premium group rhythm: headline → breathing gap → quiet secondary
    const resolveChildText = (child: import('../interfaces').IDSLTextLayer): string => {
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
          rawText = '';
        }
      } else {
        rawText = ctx.overlayText || '';
      }
      return rawText;
    };

    // Pass 1: measure children at intended sizes (no premature shrink)
    type Measured = {
      child: import('../interfaces').IDSLTextLayer;
      rawText: string;
      style: ReturnType<TypographyEngine['resolveStyle']>;
      lines: string[];
      lineHeight: number;
      height: number;
      width: number;
    };
    const measured: Measured[] = [];

    for (const child of groupLayer.children) {
      if ((child as any)._omitForComposition) continue;
      const rawText = resolveChildText(child);
      if (!rawText || ctx.layoutState?.renderedStrings?.includes(rawText)) continue;

      const style = this.resolveStyle(child, ctx, rawText);
      let lineHeightMultiplier = 1.3;
      if ((child as any).lineHeight !== undefined) lineHeightMultiplier = (child as any).lineHeight;
      else if (child.role === 'heading') lineHeightMultiplier = ctx.typographyMetrics?.heroLineHeight || 1.15;
      else if (child.role === 'body') lineHeightMultiplier = ctx.typographyMetrics?.bodyLineHeight || 1.35;
      else if (child.role === 'tagline') lineHeightMultiplier = 1.25;

      const trackingEm = this.parseTrackingEm(style.letterSpacing);
      let lines = this.wrapText(rawText, style.fontSize, child, ctx, maxW, trackingEm);
      // Cap secondary to 2 lines inside a group — keeps the cluster premium
      if ((child.role === 'tagline' || child.role === 'body') && lines.length > 2) {
        lines = lines.slice(0, 2);
        const last = lines[1] || '';
        if (last && !last.endsWith('…')) lines[1] = last.replace(/[.,;:\s]+$/, '') + '…';
      }
      if (child.role === 'heading' && lines.length > 3) {
        lines = lines.slice(0, 3);
      }

      const lineHeight = Math.round(style.fontSize * lineHeightMultiplier);
      const height = lines.length * lineHeight;
      const charW = style.fontSize * (0.58 + Math.max(0, trackingEm));
      const width = Math.max(...lines.map(l => Math.max(1, l.replace(/&[a-z]+;/gi, ' ').length) * charW));

      measured.push({ child, rawText, style, lines, lineHeight, height, width });
    }

    if (measured.length === 0) return '';

    const gapFor = (fontSize: number, role: string) => {
      let mult = isImageHero ? 0.95 : 0.75;
      if (ctx.designSpec?.composition?.negativeSpace === 'large' || ctx.designSpec?.composition?.negativeSpace === 'massive') {
        mult *= 1.35;
      }
      if (role === 'heading') mult *= 1.1;
      return Math.max(20, Math.round(fontSize * mult));
    };

    const computeStack = (items: Measured[]) => {
      let y = 0;
      let maxWidth = 0;
      const positions: { y: number; gapAfter: number }[] = [];
      for (let i = 0; i < items.length; i++) {
        positions.push({ y, gapAfter: i < items.length - 1 ? gapFor(items[i].style.fontSize, items[i].child.role) : 0 });
        maxWidth = Math.max(maxWidth, items[i].width);
        y += items[i].height + (i < items.length - 1 ? gapFor(items[i].style.fontSize, items[i].child.role) : 0);
      }
      return { totalHeight: y, maxWidth, positions };
    };

    // Pass 2: if group overflows budget, drop secondary children BEFORE shrinking
    const footerReserve = Math.max(ctx.constraints.margins.bottom, BRANDING_FOOTER_RESERVE_PX) + FOOTER_GAP_PX;
    let maxAllowedHeight = groupLayer.allocatedBox
      ? groupLayer.allocatedBox.height
      : (ctx.h - footerReserve - ctx.constraints.safeY);

    let active = [...measured];
    let stack = computeStack(active);

    while (stack.totalHeight > maxAllowedHeight && active.length > 1) {
      const dropIdx = active.findIndex(m => m.child.role === 'body' || m.child.role === 'tagline' || m.child.role === 'footnote');
      if (dropIdx < 0) break;
      console.log(`[TypographyEngine] Group: omitting ${active[dropIdx].child.role} to preserve premium cluster`);
      active.splice(dropIdx, 1);
      stack = computeStack(active);
    }

    // Mild uniform shrink only as last resort (never below 85%)
    let groupScale = 1.0;
    if (stack.totalHeight > maxAllowedHeight && stack.totalHeight > 0) {
      groupScale = Math.max(0.85, maxAllowedHeight / stack.totalHeight);
      stack.totalHeight *= groupScale;
      stack.maxWidth *= groupScale;
    }

    // Register rendered strings for active children only
    for (const m of active) {
      if (ctx.layoutState?.renderedStrings) ctx.layoutState.renderedStrings.push(m.rawText);
    }

    // Build child SVG at local coords (text already escaped by wrapText)
    let currentLocalY = 0;
    for (let i = 0; i < active.length; i++) {
      const m = active[i];
      const fontSize = Math.round(m.style.fontSize * groupScale);
      const lineHeight = Math.max(1, Math.round(m.lineHeight * groupScale));
      const height = m.lines.length * lineHeight;
      const width = m.width * groupScale;

      let opacityStr = '';
      if (m.style.opacity !== undefined && m.style.opacity !== 1.0) opacityStr = ` opacity="${m.style.opacity}"`;

      const anchor = groupLayer.alignment === 'center' ? 'middle' : groupLayer.alignment === 'right' ? 'end' : 'start';
      let childSvg = `<text font-family="${m.style.fontFamily}" font-size="${fontSize}px" font-weight="${m.style.fontWeight}" font-style="${m.style.fontStyle}" fill="${m.style.fill}" letter-spacing="${m.style.letterSpacing}" text-anchor="${anchor}"${opacityStr}>`;
      for (let li = 0; li < m.lines.length; li++) {
        childSvg += `<tspan x="0" dy="${li === 0 ? 0 : lineHeight}">${m.lines[li]}</tspan>`;
      }
      childSvg += `</text>`;

      childrenData.push({
        role: m.child.role,
        svg: childSvg,
        localY: currentLocalY,
        width,
        height,
        fontSize,
      });

      const gap = i < active.length - 1 ? Math.round(gapFor(m.style.fontSize, m.child.role) * groupScale) : 0;
      currentLocalY += height + gap;
    }

    const totalGroupHeight = currentLocalY;
    let groupMaxWidth = Math.max(...childrenData.map(c => c.width), stack.maxWidth);

    // Global group placement
    let x: number;
    let y: number;
    if (groupLayer.allocatedBox) {
      x = groupLayer.allocatedBox.x;
      y = groupLayer.allocatedBox.y;
      if (groupLayer.alignment === 'center') x = groupLayer.allocatedBox.x + groupLayer.allocatedBox.width / 2;
      else if (groupLayer.alignment === 'right') x = groupLayer.allocatedBox.x + groupLayer.allocatedBox.width;
    } else {
      const baseAnchorResult = ctx.layoutEngine.resolveAnchor(groupLayer.anchor, 0, totalGroupHeight, ctx.constraints);
      x = baseAnchorResult.x;
      y = baseAnchorResult.y;
    }

    const targetBox = {
      x: groupLayer.alignment === 'center' ? x - groupMaxWidth / 2 : groupLayer.alignment === 'right' ? x - groupMaxWidth : x,
      y,
      width: groupMaxWidth,
      height: totalGroupHeight,
    };
    const resolvedBox = ctx.layoutEngine.resolveFaceCollision(targetBox, ctx.constraints, family);
    y = resolvedBox.y;
    groupMaxWidth = resolvedBox.width;
    if (groupLayer.alignment === 'center') x = resolvedBox.x + resolvedBox.width / 2;
    else if (groupLayer.alignment === 'right') x = resolvedBox.x + resolvedBox.width;
    else x = resolvedBox.x;

    // Keep clear of footer
    const bottomClearance = footerReserve;
    if (y + totalGroupHeight > ctx.h - bottomClearance) {
      y = Math.max(ctx.constraints.safeY, ctx.h - totalGroupHeight - bottomClearance);
    }
    if (y < ctx.constraints.safeY) y = ctx.constraints.safeY;

    // Alignment offsets for non-allocated anchors
    if (!groupLayer.allocatedBox) {
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
    }

    let groupSvg = `<g transform="translate(${x}, ${y})">`;
    for (const child of childrenData) {
      groupSvg += `<g transform="translate(0, ${child.localY})">${child.svg}</g>`;
    }
    groupSvg += `</g>`;

    if (ctx.layoutState) {
      const boxX = groupLayer.alignment === 'center' ? x - groupMaxWidth / 2 : groupLayer.alignment === 'right' ? x - groupMaxWidth : x;
      ctx.layoutState.occupiedRegions.push({
        id: groupLayer.id,
        role: groupLayer.role,
        x: boxX,
        y,
        width: groupMaxWidth,
        height: totalGroupHeight,
        zIndex: groupLayer.zIndex,
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
    // Prefer photo/BrandDNA-aware dynamicTextColor (depth vs white from luminance).
    // ColorHierarchy card text is only correct on structural card containers.
    const onCard = layer.component === 'pill_label' || layer.component === 'solid_card' || layer.component === 'inset_card';
    let fill = ctx.dynamicTextColor
      || (onCard && ctx.colorHierarchy ? ctx.colorHierarchy.primaryText : undefined)
      || (ctx.colorHierarchy?.primaryText)
      || '#FFFFFF';
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
      // FontRegistry: brand-font-specific tracking + dominance strategy
      if (layerObj.tracking === undefined) {
        letterSpacing = `${fontBehavior.headlineTracking}em`;
        // Token tracking still wins when recipe explicitly asks for wide/airy editorial
        if (tokens.tracking === 'wide' || tokens.tracking === 'airy') {
          letterSpacing = trackingMap[tokens.tracking];
        } else if (tokens.tracking === 'tight') {
          letterSpacing = trackingMap.tight;
        }
      }
      if (fontBehavior.dominanceStrategy === 'scale' || fontBehavior.dominanceStrategy === 'both') {
        fontSize = Math.round(fontSize * (tokens.headlineWeight === 'hero' ? 1.08 : 1.04));
      }
      if (fontBehavior.dominanceStrategy === 'weight' || fontBehavior.dominanceStrategy === 'both') {
        const desired = parseInt(fontWeight, 10) || 700;
        fontWeight = String(Math.min(desired, fontBehavior.maxWeight));
      } else {
        // Scale-dominant fonts (serif displays) shouldn't force ultra-black weight
        fontWeight = String(Math.min(parseInt(fontWeight, 10) || 700, fontBehavior.maxWeight));
      }
      layerObj.capitalizationRule = tokens.casing;
      fill = ctx.dynamicTextColor || (onCard && ctx.colorHierarchy ? ctx.colorHierarchy.primaryText : fill);
    } else if (role === 'body') {
      fontWeight = weightMap[tokens.bodyWeight] || '400';
      fill = ctx.dynamicTextColor
        || (ctx.colorHierarchy ? ctx.colorHierarchy.secondaryText : fill);
    } else if (role === 'tagline' || role === 'footnote' || role === 'cta') {
      fontWeight = weightMap[tokens.bodyWeight] === 'light' ? '400' : '600';
      letterSpacing = layerObj.tracking !== undefined
        ? `${layerObj.tracking}em`
        : `${fontBehavior.taglineTracking}em`;
      layerObj.capitalizationRule = tokens.casing;
      fill = ctx.dynamicTextColor
        || (ctx.colorHierarchy ? ctx.colorHierarchy.secondaryText : (ctx.validSecondaryColor || fill));
    }

    // Inject serif font if the brand font is an editorial serif and it requires support
    if (tokens.headlineWeight === 'light' && tokens.tracking === 'wide') {
      fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', 'Times New Roman', serif`;
    }
    if (fontBehavior.classification === 'serif_display' || fontBehavior.classification === 'serif_text') {
      fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', serif`;
    }

    // TYPOGRAPHY PHILOSOPHY INJECTION
    // Keep subtle — geometry-compiler already applied family/dominance scaling.
    // A second 1.3× editorial boost was making type larger than shared templates.
    const family = ctx.layoutState?.family || 'default';
    if (role === 'heading') {
      if (family === 'editorial') {
        fontSize *= 1.05;
        letterSpacing = letterSpacing === '0em' || letterSpacing === 'normal' ? '-0.02em' : letterSpacing;
      } else if (family === 'minimalist') {
        fontSize *= 0.92;
        if (letterSpacing === '0em' || letterSpacing === 'normal') letterSpacing = '0.06em';
      } else if (family === 'premium') {
        fontSize *= 1.02;
      }
    }
    
    // STORY BOOST: modest — large story canvases already get bigger absolute px from geometry caps
    const isStorySize = ctx.h > ctx.w;
    if (isStorySize && role === 'heading') {
      fontSize = Math.round(fontSize * 1.06);
    }

    // Absolute canvas cap (shared-template territory: ~36–108px on 1080 feeds)
    if (role === 'heading') {
      const imageFirst = ctx.designSpec?.composition?.visualPriority === 'image_hero';
      const maxPx = Math.round(ctx.h * (imageFirst ? (isStorySize ? 0.055 : 0.075) : (isStorySize ? 0.08 : 0.10)));
      if (fontSize > maxPx) fontSize = maxPx;
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

      // Uppercase + tracking is wider than the old 0.62 estimate — underestimating
      // caused single words to clip at the canvas edge.
      const trackingEm = this.parseTrackingEm(letterSpacing);
      const charRatio = 0.62 + Math.max(0, trackingEm) + ((layer as any).capitalizationRule === 'force_uppercase' || (layer as any).capitalizationRule === 'uppercase' ? 0.04 : 0);
      const maxFontSizeForLongestWord = maxAvailableWidth / (longestWord.length * charRatio);
      if (fontSize > maxFontSizeForLongestWord) {
        fontSize = Math.floor(maxFontSizeForLongestWord);
      }
    }

    // Hierarchy floor: secondary roles must stay visually smaller than the hero
    if (role !== 'heading' && ctx.typographyMetrics?.heroSize) {
      const maxSecondary = Math.round(ctx.typographyMetrics.heroSize * (role === 'tagline' || role === 'cta' ? 0.48 : 0.36));
      if (fontSize > maxSecondary) fontSize = maxSecondary;
    }

    // Hierarchy floor absolute: heading must remain the visual dominant when metrics exist
    if (role === 'heading' && ctx.typographyMetrics?.primarySize) {
      const minHero = Math.round(ctx.typographyMetrics.primarySize / 0.48);
      if (fontSize < minHero) fontSize = Math.min(fontSize * 1.15, Math.max(fontSize, minHero));
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing, fontFamily, opacity };
  }

  private parseTrackingEm(letterSpacing: string | undefined): number {
    if (!letterSpacing || letterSpacing === 'normal') return 0;
    const match = String(letterSpacing).match(/(-?[\d.]+)em/);
    if (match) return parseFloat(match[1]) || 0;
    const pxMatch = String(letterSpacing).match(/(-?[\d.]+)px/);
    if (pxMatch) return (parseFloat(pxMatch[1]) || 0) / 100; // rough px→em for wrap math
    return 0;
  }

  /**
   * Handles text wrapping based on layout constraints and DSL layer bounds.
   */
  private wrapText(
    text: string,
    fontSize: number,
    layer: IDSLTextLayer,
    ctx: TypographyContext,
    resolvedMaxWidth?: number,
    trackingEm: number = 0,
  ): string[] {
    // Realistic character width: bold/uppercase + letter-spacing
    const casing = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
    const isUpper = casing === 'force_uppercase' || casing === 'uppercase';
    const estimatedCharWidth = fontSize * ((isUpper ? 0.66 : 0.58) + Math.max(0, trackingEm));

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
        maxCharsPerLine = Math.min(maxCharsPerLine, 16);
      }
    }

    const words = text.split(/\s+/).filter(Boolean);
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
        // Hard-break extremely long tokens so they can't escape the box
        if (word.length > maxCharsPerLine) {
          if (currentLine.trim()) {
            smartLines.push(currentLine.trim());
            currentLine = '';
          }
          for (let i = 0; i < word.length; i += maxCharsPerLine) {
            smartLines.push(word.slice(i, i + maxCharsPerLine));
          }
          continue;
        }
        if ((currentLine + word).length > maxCharsPerLine && currentLine.length > 0) {
          smartLines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine.trim()) smartLines.push(currentLine.trim());
    }

    // Cap heading stacks so they don't turn into walls of type
    if (layer.role === 'heading' && smartLines.length > 4) {
      smartLines = smartLines.slice(0, 4);
      const last = smartLines[3] || '';
      if (last && !last.endsWith('…')) smartLines[3] = last.replace(/[.,;:\s]+$/, '') + '…';
    }
    // Taglines stay short — long wrapping secondary kills premium feel
    if (layer.role === 'tagline' && smartLines.length > 2) {
      smartLines = smartLines.slice(0, 2);
      const last = smartLines[1] || '';
      if (last && !last.endsWith('…')) smartLines[1] = last.replace(/[.,;:\s]+$/, '') + '…';
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
