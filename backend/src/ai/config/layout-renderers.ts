// ============================================================================
// layout-renderers.ts — Rendering primitives dispatched by layout-templates.config.json
//
// Each layout template (see layout-templates.config.json) names a `base` treatment,
// an optional `textTemplate`, and an optional `decoration`. This file holds the actual
// Sharp/SVG implementation for every one of those keys. Adding a new layout that reuses
// existing primitives is now a JSON-only change; only a genuinely new visual mechanic
// requires adding a function here.
// ============================================================================

import sharp from 'sharp';
import layoutTemplatesConfig from './layout-templates.config.json';
import templateLibraryData from './template-library.json';
import compiledLayouts from './compiled-layouts.v1.json';
import { processPortraitFit } from '../services/ai-image-generation.service';
import { ICompiledLayoutDSL, IDSLSceneLayer, IDSLImageLayer, IDSLDecorationLayer, IDSLTextLayer } from '../services/template-engine/interfaces';
import type { VisualStyleId } from './visual-style-library';

export type LayoutTemplate = {
  base: string;
  textTemplate: string | null;
  decoration: string | null;
  showWatermark: boolean;
  showFooter: boolean;
};

// `_proposed_template_agent_library` in the JSON is a design catalog for a future Template Agent —
// it has a different shape (concept/visual_structure/etc, not base/textTemplate/decoration) and is
// excluded here so it can never be matched by resolveLayoutTemplate() or reach the renderer.
const { _proposed_template_agent_library, ...activeLayoutTemplates } = layoutTemplatesConfig as any;

export const LAYOUT_TEMPLATES: Record<string, LayoutTemplate> = activeLayoutTemplates as Record<string, LayoutTemplate>;

// Every one of the 10 Brand DNA visual styles (visual-style-library.ts) maps
// to one real decoration from the Component Registry below — chosen to match
// that style's defined material/composition language (e.g. Quiet Luxury's
// "brushed brass as the only metallic" -> gold_foil_accents; Bold Campaign's
// "flat colour fields" -> brand_scrim_heavy). Only applied when a layout's
// own config leaves `decoration: null` — a layout with a curated decoration
// already assigned keeps it untouched regardless of style ranking.
const STYLE_DECORATION_MAP: Record<VisualStyleId, string> = {
  quiet_luxury: 'gold_foil_accents',
  editorial_beauty: 'gallery_hairline',
  clinical_minimalist: 'gallery_hairline',
  warm_wellness: 'masking_tape_corners',
  high_fashion: 'dark_scrim_overlay',
  polished_commercial: 'side_photo_embed',
  soft_feminine: 'translucent_pane',
  bold_campaign: 'brand_scrim_heavy',
  natural_organic: 'ticket_notches_dashed',
  contemporary_cool: 'film_sprockets',
};

export function resolveLayoutTemplate(layoutType: string, visualRanking?: string[]): LayoutTemplate {
  // If it's a hardcoded legacy layout, use it natively
  const resolved = LAYOUT_TEMPLATES[layoutType]
    ? LAYOUT_TEMPLATES[layoutType]!
    // Otherwise, route to the Universal Dynamic Renderer engines
    : {
      base: 'universal_dynamic_base',
      textTemplate: 'universal_dynamic_text',
      decoration: 'universal_dynamic_deco',
      showWatermark: true,
      showFooter: true
    };

  // Style Mapping: an undecorated layout gets a decoration matching the
  // brand's top-ranked visual style, instead of always rendering plain.
  const primaryStyle = visualRanking?.[0] as VisualStyleId | undefined;
  if (resolved.decoration === null && primaryStyle && STYLE_DECORATION_MAP[primaryStyle]) {
    return { ...resolved, decoration: STYLE_DECORATION_MAP[primaryStyle] };
  }

  return resolved;
}

// ── Component Registry ───────────────────────────────────────────────────────

const ComponentRegistry: Record<string, (ctx: any, layer: IDSLDecorationLayer) => string> = {
  wax_seal: (ctx, layer) => {
    let cx = ctx.w / 2;
    let cy = 180;
    if (layer.anchor && layer.anchor.includes('left')) cx = 150;
    if (layer.anchor && layer.anchor.includes('right')) cx = ctx.w - 150;
    if (layer.anchor && layer.anchor.includes('bottom')) cy = ctx.h - 150;
    
    // Extract first letter of rawName for seal
    const initial = ctx.rawName ? ctx.rawName.charAt(0).toUpperCase() : 'E';

    return `
      <!-- Wax Seal Base (Shadow) -->
      <circle cx="${cx}" cy="${cy + 6}" r="62" fill="#000000" fill-opacity="0.15" filter="blur(4px)" />
      <!-- Outer Wax Ring (Irregular) -->
      <path d="M ${cx},${cy - 65} C ${cx + 35},${cy - 60} ${cx + 65},${cy - 30} ${cx + 62},${cy + 10} C ${cx + 58},${cy + 45} ${cx + 25},${cy + 68} ${cx - 10},${cy + 65} C ${cx - 40},${cy + 60} ${cx - 68},${cy + 25} ${cx - 60},${cy - 20} C ${cx - 50},${cy - 55} ${cx - 20},${cy - 68} ${cx},${cy - 65} Z" fill="${ctx.validBrandColor}" />
      <!-- Inner Embossed Ring -->
      <circle cx="${cx}" cy="${cy}" r="48" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="2" stroke-opacity="0.4" />
      <circle cx="${cx}" cy="${cy}" r="50" fill="none" stroke="#000000" stroke-width="2" stroke-opacity="0.2" />
      <!-- Embossed Initial -->
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="${ctx.brandFont}, serif" font-size="52px" fill="${ctx.validSecondaryColor}" font-weight="bold">${initial}</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="${ctx.brandFont}, serif" font-size="52px" fill="#000000" fill-opacity="0.2" font-weight="bold">${initial}</text>
    `;
  },
  gold_accents: (ctx, layer) => {
    // Thin brand-colored or accent-colored lines adding structure
    return `
      <rect x="50" y="50" width="${ctx.w - 100}" height="2" fill="${ctx.validBrandColor}" fill-opacity="0.8" />
      <rect x="50" y="${ctx.h - 52}" width="${ctx.w - 100}" height="2" fill="${ctx.validBrandColor}" fill-opacity="0.8" />
      <circle cx="50" cy="50" r="4" fill="${ctx.validBrandColor}" />
      <circle cx="${ctx.w - 50}" cy="50" r="4" fill="${ctx.validBrandColor}" />
      <circle cx="50" cy="${ctx.h - 50}" r="4" fill="${ctx.validBrandColor}" />
      <circle cx="${ctx.w - 50}" cy="${ctx.h - 50}" r="4" fill="${ctx.validBrandColor}" />
    `;
  },
  gallery_frame: (ctx, layer) => {
    return `
      <!-- Deep inner mat border -->
      <rect x="40" y="40" width="${ctx.w - 80}" height="${ctx.h - 80}" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="15" opacity="0.9" />
      <rect x="55" y="55" width="${ctx.w - 110}" height="${ctx.h - 110}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.6" />
    `;
  },
  film_sprockets: (ctx, layer) => {
    // Draws sprocket holes along left and right edges
    let sprockets = '';
    for(let i = 0; i < ctx.h; i += 60) {
      sprockets += `<rect x="15" y="${i}" width="20" height="30" rx="4" fill="${ctx.validBackgroundColor}" />`;
      sprockets += `<rect x="${ctx.w - 35}" y="${i}" width="20" height="30" rx="4" fill="${ctx.validBackgroundColor}" />`;
    }
    return `
      <rect x="0" y="0" width="50" height="${ctx.h}" fill="${ctx.validBrandColor}" opacity="0.95" />
      <rect x="${ctx.w - 50}" y="0" width="50" height="${ctx.h}" fill="${ctx.validBrandColor}" opacity="0.95" />
      ${sprockets}
    `;
  },
  ticket_notches: (ctx, layer) => {
    return `
      <!-- Corner Notches and perforation -->
      <circle cx="0" cy="0" r="45" fill="${ctx.validBackgroundColor}" />
      <circle cx="${ctx.w}" cy="0" r="45" fill="${ctx.validBackgroundColor}" />
      <circle cx="0" cy="${ctx.h}" r="45" fill="${ctx.validBackgroundColor}" />
      <circle cx="${ctx.w}" cy="${ctx.h}" r="45" fill="${ctx.validBackgroundColor}" />
      <line x1="60" y1="0" x2="${ctx.w - 60}" y2="0" stroke="${ctx.validBackgroundColor}" stroke-dasharray="10 15" stroke-width="4" />
      <line x1="60" y1="${ctx.h}" x2="${ctx.w - 60}" y2="${ctx.h}" stroke="${ctx.validBackgroundColor}" stroke-dasharray="10 15" stroke-width="4" />
    `;
  },
  masking_tape: (ctx, layer) => {
    let tx = 80;
    let ty = 80;
    if (layer.anchor && layer.anchor.includes('bottom')) ty = ctx.h - 120;
    if (layer.anchor && layer.anchor.includes('right')) tx = ctx.w - 160;
    return `
      <!-- Textured realistic tape strip -->
      <g transform="translate(${tx}, ${ty}) rotate(-12)">
        <rect x="0" y="0" width="160" height="40" fill="${ctx.validSecondaryColor}" opacity="0.95" filter="drop-shadow(2px 4px 4px rgba(0,0,0,0.15))" />
        <!-- Jagged edges -->
        <path d="M 0,0 L -5,10 L 2,20 L -4,30 L 0,40" fill="${ctx.validSecondaryColor}" opacity="0.95" />
        <path d="M 160,0 L 165,10 L 158,20 L 164,30 L 160,40" fill="${ctx.validSecondaryColor}" opacity="0.95" />
      </g>
    `;
  },
  glass_card: (ctx, layer) => {
    return `
      <rect x="40" y="${ctx.h - 320}" width="${ctx.w - 80}" height="280" rx="16" fill="${ctx.validSecondaryColor}" fill-opacity="0.85" stroke="${ctx.validBrandColor}" stroke-width="1" filter="drop-shadow(0 15px 25px rgba(0,0,0,0.1))" />
    `;
  },
  '3d_ribbon': (ctx, layer) => {
    return `
      <!-- Ribbon wrapping around image -->
      <path d="M -20,120 L ${ctx.w + 20},120 L ${ctx.w + 10},160 L -10,160 Z" fill="${ctx.validBrandColor}" opacity="0.9" filter="drop-shadow(0 5px 10px rgba(0,0,0,0.2))" />
      <path d="M -20,120 L -20,140 L 0,120 Z" fill="#000000" opacity="0.3" />
      <path d="M ${ctx.w + 20},120 L ${ctx.w + 20},140 L ${ctx.w},120 Z" fill="#000000" opacity="0.3" />
    `;
  },
  metric_panel: (ctx, layer) => {
    // A premium glassmorphic weather/data panel
    const py = ctx.h - 220;
    return `
      <g transform="translate(60, ${py})">
        <rect x="0" y="0" width="${ctx.w - 120}" height="140" rx="20" fill="${ctx.validSecondaryColor}" fill-opacity="0.85" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-opacity="0.4" filter="drop-shadow(0 20px 40px rgba(0,0,0,0.2))" />
        <rect x="20" y="20" width="80" height="100" rx="10" fill="${ctx.validBrandColor}" fill-opacity="0.1" />
        <text x="60" y="75" text-anchor="middle" font-family="${ctx.brandFont}, sans-serif" font-size="42px" fill="${ctx.dynamicTextColor}" font-weight="900">72°</text>
        <line x1="120" y1="20" x2="120" y2="120" stroke="${ctx.validBrandColor}" stroke-opacity="0.3" stroke-width="2" />
        <text x="140" y="55" font-family="${ctx.brandFont}, sans-serif" font-size="14px" fill="${ctx.dynamicTextColor}" opacity="0.7" font-weight="bold" letter-spacing="0.1em" text-transform="uppercase">UV INDEX</text>
        <text x="140" y="85" font-family="${ctx.brandFont}, sans-serif" font-size="28px" fill="${ctx.dynamicTextColor}" font-weight="bold">Moderate</text>
        <circle cx="${ctx.w - 180}" cy="70" r="40" fill="none" stroke="${ctx.validBrandColor}" stroke-width="4" stroke-opacity="0.2" />
        <circle cx="${ctx.w - 180}" cy="70" r="40" fill="none" stroke="${ctx.validBrandColor}" stroke-width="4" stroke-dasharray="140 100" />
      </g>
    `;
  },
  editorial_sidebar: (ctx, layer) => {
    // A luxury magazine sidebar
    return `
      <g transform="translate(40, 100)">
        <rect x="0" y="0" width="4" height="${ctx.h - 200}" fill="${ctx.validBrandColor}" />
        <text x="25" y="40" font-family="${ctx.brandFont}, serif" font-size="12px" fill="${ctx.validBackgroundColor}" font-weight="bold" letter-spacing="0.3em" text-transform="uppercase" transform="rotate(-90, 25, 40)">VOL. 01</text>
        <text x="25" y="${ctx.h - 220}" font-family="${ctx.brandFont}, serif" font-size="12px" fill="${ctx.validBackgroundColor}" font-weight="bold" letter-spacing="0.3em" text-transform="uppercase" transform="rotate(-90, 25, ${ctx.h - 220})">EDITORIAL</text>
      </g>
    `;
  },
  status_chip: (ctx, layer) => {
    return `
      <g transform="translate(${ctx.w / 2 - 80}, 60)">
        <rect x="0" y="0" width="160" height="36" rx="18" fill="${ctx.validBrandColor}" opacity="0.9" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.15))" />
        <text x="80" y="22" text-anchor="middle" font-family="${ctx.brandFont}, sans-serif" font-size="12px" fill="${ctx.validBackgroundColor}" font-weight="bold" letter-spacing="0.2em" text-transform="uppercase">NEW ARRIVAL</text>
      </g>
    `;
  },
  divider: (ctx, layer) => {
    return `
      <line x1="${ctx.w / 2 - 60}" y1="${ctx.h / 2 + 100}" x2="${ctx.w / 2 + 60}" y2="${ctx.h / 2 + 100}" stroke="${ctx.validBrandColor}" stroke-width="2" opacity="0.5" />
      <circle cx="${ctx.w / 2}" cy="${ctx.h / 2 + 100}" r="4" fill="${ctx.validBackgroundColor}" stroke="${ctx.validBrandColor}" stroke-width="2" />
    `;
  }
};

const renderTextLayer = (ctx: any, layer: IDSLTextLayer): string => {
  // Safe margins for text
  const safeX = 60;
  const safeY = 140;
  
  // Luxury Typography Engine (Mixes weights, styles, and sizes based on role)
  let fontSize = ctx.dynamicFontSize;
  let fontWeight = 'normal';
  let fontStyle = 'normal';
  let fill = ctx.dynamicTextColor;
  let letterSpacing = 'normal';

  if (layer.role === 'heading') {
    fontSize = ctx.dynamicFontSize + 16;
    fontWeight = '900'; // Extra bold hook
    letterSpacing = '-0.02em';
  } else if (layer.role === 'tagline' || layer.role === 'footnote') {
    fontSize = ctx.dynamicFontSize - 4;
    fontStyle = 'italic'; // Elegant small caps / italic
    fill = ctx.validSecondaryColor || ctx.dynamicTextColor;
    letterSpacing = '0.05em';
  } else if (layer.role === 'body') {
    fontSize = ctx.dynamicFontSize;
    fontWeight = '300'; // Light, elegant body
  }

  // Dynamic Line Wrapping based on canvas width and font size
  const estimatedCharWidth = fontSize * 0.55;
  const maxAvailableWidth = ctx.w - (safeX * 2);
  const maxCharsPerLine = Math.floor(maxAvailableWidth / estimatedCharWidth);
  
  const words = (ctx.overlayText || '').split(/\s+/);
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
  
  // Use pre-escaped formatting if available, otherwise just escape XML
  const escapedLines = smartLines.map(line => {
    // If the orchestrator already provides an escapeXml helper in ctx, use it.
    if (ctx.escapeXml) {
       // Also apply capitalization rule if needed, though usually orchestrator does it
       return ctx.escapeXml(line.toUpperCase() !== line ? line.toUpperCase() : line);
    }
    return line;
  });

  const lineHeight = layer.role === 'tagline' || layer.role === 'footnote' ? 25 : fontSize * 1.35;
  const textHeightGuess = escapedLines.length * lineHeight;

  // Resolve X coordinate
  let x = ctx.w / 2; // Default center
  if (layer.anchor.includes('left') || layer.anchor === 'edges') x = safeX;
  if (layer.anchor.includes('right')) x = ctx.w - safeX;
  
  // Resolve Y coordinate
  let y = ctx.h / 2; // Default center
  if (layer.anchor.includes('top')) y = safeY;
  if (layer.anchor.includes('bottom')) y = ctx.h - safeY - 40;
  if (layer.anchor === 'bottom_edge' || layer.anchor === 'edges') y = ctx.h - 80;

  // Face Collision Detection (Safe Zone Awareness)
  if (layer.anchor.includes('center') && ctx.faceCoordinates) {
    const face = ctx.faceCoordinates;
    // If text Y overlaps with face bounding box
    if (y >= face.y - textHeightGuess && y <= face.y + face.height + textHeightGuess) {
       // Push text down below the face to the safe background zone
       y = face.y + face.height + 80;
       if (y + textHeightGuess > ctx.h - safeY) {
         // If it's pushed off screen, push it to the top instead
         y = Math.max(safeY, face.y - textHeightGuess - 40);
       }
    }
  }

  // Bounds checking to prevent text from clipping off the bottom
  if (y + textHeightGuess > ctx.h - 40) {
     y = ctx.h - textHeightGuess - 40;
  }

  // Resolve alignment implicitly if not specified, otherwise use specified
  let anchor = 'start';
  if (layer.alignment === 'center' || layer.anchor.includes('center')) anchor = 'middle';
  if (layer.alignment === 'right' || layer.anchor.includes('right')) anchor = 'end';
  if (layer.alignment === 'left' || layer.anchor.includes('left')) anchor = 'start';

  // Override if explicit alignment is provided
  if (layer.alignment === 'center') anchor = 'middle';
  if (layer.alignment === 'right') anchor = 'end';
  if (layer.alignment === 'left') anchor = 'start';

  // Multiline text handling
  const content = escapedLines.map((line: string, idx: number) => `<tspan x="${x}" dy="${idx === 0 ? 0 : lineHeight}">${line}</tspan>`).join('');

  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="overlay-text" style="font-family: '${ctx.brandFont}', sans-serif; font-size: ${fontSize}px; fill: ${fill}; font-weight: ${fontWeight}; font-style: ${fontStyle}; letter-spacing: ${letterSpacing}; text-shadow: 0 2px 10px rgba(0,0,0,0.15);">${content}</text>`;
};


// ── Base image treatments (Step 1) ──────────────────────────────────────────

export type BaseCtx = {
  layoutType: string;
  imageBuffer: Buffer;
  beforePhotoUrl?: string;
  w: number;
  h: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
  innerW: number;
  innerH: number;
  validBrandColor: string;
  validSecondaryColor: string;
  validBackgroundColor: string;
  downloadImageAsBuffer: (url: string) => Promise<Buffer>;
};

export type BaseResult = {
  baseImage: sharp.Sharp;
  compositeTop: number;
  compositeBottom: number;
  compositeLeft: number;
  compositeRight: number;
};

// Uses processPortraitFit: contain + blurred background — never crops faces on tall photos
const borderedDefault = async (ctx: BaseCtx): Promise<BaseResult> => ({
  baseImage: sharp(await processPortraitFit(ctx.imageBuffer, ctx.innerW, ctx.innerH, ctx.validBackgroundColor)),
  compositeTop: ctx.paddingTop,
  compositeBottom: ctx.paddingBottom,
  compositeLeft: ctx.paddingX,
  compositeRight: ctx.paddingX,
});

// Full-bleed: resize to canvas dimensions so SVG overlay coordinates match
const fullBleedBase = async (ctx: BaseCtx): Promise<BaseResult> => ({
  baseImage: sharp(await processPortraitFit(ctx.imageBuffer, ctx.w, ctx.h, ctx.validBackgroundColor)),
  compositeTop: 0,
  compositeBottom: 0,
  compositeLeft: 0,
  compositeRight: 0,
});

export const BASE_TREATMENTS: Record<string, (ctx: BaseCtx) => Promise<BaseResult>> = {
  bordered_default: async (ctx) => await borderedDefault(ctx),

  full_bleed: async (ctx) => await fullBleedBase(ctx),

  full_bleed_duotone: async (ctx) => {
    const base = await fullBleedBase(ctx);
    base.baseImage = base.baseImage.greyscale().tint(ctx.validBrandColor as any);
    return base;
  },

  solid_canvas_full: async (ctx) => ({
    baseImage: sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validBackgroundColor } }),
    compositeTop: 0,
    compositeBottom: 0,
    compositeLeft: 0,
    compositeRight: 0,
  }),

  solid_canvas_bordered: async (ctx) => ({
    baseImage: sharp({ create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: ctx.validBackgroundColor } }),
    compositeTop: ctx.paddingTop,
    compositeBottom: ctx.paddingBottom,
    compositeLeft: ctx.paddingX,
    compositeRight: ctx.paddingX,
  }),

  asymmetric_offset: async (ctx) => {
    const monoW = Math.floor(ctx.w * 0.70);
    const monoH = Math.floor(ctx.h * 0.70);
    const compositeTop = Math.floor(ctx.h * 0.05);
    const compositeLeft = Math.floor(ctx.w * 0.05);
    return {
      baseImage: sharp(await processPortraitFit(ctx.imageBuffer, monoW, monoH, ctx.validBackgroundColor)),
      compositeTop,
      compositeLeft,
      compositeBottom: ctx.h - monoH - compositeTop,
      compositeRight: ctx.w - monoW - compositeLeft,
    };
  },

  split_before_after: async (ctx) => {
    if (!ctx.beforePhotoUrl) return borderedDefault(ctx);
    try {
      const beforeBuffer = await ctx.downloadImageAsBuffer(ctx.beforePhotoUrl);
      const leftHalf = await processPortraitFit(beforeBuffer, Math.round(ctx.innerW / 2), ctx.innerH, ctx.validBackgroundColor);
      const rightHalf = await processPortraitFit(ctx.imageBuffer, Math.round(ctx.innerW / 2), ctx.innerH, ctx.validBackgroundColor);
      const baseImage = sharp({
        create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: '#000000' },
      }).composite([
        { input: leftHalf, top: 0, left: 0 },
        { input: rightHalf, top: 0, left: Math.round(ctx.innerW / 2) },
      ]);
      return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
    } catch (err) {
      console.error('[Sharp Split Frame Error] Failed to stitch before/after images, falling back:', err);
      return borderedDefault(ctx);
    }
  },

  arch_mask: async (ctx) => {
    try {
      const archMaskSvg = `
        <svg width="${ctx.innerW}" height="${ctx.innerH}" xmlns="http://www.w3.org/2000/svg">
          <path d="M 0 ${ctx.innerH} L 0 ${Math.round(ctx.innerH * 0.42)} A ${Math.round(ctx.innerW / 2)} ${Math.round(ctx.innerH * 0.42)} 0 0 1 ${ctx.innerW} ${Math.round(ctx.innerH * 0.42)} L ${ctx.innerW} ${ctx.innerH} Z" fill="#fff"/>
        </svg>`;
      const fittedBuffer = await processPortraitFit(ctx.imageBuffer, ctx.innerW, ctx.innerH, ctx.validBackgroundColor);
      const archPhoto = await sharp(fittedBuffer)
        .composite([{ input: Buffer.from(archMaskSvg), blend: 'dest-in' }])
        .png()
        .toBuffer();
      const baseImage = sharp({
        create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: ctx.validSecondaryColor },
      }).composite([{ input: archPhoto, top: 0, left: 0 }]);
      return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
    } catch (err) {
      console.error('[Sharp Editorial Arch Error] Falling back to standard inset:', err);
      return borderedDefault(ctx);
    }
  },

  universal_dynamic_base: async (ctx) => {
    const dsl = (compiledLayouts as any)[ctx.layoutType] as ICompiledLayoutDSL;
    
    if (dsl && dsl.layers) {
      const imageLayer = dsl.layers.find(l => l.type === 'image') as IDSLImageLayer;
      if (imageLayer) {
        if (imageLayer.mask === 'split') {
          const halfW = Math.floor(ctx.w / 2);
          const splitPhoto = await processPortraitFit(ctx.imageBuffer, halfW, ctx.h, ctx.validBackgroundColor);
          const baseImage = sharp({
            create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor },
          }).composite([{ input: splitPhoto, top: 0, left: 0 }]);
          return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: halfW + ctx.paddingX, compositeRight: ctx.paddingX };
        } else if (imageLayer.mask === 'circle') {
          // Circle mask logic
          return fullBleedBase(ctx);
        } else if (imageLayer.mask === 'die_cut' || imageLayer.paddingPercent > 0) {
          return borderedDefault(ctx);
        }
      }
    }
    
    // Fallback: standard full bleed image
    return fullBleedBase(ctx);
  },

  polaroid_stack: async (ctx) => {
    const minDim = Math.floor(Math.min(ctx.w, ctx.h) * 0.85);
    const photo = await processPortraitFit(ctx.imageBuffer, minDim, minDim, ctx.validBackgroundColor);
    const frameW = minDim + 60;
    const frameH = minDim + 160;
    const polaroidFrame = await sharp({ create: { width: frameW, height: frameH, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const baseImage = sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor } })
      .composite([
        { input: polaroidFrame, top: Math.floor((ctx.h - frameH)/2), left: Math.floor((ctx.w - frameW)/2) },
        { input: photo, top: Math.floor((ctx.h - frameH)/2) + 30, left: Math.floor((ctx.w - frameW)/2) + 30 }
      ]);
    return { baseImage, compositeTop: Math.floor((ctx.h - frameH)/2) + minDim + 50, compositeBottom: ctx.paddingBottom, compositeLeft: Math.floor((ctx.w - frameW)/2) + 40, compositeRight: Math.floor((ctx.w - frameW)/2) + 40 };
  },

  circle_crop: async (ctx) => {
    const minDim = Math.floor(Math.min(ctx.w, ctx.h) * 0.75);
    const photo = await processPortraitFit(ctx.imageBuffer, minDim, minDim, ctx.validBackgroundColor);
    const circleSvg = Buffer.from(`<svg width="${minDim}" height="${minDim}"><circle cx="${minDim/2}" cy="${minDim/2}" r="${minDim/2}" fill="white"/></svg>`);
    const masked = await sharp(photo).composite([{ input: circleSvg, blend: 'dest-in' }]).png().toBuffer();
    const baseImage = sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor } })
      .composite([{ input: masked, top: Math.floor((ctx.h - minDim)/2), left: Math.floor((ctx.w - minDim)/2) }]);
    return { baseImage, compositeTop: Math.floor((ctx.h - minDim)/2) + minDim + 40, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
  },

  torn_paper_edge: async (ctx) => {
    const photo = await processPortraitFit(ctx.imageBuffer, ctx.w, ctx.h, ctx.validBackgroundColor);
    const tearSvg = Buffer.from(`
      <svg width="${ctx.w}" height="${ctx.h}" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 0 L ${ctx.w} 0 L ${ctx.w} ${ctx.h - 150} Q ${ctx.w * 0.75} ${ctx.h - 180} ${ctx.w / 2} ${ctx.h - 130} T 0 ${ctx.h - 160} Z" fill="white"/>
      </svg>`);
    const masked = await sharp(photo).composite([{ input: tearSvg, blend: 'dest-in' }]).png().toBuffer();
    const baseImage = sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor } })
      .composite([{ input: masked, top: 0, left: 0 }]);
    return { baseImage, compositeTop: ctx.h - 120, compositeBottom: 20, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
  },
};

// ── Text templates (Step 3) ─────────────────────────────────────────────────

export type TextCtx = {
  layoutType: string;
  w: number;
  h: number;
  dynamicFontSize: number;
  dyOffset: number;
  escapedLines: string[];
  lines: string[];
  overlayText: string;
  maxLength: number;
  dynamicTextColor: string;
  posterTextColor: string;
  validBrandColor: string;
  validSecondaryColor: string;
  brandFont: string;
  bodyFont: string;
  escapedSpacedName: string;
  photoDataUri: string;
  escapeXml: (str: string) => string;
  faceCoordinates?: {
    eyesYPercent: number;
    mouthYPercent: number;
  };
};

const tspans = (ctx: TextCtx, x: string, dyFirst = 0) =>
  ctx.escapedLines.map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? dyFirst : ctx.dyOffset}">${line}</tspan>`).join('');

function calculateDodgedY(ctx: TextCtx, intendedY: number, textHeight: number): number {
  // ARCHITECTURE DECISION:
  // The Universal Rendering Engine must NOT dynamically redesign layouts (e.g. dodging faces).
  // Collision prevention is handled entirely upstream by the Template Engine's HardConstraintEngine.
  // We simply return the intended layout Y coordinate.
  return intendedY;
}

export const TEXT_TEMPLATES: Record<string, (ctx: TextCtx) => string> = {
  passepartout_bottom: (ctx) => `
      <!-- Hook Text directly in the Passepartout Negative Space -->
      <text x="${ctx.w / 2}" y="${ctx.h - 135}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, `${ctx.w / 2}`)}
      </text>`,

  left_negative_space: (ctx) => `
      <!-- Left-aligned negative space text for Asymmetrical Layout -->
      <text x="60" y="${ctx.h - 145}" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, '60')}
      </text>`,

  translucent_left_panel: (ctx) => `
      <!-- Text inside the blurred brand side-panel -->
      <text x="${ctx.w * 0.25}" y="${ctx.h / 2 - 40}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, `${ctx.w * 0.25}`)}
      </text>`,

  poster_high_contrast: (ctx) => `
      <!-- High contrast text placed directly on the borderless photo -->
      <text x="${ctx.w / 2}" y="${ctx.h - 150}" class="overlay-text text-centered" style="fill: ${ctx.posterTextColor}; font-size: ${ctx.dynamicFontSize}px; letter-spacing: 5px;">
        ${tspans(ctx, `${ctx.w / 2}`)}
      </text>`,

  duotone_high_contrast: (ctx) => `
      <!-- High contrast centred text over the duotone-treated photo -->
      <text x="${ctx.w / 2}" y="${ctx.h - 150}" class="overlay-text text-centered" style="fill: ${ctx.dynamicTextColor}; font-size: ${ctx.dynamicFontSize}px; letter-spacing: 4px;">
        ${tspans(ctx, `${ctx.w / 2}`)}
      </text>`,

  quote_centered_middle: (ctx) => `
      <!-- Large centred quote-style text, no photo underneath -->
      <text x="${ctx.w / 2}" y="${ctx.h / 2}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize + 10}px; fill: ${ctx.dynamicTextColor};">
        ${ctx.escapedLines.map((line, idx) => `<tspan x="${ctx.w / 2}" dy="${idx === 0 ? 0 : ctx.dyOffset + 14}">${line}</tspan>`).join('')}
      </text>`,

  rotated_note_card: (ctx) => `
      <!-- Rotated paper note card sitting over the full-bleed photo -->
      <g transform="rotate(-4 ${ctx.w - 260} ${ctx.h - 210})">
        <rect x="${ctx.w - 460}" y="${ctx.h - 300}" width="400" height="180" rx="6" fill="${ctx.validSecondaryColor}" fill-opacity="0.97" stroke="${ctx.validBrandColor}" stroke-width="2" />
        <text x="${ctx.w - 260}" y="${ctx.h - 210}" class="overlay-text text-centered" style="font-style: italic; font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.validBrandColor};">
          ${tspans(ctx, `${ctx.w - 260}`)}
        </text>
      </g>`,

  giant_word_plus_caption: (ctx) => {
    const giantWord = ctx.escapeXml((ctx.lines[0] || ctx.overlayText).split(/\s+/)[0]!.toUpperCase().slice(0, 12));
    const giantFontSize = giantWord.length > 8 ? 90 : giantWord.length > 5 ? 130 : 180;
    return `
      <!-- Oversized single-word graphic type statement behind the caption -->
      <text x="${ctx.w / 2}" y="${Math.round(ctx.h * 0.42)}" text-anchor="middle" font-family="'${ctx.brandFont}', Georgia, serif" font-weight="bold" font-size="${giantFontSize}px" fill="${ctx.validBrandColor}" fill-opacity="0.92">${giantWord}</text>
      <text x="${ctx.w / 2}" y="${ctx.h - 150}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, `${ctx.w / 2}`)}
      </text>`;
  },

  stacked_headline_tag: (ctx) => {
    const posterFontSize = ctx.dynamicFontSize + 34;
    return `
      <!-- Bold stacked headline top-aligned, vertical brand tag along the right edge -->
      <text x="${ctx.w / 2}" y="${Math.round(ctx.h * 0.16)}" text-anchor="middle" font-family="'${ctx.brandFont}', system-ui, sans-serif" font-weight="bold" font-size="${posterFontSize}px" fill="${ctx.posterTextColor}" letter-spacing="1px">
        ${ctx.escapedLines.map((line, idx) => `<tspan x="${ctx.w / 2}" dy="${idx === 0 ? 0 : posterFontSize * 1.05}">${line}</tspan>`).join('')}
      </text>
      <text x="${ctx.w - 30}" y="${ctx.h / 2}" text-anchor="middle" font-family="'${ctx.brandFont}', system-ui, sans-serif" font-weight="bold" font-size="22px" fill="${ctx.validBrandColor}" fill-opacity="0.85" letter-spacing="6px" transform="rotate(90 ${ctx.w - 30} ${ctx.h / 2})">${ctx.escapedSpacedName}</text>`;
  },

  speech_bubble: (ctx) => {
    const bubbleW = Math.min(ctx.w - 120, 100 + ctx.maxLength * (ctx.dynamicFontSize * 0.6));
    const bubbleX = (ctx.w - bubbleW) / 2;
    const bubbleH = 70 + ctx.lines.length * ctx.dyOffset;
    const bubbleY = ctx.h - 260 - bubbleH;
    return `
      <!-- Rounded speech-bubble caption card -->
      <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="26" fill="${ctx.validSecondaryColor}" fill-opacity="0.96" />
      <path d="M ${ctx.w / 2 - 16} ${bubbleY + bubbleH} L ${ctx.w / 2} ${bubbleY + bubbleH + 22} L ${ctx.w / 2 + 16} ${bubbleY + bubbleH} Z" fill="${ctx.validSecondaryColor}" fill-opacity="0.96" />
      <text x="${ctx.w / 2}" y="${bubbleY + 45}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.validBrandColor};">
        ${tspans(ctx, `${ctx.w / 2}`)}
      </text>`;
  },

  testimonial_avatar_card: (ctx) => {
    const avatarR = 70;
    const avatarCx = 140;
    const avatarCy = 170;
    const cardY = avatarCy + avatarR + 40;
    return `
      <!-- Circular avatar crop of the same photo + name + quote card -->
      <defs><clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" /></clipPath></defs>
      <image href="${ctx.photoDataUri}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />
      <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="4" />
      <text x="${avatarCx + avatarR + 20}" y="${avatarCy - 5}" font-family="'${ctx.brandFont}', system-ui, sans-serif" font-weight="bold" font-size="24px" fill="${ctx.posterTextColor}">${ctx.escapedSpacedName}</text>
      <text x="${avatarCx + avatarR + 20}" y="${avatarCy + 26}" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="15px" fill="${ctx.posterTextColor}" fill-opacity="0.85" letter-spacing="2px">VERIFIED CLIENT</text>
      <rect x="60" y="${cardY}" width="${ctx.w - 120}" height="${70 + ctx.lines.length * ctx.dyOffset}" rx="18" fill="${ctx.validSecondaryColor}" fill-opacity="0.9" />
      <text x="90" y="${cardY + 42}" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, '90')}
      </text>`;
  },

  side_panel_label: (ctx) => `
      <!-- Label + headline block sitting in the solid side panel -->
      <text x="50" y="${Math.round(ctx.h * 0.42)}" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="13px" letter-spacing="3px" fill="${ctx.validBrandColor}" fill-opacity="0.8">${ctx.escapedSpacedName}</text>
      <text x="50" y="${Math.round(ctx.h * 0.42) + 40}" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize + 4}px; fill: ${ctx.dynamicTextColor};">
        ${tspans(ctx, '50')}
      </text>`,

  // ── Premium Calendar / Wax-Stamp Date Tile ──────────────────────────────
  editorial_date_stamp: (ctx) => {
    const now = new Date();
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const month = monthNames[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const year = String(now.getFullYear());
    const cx = Math.round(ctx.w / 2);
    const cy = Math.round(ctx.h / 2);
    const r = Math.round(Math.min(ctx.w, ctx.h) * 0.28);
    return `
      <!-- Outer double-ring vintage wax seal -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="3" />
      <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-dasharray="6 4" />
      <!-- Decorative cross lines inside the seal -->
      <line x1="${cx - r + 30}" y1="${cy}" x2="${cx - r + 60}" y2="${cy}" stroke="${ctx.validBrandColor}" stroke-width="1.5" />
      <line x1="${cx + r - 60}" y1="${cy}" x2="${cx + r - 30}" y2="${cy}" stroke="${ctx.validBrandColor}" stroke-width="1.5" />
      <!-- Month arc text along the top of the seal -->
      <text x="${cx}" y="${cy - r + 50}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="16px" letter-spacing="6px" fill="${ctx.validBrandColor}" fill-opacity="0.7">${month}</text>
      <!-- Day: Large centered number -->
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-family="'${ctx.brandFont}', Georgia, serif" font-weight="bold" font-size="92px" fill="${ctx.dynamicTextColor}">${day}</text>
      <!-- Year below the day -->
      <text x="${cx}" y="${cy + 68}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="20px" letter-spacing="8px" fill="${ctx.validBrandColor}" fill-opacity="0.8">${year}</text>
      <!-- Brand name at bottom of seal -->
      <text x="${cx}" y="${cy + r - 28}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="11px" letter-spacing="5px" fill="${ctx.validBrandColor}" fill-opacity="0.6">${ctx.escapedSpacedName}</text>`;
  },

  // ── Premium Certificate Signature Card ──────────────────────────────────
  technician_signature_card: (ctx) => {
    const cx = Math.round(ctx.w / 2);
    const cy = Math.round(ctx.h / 2);
    const cardW = Math.round(ctx.w * 0.72);
    const cardH = Math.round(ctx.h * 0.52);
    const cardX = Math.round((ctx.w - cardW) / 2);
    const cardY = Math.round((ctx.h - cardH) / 2);
    // Generate a smooth, flowing SVG signature path from the brand name
    const nameChars = ctx.escapedSpacedName.replace(/\s+/g, '').slice(0, 10);
    const sigStartX = cardX + Math.round(cardW * 0.18);
    const sigY = cardY + Math.round(cardH * 0.62);
    const sigWidth = Math.round(cardW * 0.64);
    // Create a believable signature curve using cubic beziers
    const cp1x = sigStartX + Math.round(sigWidth * 0.2);
    const cp1y = sigY - 35;
    const cp2x = sigStartX + Math.round(sigWidth * 0.5);
    const cp2y = sigY + 25;
    const endX = sigStartX + sigWidth;
    const endY = sigY - 8;
    return `
      <!-- Outer certificate double-border frame -->
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="4" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2.5" />
      <rect x="${cardX + 10}" y="${cardY + 10}" width="${cardW - 20}" height="${cardH - 20}" rx="2" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.8" />
      <!-- Certificate header: brand tagline -->
      <text x="${cx}" y="${cardY + 55}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="11px" letter-spacing="5px" fill="${ctx.validBrandColor}" fill-opacity="0.7">CERTIFICATE OF CARE</text>
      <!-- Brand name as a large editorial wordmark -->
      <text x="${cx}" y="${cardY + Math.round(cardH * 0.38)}" text-anchor="middle" font-family="'${ctx.brandFont}', Georgia, serif" font-weight="bold" font-size="38px" fill="${ctx.dynamicTextColor}" letter-spacing="2px">${ctx.escapedSpacedName}</text>
      <!-- Thin horizontal divider line -->
      <line x1="${cardX + 60}" y1="${cardY + Math.round(cardH * 0.46)}" x2="${cardX + cardW - 60}" y2="${cardY + Math.round(cardH * 0.46)}" stroke="${ctx.validBrandColor}" stroke-width="1" stroke-opacity="0.5" />
      <!-- Hand-drawn flowing script signature path -->
      <path d="M ${sigStartX} ${sigY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" stroke-linecap="round" />
      <!-- Small flourish dot at the end -->
      <circle cx="${endX + 6}" cy="${endY}" r="3" fill="${ctx.validBrandColor}" />
      <!-- Footer: "Est. YEAR" -->
      <text x="${cx}" y="${cardY + cardH - 28}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-size="12px" letter-spacing="4px" fill="${ctx.validBrandColor}" fill-opacity="0.6">EST. ${new Date().getFullYear()}</text>`;
  },

  // ── Randomized Always-On Text Overlays ──────────────────────────────────
  randomized_overlay: (ctx) => {
    // Generate a deterministic random index based on the text length and image size so it's stable per render
    const seed = ctx.overlayText.length + ctx.w + ctx.h;
    const styleIndex = seed % 6;
    
    switch (styleIndex) {
      case 0: {
        // Giant transparent word
        const giantWord = ctx.escapeXml((ctx.lines[0] || ctx.overlayText).split(/\s+/)[0]!.toUpperCase().slice(0, 12));
        return `
          <text x="${ctx.w / 2}" y="${ctx.h / 2 + 50}" text-anchor="middle" font-family="'${ctx.brandFont}', Georgia, serif" font-weight="bold" font-size="160px" fill="${ctx.validBrandColor}" fill-opacity="0.15">${giantWord}</text>
          <text x="${ctx.w / 2}" y="${ctx.h - 150}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
            ${tspans(ctx, `${ctx.w / 2}`)}
          </text>`;
      }
      case 1: {
        // Bottom-left caption
        return `
          <text x="80" y="${ctx.h - 160}" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor}; fill-opacity: 0.85;">
            ${tspans(ctx, '80')}
          </text>`;
      }
      case 2: {
        // Vertical side text (right edge) + top left caption
        return `
          <text x="${ctx.w - 40}" y="${ctx.h / 2}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-weight="bold" font-size="18px" fill="${ctx.validBrandColor}" fill-opacity="0.6" letter-spacing="4px" transform="rotate(90 ${ctx.w - 40} ${ctx.h / 2})">${ctx.escapedSpacedName}</text>
          <text x="60" y="120" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor}; fill-opacity: 0.9;">
            ${tspans(ctx, '60')}
          </text>`;
      }
      case 3: {
        // Top overlay banner
        return `
          <rect x="0" y="0" width="${ctx.w}" height="${120 + ctx.lines.length * ctx.dyOffset}" fill="${ctx.validSecondaryColor}" fill-opacity="0.8" />
          <text x="${ctx.w / 2}" y="90" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.validBrandColor};">
            ${tspans(ctx, `${ctx.w / 2}`)}
          </text>`;
      }
      case 4: {
        // Diagonal watermark text
        return `
          <text x="${ctx.w / 2}" y="${ctx.h / 2}" text-anchor="middle" transform="rotate(-30 ${ctx.w / 2} ${ctx.h / 2})" font-family="'${ctx.brandFont}', Georgia, serif" font-weight="bold" font-size="80px" fill="${ctx.validBrandColor}" fill-opacity="0.25">
            ${ctx.escapeXml(ctx.overlayText.substring(0, 20))}
          </text>
          <text x="${ctx.w / 2}" y="${ctx.h - 130}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
            ${tspans(ctx, `${ctx.w / 2}`)}
          </text>`;
      }
      case 5:
      default: {
        // Center bold statement
        return `
          <rect x="50" y="${ctx.h / 2 - 60}" width="${ctx.w - 100}" height="${80 + ctx.lines.length * ctx.dyOffset}" rx="8" fill="${ctx.validBrandColor}" fill-opacity="0.9" />
          <text x="${ctx.w / 2}" y="${ctx.h / 2}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.validSecondaryColor};">
            ${tspans(ctx, `${ctx.w / 2}`)}
          </text>`;
      }
    }
  },

  editorial_magazine_cover: (ctx) => {
    const giantWord = ctx.escapeXml((ctx.lines[0] || ctx.overlayText).split(/\\s+/)[0]!.toUpperCase().slice(0, 15));
    return `
      <!-- Giant text at top covering the full width -->
      <text x="${ctx.w / 2}" y="${Math.round(ctx.h * 0.15)}" text-anchor="middle" font-family="'${ctx.brandFont}', system-ui, serif" font-weight="normal" font-size="140px" fill="${ctx.dynamicTextColor}" fill-opacity="0.95" letter-spacing="12px">${giantWord}</text>
      <text x="${ctx.w / 2}" y="${ctx.h - 100}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
        ${ctx.escapedLines.map((line, idx) => `<tspan x="${ctx.w / 2}" dy="${idx === 0 ? 0 : ctx.dyOffset}">${line}</tspan>`).join('')}
      </text>`;
  },

  minimalist_corner_text: (ctx) => {
    return `
      <!-- Extremely tiny text pinned to top-left and bottom-right -->
      <text x="50" y="60" class="overlay-text text-left" style="font-size: 18px; fill: ${ctx.dynamicTextColor}; letter-spacing: 4px; font-weight: bold;">
        ${ctx.escapedSpacedName}
      </text>
      <text x="${ctx.w - 50}" y="${ctx.h - 50}" class="overlay-text text-right" style="font-size: 20px; fill: ${ctx.dynamicTextColor}; letter-spacing: 2px;">
        ${ctx.escapedLines.map((line: string, idx: number) => `<tspan x="${ctx.w - 50}" dy="${idx === 0 ? 0 : 25}">${line}</tspan>`).join('')}
      </text>`;
  },

  universal_dynamic_text: (ctx) => {
    // Under the Tripartite architecture, text rendering is handled in a single Scene Graph loop 
    // inside universal_dynamic_deco to guarantee strict zIndex ordering. 
    // This phase returns empty so we don't render duplicate text.
    return '';
  },
};

// ── Decorations (Step 3 structural overlays) ────────────────────────────────

export type DecoCtx = {
  layoutType: string;
  w: number;
  h: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
  innerW: number;
  innerH: number;
  validBrandColor: string;
  validSecondaryColor: string;
  validBackgroundColor: string;
  validAccentColor: string;
  brandFont: string;
  rawName: string;
  photoDataUri: string;
  escapedLines: string[];
  dyOffset: number;
  dynamicFontSize: number;
  dynamicTextColor: string;
  overlayText: string;
  maxLength: number;
  faceCoordinates?: any;
};

export const DECORATIONS: Record<string, (ctx: DecoCtx) => string> = {
  brand_scrim_heavy: (ctx) => `
      <!-- Heavy brand-colored scrim to make backgrounds semi-transparent behind hero elements -->
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.55" />`,

  dark_scrim_overlay: (ctx) => `
      <!-- Deep luxury dark scrim overlay -->
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.32" />`,

  monogram_watermark: (ctx) => `
      <!-- Large single-character monogram watermark in negative space -->
      <text x="${ctx.w * 0.82}" y="${ctx.h * 0.76}" fill="${ctx.validSecondaryColor}" fill-opacity="0.07" font-family="'${ctx.brandFont}', Georgia, serif" font-size="300px" font-weight="bold" text-anchor="middle">
        ${ctx.rawName.charAt(0)}
      </text>`,

  translucent_pane: (ctx) => `
      <!-- Semi-transparent solid brand pane overlay -->
      <rect x="0" y="0" width="${ctx.w * 0.5}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.82" />`,

  ticket_notches_dashed: (ctx) => {
    const notchY1 = ctx.paddingTop;
    const notchY2 = ctx.h - ctx.paddingBottom;
    const notchCount = 10;
    const notchSpacing = ctx.innerW / notchCount;
    let notches = '';
    for (let i = 0; i <= notchCount; i++) {
      const cx = ctx.paddingX + i * notchSpacing;
      notches += `<circle cx="${cx}" cy="${notchY1}" r="9" fill="${ctx.validBrandColor}" /><circle cx="${cx}" cy="${notchY2}" r="9" fill="${ctx.validBrandColor}" />`;
    }
    return `
      <!-- Vintage ticket-stub notches + dashed border around the photo inset -->
      <rect x="${ctx.paddingX}" y="${ctx.paddingTop}" width="${ctx.innerW}" height="${ctx.innerH}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="3" stroke-dasharray="14 10" />
      ${notches}`;
  },

  gallery_hairline: (ctx) => `
      <!-- Museum mat: thin inner hairline rule around the photo -->
      <rect x="${ctx.paddingX + 14}" y="${ctx.paddingTop + 14}" width="${ctx.innerW - 28}" height="${ctx.innerH - 28}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" />`,

  film_sprockets: (ctx) => {
    const holeCount = 8;
    const holeSpacing = ctx.innerH / holeCount;
    let holes = '';
    for (let i = 0; i <= holeCount; i++) {
      const cy = ctx.paddingTop + i * holeSpacing;
      holes += `<rect x="${Math.round(ctx.paddingX * 0.3)}" y="${cy - 10}" width="16" height="20" rx="3" fill="${ctx.validBrandColor}" /><rect x="${ctx.w - Math.round(ctx.paddingX * 0.3) - 16}" y="${cy - 10}" width="16" height="20" rx="3" fill="${ctx.validBrandColor}" />`;
    }
    return `<!-- Film sprocket perforations along both edges -->${holes}`;
  },

  masking_tape_corners: (ctx) => `
      <!-- Masking tape overlays at top-left and bottom-right corners — tinted with the brand's background colour, not a fixed kraft/beige -->
      <polygon points="20,80 100,50 110,80 30,110" fill="${ctx.validBackgroundColor}" fill-opacity="0.8" transform="rotate(-15 65 80)" />
      <polygon points="${ctx.w - 100},${ctx.h - 80} ${ctx.w - 20},${ctx.h - 50} ${ctx.w - 30},${ctx.h - 20} ${ctx.w - 110},${ctx.h - 50}" fill="${ctx.validBackgroundColor}" fill-opacity="0.8" transform="rotate(15 ${ctx.w - 65} ${ctx.h - 50})" />`,

  gold_foil_accents: (ctx) => `
      <!-- Thin foil-style accent lines decorating the edges — colour comes from the brand's accent colour, not a fixed gold -->
      <rect x="30" y="30" width="${ctx.w - 60}" height="${ctx.h - 60}" fill="none" stroke="${ctx.validAccentColor}" stroke-width="2" />
      <circle cx="30" cy="30" r="4" fill="${ctx.validAccentColor}" />
      <circle cx="${ctx.w - 30}" cy="30" r="4" fill="${ctx.validAccentColor}" />
      <circle cx="30" cy="${ctx.h - 30}" r="4" fill="${ctx.validAccentColor}" />
      <circle cx="${ctx.w - 30}" cy="${ctx.h - 30}" r="4" fill="${ctx.validAccentColor}" />`,

  arch_outline: (ctx) => `
      <!-- Fine vector outline retracing the dome mask edge -->
      <path d="M ${ctx.paddingX} ${ctx.h - ctx.paddingBottom} L ${ctx.paddingX} ${Math.round(ctx.paddingTop + ctx.innerH * 0.42)} A ${Math.round(ctx.innerW / 2)} ${Math.round(ctx.innerH * 0.42)} 0 0 1 ${ctx.w - ctx.paddingX} ${Math.round(ctx.paddingTop + ctx.innerH * 0.42)} L ${ctx.w - ctx.paddingX} ${ctx.h - ctx.paddingBottom} Z" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" />`,

  side_photo_embed: (ctx) => {
    const sidePanelW = Math.round(ctx.w * 0.38);
    return `
      <!-- Photo embedded into its own panel, clean vertical divider against the solid side panel -->
      <defs><clipPath id="sidePhotoClip"><rect x="${sidePanelW}" y="0" width="${ctx.w - sidePanelW}" height="${ctx.h}" /></clipPath></defs>
      <image href="${ctx.photoDataUri}" x="${sidePanelW}" y="0" width="${ctx.w - sidePanelW}" height="${ctx.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#sidePhotoClip)" />
      <rect x="${sidePanelW - 2}" y="0" width="4" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.5" />`;
  },

  universal_dynamic_deco: (ctx) => {
    const dsl = (compiledLayouts as any)[ctx.layoutType] as ICompiledLayoutDSL;
    if (!dsl || !dsl.layers) return '';

    let svg = '';
    
    // Sort all text and decoration layers by zIndex
    const overlayLayers = dsl.layers.filter(l => l.type === 'decoration' || l.type === 'text');
    overlayLayers.sort((a, b) => a.zIndex - b.zIndex);

    // Iteratively render each layer using the Component Registry
    for (const layer of overlayLayers) {
      if (layer.type === 'decoration') {
        const componentName = (layer as IDSLDecorationLayer).component;
        if (!componentName) continue;
        
        const decoFn = ComponentRegistry[componentName];
        if (decoFn) {
          svg += decoFn(ctx, layer as IDSLDecorationLayer);
        } else {
          // Strict Validation: Unknown components fail loudly
          console.error(`[Renderer Sprint] CRITICAL ERROR: Component '${componentName}' requested by DSL but not found in ComponentRegistry!`);
          // Render a visible placeholder block so developers see the missing component immediately
          svg += `
            <g transform="translate(40, ${Math.floor(Math.random() * (ctx.h - 100))})">
              <rect width="300" height="40" fill="red" opacity="0.8" />
              <text x="10" y="25" fill="white" font-weight="bold" font-family="sans-serif">MISSING COMPONENT: ${componentName}</text>
            </g>
          `;
        }
      } else if (layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;
        
        // If the text layer defines a background component (e.g. editorial_sidebar, metric_panel), render it FIRST
        if (textLayer.component) {
          const decoFn = ComponentRegistry[textLayer.component];
          if (decoFn) {
            svg += decoFn(ctx, layer as any);
          } else {
            console.error(`[Renderer Sprint] CRITICAL ERROR: Text Component '${textLayer.component}' not found in ComponentRegistry!`);
          }
        }
        
        // Then render the text on top
        svg += renderTextLayer(ctx, textLayer);
      }
    }

    return svg;
  },
};
