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
const BRANDING_FOOTER_RESERVE_PX = 300;

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
    let rawText = ctx.overlayText || '';

    if (ctx.structuredText) {
      if (layer.id === 'headline' && ctx.structuredText.headline) rawText = ctx.structuredText.headline;
      else if (layer.id === 'subheadline' && ctx.structuredText.subheadline) rawText = ctx.structuredText.subheadline;
      else if (layer.id === 'cta' && ctx.structuredText.cta) rawText = ctx.structuredText.cta;
      else if (layer.role === 'heading' && ctx.structuredText.headline) rawText = ctx.structuredText.headline;
      else if (layer.role === 'tagline' && ctx.structuredText.subheadline) rawText = ctx.structuredText.subheadline;
      else if (layer.role === 'footnote' && ctx.structuredText.cta) rawText = ctx.structuredText.cta;
      else if (layer.role === 'body' && !ctx.overlayText && ctx.structuredText.headline) rawText = ctx.structuredText.headline;
    }

    if (!rawText) return '';

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
    let lineHeight = Math.round(style.fontSize * 1.35);
    if ((layer as any).lineHeight !== undefined) {
      lineHeight = Math.round(style.fontSize * (layer as any).lineHeight);
    } else if (layer.role === 'heading') {
      lineHeight = Math.round(style.fontSize * (ctx.typographyMetrics?.heroLineHeight || 1.18));
    } else if (layer.role === 'body') {
      lineHeight = Math.round(style.fontSize * (ctx.typographyMetrics?.bodyLineHeight || 1.35));
    } else if (layer.role === 'tagline' || layer.role === 'footnote') {
      lineHeight = 26;
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
    const escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, effectiveMaxW);
    let textHeight = escapedLines.length * lineHeight;

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

      const anchorStr = layer.anchor as string;
      const isCenterAnchor = anchorStr.includes('center') || anchorStr.includes('top') || anchorStr.includes('bottom') || anchorStr.includes('middle');
      
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
    // If text bleeds off the bottom, we shift it up rather than shrinking the font.
    // We use BRANDING_FOOTER_RESERVE_PX to avoid colliding with the globally-rendered branding footer.
    if (y + textHeight > ctx.h - BRANDING_FOOTER_RESERVE_PX) {
      y = ctx.h - textHeight - BRANDING_FOOTER_RESERVE_PX;
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

  /**
   * Resolves the font properties depending on the typographical system, layer role, and DSL properties.
   */
  private resolveStyle(layer: IDSLTextLayer, ctx: TypographyContext, text: string) {
    const role = layer.role;
    let fontSize = ctx.dynamicFontSize;
    let fontWeight = 'normal';
    let fontStyle = 'normal';
    let fill = ctx.dynamicTextColor;
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
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.metadataSize : 16;
      } else if (role === 'body') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.bodySize : 18;
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
      fill = ctx.dynamicTextColor; // Could map contrast here
    } else if (role === 'body') {
      fontWeight = weightMap[tokens.bodyWeight] || '400';
      fill = ctx.dynamicTextColor;
    } else if (role === 'tagline' || role === 'footnote') {
      // Metadata is usually slightly bolder and wider than body, but smaller
      fontWeight = weightMap[tokens.bodyWeight] === 'light' ? '400' : '600';
      letterSpacing = trackingMap['wide'];
      layerObj.capitalizationRule = tokens.casing;
      fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
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

    // DYNAMIC CLAMPING: Prevent single long words from bleeding off the canvas
    const longestWord = text.split(/\s+/).reduce((a, b) => a.length > b.length ? a : b, '');
    if (longestWord.length > 0) {
      let layerMaxWidth = ctx.constraints.contentMaxWidth;
      if ((layer as any).maxWidthPercent) layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
      const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
      
      const maxFontSizeForLongestWord = maxAvailableWidth / (longestWord.length * 0.52);
      if (fontSize > maxFontSizeForLongestWord) {
        fontSize = Math.floor(maxFontSizeForLongestWord);
      }
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing, fontFamily };
  }

  /**
   * Handles text wrapping based on layout constraints and DSL layer bounds.
   */
  private wrapText(text: string, fontSize: number, layer: IDSLTextLayer, ctx: TypographyContext, resolvedMaxWidth?: number): string[] {
    const estimatedCharWidth = fontSize * 0.52;
    
    let layerMaxWidth = resolvedMaxWidth || ctx.constraints.contentMaxWidth;
    if (!resolvedMaxWidth && (layer as any).maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * ((layer as any).maxWidthPercent / 100));
    }

    const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
    let maxCharsPerLine = Math.max(10, Math.floor(maxAvailableWidth / estimatedCharWidth));
    
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
