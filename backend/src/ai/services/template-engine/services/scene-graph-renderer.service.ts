/**
 * Scene Graph Renderer Service
 *
 * This is the generic renderer that executes CompositionPlan scene graphs.
 * It reads layers in z-order and calls draw() for each - no hardcoded logic.
 *
 * This is how Figma works:
 * - Designers define structure (recipes + composition)
 * - Renderer executes the structure faithfully
 * - Renderer never makes creative decisions
 */

import sharp, { Sharp } from 'sharp';
import { SceneGraphLayer, Bounds } from '../types/design-recipe.type';

export interface SceneGraphRenderContext {
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  downloadImageAsBuffer: (url: string) => Promise<Buffer>;
  primaryBrandColor: string;
  secondaryBrandColor: string;
}

export class SceneGraphRendererService {
  /**
   * Render a scene graph to SVG/Sharp instructions
   * This is the single source of rendering logic
   */
  async renderSceneGraph(
    layers: SceneGraphLayer[],
    context: SceneGraphRenderContext,
  ): Promise<{ svgLayers: string; compositeInstructions: any[] }> {
    // Sort layers by z-order
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    const svgParts: string[] = [];
    const compositeInstructions: any[] = [];

    // Start SVG
    svgParts.push(`<svg width="${context.canvas.width}" height="${context.canvas.height}" xmlns="http://www.w3.org/2000/svg">`);
    
    // Inject Fonts
    svgParts.push(`
      <defs>
        <style>
          @font-face {
            font-family: "Playfair Display";
            src: url("./assets/fonts/PlayfairDisplay-Regular.ttf");
          }
          @font-face {
            font-family: "Inter";
            src: url("./assets/fonts/Inter-Regular.ttf");
          }
          text {
            font-family: "Inter", sans-serif;
          }
        </style>
      </defs>
    `);

    // Process each layer
    for (const layer of sortedLayers) {
      switch (layer.type) {
        case 'background':
          this.renderBackground(layer, svgParts, context);
          break;

        case 'image':
          await this.renderImage(layer, compositeInstructions, context);
          break;

        case 'primitive':
          this.renderPrimitive(layer, svgParts, context);
          break;

        case 'text':
          this.renderText(layer, svgParts, context);
          break;

        case 'mask':
          this.renderMask(layer, svgParts, context);
          break;

        case 'overlay':
          this.renderOverlay(layer, svgParts, context);
          break;
      }
    }

    svgParts.push('</svg>');

    return {
      svgLayers: svgParts.join('\n'),
      compositeInstructions,
    };
  }

  /**
   * Render background layer
   */
  private renderBackground(
    layer: SceneGraphLayer,
    svg: string[],
    context: SceneGraphRenderContext,
  ): void {
    const color = layer.properties.color || context.canvas.backgroundColor;
    const opacity = layer.properties.opacity || 1.0;

    svg.push(`
      <rect
        x="0" y="0"
        width="${context.canvas.width}"
        height="${context.canvas.height}"
        fill="${color}"
        opacity="${opacity}"
      />
    `);
  }

  /**
   * Render image layer
   */
  private async renderImage(
    layer: SceneGraphLayer,
    composites: any[],
    context: SceneGraphRenderContext,
  ): Promise<void> {
    // Images are composited in Sharp, not SVG
    // Just record the instruction for the compositor
    composites.push({
      layerId: layer.id,
      type: 'image',
      bounds: layer.bounds,
      masking: layer.properties.masking || 'rectangle',
      zIndex: layer.zIndex,
    });
  }

  /**
   * Render primitive (structural element)
   * Rules, cards, badges, borders, shadows, grids, etc.
   */
  private renderPrimitive(
    layer: SceneGraphLayer,
    svg: string[],
    context: SceneGraphRenderContext,
  ): void {
    const type = layer.properties.primitiveType;
    const bounds = layer.bounds;
    const color = layer.properties.primitiveColor || context.primaryBrandColor;
    const opacity = layer.properties.primitiveOpacity || 0.8; // Make visible by default
    const thickness = layer.properties.primitiveThickness || 2;

    switch (type) {
      case 'rule':
        // Horizontal or vertical rule
        this.drawRule(svg, bounds, color, thickness, opacity);
        break;

      case 'frame':
        // Rectangular border frame
        this.drawFrame(svg, bounds, color, thickness, opacity);
        break;

      case 'badge':
        // Rounded rectangle badge
        this.drawBadge(svg, bounds, color, opacity);
        break;

      case 'card':
        // Card with shadow effect
        this.drawCard(svg, bounds, color, opacity);
        break;

      case 'border':
        // Simple border
        this.drawBorder(svg, bounds, color, thickness, opacity);
        break;

      case 'shadow':
        // Drop shadow effect
        this.drawShadow(svg, bounds, color, opacity);
        break;

      case 'grid':
        // Grid overlay
        this.drawGrid(svg, bounds, color, opacity);
        break;

      case 'decoration':
        // Generic decoration
        this.drawDecoration(svg, bounds, color, opacity);
        break;
    }
  }

  /**
   * Render text layer with constraint checking
   */
  private renderText(
    layer: SceneGraphLayer,
    svg: string[],
    context: SceneGraphRenderContext,
  ): void {
    const bounds = layer.bounds;
    const spec = layer.properties.textSpec;
    const text = layer.properties.text || '';
    const avoidRegions = layer.properties.avoidRegions || [];

    // Check if text spec exists
    if (!spec) {
      return;
    }

    // Check if text would overlap forbidden regions
    if (this.wouldOverlapRegions(bounds, avoidRegions)) {
      // Skip rendering or reposition text
      console.warn(`[SceneGraphRenderer] Text layer "${layer.id}" would overlap face/logo zone, repositioning...`);
      // Renderer could reposition here instead of skipping
      return;
    }

    // Process alignment and casing
    const alignment = (spec as any).alignment || 'left';
    const textAnchor = alignment === 'center' ? 'middle' : (alignment === 'right' ? 'end' : 'start');
    const xPos = alignment === 'center' ? bounds.x + bounds.width / 2 : (alignment === 'right' ? bounds.x + bounds.width : bounds.x);
    
    let displayText = text;
    const casing = (spec as any).textTransform || 'none';
    if (casing === 'uppercase') displayText = text.toUpperCase();
    else if (casing === 'lowercase') displayText = text.toLowerCase();

    // Render text with proper hierarchy
    svg.push(`
      <text
        x="${xPos}"
        y="${bounds.y}"
        font-family="${spec.fontFamily}"
        font-size="${spec.fontSize}"
        font-weight="${spec.fontWeight}"
        letter-spacing="${(spec as any).letterSpacing || 0}"
        fill="${spec.color}"
        text-anchor="${textAnchor}"
        dominant-baseline="hanging"
        opacity="1.0"
      >
        ${this.escapeXml(displayText.substring(0, 100))}
      </text>
    `);
  }

  /**
   * Render mask layer
   */
  private renderMask(
    layer: SceneGraphLayer,
    svg: string[],
    context: SceneGraphRenderContext,
  ): void {
    const bounds = layer.bounds;

    svg.push(`
      <defs>
        <mask id="mask-${layer.id}">
          <rect x="0" y="0" width="${context.canvas.width}" height="${context.canvas.height}" fill="white"/>
          <circle cx="${bounds.x + bounds.width / 2}" cy="${bounds.y + bounds.height / 2}" r="${Math.min(bounds.width, bounds.height) / 2}" fill="black"/>
        </mask>
      </defs>
    `);
  }

  /**
   * Render overlay layer
   */
  private renderOverlay(
    layer: SceneGraphLayer,
    svg: string[],
    context: SceneGraphRenderContext,
  ): void {
    const bounds = layer.bounds;
    const color = layer.properties.color || 'rgba(0,0,0,0.3)';
    const opacity = layer.properties.opacity || 0.3;

    svg.push(`
      <rect
        x="${bounds.x}"
        y="${bounds.y}"
        width="${bounds.width}"
        height="${bounds.height}"
        fill="${color}"
        opacity="${opacity}"
      />
    `);
  }

  /**
   * Draw a rule (line)
   */
  private drawRule(
    svg: string[],
    bounds: Bounds,
    color: string,
    thickness: number,
    opacity: number,
  ): void {
    const isHorizontal = bounds.width > bounds.height;

    if (isHorizontal) {
      svg.push(`
        <line
          x1="${bounds.x}"
          y1="${bounds.y + bounds.height / 2}"
          x2="${bounds.x + bounds.width}"
          y2="${bounds.y + bounds.height / 2}"
          stroke="${color}"
          stroke-width="${thickness}"
          opacity="${opacity}"
        />
      `);
    } else {
      svg.push(`
        <line
          x1="${bounds.x + bounds.width / 2}"
          y1="${bounds.y}"
          x2="${bounds.x + bounds.width / 2}"
          y2="${bounds.y + bounds.height}"
          stroke="${color}"
          stroke-width="${thickness}"
          opacity="${opacity}"
        />
      `);
    }
  }

  /**
   * Draw a rectangular frame
   */
  private drawFrame(
    svg: string[],
    bounds: Bounds,
    color: string,
    thickness: number,
    opacity: number,
  ): void {
    svg.push(`
      <rect
        x="${bounds.x}"
        y="${bounds.y}"
        width="${bounds.width}"
        height="${bounds.height}"
        fill="none"
        stroke="${color}"
        stroke-width="${thickness}"
        opacity="${opacity}"
      />
    `);
  }

  /**
   * Draw a badge (rounded rectangle)
   */
  private drawBadge(
    svg: string[],
    bounds: Bounds,
    color: string,
    opacity: number,
  ): void {
    const radius = Math.min(bounds.width, bounds.height) * 0.2;

    svg.push(`
      <rect
        x="${bounds.x}"
        y="${bounds.y}"
        width="${bounds.width}"
        height="${bounds.height}"
        rx="${radius}"
        ry="${radius}"
        fill="${color}"
        opacity="${opacity * 0.2}"
        stroke="${color}"
        stroke-width="1.5"
        stroke-opacity="${opacity}"
      />
    `);
  }

  /**
   * Draw a card with shadow
   */
  private drawCard(
    svg: string[],
    bounds: Bounds,
    color: string,
    opacity: number,
  ): void {
    const radius = 8;

    // Shadow
    svg.push(`
      <filter id="shadow-${bounds.x}-${bounds.y}">
        <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="${opacity * 0.3}"/>
      </filter>
    `);

    // Card
    svg.push(`
      <rect
        x="${bounds.x}"
        y="${bounds.y}"
        width="${bounds.width}"
        height="${bounds.height}"
        rx="${radius}"
        fill="white"
        stroke="${color}"
        stroke-width="1"
        stroke-opacity="${opacity}"
        filter="url(#shadow-${bounds.x}-${bounds.y})"
      />
    `);
  }

  /**
   * Draw a simple border
   */
  private drawBorder(
    svg: string[],
    bounds: Bounds,
    color: string,
    thickness: number,
    opacity: number,
  ): void {
    svg.push(`
      <rect
        x="${bounds.x}"
        y="${bounds.y}"
        width="${bounds.width}"
        height="${bounds.height}"
        fill="none"
        stroke="${color}"
        stroke-width="${thickness}"
        opacity="${opacity}"
      />
    `);
  }

  /**
   * Draw shadow effect
   */
  private drawShadow(
    svg: string[],
    bounds: Bounds,
    color: string,
    opacity: number,
  ): void {
    svg.push(`
      <filter id="shadow-${bounds.x}-${bounds.y}">
        <feDropShadow dx="4" dy="4" stdDeviation="6" flood-opacity="${opacity}"/>
      </filter>
      <rect
        x="${bounds.x + 2}"
        y="${bounds.y + 2}"
        width="${bounds.width - 4}"
        height="${bounds.height - 4}"
        fill="${color}"
        opacity="${opacity * 0.15}"
        filter="url(#shadow-${bounds.x}-${bounds.y})"
      />
    `);
  }

  /**
   * Draw grid overlay
   */
  private drawGrid(
    svg: string[],
    bounds: Bounds,
    color: string,
    opacity: number,
  ): void {
    const gridSize = 40;
    const lines: string[] = [];

    // Vertical lines
    for (let x = bounds.x; x < bounds.x + bounds.width; x += gridSize) {
      lines.push(`<line x1="${x}" y1="${bounds.y}" x2="${x}" y2="${bounds.y + bounds.height}" stroke="${color}" stroke-width="0.5" opacity="${opacity * 0.5}"/>`);
    }

    // Horizontal lines
    for (let y = bounds.y; y < bounds.y + bounds.height; y += gridSize) {
      lines.push(`<line x1="${bounds.x}" y1="${y}" x2="${bounds.x + bounds.width}" y2="${y}" stroke="${color}" stroke-width="0.5" opacity="${opacity * 0.5}"/>`);
    }

    svg.push(`<g>${lines.join('')}</g>`);
  }

  /**
   * Draw generic decoration
   */
  private drawDecoration(
    svg: string[],
    bounds: Bounds,
    color: string,
    opacity: number,
  ): void {
    // Simple circle or geometric shape
    svg.push(`
      <circle
        cx="${bounds.x + bounds.width / 2}"
        cy="${bounds.y + bounds.height / 2}"
        r="${Math.min(bounds.width, bounds.height) / 2}"
        fill="none"
        stroke="${color}"
        stroke-width="1.5"
        opacity="${opacity}"
      />
    `);
  }

  /**
   * Check if bounds would overlap with forbidden regions
   */
  private wouldOverlapRegions(bounds: Bounds, forbiddenRegions: Bounds[]): boolean {
    for (const region of forbiddenRegions) {
      if (this.boundsIntersect(bounds, region)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if two bounds intersect
   */
  private boundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
