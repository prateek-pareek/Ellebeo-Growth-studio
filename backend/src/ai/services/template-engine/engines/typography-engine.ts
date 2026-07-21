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
    const style = this.resolveStyle(layer.role, system, ctx);

    // 2. Line Wrapping
    const escapedLines = this.wrapText(ctx.overlayText || '', style.fontSize, ctx);
    const lineHeight = layer.role === 'tagline' || layer.role === 'footnote' ? 25 : style.fontSize * 1.35;
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

    // 5. Generate SVG
    const content = escapedLines.map((line: string, idx: number) => `<tspan x="${x}" dy="${idx === 0 ? 0 : lineHeight}">${line}</tspan>`).join('');

    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="overlay-text" style="font-family: '${ctx.brandFont}', sans-serif; font-size: ${style.fontSize}px; fill: ${style.fill}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; letter-spacing: ${style.letterSpacing};" filter="url(#premium_shadow)">${content}</text>`;
  }

  /**
   * Resolves the font properties depending on the typographical system and layer role.
   */
  private resolveStyle(role: string, system: TypographySystem, ctx: TypographyContext) {
    let fontSize = ctx.dynamicFontSize;
    let fontWeight = 'normal';
    let fontStyle = 'normal';
    let fill = ctx.dynamicTextColor;
    let letterSpacing = 'normal';

    if (system === 'editorial') {
      if (role === 'heading') {
        fontSize = ctx.dynamicFontSize + 16;
        fontWeight = '900';
        letterSpacing = '-0.02em';
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.dynamicFontSize - 4;
        fontStyle = 'italic';
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
        letterSpacing = '0.05em';
      } else if (role === 'body') {
        fontWeight = '300';
      }
    } else if (system === 'technical') {
      if (role === 'heading') {
        fontSize = ctx.dynamicFontSize + 8;
        fontWeight = '700';
        letterSpacing = '0.05em'; // Technical monospace feel
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.dynamicFontSize - 6;
        fontWeight = 'bold';
        letterSpacing = '0.2em';
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
      } else if (role === 'body') {
        fontWeight = '400';
      }
    } else {
      // minimal / default
      if (role === 'heading') {
        fontSize = ctx.dynamicFontSize + 10;
        fontWeight = '700';
      } else if (role === 'tagline' || role === 'footnote') {
        fontSize = ctx.dynamicFontSize - 4;
        letterSpacing = '0.05em';
        fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
      } else if (role === 'body') {
        fontWeight = '400';
      }
    }

    // Phase E: Apply Design Tokens (Typography Assertiveness)
    if (ctx.designTokens) {
      if (role === 'heading') {
        if (ctx.designTokens.headlinePresence === 'hero') {
          fontSize = ctx.dynamicFontSize * 1.6; // Massive assertion
          fontWeight = '900';
        } else if (ctx.designTokens.headlinePresence === 'subtle') {
          fontSize = ctx.dynamicFontSize * 0.9;
          fontWeight = '300';
        }
      }
    }

    return { fontSize, fontWeight, fontStyle, fill, letterSpacing };
  }

  /**
   * Handles text wrapping based on layout constraints.
   */
  private wrapText(text: string, fontSize: number, ctx: TypographyContext): string[] {
    const estimatedCharWidth = fontSize * 0.55;
    const maxAvailableWidth = ctx.constraints.contentMaxWidth;
    const maxCharsPerLine = Math.floor(maxAvailableWidth / estimatedCharWidth);
    
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
    
    return smartLines.map(line => {
      if (ctx.escapeXml) {
         return ctx.escapeXml(line.toUpperCase() !== line ? line.toUpperCase() : line);
      }
      return line;
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
