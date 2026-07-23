import { IDSLTextLayer } from '../interfaces';
import { LayoutConstraints, LayoutEngine } from './layout-engine';
import { DesignTokens } from './theme-engine';

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
}

export type TypographySystem = 'editorial' | 'technical' | 'minimal';

export class TypographyEngine {
  
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
    }

    if (!rawText) return ''; // Skip rendering if text is empty for this layer

    // 2. Line Wrapping
    const escapedLines = this.wrapText(rawText, style.fontSize, layer, ctx, system);
    const lineHeight = layer.role === 'heading' ? Math.round(style.fontSize * 1.18) : layer.role === 'tagline' || layer.role === 'footnote' ? 26 : Math.round(style.fontSize * 1.35);
    const textHeightGuess = escapedLines.length * lineHeight;

    // 3. Resolve Coordinates via Layout Engine
    const anchorResult = ctx.layoutEngine.resolveAnchor(layer.anchor, 0, textHeightGuess, ctx.constraints);
    let x = anchorResult.x;
    let y = anchorResult.y;

    if (layer.anchor.includes('center') && ctx.faceCoordinates) {
      y = ctx.layoutEngine.resolveFaceCollision({ x, y, width: 0, height: textHeightGuess }, ctx.constraints);
    }

    // Bounds checking to prevent text from clipping off the bottom
    if (y + textHeightGuess > ctx.h - 40) {
      y = ctx.h - textHeightGuess - 40;
    }

    // 4. Resolve Alignment
    let anchor = 'start';
    if (layer.alignment === 'center' || layer.anchor.includes('center')) anchor = 'middle';
    if (layer.alignment === 'right' || layer.anchor.includes('right')) anchor = 'end';
    if (layer.alignment === 'left' || layer.anchor.includes('left')) anchor = 'start';

    // Explicit override
    if (layer.alignment === 'center') anchor = 'middle';
    if (layer.alignment === 'right') anchor = 'end';
    if (layer.alignment === 'left') anchor = 'start';
    
    // OPTICAL BALANCE: Mathematical centering looks too low to the human eye. 
    // Shift slightly upwards (-12px) when text is centered to make it feel premium.
    if (anchor === 'middle') {
      y -= 12;
    }

    // 5. Generate SVG
    const mixFonts = system === 'editorial' && layer.role === 'heading' && escapedLines.length > 1;

    const content = escapedLines.map((line: string, idx: number) => {
      let tspanStyle = '';
      if (mixFonts && idx === 0) {
         tspanStyle = `font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 300; font-size: ${style.fontSize * 1.1}px; text-transform: lowercase;`;
      }
      // CRITICAL FIX: Only apply `x` if we are absolutely anchored left/right, else inherit safely. Actually, applying `x` to tspan with text-anchor='middle' forces the center of EVERY line to align at X, which pushes long lines off canvas if X is small!
      // By using x="${x}", we explicitly force every line to start/center at X. If X is safeX (60), and text is middle, it pushes left.
      // We will keep x="${x}" but ensure text-anchor is CORRECT.
      return `<tspan x="${x}" dy="${idx === 0 ? 0 : lineHeight}" style="${tspanStyle}">${line}</tspan>`;
    }).join('');

    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="overlay-text" style="font-family: '${ctx.brandFont}', sans-serif; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};" filter="url(#premium_shadow)">${content}</text>`;
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

    // 1. DSL Layer Direct Property Overrides (if defined)
    const layerObj = layer as any;
    if (layerObj.fontSize) {
      fontSize = layerObj.fontSize;
    } else if (layerObj.scale) {
      fontSize = Math.round(ctx.w * layerObj.scale);
    } else if (role === 'heading') {
      fontSize = Math.max(72, Math.round(ctx.dynamicFontSize * 1.25));
      fontWeight = '800';
      letterSpacing = '-0.02em';
    } else if (role === 'tagline' || role === 'footnote') {
      fontSize = Math.max(16, Math.round(ctx.dynamicFontSize * 0.7));
      letterSpacing = '0.15em'; // Upgraded from 0.08em for premium feel
      fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
    } else if (role === 'body') {
      fontSize = Math.max(18, Math.round(ctx.dynamicFontSize * 0.8));
      fontWeight = '400';
    }

    if (system === 'editorial' && role === 'heading') {
      fontWeight = '900';
      letterSpacing = '-0.03em';
    } else if (system === 'technical') {
      if (role === 'heading') {
        fontWeight = '800';
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
    const maxCharsPerLine = Math.max(10, Math.floor(maxAvailableWidth / estimatedCharWidth));
    
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
      if (system === 'editorial') return esc(line);
      return esc(line.toUpperCase() !== line ? line.toUpperCase() : line);
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
