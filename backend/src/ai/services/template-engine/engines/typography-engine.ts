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

export type TypographySystem = 'editorial' | 'technical' | 'minimal';

export class TypographyEngine {
  private fontRegistry: FontRegistry;

  constructor() {
    this.fontRegistry = new FontRegistry();
  }
  
  /**
   * Main text rendering entry point that handles wrapping, styling, and safe-zone collision
   */
  public renderTextLayer(ctx: TypographyContext, layer: IDSLTextLayer, system: TypographySystem = 'minimal'): string {
    // 1. Resolve Style Based on System & Role
    const style = this.resolveStyle(layer, system, ctx);

    // Map text layer ID to structured text fields if available
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

    if (!rawText) return ''; // Skip rendering if text is empty for this layer

    // 2. Line Wrapping & Semantic Chunking
    let heroWord = '';
    let remainingText = '';
    const isHeroHeading = layer.role === 'heading';
    const isIntenseHierarchy = isHeroHeading && style.fontSize > 110 && system === 'editorial';

    if (isIntenseHierarchy && rawText.includes(' ')) {
      const words = rawText.split(/\s+/);
      heroWord = words[0];
      remainingText = words.slice(1).join(' ');
    }

    const textToWrap = isIntenseHierarchy ? heroWord : rawText;
    const escapedLines = this.wrapText(textToWrap, style.fontSize, layer, ctx, system);
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
    
    const textHeightGuess = escapedLines.length * lineHeight;

    // 3. Pre-resolve X and alignment to get accurate bounding box for collision detection
    let anchor = 'start';
    if (layer.alignment === 'center' || layer.anchor.includes('center')) anchor = 'middle';
    if (layer.alignment === 'right' || layer.anchor.includes('right')) anchor = 'end';
    if (layer.alignment === 'left' || layer.anchor.includes('left')) anchor = 'start';
    
    // Explicit override
    if (layer.alignment === 'center') anchor = 'middle';
    if (layer.alignment === 'right') anchor = 'end';
    if (layer.alignment === 'left') anchor = 'start';

    const baseAnchorResult = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, textHeightGuess, ctx.constraints);
    let x = baseAnchorResult.x;
    let y = baseAnchorResult.y;

    let layerMaxWidth = ctx.constraints.contentMaxWidth;
    const layerObj = layer as any;
    if (layerObj.maxWidthPercent) layerMaxWidth = Math.round(ctx.w * (layerObj.maxWidthPercent / 100));
    const maxW = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);

    if (anchor === 'middle') {
      if (layer.anchor.includes('left')) x = ctx.constraints.safeX + maxW / 2;
      else if (layer.anchor.includes('right')) x = ctx.w - ctx.constraints.safeX - maxW / 2;
      else x = ctx.w / 2;
    } else if (anchor === 'end') {
      if (layer.anchor.includes('left')) x = ctx.constraints.safeX + maxW;
      else if (layer.anchor === 'center') x = ctx.w / 2 + maxW / 2;
      else x = ctx.w - ctx.constraints.safeX;
    } else if (anchor === 'start') {
      if (layer.anchor === 'center') x = ctx.w / 2 - maxW / 2;
    }

    // 4. Strict Face Collision Dodging (Client Trust Rule)
    // We compute the true visual bounding box of the text to ensure it NEVER covers the detected face.
    if (ctx.faceCoordinates) {
      let boxX = x;
      if (anchor === 'middle') boxX = x - maxW / 2;
      else if (anchor === 'end') boxX = x - maxW;

      // EDITORIAL UPGRADE: If the headline is massive and system is editorial, we allow it to act as a background element (opacity < 0.2)
      // and NOT run away from the face, because it creates visual tension. 
      // But if it's solid text (opacity > 0.5), it MUST avoid the face.
      const isBackgroundText = system === 'editorial' && layer.role === 'heading' && style.fill.includes('opacity'); 
      
      if (!isBackgroundText) {
        const textBBox = { x: boxX, y, width: maxW, height: textHeightGuess };
        y = ctx.layoutEngine.resolveFaceCollision(textBBox, ctx.constraints);
      }
    }

    // Bounds checking to prevent text from clipping off the bottom
    if (y + textHeightGuess > ctx.h - 40) {
      y = ctx.h - textHeightGuess - 40;
    }
    
    // OPTICAL BALANCE: Mathematical centering looks too low to the human eye. 
    // Shift slightly upwards (-12px) when text is centered to make it feel premium.
    if (anchor === 'middle') {
      y -= 12;
    }

    // 5. Generate SVG
    const content = escapedLines.map((line: string, idx: number) => {
      let tspanStyle = '';
      let currentLineHeight = lineHeight;
      return `<tspan x="${x}" dy="${idx === 0 ? 0 : currentLineHeight}" style="${tspanStyle}">${line}</tspan>`;
    }).join('');

    let strokeAddition = '';
    const fontBehavior = this.fontRegistry.getBehavior(ctx.brandFont);
    if (layer.role === 'heading' && fontBehavior.requiresFauxStrokeForDominance) {
      strokeAddition = ` stroke="${style.fill}" stroke-width="2" stroke-linejoin="round" `;
    }

    let transformStr = '';
    if (layer.rotation) {
      transformStr = ` transform="rotate(${layer.rotation} ${x} ${y})"`;
    }

    let opacityStr = '';
    if ((layer as any).opacity !== undefined) {
      opacityStr = ` opacity="${(layer as any).opacity}"`;
    }

    let blendModeStr = '';
    if (isIntenseHierarchy && system === 'editorial') {
      blendModeStr = ` mix-blend-mode: exclusion;`;
    }

    let resultSvg = `<text x="${x}" y="${y}" text-anchor="${anchor}" class="overlay-text" style="font-family: '${ctx.brandFont}', sans-serif; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};${blendModeStr}" filter="url(#premium_shadow)"${strokeAddition}${transformStr}${opacityStr}>${content}</text>`;

    // Render the semantic secondary chunk
    if (isIntenseHierarchy && remainingText) {
      const subSize = Math.max(16, Math.round(style.fontSize * 0.15));
      const subLineHeight = Math.round(subSize * 1.4);
      const subLines = this.wrapText(remainingText, subSize, layer, ctx, system);
      
      const subContent = subLines.map((line: string, idx: number) => {
        return `<tspan x="${x}" dy="${idx === 0 ? 0 : subLineHeight}">${line}</tspan>`;
      }).join('');
      
      const subY = y + lineHeight * escapedLines.length + 20; // 20px gap
      resultSvg += `\n<text x="${x}" y="${subY}" text-anchor="${anchor}" style="font-family: 'Inter', system-ui, sans-serif; font-size: ${subSize}px; fill: ${style.fill}; font-weight: 400; letter-spacing: 2px;" opacity="0.8"${transformStr}>${subContent}</text>`;
    }

    return resultSvg;
  }

  /**
   * Resolves the font properties depending on the typographical system, layer role, and DSL properties.
   */
  private resolveStyle(layer: IDSLTextLayer, system: TypographySystem, ctx: TypographyContext) {
    const role = layer.role;
    let fontSize = ctx.dynamicFontSize;
    let fontWeight = 'normal';
    let fontStyle = 'normal';
    let fill = ctx.dynamicTextColor;
    let letterSpacing = 'normal';

    const fontBehavior = this.fontRegistry.getBehavior(ctx.brandFont);

    // 1. DSL Layer Direct Property Overrides (if defined)
    const layerObj = layer as any;
    if (layerObj.fontSize) {
      fontSize = layerObj.fontSize;
    } else if (layerObj.scale) {
      fontSize = Math.round(ctx.w * layerObj.scale);
    } 
    
    if (layerObj.tracking !== undefined) {
      letterSpacing = `${layerObj.tracking}em`;
    }
    
    if (!layerObj.fontSize && !layerObj.scale) {
      if (role === 'heading') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.heroSize : Math.max(72, Math.round(ctx.dynamicFontSize * 1.25));
        fontWeight = Math.min(800, fontBehavior.maxWeight).toString();
        letterSpacing = ctx.typographyMetrics ? ctx.typographyMetrics.heroTracking : `${fontBehavior.headlineTracking}em`;
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.metadataSize : Math.max(16, Math.round(ctx.dynamicFontSize * 0.7));
        letterSpacing = ctx.typographyMetrics ? ctx.typographyMetrics.metadataTracking : `${fontBehavior.taglineTracking}em`; 
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
      } else if (role === 'body') {
        fontSize = ctx.typographyMetrics ? ctx.typographyMetrics.bodySize : Math.max(18, Math.round(ctx.dynamicFontSize * 0.8));
        fontWeight = '400';
      }
    }

    if (system === 'editorial' && role === 'heading') {
      // EDITORIAL UPGRADE: Massive scale and extreme weight contrast
      fontSize = Math.max(140, Math.round(fontSize * 1.8)); // Huge scaling
      fontWeight = '900'; // Maximum visual weight
      letterSpacing = '-0.04em'; // Tight tracking for tension
      
      // If the text is really long, we might need to compress it slightly
    } else if (system === 'editorial' && role === 'tagline') {
      fontSize = 12; // Tiny metadata for contrast
      fontWeight = '300';
      letterSpacing = '0.3em'; // Wide tracking
      fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
    } else if (system === 'technical') {
      if (role === 'heading') {
        fontWeight = Math.min(800, fontBehavior.maxWeight).toString();
        letterSpacing = '0.04em';
      } else if (role === 'tagline' || role === 'footnote') {
        letterSpacing = '0.2em';
      }
    }

    // Design Tokens (Typography Assertiveness)
    if (ctx.designTokens && role === 'heading') {
      if (ctx.designTokens.headlinePresence === 'hero') {
        fontSize = Math.max(72, Math.round(fontSize * 1.25));
        fontWeight = '900';
      } else if (ctx.designTokens.headlinePresence === 'subtle') {
        fontSize = Math.round(fontSize * 0.85);
        fontWeight = '400';
      }
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing };
  }

  /**
   * Handles text wrapping based on layout constraints and DSL layer bounds.
   */
  private wrapText(text: string, fontSize: number, layer: IDSLTextLayer, ctx: TypographyContext, system: TypographySystem): string[] {
    const estimatedCharWidth = fontSize * 0.52;
    
    let layerMaxWidth = ctx.constraints.contentMaxWidth;
    const layerObj = layer as any;
    if (layerObj.maxWidthPercent) {
      layerMaxWidth = Math.round(ctx.w * (layerObj.maxWidthPercent / 100));
    }

    const maxAvailableWidth = Math.min(layerMaxWidth, ctx.constraints.contentMaxWidth);
    let maxCharsPerLine = Math.max(10, Math.floor(maxAvailableWidth / estimatedCharWidth));
    
    // BEHAVIORAL DESIGN: Dominance Stacking
    // Premium editorial design forces massive headlines to stack vertically rather than stretch wide.
    if (layer.role === 'heading') {
      if (system === 'editorial') {
        maxCharsPerLine = 12; // Extremely tight word wrap for tall, blocky editorial text
      } else if (fontSize >= 80) {
        maxCharsPerLine = 18;
      }
    }
    
    const words = text.split(/\s+/);
    const smartLines: string[] = [];
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
