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
  designLanguage?: { intent?: { visualPriority?: string } };
  visualPriority?: string;
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

    // VERTICAL OVERFLOW — adapt to safe region without mid-word clipping ("Pull…")
    if (layer.allocatedBox && textHeight > layer.allocatedBox.height) {
      const isSecondary = layer.role === 'tagline' || layer.role === 'body' || layer.role === 'footnote';
      let attempts = 0;
      let currentFontSize = style.fontSize;
      const minFontSize = isSecondary
        ? Math.max(ctx.h * 0.016, style.fontSize * 0.85)
        : Math.max(ctx.h * 0.028, style.fontSize * 0.68);
      const originalLineHeightMultiplier = lineHeight / Math.max(1, style.fontSize);
      const maxAttempts = isSecondary ? 6 : 12;

      while (textHeight > layer.allocatedBox.height && currentFontSize > minFontSize && attempts < maxAttempts) {
        currentFontSize = Math.floor(currentFontSize * 0.94);
        lineHeight = Math.max(1, Math.floor(currentFontSize * originalLineHeightMultiplier));
        style.fontSize = currentFontSize;
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
        textHeight = escapedLines.length * lineHeight;
        attempts++;
      }

      // Drop whole trailing lines (complete words) — never ellipsis mid-word
      if (textHeight > layer.allocatedBox.height && lineHeight > 0) {
        const roleCap = layer.role === 'tagline' ? 2 : layer.role === 'heading' ? 4 : 3;
        const maxLines = Math.min(roleCap, Math.max(1, Math.floor(layer.allocatedBox.height / lineHeight)));
        if (escapedLines.length > maxLines) {
          escapedLines = escapedLines.slice(0, maxLines);
          textHeight = escapedLines.length * lineHeight;
        }
      }

      if (isSecondary && textHeight > layer.allocatedBox.height * 1.02) {
        return '';
      }
    }

    let x = ctx.w / 2;
    let y = ctx.h / 2;

    if (layer.allocatedBox) {
      // HARD LOCK: QC already chose this pocket. Do not re-anchor or face-nudge —
      // that was moving type onto the photo and causing "random" placement.
      x = layer.allocatedBox.x;
      y = layer.allocatedBox.y;
      effectiveMaxW = Math.min(effectiveMaxW, layer.allocatedBox.width);

      if (anchor === 'middle') x = layer.allocatedBox.x + layer.allocatedBox.width / 2;
      if (anchor === 'end') x = layer.allocatedBox.x + layer.allocatedBox.width;

      // Fit content inside the allocated pocket only (scale/wrap), never relocate
      const pocketH = layer.allocatedBox.height;
      if (textHeight > pocketH && pocketH > 0) {
        const isSecondary = layer.role === 'tagline' || layer.role === 'body' || layer.role === 'footnote';
        const originalLineHeightMultiplier = lineHeight / Math.max(1, style.fontSize);
        let currentFontSize = style.fontSize;
        const minFontSize = isSecondary
          ? Math.max(18, Math.round(ctx.h * 0.018))
          : Math.max(Math.round(ctx.h * 0.038), Math.round(style.fontSize * 0.82));
        let attempts = 0;
        while (textHeight > pocketH && currentFontSize > minFontSize && attempts < 8) {
          currentFontSize = Math.floor(currentFontSize * 0.92);
          lineHeight = Math.max(1, Math.floor(currentFontSize * originalLineHeightMultiplier));
          style.fontSize = currentFontSize;
          escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
          textHeight = escapedLines.length * lineHeight;
          attempts++;
        }
        if (textHeight > pocketH && lineHeight > 0) {
          const roleCap = layer.role === 'tagline' ? 2 : layer.role === 'heading' ? 4 : 3;
          const maxLines = Math.min(roleCap, Math.max(1, Math.floor(pocketH / lineHeight)));
          escapedLines = escapedLines.slice(0, maxLines);
          textHeight = escapedLines.length * lineHeight;
        }
        if (isSecondary && textHeight > pocketH * 1.02) {
          return '';
        }
      }
    } else {
      const baseAnchorResult = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, textHeight, ctx.constraints);
      x = baseAnchorResult.x;
      y = baseAnchorResult.y;

      // Face avoidance only when optimizer did not allocate a pocket
      const targetBox = { x, y, width: effectiveMaxW, height: textHeight };
      const resolvedBox = ctx.layoutEngine.resolveFaceCollision(targetBox, ctx.constraints, (ctx.layoutState?.family as any) || 'minimal');
      x = resolvedBox.x;
      y = resolvedBox.y;
      effectiveMaxW = resolvedBox.width;

      const anchorStr = (layer.anchor as string) || '';
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
    // Sequential Y Stacking: only when no allocated pocket (optimizer owns stacking)
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
    // When allocatedBox is set, clamp INSIDE the pocket — never slide to another band.
    const bottomClearance = Math.max(
      ctx.constraints.margins.bottom,
      BRANDING_FOOTER_RESERVE_PX
    ) + FOOTER_GAP_PX;

    if (layer.allocatedBox) {
      const pocketTop = Math.max(layer.allocatedBox.y, ctx.constraints.safeY);
      const pocketBottom = Math.min(
        layer.allocatedBox.y + layer.allocatedBox.height,
        ctx.h - bottomClearance,
      );
      y = Math.max(pocketTop, Math.min(y, Math.max(pocketTop, pocketBottom - textHeight)));
    } else {
      if (y + textHeight > ctx.h - bottomClearance) {
        y = ctx.h - textHeight - bottomClearance;
      }
      if (y < ctx.constraints.safeY) {
        y = ctx.constraints.safeY;
      }
    }

    // If the box still can't fit after clamping, shrink/cap again so we never
    // draw through the footer or off the top safe edge.
    const availableHeight = layer.allocatedBox
      ? Math.max(0, Math.min(layer.allocatedBox.y + layer.allocatedBox.height, ctx.h - bottomClearance) - Math.max(y, ctx.constraints.safeY))
      : ((ctx.h - bottomClearance) - Math.max(y, ctx.constraints.safeY));
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
      if (!layer.allocatedBox && y + textHeight > ctx.h - bottomClearance) {
        y = Math.max(ctx.constraints.safeY, ctx.h - textHeight - bottomClearance);
      }
    }

    // 2. Horizontal Validation & Clamping — STRICT safe margins
    const minX = Math.max(ctx.constraints.safeX, layer.allocatedBox ? layer.allocatedBox.x : ctx.constraints.safeX);
    const maxX = layer.allocatedBox
      ? Math.min(ctx.w - ctx.constraints.safeX, layer.allocatedBox.x + layer.allocatedBox.width)
      : (ctx.w - ctx.constraints.safeX);
    if (anchor === 'middle') {
      x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
    } else if (anchor === 'end') {
      x = Math.max(minX + effectiveMaxW, Math.min(x, maxX));
    } else {
      x = Math.max(minX, Math.min(x, maxX - effectiveMaxW));
    }

    let boxX = x;
    if (anchor === 'middle') boxX = x - effectiveMaxW / 2;
    else if (anchor === 'end') boxX = x - effectiveMaxW;

    // If measured text still exceeds safe width, shrink font to fit whole words
    const longestLineChars = escapedLines.reduce((m, l) => Math.max(m, l.replace(/&[a-z]+;/gi, ' ').length), 0);
    if (longestLineChars > 0) {
      const trackingEmNow = this.parseTrackingEm(style.letterSpacing);
      const casingNow = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
      const isUpperNow = casingNow === 'force_uppercase' || casingNow === 'uppercase';
      const lhMult = lineHeight / Math.max(1, style.fontSize);
      const charW = style.fontSize * ((isUpperNow ? 0.70 : 0.60) + Math.max(0, trackingEmNow));
      const neededW = longestLineChars * charW;
      const availW = maxX - minX;
      if (neededW > availW && neededW > 0) {
        const shrink = availW / neededW;
        style.fontSize = Math.max(Math.round(ctx.h * 0.022), Math.floor(style.fontSize * shrink));
        lineHeight = Math.max(1, Math.round(style.fontSize * lhMult));
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, Math.min(effectiveMaxW, availW), trackingEmNow);
        textHeight = escapedLines.length * lineHeight;
        effectiveMaxW = Math.min(effectiveMaxW, availW);
        if (anchor === 'middle') x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
        else if (anchor === 'end') x = Math.max(minX + effectiveMaxW, Math.min(x, maxX));
        else x = Math.max(minX, Math.min(x, maxX - effectiveMaxW));
        boxX = anchor === 'middle' ? x - effectiveMaxW / 2 : anchor === 'end' ? x - effectiveMaxW : x;
      }
    }

    if (boxX < minX || boxX + effectiveMaxW > maxX) {
      if (anchor === 'middle') {
        x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
      } else if (anchor === 'end') {
        x = Math.max(minX + effectiveMaxW, Math.min(x, maxX));
      } else {
        x = Math.max(minX, Math.min(x, maxX - effectiveMaxW));
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
      // Stage 1 — WRAP (whole words only; no mid-word ellipsis)
      let lines = this.wrapText(rawText, style.fontSize, child, ctx, maxW, trackingEm);
      if ((child.role === 'tagline' || child.role === 'body') && lines.length > 2) {
        lines = lines.slice(0, 2);
      }
      if (child.role === 'heading' && lines.length > 4) {
        lines = lines.slice(0, 4);
      }

      const lineHeight = Math.round(style.fontSize * lineHeightMultiplier);
      const height = lines.length * lineHeight;
      const charW = style.fontSize * (0.62 + Math.max(0, trackingEm));
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
      return Math.max(Math.round(ctx.h * 0.012), Math.round(fontSize * mult));
    };

    const computeStack = (items: Measured[], scale = 1) => {
      let y = 0;
      let maxWidth = 0;
      for (let i = 0; i < items.length; i++) {
        maxWidth = Math.max(maxWidth, items[i].width * scale);
        y += items[i].height * scale + (i < items.length - 1 ? gapFor(items[i].style.fontSize, items[i].child.role) * scale : 0);
      }
      return { totalHeight: y, maxWidth };
    };

    const footerReserve = Math.max(ctx.constraints.margins.bottom, BRANDING_FOOTER_RESERVE_PX) + FOOTER_GAP_PX;
    const maxAllowedHeight = groupLayer.allocatedBox
      ? groupLayer.allocatedBox.height
      : (ctx.h - footerReserve - ctx.constraints.safeY);

    let active = [...measured];
    let stack = computeStack(active);

    // Stage 1b — WRAP tighter before scaling
    if (stack.totalHeight > maxAllowedHeight) {
      for (const factor of [0.85, 0.72, 0.6]) {
        const tryW = Math.round(maxW * factor);
        const rewrapped: Measured[] = [];
        for (const m of active) {
          const trackingEm = this.parseTrackingEm(m.style.letterSpacing);
          let lines = this.wrapText(m.rawText, m.style.fontSize, m.child, ctx, tryW, trackingEm);
          if ((m.child.role === 'tagline' || m.child.role === 'body') && lines.length > 2) lines = lines.slice(0, 2);
          if (m.child.role === 'heading' && lines.length > 4) lines = lines.slice(0, 4);
          const height = lines.length * m.lineHeight;
          const charW = m.style.fontSize * (0.62 + Math.max(0, trackingEm));
          const width = Math.max(...lines.map(l => Math.max(1, l.replace(/&[a-z]+;/gi, ' ').length) * charW));
          rewrapped.push({ ...m, lines, height, width });
        }
        active = rewrapped;
        stack = computeStack(active);
        if (stack.totalHeight <= maxAllowedHeight) break;
      }
    }

    // Stage 2 — SCALE proportionally (preserve hierarchy)
    let groupScale = (groupLayer as any)._groupScale || 1.0;
    if (stack.totalHeight > maxAllowedHeight && stack.totalHeight > 0) {
      groupScale = Math.min(groupScale, Math.max(0.72, maxAllowedHeight / stack.totalHeight));
      stack = computeStack(active, groupScale);
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

    // Global group placement — lock to allocated pocket; never face-nudge off it
    let x: number;
    let y: number;
    if (groupLayer.allocatedBox) {
      x = groupLayer.allocatedBox.x;
      y = groupLayer.allocatedBox.y;
      groupMaxWidth = Math.min(groupMaxWidth, groupLayer.allocatedBox.width);
      if (groupLayer.alignment === 'center') x = groupLayer.allocatedBox.x + groupLayer.allocatedBox.width / 2;
      else if (groupLayer.alignment === 'right') x = groupLayer.allocatedBox.x + groupLayer.allocatedBox.width;

      // Fit inside pocket height only — do not relocate to another band
      const pocketH = groupLayer.allocatedBox.height;
      if (totalGroupHeight > pocketH && pocketH > 0 && groupScale > 0.82) {
        const fitScale = Math.max(0.82, pocketH / totalGroupHeight);
        // Children already rendered; clamp Y inside pocket instead of reflowing mid-render
        const pocketBottom = groupLayer.allocatedBox.y + pocketH;
        y = Math.min(y, Math.max(groupLayer.allocatedBox.y, pocketBottom - totalGroupHeight));
        if (fitScale < groupScale) {
          console.warn(`[TypographyEngine] Group '${groupLayer.id}' exceeds allocated pocket — clamped in-place (scale hint=${fitScale.toFixed(2)})`);
        }
      }
    } else {
      const baseAnchorResult = ctx.layoutEngine.resolveAnchor(groupLayer.anchor, 0, totalGroupHeight, ctx.constraints);
      x = baseAnchorResult.x;
      y = baseAnchorResult.y;

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
    }

    // Keep clear of footer — never clip; with allocatedBox stay inside pocket
    const bottomClearance = footerReserve;
    if (groupLayer.allocatedBox) {
      const pocketTop = Math.max(groupLayer.allocatedBox.y, ctx.constraints.safeY);
      const pocketBottom = Math.min(
        groupLayer.allocatedBox.y + groupLayer.allocatedBox.height,
        ctx.h - bottomClearance,
      );
      y = Math.max(pocketTop, Math.min(y, Math.max(pocketTop, pocketBottom - totalGroupHeight)));
    } else {
      if (y + totalGroupHeight > ctx.h - bottomClearance) {
        y = Math.max(ctx.constraints.safeY, ctx.h - totalGroupHeight - bottomClearance);
      }
      if (y < ctx.constraints.safeY) y = ctx.constraints.safeY;
    }

    // Strict horizontal clamp — respect allocated pocket + canvas safe margins
    const minX = Math.max(ctx.constraints.safeX, groupLayer.allocatedBox ? groupLayer.allocatedBox.x : ctx.constraints.safeX);
    const maxSafeX = groupLayer.allocatedBox
      ? Math.min(ctx.w - ctx.constraints.safeX, groupLayer.allocatedBox.x + groupLayer.allocatedBox.width)
      : (ctx.w - ctx.constraints.safeX);
    if (groupLayer.alignment === 'center') {
      x = Math.max(minX + groupMaxWidth / 2, Math.min(x, maxSafeX - groupMaxWidth / 2));
    } else if (groupLayer.alignment === 'right') {
      x = Math.max(minX + groupMaxWidth, Math.min(x, maxSafeX));
    } else {
      x = Math.max(minX, Math.min(x, maxSafeX - groupMaxWidth));
    }

    // Stage 4 — layout change is optimizer-owned via _suggestLayoutChange
    if ((groupLayer as any)._suggestLayoutChange) {
      console.warn(`[TypographyEngine] Group '${groupLayer.id}' exhausted wrap/scale/move — suggest layout change`);
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
    // Prefer BrandDNA ink hierarchy (rotated primary/secondary/accent/depth).
    // dynamicTextColor is photo-luminance fallback only when hierarchy is absent.
    // Background is never used as text fill.
    let fill =
      (ctx.colorHierarchy?.primaryText)
      || ctx.dynamicTextColor
      || '#1E1E1C';
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
      fill = ctx.colorHierarchy?.primaryText || ctx.dynamicTextColor || fill;
    } else if (role === 'body') {
      fontWeight = weightMap[tokens.bodyWeight] || '400';
      fill = ctx.colorHierarchy?.secondaryText || ctx.dynamicTextColor || fill;
    } else if (role === 'tagline' || role === 'footnote' || role === 'cta') {
      fontWeight = weightMap[tokens.bodyWeight] === 'light' ? '400' : '600';
      letterSpacing = layerObj.tracking !== undefined
        ? `${layerObj.tracking}em`
        : `${fontBehavior.taglineTracking}em`;
      layerObj.capitalizationRule = tokens.casing;
      // Secondary ink from BrandDNA — never background
      fill = ctx.colorHierarchy?.secondaryText
        || ctx.colorHierarchy?.accent
        || ctx.dynamicTextColor
        || fill;
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

    // Absolute canvas cap — image_hero still keeps readable presence
    if (role === 'heading') {
      const imageFirst =
        ctx.visualPriority === 'image_hero'
        || ctx.designLanguage?.intent?.visualPriority === 'image_hero'
        || ctx.designSpec?.composition?.visualPriority === 'image_hero';
      const maxPx = Math.round(ctx.h * (imageFirst ? (isStorySize ? 0.075 : 0.09) : (isStorySize ? 0.09 : 0.11)));
      const minPx = Math.round(ctx.h * 0.038);
      if (fontSize > maxPx) fontSize = maxPx;
      if (fontSize < minPx) fontSize = minPx;
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

    // Content-length adaptation to available safe width
    const safeW = layer.allocatedBox?.width
      || ((layer as any).maxWidthPercent ? Math.round(ctx.w * ((layer as any).maxWidthPercent / 100)) : ctx.constraints.contentMaxWidth);
    const chars = text.replace(/\s+/g, '').length;
    if (role === 'heading' && chars > 18) {
      fontSize *= Math.max(0.70, 1 - (chars - 18) * 0.011);
    } else if ((role === 'tagline' || role === 'body') && chars > 40) {
      fontSize *= Math.max(0.82, 1 - (chars - 40) * 0.006);
    }

    // DYNAMIC CLAMPING: longest whole word must fit — never break words
    const words = text.split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((a, b) => (a.length > b.length ? a : b), '');
    if (longestWord.length > 0) {
      const maxAvailableWidth = Math.min(safeW, ctx.constraints.contentMaxWidth);
      const trackingEm = this.parseTrackingEm(letterSpacing);
      const charRatio = 0.64 + Math.max(0, trackingEm) + ((layer as any).capitalizationRule === 'force_uppercase' || (layer as any).capitalizationRule === 'uppercase' ? 0.06 : 0);
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
   * NEVER breaks words mid-token — oversized words stay whole; caller must
   * shrink font via resolveStyle / fit cascade so they fit the safe width.
   */
  private wrapText(
    text: string,
    fontSize: number,
    layer: IDSLTextLayer,
    ctx: TypographyContext,
    resolvedMaxWidth?: number,
    trackingEm: number = 0,
  ): string[] {
    const casing = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
    const isUpper = casing === 'force_uppercase' || casing === 'uppercase';
    // Slightly wider estimate to prevent canvas edge clipping
    const estimatedCharWidth = fontSize * ((isUpper ? 0.70 : 0.60) + Math.max(0, trackingEm));

    let layerMaxWidth = resolvedMaxWidth || ctx.constraints.contentMaxWidth;
    if (!resolvedMaxWidth && (layer as any).maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
    }

    const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
    // Leave a small safety gutter so glyphs never kiss the clip edge
    const usableWidth = Math.max(8, maxAvailableWidth - Math.round(ctx.w * 0.01));
    let maxCharsPerLine = Math.max(4, Math.floor(usableWidth / estimatedCharWidth));

    if (layer.role === 'heading') {
      if (ctx.typographyTokens?.headlineWeight === 'light' && ctx.typographyTokens?.tracking === 'wide') {
        maxCharsPerLine = Math.min(maxCharsPerLine, 14);
      } else if (fontSize >= 80) {
        maxCharsPerLine = Math.min(maxCharsPerLine, 18);
      }
    }

    const words = text.split(/\s+/).filter(Boolean);
    let smartLines: string[] = [];

    // Balanced split for short headings — whole words only
    if (layer.role === 'heading' && words.length > 1 && text.length <= maxCharsPerLine * 2.5) {
      let bestSplitIndex = 0;
      let minDiff = Infinity;
      const targetLength = text.length / 2;
      let currentLength = 0;
      for (let i = 0; i < words.length - 1; i++) {
        currentLength += words[i].length + 1;
        const diff = Math.abs(currentLength - targetLength);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplitIndex = i;
        }
      }

      const line1 = words.slice(0, bestSplitIndex + 1).join(' ');
      const line2 = words.slice(bestSplitIndex + 1).join(' ');

      // Accept only if every word fits on its line (never split a word)
      const line1Ok = words.slice(0, bestSplitIndex + 1).every(w => w.length <= maxCharsPerLine)
        && line1.length <= maxCharsPerLine;
      const line2Ok = words.slice(bestSplitIndex + 1).every(w => w.length <= maxCharsPerLine)
        && line2.length <= maxCharsPerLine;
      if (line1Ok && line2Ok) {
        smartLines = [line1, line2];
      }
    }

    if (smartLines.length === 0) {
      let currentLine = '';
      for (const word of words) {
        // Whole-word only: if the word alone exceeds the line budget, still keep
        // it intact on its own line (font was / will be scaled to fit width).
        if (word.length > maxCharsPerLine) {
          if (currentLine.trim()) {
            smartLines.push(currentLine.trim());
            currentLine = '';
          }
          smartLines.push(word);
          continue;
        }
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length > maxCharsPerLine && currentLine.length > 0) {
          smartLines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine = candidate;
        }
      }
      if (currentLine.trim()) smartLines.push(currentLine.trim());
    }

    // Soft line caps — drop trailing whole words (no mid-word ellipsis / "Pull…")
    const maxLines = layer.role === 'heading' ? 4 : layer.role === 'tagline' ? 2 : 3;
    if (smartLines.length > maxLines) {
      smartLines = smartLines.slice(0, maxLines);
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
