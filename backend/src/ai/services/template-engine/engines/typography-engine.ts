import { IDSLTextLayer, TypographyTokens } from '../interfaces';
import { LayoutConstraints, LayoutEngine } from './layout-engine';
import { DesignTokens } from './theme-engine';
import { FontRegistry } from '../font-registry';

export interface TypographyContext {
  w: number;
  h: number;
  brandFont: string;
  /** Brand DNA body/secondary font — used for tagline, body, footnote, cta */
  bodyFont?: string;
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
  /** True when type sits on a photo band that is dark; false when light. Undefined = not on photo. */
  photoBandIsDark?: boolean;
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
      else if (layer.id === 'cta' || layer.role === 'cta' || layer.role === 'footnote') {
        rawText = ctx.structuredText.cta || (layer.role === 'footnote' ? ctx.structuredText.cta : '') || '';
      } else if (layer.role === 'body') {
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

    const preserveHero =
      !!(layer as any)._preserveHeroSize
      || ctx.visualPriority === 'typography_hero'
      || ctx.designLanguage?.intent?.visualPriority === 'typography_hero'
      || ctx.designSpec?.composition?.visualPriority === 'typography_hero';

    // VERTICAL OVERFLOW — wrap/line-cap first; font shrink is last resort (esp. typography_hero)
    if (layer.allocatedBox && textHeight > layer.allocatedBox.height) {
      const isSecondary = layer.role === 'tagline' || layer.role === 'body' || layer.role === 'footnote';
      const pocketH = layer.allocatedBox.height;
      const originalLineHeightMultiplier = lineHeight / Math.max(1, style.fontSize);

      // Prefer dropping whole lines before crushing hero type — but NEVER for headings
      // when that would discard required words (content integrity).
      if (lineHeight > 0 && layer.role !== 'heading') {
        const roleCap = layer.role === 'tagline' ? 2 : 3;
        const maxLines = Math.min(roleCap, Math.max(1, Math.floor(pocketH / lineHeight)));
        if (escapedLines.length > maxLines) {
          escapedLines = escapedLines.slice(0, maxLines);
          textHeight = escapedLines.length * lineHeight;
        }
      } else if (lineHeight > 0 && layer.role === 'heading' && preserveHero) {
        // Expand conceptually: keep words; shrink gently later if needed
        const maxLines = Math.max(2, Math.min(5, Math.floor(pocketH / lineHeight) || 2));
        if (escapedLines.length > maxLines) {
          // Mark integrity failure rather than silently keeping "DULL."
          (layer as any)._contentIntegrity = {
            ok: false,
            reason: `pocket_too_small_for_headline:${escapedLines.length}_lines_need_vs_${maxLines}_fit`,
          };
        }
      }

      let attempts = 0;
      let currentFontSize = style.fontSize;
      const minFontSize = preserveHero && layer.role === 'heading'
        ? Math.max(Math.round(ctx.h * 0.055), Math.round(style.fontSize * 0.92))
        : isSecondary
          ? Math.max(ctx.h * 0.016, style.fontSize * 0.85)
          : Math.max(ctx.h * 0.028, style.fontSize * 0.68);
      const maxAttempts = preserveHero ? 4 : (isSecondary ? 6 : 12);
      const shrinkFactor = preserveHero ? 0.97 : 0.94;

      while (textHeight > pocketH && currentFontSize > minFontSize && attempts < maxAttempts) {
        currentFontSize = Math.floor(currentFontSize * shrinkFactor);
        lineHeight = Math.max(1, Math.floor(currentFontSize * originalLineHeightMultiplier));
        style.fontSize = currentFontSize;
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
        textHeight = escapedLines.length * lineHeight;
        if (lineHeight > 0 && layer.role !== 'heading') {
          const roleCap = layer.role === 'tagline' ? 2 : 3;
          const maxLines = Math.min(roleCap, Math.max(1, Math.floor(pocketH / lineHeight)));
          if (escapedLines.length > maxLines) {
            escapedLines = escapedLines.slice(0, maxLines);
            textHeight = escapedLines.length * lineHeight;
          }
        }
        attempts++;
      }

      // If heading still overflows after gentle shrink, flag integrity — don't clip to "DULL."
      if (layer.role === 'heading' && textHeight > pocketH * 1.02) {
        (layer as any)._contentIntegrity = {
          ok: false,
          reason: `headline_overflow_after_fit:h=${Math.round(textHeight)}_pocket=${Math.round(pocketH)}`,
        };
      }

      if (isSecondary && textHeight > pocketH * 1.02) {
        (layer as any)._omitForComposition = true;
        return '';
      }
    }

    // ==========================================
    // TWO-PASS TYPOGRAPHY OCCUPANCY BOOST
    // ==========================================
    // Skip boost when optimizer already width-adapted the slot — re-boosting
    // undoes fit and causes edge clip / overflow.
    const slotFitted = typeof (layer as any)._fittedLineCount === 'number'
      || ((layer as any)._preserveHeroSize === false && !!(layer as any)._estimatedFontSize);
    if (!slotFitted && preserveHero && layer.role === 'heading' && layer.allocatedBox) {
      // Prefer full text panel for occupancy when available (large negative space)
      const fillBox = (layer as any)._textRegion || layer.allocatedBox;
      const allocatedArea = fillBox.width * fillBox.height;
      const actualArea = effectiveMaxW * textHeight;
      const occupancy = allocatedArea > 0 ? actualArea / allocatedArea : 1;

      if (occupancy < 0.50) {
        const targetOccupancy = 0.62;
        const boostRatio = Math.min(1.55, Math.sqrt(targetOccupancy / Math.max(0.05, occupancy)));
        const boostedSize = Math.round(style.fontSize * boostRatio);
        const maxAllowedSize = Math.round(Math.min(
          fillBox.height * 0.55,
          fillBox.width * 0.16,
          ctx.h * 0.20,
        ));
        const newSize = Math.min(boostedSize, maxAllowedSize);

        if (newSize > style.fontSize) {
          const originalLineHeightMult = lineHeight / Math.max(1, style.fontSize);
          style.fontSize = newSize;
          lineHeight = Math.max(1, Math.round(newSize * originalLineHeightMult));
          escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);

          // Prefer shrink over slicing words — never drop headline content after a boost
          let fitAttempts = 0;
          while (
            escapedLines.length * lineHeight > fillBox.height
            && style.fontSize > Math.round(ctx.h * 0.055)
            && fitAttempts < 6
          ) {
            style.fontSize = Math.floor(style.fontSize * 0.92);
            lineHeight = Math.max(1, Math.round(style.fontSize * originalLineHeightMult));
            escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW, trackingEm);
            fitAttempts++;
          }
          textHeight = escapedLines.length * lineHeight;
          if (escapedLines.length * lineHeight > fillBox.height * 1.02) {
            (layer as any)._contentIntegrity = {
              ok: false,
              reason: `headline_overflow_after_boost:lines=${escapedLines.length}`,
            };
          }

          console.log(
            `[TypographyOccupancy] Boosted heading: ${style.fontSize}px (ratio=${boostRatio.toFixed(2)}) ` +
            `occupancy=${(occupancy * 100).toFixed(0)}% → ~${((effectiveMaxW * textHeight) / allocatedArea * 100).toFixed(0)}%`,
          );
        }
      }
    }

    let x = ctx.w / 2;
    let y = ctx.h / 2;

    if (layer.allocatedBox) {
      // HARD LOCK: stay inside allocated text region — never re-anchor onto the photo
      x = layer.allocatedBox.x;
      y = layer.allocatedBox.y;
      effectiveMaxW = Math.min(effectiveMaxW, layer.allocatedBox.width);

      if (anchor === 'middle') x = layer.allocatedBox.x + layer.allocatedBox.width / 2;
      if (anchor === 'end') x = layer.allocatedBox.x + layer.allocatedBox.width;
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
          // typography_hero: airy space is for large type, not extra gaps that force shrink
          const vp = ctx.visualPriority || ctx.designLanguage?.intent?.visualPriority || ctx.designSpec?.composition?.visualPriority;
          rhythmMultiplier *= (vp === 'typography_hero') ? 1.1 : 1.45;
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

    // Vertically center type inside its allocated pocket (cards / bottom bands look template-true)
    if (layer.allocatedBox && textHeight > 0) {
      const pocketTop = Math.max(layer.allocatedBox.y, ctx.constraints.safeY);
      const pocketBottom = Math.min(
        layer.allocatedBox.y + layer.allocatedBox.height,
        ctx.h - bottomClearance,
      );
      const pocketH = Math.max(0, pocketBottom - pocketTop);
      const onCard = layer.component === 'solid_card'
        || layer.component === 'inset_card'
        || layer.component === 'pill_label';
      if (pocketH > textHeight + 4 && (onCard || String(layer.anchor || '').includes('center') || (layer as any).alignment === 'center')) {
        y = pocketTop + Math.round((pocketH - textHeight) / 2);
      } else {
        y = Math.max(pocketTop, Math.min(y, Math.max(pocketTop, pocketBottom - textHeight)));
      }
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
        if (layer.role === 'heading') {
          (layer as any)._contentIntegrity = {
            ok: false,
            reason: `headline_overflow_no_slice:h=${Math.round(textHeight)}_avail=${Math.round(availableHeight)}`,
          };
        } else {
          const roleCap = layer.role === 'tagline' ? 2 : 3;
          const maxLines = Math.min(roleCap, Math.max(1, Math.floor(availableHeight / lineHeight)));
          escapedLines = escapedLines.slice(0, maxLines);
          textHeight = escapedLines.length * lineHeight;
        }
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
    const availW = Math.max(40, maxX - minX);
    // Hard cap: never let effective width exceed the safe column (prevents left-edge glyph clip)
    if (effectiveMaxW > availW) effectiveMaxW = availW;
    if (longestLineChars > 0) {
      const trackingEmNow = this.parseTrackingEm(style.letterSpacing);
      const casingNow = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
      const isUpperNow = casingNow === 'force_uppercase' || casingNow === 'uppercase';
      const lhMult = lineHeight / Math.max(1, style.fontSize);
      const charW = style.fontSize * ((isUpperNow ? 0.80 : 0.62) + Math.max(0, trackingEmNow));
      const neededW = longestLineChars * charW;
      if (neededW > availW && neededW > 0) {
        const shrink = availW / neededW;
        const vp =
          ctx.visualPriority
          || ctx.designLanguage?.intent?.visualPriority
          || ctx.designSpec?.composition?.visualPriority;
        // Floor low enough that long display words ("DIMENSION") still fit inside safeX
        const floorRatio = (vp === 'typography_hero' || preserveHero) ? 0.038 : 0.022;
        style.fontSize = Math.max(Math.round(ctx.h * floorRatio), Math.floor(style.fontSize * shrink));
        lineHeight = Math.max(1, Math.round(style.fontSize * lhMult));
        escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, Math.min(effectiveMaxW, availW), trackingEmNow);
        textHeight = escapedLines.length * lineHeight;
        effectiveMaxW = Math.min(effectiveMaxW, availW);
        // Re-measure after wrap — may still need one more shrink pass
        const longest2 = escapedLines.reduce((m, l) => Math.max(m, l.replace(/&[a-z]+;/gi, ' ').length), 0);
        const needed2 = longest2 * style.fontSize * ((isUpperNow ? 0.80 : 0.62) + Math.max(0, trackingEmNow));
        if (needed2 > availW && needed2 > 0) {
          style.fontSize = Math.max(Math.round(ctx.h * floorRatio), Math.floor(style.fontSize * (availW / needed2)));
          lineHeight = Math.max(1, Math.round(style.fontSize * lhMult));
          escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, availW, trackingEmNow);
          textHeight = escapedLines.length * lineHeight;
        }
        if (anchor === 'middle') x = Math.max(minX + effectiveMaxW / 2, Math.min(x, maxX - effectiveMaxW / 2));
        else if (anchor === 'end') x = Math.max(minX + effectiveMaxW, Math.min(x, maxX));
        else x = Math.max(minX, Math.min(x, maxX - effectiveMaxW));
        boxX = anchor === 'middle' ? x - effectiveMaxW / 2 : anchor === 'end' ? x - effectiveMaxW : x;
      }
    }

    // When the wrap width still exceeds the pocket, recenter inside safe bounds
    if (effectiveMaxW > availW) {
      effectiveMaxW = availW;
      if (anchor === 'middle') x = (minX + maxX) / 2;
      else if (anchor === 'end') x = maxX;
      else x = minX;
      boxX = anchor === 'middle' ? x - effectiveMaxW / 2 : anchor === 'end' ? x - effectiveMaxW : x;
    }

    if (boxX < minX || boxX + effectiveMaxW > maxX) {
      if (anchor === 'middle') {
        // Avoid inverted clamp when effectiveMaxW ≈ availW
        x = (minX + maxX) / 2;
      } else if (anchor === 'end') {
        x = Math.max(minX + Math.min(effectiveMaxW, availW), Math.min(x, maxX));
      } else {
        x = Math.max(minX, Math.min(x, maxX - Math.min(effectiveMaxW, availW)));
      }
      boxX = anchor === 'middle' ? x - effectiveMaxW / 2 : anchor === 'end' ? x - effectiveMaxW : x;
    }
    // Absolute edge lock — first glyph must never start before safe inset
    const edgePad = Math.max(4, Math.round(style.fontSize * 0.06));
    if (boxX < minX + edgePad) {
      const shift = (minX + edgePad) - boxX;
      boxX += shift;
      x += shift;
    }
    if (boxX + effectiveMaxW > maxX - edgePad) {
      const shift = (boxX + effectiveMaxW) - (maxX - edgePad);
      boxX -= shift;
      x -= shift;
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
      // Even inset like template cards — proportional to type, not stamp-cramped
      const lineCount = Math.max(1, escapedLines.length);
      const padX = layer.component === 'pill_label'
        ? 28
        : Math.max(40, Math.round(style.fontSize * 0.52));
      const padY = layer.component === 'pill_label'
        ? 14
        : Math.max(24, Math.round(style.fontSize * (lineCount >= 3 ? 0.42 : 0.36)));
      const radius = layer.component === 'pill_label'
        ? (textHeight + padY * 2) / 2
        : (layer.component === 'inset_card' ? 10 : 16);

      let bgFill = '#FFFFFF';
      if (ctx.colorHierarchy) {
        bgFill = layer.role === 'heading' ? ctx.colorHierarchy.cardSurface : ctx.colorHierarchy.accent;
      }
      // Absolute card contrast lock — never ship white-on-white / dark-on-dark cards
      const cardLum = this.hexLuminance(bgFill);
      if (cardLum > 0.45) {
        style.fill = (layer as any)._forceCardInk && this.hexLuminance((layer as any)._forceCardInk) < 0.45
          ? (layer as any)._forceCardInk
          : '#1A1A1A';
        if (this.hexLuminance(bgFill) > 0.85) bgFill = '#F7F4EF';
      } else {
        style.fill = '#FFFFFF';
      }

      // Card tracks measured lines with even air — template-clean, not over-hugged
      const trackingEmCard = this.parseTrackingEm(style.letterSpacing);
      const casingCard = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
      const isUpperCard = casingCard === 'force_uppercase' || casingCard === 'uppercase';
      const approxLineW = Math.ceil(
        longestLineChars * style.fontSize * ((isUpperCard ? 0.82 : 0.65) + Math.max(0, trackingEmCard)),
      );
      const balance = String((layer as any)._copyBalance || '');
      const hug = balance === 'short' ? 1.08 : balance === 'long' ? 1.06 : 1.08;
      const contentW = Math.max(
        100,
        Math.min(effectiveMaxW, Math.round(approxLineW * hug) || Math.round(style.fontSize * 5)),
      );
      let cardX = anchor === 'middle'
        ? x - contentW / 2
        : anchor === 'end'
          ? x - contentW
          : boxX;
      if (cardX - padX < minX) cardX = minX + padX;
      if (cardX + contentW + padX > maxX) cardX = Math.max(minX + padX, maxX - padX - contentW);
      containerSvg = `
          <!-- Structural Container: ${layer.component} -->
          <rect x="${cardX - padX}" y="${y - padY}" width="${contentW + padX * 2}" height="${textHeight + padY * 2}" rx="${radius}" fill="${bgFill}" filter="url(#premium_shadow)" />
        `;
    } else if (
      typeof ctx.photoBandIsDark === 'boolean'
      && (layer.role === 'heading' || layer.role === 'tagline' || layer.role === 'cta')
    ) {
      // Marketing plate: tight readable backdrop on the original photo (not a full-canvas scrim).
      const isDark = ctx.photoBandIsDark;
      const padX = Math.max(16, Math.round(style.fontSize * 0.42));
      const padY = Math.max(10, Math.round(style.fontSize * 0.26));
      const trackingEmPlate = this.parseTrackingEm(style.letterSpacing);
      const casingPlate = (layer as any).capitalizationRule || ctx.typographyTokens?.casing || 'natural';
      const isUpperPlate = casingPlate === 'force_uppercase' || casingPlate === 'uppercase';
      const approxLineW = Math.ceil(
        longestLineChars * style.fontSize * ((isUpperPlate ? 0.82 : 0.65) + Math.max(0, trackingEmPlate)),
      );
      const contentW = Math.max(
        80,
        Math.min(effectiveMaxW, Math.round(approxLineW * 1.08) || Math.round(style.fontSize * 5)),
      );
      let plateX = anchor === 'middle'
        ? x - contentW / 2
        : anchor === 'end'
          ? x - contentW
          : boxX;
      if (plateX - padX < minX) plateX = minX + padX;
      if (plateX + contentW + padX > maxX) plateX = Math.max(minX + padX, maxX - padX - contentW);
      const plateFill = isDark ? '#0C0C0C' : '#F7F4EF';
      const plateOpacity = isDark ? 0.58 : 0.90;
      const plateRx = layer.role === 'cta' ? Math.round((textHeight + padY * 2) / 2) : 14;
      containerSvg = `
          <rect x="${plateX - padX}" y="${y - padY}" width="${contentW + padX * 2}" height="${textHeight + padY * 2}" rx="${plateRx}" fill="${plateFill}" fill-opacity="${plateOpacity}" />
        `;
      style.fill = isDark ? '#FFFFFF' : '#1A1A1A';
    }

    finalSvg = `${containerSvg}<text x="${x}" y="${baselineY}" text-anchor="${anchor}" class="${layer.role === 'heading' ? 'overlay-text' : 'overlay-text-body'}" style="font-family: ${style.fontFamily}; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};" filter="url(#premium_shadow)"${strokeAddition}${transformStr}${opacityStr}>${content}</text>`;

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
      // Headings: keep all wrapped lines (up to 5) — never truncate to a single word
      if (child.role === 'heading' && lines.length > 5) {
        lines = lines.slice(0, 5);
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
    // Photo-aware ink first for overlay type (hierarchy primaryText is card-relative and
    // often depth/black — invisible on dark photo bands). Cards keep hierarchy inks.
    const onCard = layer.component === 'pill_label'
      || layer.component === 'solid_card'
      || layer.component === 'inset_card';
    let fill = onCard
      ? ((ctx.colorHierarchy?.primaryText) || ctx.dynamicTextColor || '#1E1E1C')
      : ((ctx.dynamicTextColor) || (ctx.colorHierarchy?.primaryText) || '#FFFFFF');
    let letterSpacing = 'normal';
    let fontFamily = `'${ctx.brandFont}', sans-serif`;
    const bodyFamilyName = (ctx.bodyFont && ctx.bodyFont.trim()) || ctx.brandFont;
    const bodyFontFamily = `'${bodyFamilyName}', sans-serif`;

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

    // Slot fit = DNA size gently fitted into the template pocket (not a separate ladder)
    const slotFittedSize = Number(layerObj._estimatedFontSize);
    const hasSlotFit = Number.isFinite(slotFittedSize) && slotFittedSize > 8;
    if (hasSlotFit) {
      fontSize = Math.round(slotFittedSize);
      // When DNA is preserved, never let a stale layer.fontSize pull us off metrics
      if (layerObj._preserveHeroSize && ctx.typographyMetrics?.heroSize && role === 'heading') {
        const dna = ctx.typographyMetrics.heroSize;
        // Stay within DNA band: prefer closer of slot vs DNA if slot drifted up hard
        if (fontSize > dna * 1.12) fontSize = Math.round(dna * 1.08);
        if (fontSize < dna * 0.78) fontSize = Math.round(Math.max(fontSize, dna * 0.85));
      }
    }
    // Circle free-band: force light ink on dark blur
    if (layerObj._forceOverlayInk && !onCard) {
      fill = layerObj._forceOverlayInk;
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
        // Don't inflate past the slot-fitted size — that undoes width adaptation
        if (!hasSlotFit) {
          fontSize = Math.round(fontSize * (tokens.headlineWeight === 'hero' ? 1.08 : 1.04));
        }
      }
      if (fontBehavior.dominanceStrategy === 'weight' || fontBehavior.dominanceStrategy === 'both') {
        const desired = parseInt(fontWeight, 10) || 700;
        fontWeight = String(Math.min(desired, fontBehavior.maxWeight));
      } else {
        // Scale-dominant fonts (serif displays) shouldn't force ultra-black weight
        fontWeight = String(Math.min(parseInt(fontWeight, 10) || 700, fontBehavior.maxWeight));
      }
      layerObj.capitalizationRule = tokens.casing;
      fill = onCard
        ? (ctx.colorHierarchy?.primaryText || ctx.dynamicTextColor || fill)
        : (ctx.dynamicTextColor || ctx.colorHierarchy?.primaryText || fill);
    } else if (role === 'body') {
      fontWeight = weightMap[tokens.bodyWeight] || '400';
      fontFamily = bodyFontFamily;
      fill = onCard
        ? (ctx.colorHierarchy?.secondaryText || ctx.dynamicTextColor || fill)
        : (ctx.dynamicTextColor || ctx.colorHierarchy?.secondaryText || fill);
    } else if (role === 'tagline' || role === 'footnote' || role === 'cta') {
      fontWeight = weightMap[tokens.bodyWeight] === 'light' ? '400' : '600';
      fontFamily = bodyFontFamily;
      letterSpacing = layerObj.tracking !== undefined
        ? `${layerObj.tracking}em`
        : `${fontBehavior.taglineTracking}em`;
      layerObj.capitalizationRule = tokens.casing;
      // Secondary ink — photo-aware when not on a card; never background
      fill = onCard
        ? (ctx.colorHierarchy?.secondaryText || ctx.colorHierarchy?.accent || ctx.dynamicTextColor || fill)
        : (ctx.dynamicTextColor || ctx.colorHierarchy?.secondaryText || ctx.colorHierarchy?.accent || fill);
    }

    // Inject serif font if the brand font is an editorial serif and it requires support
    if (role === 'heading' && tokens.headlineWeight === 'light' && tokens.tracking === 'wide') {
      fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', 'Times New Roman', serif`;
    }
    if (role === 'heading' && (fontBehavior.classification === 'serif_display' || fontBehavior.classification === 'serif_text')) {
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

    // Absolute canvas cap — relative to priority (typography_hero keeps presence)
    if (role === 'heading') {
      const vp =
        ctx.visualPriority
        || ctx.designLanguage?.intent?.visualPriority
        || ctx.designSpec?.composition?.visualPriority
        || 'image_hero';
      const imageFirst = vp === 'image_hero';
      const typeFirst = vp === 'typography_hero';
      const maxPx = Math.round(ctx.h * (
        typeFirst ? (isStorySize ? 0.18 : 0.20)
          : imageFirst ? (isStorySize ? 0.075 : 0.09)
            : (isStorySize ? 0.09 : 0.11)
      ));
      const minPx = Math.round(ctx.h * (typeFirst ? 0.07 : 0.038));
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
    if (!hasSlotFit) {
      if (role === 'heading' && chars > 18) {
        fontSize *= Math.max(0.70, 1 - (chars - 18) * 0.011);
      } else if ((role === 'tagline' || role === 'body') && chars > 40) {
        fontSize *= Math.max(0.82, 1 - (chars - 40) * 0.006);
      }
    }

    // DYNAMIC CLAMPING: longest whole word must fit — never break words
    const words = text.split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((a, b) => (a.length > b.length ? a : b), '');
    if (longestWord.length > 0) {
      const maxAvailableWidth = Math.min(safeW, ctx.constraints.contentMaxWidth) * 0.96;
      const trackingEm = this.parseTrackingEm(letterSpacing);
      const isUpperCasing = (layer as any).capitalizationRule === 'force_uppercase'
        || (layer as any).capitalizationRule === 'uppercase';
      const charRatio = (isUpperCasing ? 0.80 : 0.62) + Math.max(0, trackingEm);
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

    // Hierarchy floor absolute — skip when slot already width-adapted
    if (!hasSlotFit && role === 'heading' && ctx.typographyMetrics?.primarySize) {
      const minHero = Math.round(ctx.typographyMetrics.primarySize / 0.48);
      if (fontSize < minHero) fontSize = Math.min(fontSize * 1.15, Math.max(fontSize, minHero));
    }

    // Final contrast lock for overlay type: never ship dark ink on dark photo / light on light.
    // Cards already pick ink vs cardSurface — skip them.
    if (!onCard && fill) {
      // Explicit circle/band override wins
      if (layerObj._forceOverlayInk) {
        fill = layerObj._forceOverlayInk;
      } else if (ctx.dynamicTextColor) {
        // Trust photo-band ink when hierarchy fill would clash (black-on-black / white-on-white)
        const fillLum = this.hexLuminance(fill);
        const dynLum = this.hexLuminance(ctx.dynamicTextColor);
        if (Math.abs(fillLum - dynLum) > 0.3) {
          fill = ctx.dynamicTextColor;
        }
      }
      // Never use canvas background as ink
      if (fill.toUpperCase() === (ctx.validBackgroundColor || '').toUpperCase()) {
        const dyn = ctx.dynamicTextColor ? this.hexLuminance(ctx.dynamicTextColor) : 1;
        fill = dyn > 0.55 ? '#FFFFFF' : '#1A1A1A';
      }
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing, fontFamily, opacity };
  }

  private hexLuminance(hex: string): number {
    try {
      const cleaned = hex.replace('#', '');
      const full = cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned;
      const rgb = parseInt(full, 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    } catch {
      return 0.5;
    }
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
    // Match real display-serif uppercase advance (~0.78–0.82) — 0.70 under-wrapped and clipped
    const estimatedCharWidth = fontSize * ((isUpper ? 0.80 : 0.62) + Math.max(0, trackingEm));

    let layerMaxWidth = resolvedMaxWidth || ctx.constraints.contentMaxWidth;
    if (!resolvedMaxWidth && (layer as any).maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
    }

    const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
    // Leave a safety gutter so glyphs never kiss the clip edge
    const usableWidth = Math.max(8, maxAvailableWidth - Math.round(Math.max(8, ctx.w * 0.02)));
    let maxCharsPerLine = Math.max(4, Math.floor(usableWidth / estimatedCharWidth));

    if (layer.role === 'heading') {
      if (ctx.typographyTokens?.headlineWeight === 'light' && ctx.typographyTokens?.tracking === 'wide') {
        maxCharsPerLine = Math.min(maxCharsPerLine, 14);
      } else if (fontSize >= 72) {
        maxCharsPerLine = Math.min(maxCharsPerLine, 16);
      }
    }

    const words = text.split(/\s+/).filter(Boolean);
    let smartLines: string[] = [];

    // Balanced split for headings — whole words only
    // Short (≤3 words): prefer 1–2 lines, never force awkward wraps
    // Long: prefer 2–3 balanced lines so it doesn't crush into one ugly box line
    if (layer.role === 'heading' && words.length > 1) {
      const totalChars = text.length;
      const preferLines = totalChars > 28 || words.length > 5
        ? Math.min(3, words.length)
        : totalChars <= 14 && words.length <= 3
          ? 1
          : 2;

      if (preferLines === 1 && totalChars <= maxCharsPerLine) {
        smartLines = [words.join(' ')];
      } else if (preferLines >= 2 && text.length <= maxCharsPerLine * preferLines) {
        const targetLen = text.length / preferLines;
        const breaks: number[] = [];
        let currentLength = 0;
        let nextTarget = targetLen;
        for (let i = 0; i < words.length - 1; i++) {
          currentLength += words[i].length + 1;
          if (breaks.length < preferLines - 1 && currentLength >= nextTarget * 0.85) {
            breaks.push(i);
            nextTarget = targetLen * (breaks.length + 1);
          }
        }
        // Fallback to mid split for 2-line
        if (breaks.length === 0) {
          let bestSplitIndex = 0;
          let minDiff = Infinity;
          let len = 0;
          for (let i = 0; i < words.length - 1; i++) {
            len += words[i].length + 1;
            const diff = Math.abs(len - text.length / 2);
            if (diff < minDiff) {
              minDiff = diff;
              bestSplitIndex = i;
            }
          }
          breaks.push(bestSplitIndex);
        }

        const slices: string[] = [];
        let start = 0;
        for (const b of breaks) {
          slices.push(words.slice(start, b + 1).join(' '));
          start = b + 1;
        }
        slices.push(words.slice(start).join(' '));

        const allFit = slices.every(line => line.length <= maxCharsPerLine)
          && slices.every(line => line.split(/\s+/).every(w => w.length <= maxCharsPerLine));
        if (allFit && slices.length >= 1) {
          smartLines = slices;
        }
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

    // Soft line caps — for headings, NEVER drop words silently (content integrity).
    // Prefer returning all lines; allocator/QC expands space or fails the slide.
    if (layer.role !== 'heading') {
      const maxLines = layer.role === 'tagline' ? 2 : 3;
      if (smartLines.length > maxLines) {
        const droppedLines = smartLines.length - maxLines;
        smartLines = smartLines.slice(0, maxLines);
        // Never let the cap silently swallow words mid-sentence with no visual trace — that's
        // what produced copy that just stops ("...RESERVING YOUR"). Mark the cut with an
        // ellipsis so it reads as intentionally-shortened copy instead of a broken fragment.
        const lastIdx = smartLines.length - 1;
        let lastLine = smartLines[lastIdx];
        if (lastLine && !/[.!?…]$/.test(lastLine)) {
          if (lastLine.length > maxCharsPerLine - 1) {
            const budget = lastLine.slice(0, maxCharsPerLine - 1);
            const lastSpace = budget.lastIndexOf(' ');
            lastLine = lastSpace > 0 ? budget.slice(0, lastSpace) : budget;
          }
          smartLines[lastIdx] = `${lastLine}…`;
        }
        console.warn(
          `[TypographyEngine] Line cap dropped ${droppedLines} line(s) for role='${layer.role}' — ellipsis applied to avoid a silently truncated sentence.`,
        );
      }
    } else if (smartLines.length > 6) {
      // Absolute safety ceiling only
      smartLines = smartLines.slice(0, 6);
    }

    // Integrity annotation for callers (all roles — not just headings — so truncation from
    // either the wrap pass above or the line-cap above is visible to logging/QC).
    const renderedWords = smartLines.join(' ').split(/\s+/).filter(Boolean);
    const sourceWords = words;
    if (sourceWords.length > 0 && renderedWords.length < sourceWords.length) {
      (layer as any)._contentIntegrity = {
        // Headings must still hard-fail (upstream relies on ok:false to trigger repair/reject).
        // Non-heading roles are now visually flagged with an ellipsis above, so treat this as a
        // soft/non-blocking notice rather than a gate failure.
        ok: layer.role !== 'heading' ? true : false,
        reason: `wrap_truncated:${renderedWords.length}/${sourceWords.length}`,
        missing: sourceWords.filter(w => !renderedWords.includes(w)),
      };
    } else {
      (layer as any)._contentIntegrity = { ok: true, wordCount: renderedWords.length };
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
