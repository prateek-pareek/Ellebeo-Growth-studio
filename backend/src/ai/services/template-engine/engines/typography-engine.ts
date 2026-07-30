import { IDSLTextLayer } from '../interfaces';
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
  layoutState?: import('../interfaces').ILayoutState;
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

export type TypographySystem = 'editorial' | 'clinical' | 'minimalist' | 'premium';

export class TypographyEngine {
  private fontRegistry: FontRegistry;

  constructor() {
    this.fontRegistry = new FontRegistry();
  }
  
  /**
   * Main text rendering entry point that handles wrapping, styling, and safe-zone collision
   */
  public renderTextLayer(ctx: TypographyContext, layer: IDSLTextLayer, system: TypographySystem = 'minimalist'): string {
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

    if ((layer as any).capitalizationRule === 'force_uppercase') {
      rawText = rawText.toUpperCase();
    } else if ((layer as any).capitalizationRule === 'force_lowercase') {
      rawText = rawText.toLowerCase();
    }

    const isHeroHeading = layer.role === 'heading';
    // Remove "first word" chunking; we'll do balanced line splitting later in wrapText
    let textToWrap = rawText;
    
    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    let currentScaleMultiplier = 1.0;
    let finalSvg = '';

    while (attempt < MAX_ATTEMPTS) {
      attempt++;

      // 2. Resolve Base Style
      const style = this.resolveStyle(layer, system, ctx, textToWrap);
      // Apply retry scaling down
      style.fontSize = Math.round(style.fontSize * currentScaleMultiplier);

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
      // so we don't wrap using a 1080px width on a coordinate that starts at x=800.
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
      const escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, system, effectiveMaxW);
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

      let boxX = x;
      if (anchor === 'middle') boxX = x - effectiveMaxW / 2;
      else if (anchor === 'end') boxX = x - effectiveMaxW;

      // PHASE 2.5: COMPOSITION VALIDATION PASS
      let isValid = true;
      
      // Validation 1: Bleeding off bottom
      if (y + textHeight > ctx.h - 20) {
        isValid = false;
      }
      // Validation 2: Too wide for bounds - strictly enforce safeX margins
      if (boxX < ctx.constraints.safeX - 20 || boxX + effectiveMaxW > ctx.w - ctx.constraints.safeX + 20) {
        isValid = false;
      }

      if (!isValid && attempt < MAX_ATTEMPTS) {
        console.warn(`[TypographyEngine] Validation failed for layer ${layer.id} (boxX: ${boxX}, maxW: ${effectiveMaxW}). Retrying with minor scale adjustment (Attempt ${attempt}).`);
        // Art Director philosophy: We do not aggressively shrink typography to fit tiny boxes.
        // We allow a maximum 5% adjustment to gracefully handle slight bleeds.
        currentScaleMultiplier *= 0.95; 
        continue;
      } else if (!isValid && attempt === MAX_ATTEMPTS) {
        console.error(`[TypographyEngine] Validation failed after ${MAX_ATTEMPTS} attempts for layer ${layer.id}. Protecting typographic integrity over layout boundaries.`);
        if (y + textHeight > ctx.h - 40) y = ctx.h - textHeight - 40;
      }

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

      finalSvg = `<text x="${x}" y="${baselineY}" text-anchor="${anchor}" class="overlay-text" style="font-family: ${style.fontFamily}; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};" filter="url(#premium_shadow)"${strokeAddition}${transformStr}${opacityStr}>${content}</text>`;

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

      break; // Success, exit retry loop
    }

    return finalSvg;
  }

  /**
   * Resolves the font properties depending on the typographical system, layer role, and DSL properties.
   */
  private resolveStyle(layer: IDSLTextLayer, system: TypographySystem, ctx: TypographyContext, text: string) {
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
    
    if (!layerObj.fontSize) {
      if (role === 'heading') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.heroSize : 72;
        fontWeight = Math.min(800, fontBehavior.maxWeight).toString();
        letterSpacing = ctx.typographyMetrics ? ctx.typographyMetrics.heroTracking : `${fontBehavior.headlineTracking}em`;
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.metadataSize : 16;
        letterSpacing = ctx.typographyMetrics ? ctx.typographyMetrics.metadataTracking : `${fontBehavior.taglineTracking}em`; 
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
      } else if (role === 'body') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.bodySize : 18;
        fontWeight = '400';
      }
    }

    if (system === 'editorial') {
      fontFamily = `'${ctx.brandFont}', 'Playfair Display', 'Georgia', 'Times New Roman', serif`;
      if (role === 'heading') {
        // Editorial Weight Range [300, 400, 700]
        fontWeight = ctx.designTokens?.headlinePresence === 'hero' ? '700' : (ctx.designTokens?.headlinePresence === 'subtle' ? '300' : '400');
        letterSpacing = '0.05em'; // Elegant wide tracking
        (layer as any).capitalizationRule = 'force_uppercase';
        fill = ctx.dynamicTextColor;
      } else if (role === 'body') {
        fontWeight = '400';
      } else if (role === 'tagline' || role === 'footnote') {
        fontWeight = '300';
        letterSpacing = '0.3em'; // Very wide tracking for small captions
        (layer as any).capitalizationRule = 'force_uppercase';
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
      }
    } else if (system === 'clinical') {
      fontFamily = `'${ctx.brandFont}', 'Inter', 'Helvetica Neue', 'Arial', sans-serif`;
      if (role === 'heading') {
        // Clinical Weight Range [600, 700, 800]
        fontWeight = ctx.designTokens?.headlinePresence === 'hero' ? '800' : (ctx.designTokens?.headlinePresence === 'subtle' ? '600' : '700');
        letterSpacing = '-0.02em'; // Tight tracking for precision
        (layer as any).capitalizationRule = 'force_sentence';
      } else if (role === 'body') {
        fontWeight = '400';
      } else if (role === 'tagline' || role === 'footnote') {
        fontWeight = '600';
        letterSpacing = '0.1em';
      }
    } else if (system === 'minimalist') {
      fontFamily = `'${ctx.brandFont}', 'Optima', 'Futura', 'Trebuchet MS', sans-serif`;
      if (role === 'heading') {
        // Minimalist Weight Range [300, 400, 500]
        fontWeight = ctx.designTokens?.headlinePresence === 'hero' ? '500' : (ctx.designTokens?.headlinePresence === 'subtle' ? '300' : '400');
        letterSpacing = '0.02em'; // Generous breathing room
      } else if (role === 'body') {
        fontWeight = '300';
      } else if (role === 'tagline' || role === 'footnote') {
        fontWeight = '400';
        letterSpacing = '0.2em';
      }
    } else if (system === 'premium') {
      fontFamily = `'${ctx.brandFont}', 'Helvetica Neue', 'Arial', sans-serif`;
      if (role === 'heading') {
        // Premium Text Weight Range [700, 800, 900]
        fontWeight = ctx.designTokens?.headlinePresence === 'subtle' ? '700' : (ctx.designTokens?.headlinePresence === 'hero' ? '900' : '800');
        letterSpacing = '-0.04em'; // Very tight negative tracking for modern chunky look
      } else if (role === 'body') {
        fontWeight = '500';
      } else if (role === 'tagline' || role === 'footnote') {
        fontWeight = '700';
        letterSpacing = '0.05em';
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
  private wrapText(text: string, fontSize: number, layer: IDSLTextLayer, ctx: TypographyContext, system: TypographySystem, resolvedMaxWidth?: number): string[] {
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
      if (system === 'editorial') {
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
      if ((layer as any).capitalizationRule === 'force_uppercase') {
        transformed = line.toUpperCase();
      } else if ((layer as any).capitalizationRule === 'force_lowercase') {
        transformed = line.toLowerCase();
      } else if (system !== 'editorial') {
        // legacy behavior
        transformed = line.toUpperCase() !== line ? line.toUpperCase() : line;
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
