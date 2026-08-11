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
import compiledLayouts from './compiled-layouts.v2.json';
import { processPortraitFit } from '../services/ai-image-generation.service';
import { ICompiledLayoutDSL, IDSLSceneLayer, IDSLImageLayer, IDSLDecorationLayer, IDSLTextLayer, ISemanticDesignSpec } from '../services/template-engine/interfaces';
import { IDesignLanguage } from '../services/template-engine/engines/art-direction-engine';
import { LayoutEngine, LayoutFamily, NegativeSpace, BoundingBox, LayoutConstraints } from '../services/template-engine/engines/layout-engine';
import { PrimitiveEngine, PrimitiveContext } from '../services/template-engine/engines/primitive-engine';
import { TypographyEngine, TypographyContext } from '../services/template-engine/engines/typography-engine';
import { ThemeEngine } from '../services/template-engine/engines/theme-engine';
import { DesignCompiler } from '../services/template-engine/engines/design-compiler';
import { VisualResourceEngine } from './visual-resource-library';
import { ArtDirectionEngine } from '../services/template-engine/engines/art-direction-engine';

const primitiveEngine = new PrimitiveEngine();
const typographyEngine = new TypographyEngine();
const artDirectionEngine = new ArtDirectionEngine();

function getLuminanceSafe(hex: string): number {
  try {
    const cleaned = hex.replace('#', '');
    const rgb = parseInt(cleaned.length === 3
      ? cleaned.split('').map(c => c + c).join('')
      : cleaned, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  } catch {
    return 128;
  }
}

export const COMPILED_LAYOUTS: Record<string, ICompiledLayoutDSL> = { ...compiledLayouts } as any;

import { ColorCompositionEngine, ColorPalette } from '../services/template-engine/engines/color-composition-engine';
const colorEngine = new ColorCompositionEngine();

export function registerDynamicLayout(layout: ICompiledLayoutDSL) {
  COMPILED_LAYOUTS[layout.id] = layout;
}
const themeEngine = new ThemeEngine();
import { CompositionOptimizer } from '../services/template-engine/engines/composition-optimizer';
const designCompiler = new DesignCompiler();
const optimizer = new CompositionOptimizer();
const visualEngine = new VisualResourceEngine();
import { DesignLanguageResolver } from '../services/template-engine/engines/design-language-resolver';
const designLanguageResolver = new DesignLanguageResolver();
import { CompositionQualityController } from '../services/template-engine/engines/composition-quality-controller';
const compositionQC = new CompositionQualityController();


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

export function resolveLayoutTemplate(layoutType: string, visualRanking?: string[]): LayoutTemplate {
  const item = LAYOUT_TEMPLATES[layoutType];

  const resolved: LayoutTemplate = {
    base: item?.base || 'universal_dynamic_base',
    textTemplate: item?.textTemplate || 'universal_dynamic_text',
    decoration: item?.decoration || 'universal_dynamic_deco',
    showWatermark: item?.showWatermark ?? true,
    showFooter: item?.showFooter ?? true
  };

  // Style Mapping: an undecorated layout gets a decoration matching the
  // brand's top-ranked visual style, instead of always rendering plain.
  if (resolved.decoration === null) {
    const themeDeco = themeEngine.resolveStyleDecoration(visualRanking);
    if (themeDeco) {
      return { ...resolved, decoration: themeDeco };
    }
  }

  return resolved;
}


// Text Layer Rendering is now handled by TypographyEngine


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
  designSpec?: ISemanticDesignSpec;
  designLanguage?: IDesignLanguage;
  faceCoordinates?: { eyesYPercent: number; mouthYPercent: number; };
  faceBox?: any;
  subjectBox?: any;
  additionalSubjects?: any[];
  optimizedDsl?: any;
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

// Genuine two-photo compositing — a real before-photo and a real after-photo
// stitched together (not a single-photo crop). Shared by the legacy
// split_before_after treatment and the DSL/primitive-system before_after
// family (universal_dynamic_base), so there's one implementation of the
// actual Sharp stitching logic. Falls back to a single-photo bordered
// treatment when no before-photo is available for this appointment.
const stitchBeforeAfterImages = async (ctx: BaseCtx, orientation: 'vertical' | 'horizontal'): Promise<BaseResult> => {
  if (!ctx.beforePhotoUrl) return borderedDefault(ctx);
  try {
    const beforeBuffer = await ctx.downloadImageAsBuffer(ctx.beforePhotoUrl);
    let composites: sharp.OverlayOptions[];
    if (orientation === 'horizontal') {
      const topHalf = await processPortraitFit(beforeBuffer, ctx.innerW, Math.round(ctx.innerH / 2), ctx.validBackgroundColor);
      const bottomHalf = await processPortraitFit(ctx.imageBuffer, ctx.innerW, Math.round(ctx.innerH / 2), ctx.validBackgroundColor);
      composites = [
        { input: topHalf, top: 0, left: 0 },
        { input: bottomHalf, top: Math.round(ctx.innerH / 2), left: 0 },
      ];
    } else {
      const leftHalf = await processPortraitFit(beforeBuffer, Math.round(ctx.innerW / 2), ctx.innerH, ctx.validBackgroundColor);
      const rightHalf = await processPortraitFit(ctx.imageBuffer, Math.round(ctx.innerW / 2), ctx.innerH, ctx.validBackgroundColor);
      composites = [
        { input: leftHalf, top: 0, left: 0 },
        { input: rightHalf, top: 0, left: Math.round(ctx.innerW / 2) },
      ];
    }
    const baseImageBuffer = await sharp({
      create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: '#000000' },
    }).composite(composites).png().toBuffer();
    return { baseImage: sharp(baseImageBuffer), compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
  } catch (err) {
    console.error('[Before/After Stitch Error] Failed to stitch before/after images, falling back:', err);
    return borderedDefault(ctx);
  }
};

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

  split_before_after: async (ctx) => stitchBeforeAfterImages(ctx, 'vertical'),

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
    let dsl = ctx.optimizedDsl || COMPILED_LAYOUTS[ctx.layoutType];

    if (dsl && dsl.layers) {
      const isEditorial = ctx.layoutType.includes('editorial');
      const imageLayer = dsl.layers.find((l: any) => l.type === 'image') as IDSLImageLayer;

      if (imageLayer) {
        if (imageLayer.layoutMode === 'triptych' || ctx.designSpec?.photo?.imageExecution === 'triptych') {
          // CANVA-STYLE TRIPTYCH AS SVG MASK: Splits the photo into 3 distinct vertical panels over the brand background
          const panelW = Math.floor(ctx.w * 0.28);
          const gap = Math.floor(ctx.w * 0.04);
          const startX = Math.floor((ctx.w - (panelW * 3 + gap * 2)) / 2);
          const panelH = Math.floor(ctx.h * 0.75);
          const startY = Math.floor((ctx.h - panelH) / 2);

          const triptychSvg = `
            <svg width="${ctx.w}" height="${ctx.h}" xmlns="http://www.w3.org/2000/svg">
              <rect x="${startX}" y="${startY}" width="${panelW}" height="${panelH}" fill="#fff"/>
              <rect x="${startX + panelW + gap}" y="${startY}" width="${panelW}" height="${panelH}" fill="#fff"/>
              <rect x="${startX + (panelW + gap) * 2}" y="${startY}" width="${panelW}" height="${panelH}" fill="#fff"/>
            </svg>`;

          const fullPhoto = await processPortraitFit(ctx.imageBuffer, ctx.w, ctx.h, ctx.validBackgroundColor);
          const maskedPhoto = await sharp(fullPhoto).composite([{ input: Buffer.from(triptychSvg), blend: 'dest-in' }]).png().toBuffer();

          const baseImageBuffer = await sharp({
            create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validBackgroundColor },
          }).composite([{ input: maskedPhoto, top: 0, left: 0 }]).png().toBuffer();

          return {
            baseImage: sharp(baseImageBuffer),
            compositeTop: dsl.canvasRegions ? dsl.canvasRegions.textRegion.y : startY,
            compositeBottom: 0,
            compositeLeft: dsl.canvasRegions ? dsl.canvasRegions.textRegion.x : startX,
            compositeRight: ctx.w - (dsl.canvasRegions ? dsl.canvasRegions.textRegion.x + dsl.canvasRegions.textRegion.width : ctx.w)
          };
        }

        // AI ART DIRECTION UPGRADE: Region-Based Extraction
        if (dsl.canvasRegions && (!imageLayer.mask || imageLayer.mask === 'rectangle' || imageLayer.mask === 'split')) {
          const region = dsl.canvasRegions.imageRegion;

          if (region.width < ctx.w) {
            // Asymmetrical Bleed or Split (Photo does not occupy 100% of canvas width)
            const splitPhoto = await processPortraitFit(ctx.imageBuffer, region.width, region.height, ctx.validBackgroundColor);

            const baseImageBuffer = await sharp({
              create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validBackgroundColor },
            }).composite([{ input: splitPhoto, top: region.y, left: region.x }]).png().toBuffer();

            return {
              baseImage: sharp(baseImageBuffer),
              compositeTop: dsl.canvasRegions.textRegion.y,
              compositeBottom: 0,
              compositeLeft: dsl.canvasRegions.textRegion.x,
              compositeRight: ctx.w - (dsl.canvasRegions.textRegion.x + dsl.canvasRegions.textRegion.width)
            };
          }
        }

        if (imageLayer.mask === 'before_after_split') {
          // Genuine two-photo compositing for the before_after DSL family —
          // real before-photo + real after-photo stitched together, not a
          // single-photo crop. Falls back to a single-photo treatment inside
          // stitchBeforeAfterImages() when no before-photo is available.
          return stitchBeforeAfterImages(ctx, imageLayer.orientation === 'horizontal' ? 'horizontal' : 'vertical');
        } else if (imageLayer.mask === 'circle') {
          const size = Math.floor(Math.min(ctx.w, ctx.h) * 0.6); // 60% of canvas width
          const paddingPx = Math.floor(ctx.w * (imageLayer.paddingPercent || 15) / 100);

          let cx = ctx.w / 2;
          let cy = ctx.h / 2;

          if (imageLayer.anchor) {
            if (imageLayer.anchor.includes('right')) cx = ctx.w - paddingPx - (size / 2);
            if (imageLayer.anchor.includes('left')) cx = paddingPx + (size / 2);
            if (imageLayer.anchor.includes('top')) cy = paddingPx + (size / 2);
            if (imageLayer.anchor.includes('bottom')) cy = ctx.h - paddingPx - (size / 2);
          }

          const leftOffset = Math.floor(cx - (size / 2));
          const topOffset = Math.floor(cy - (size / 2));

          const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`;
          const splitPhoto = await processPortraitFit(ctx.imageBuffer, size, size, ctx.validBackgroundColor);
          const roundedPhoto = await sharp(splitPhoto).composite([{ input: Buffer.from(circleSvg), blend: 'dest-in' }]).png().toBuffer();

          const baseImageBuffer = await sharp({
            create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor },
          }).composite([{ input: roundedPhoto, top: topOffset, left: leftOffset }]).png().toBuffer();

          const isRight = imageLayer.anchor?.includes('right');
          const isLeft = imageLayer.anchor?.includes('left');
          const compLeft = isRight ? ctx.paddingX : (isLeft ? leftOffset + size + ctx.paddingX : ctx.paddingX);
          const compRight = isLeft ? ctx.paddingX : (isRight ? ctx.w - leftOffset + ctx.paddingX : ctx.paddingX);

          return { baseImage: sharp(baseImageBuffer), compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: compLeft, compositeRight: compRight };
        } else {
          let targetW: number;
          let targetH: number;
          let top: number;
          let left: number;

          // Device mockup screen viewport mapping
          if (imageLayer.component === 'desktop_monitor_mockup') {
            targetW = 460;
            targetH = 276;
            top = Math.round(ctx.h * 0.28) + 10;
            const isRight = imageLayer.anchor && imageLayer.anchor.includes('right');
            left = isRight ? (ctx.w - 480 - 40 + 10) : (40 + 10);
          } else if (imageLayer.component === 'tablet_device_mockup') {
            targetW = 352;
            targetH = 492;
            top = Math.round(ctx.h * 0.25) + 14;
            left = Math.round(ctx.w / 2 - 190) + 14;
          } else {
            // Outer margin calculation: paddingPercent represents outer margin (e.g. 5% to 12%)
            const rawPadding = Math.min(imageLayer.paddingPercent || 0, 15); // Cap outer margin to max 15%
            const marginX = Math.round(ctx.w * (rawPadding / 100));
            const marginY = Math.round(ctx.h * (rawPadding / 100));

            targetW = ctx.w - (marginX * 2);
            targetH = ctx.h - (marginY * 2);

            // Anchor Positioning Math (All 9 Anchors)
            const anchor = imageLayer.anchor || 'center';
            if (anchor === 'top_left') {
              top = marginY; left = marginX;
            } else if (anchor === 'top_right') {
              top = marginY; left = ctx.w - targetW - marginX;
            } else if (anchor === 'top_center') {
              top = marginY; left = Math.round((ctx.w - targetW) / 2);
            } else if (anchor === 'bottom_left') {
              top = ctx.h - targetH - marginY; left = marginX;
            } else if (anchor === 'bottom_right') {
              top = ctx.h - targetH - marginY; left = ctx.w - targetW - marginX;
            } else if (anchor === 'bottom_center') {
              top = ctx.h - targetH - marginY; left = Math.round((ctx.w - targetW) / 2);
            } else if (anchor === 'center_left') {
              top = Math.round((ctx.h - targetH) / 2); left = marginX;
            } else if (anchor === 'center_right') {
              top = Math.round((ctx.h - targetH) / 2); left = ctx.w - targetW - marginX;
            } else {
              // Exact center
              top = Math.round((ctx.h - targetH) / 2);
              left = Math.round((ctx.w - targetW) / 2);
            }
          }

          const scaledPhoto = await processPortraitFit(ctx.imageBuffer, targetW, targetH, ctx.validBackgroundColor);

          const backgroundCanvas = sharp({
            create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validBackgroundColor },
          });

          const baseImageBuffer = await backgroundCanvas.composite([{ input: scaledPhoto, top, left }]).png().toBuffer();
          const baseImage = sharp(baseImageBuffer);

          // Canva-Level Polish: Dynamically adjust text boundaries to dodge the photo
          let cTop = ctx.paddingTop;
          let cBottom = ctx.paddingBottom;
          let cLeft = ctx.paddingX;
          let cRight = ctx.paddingX;

          const safeAnchor = imageLayer.anchor || 'center';

          if (safeAnchor === 'top_center' || safeAnchor === 'top_left' || safeAnchor === 'top_right') {
            cTop = top + targetH + 40;
          } else if (safeAnchor === 'bottom_center' || safeAnchor === 'bottom_left' || safeAnchor === 'bottom_right') {
            cBottom = ctx.h - top + 40;
          } else if (safeAnchor === 'center_left') {
            cLeft = left + targetW + 40;
          } else if (safeAnchor === 'center_right') {
            cRight = ctx.w - left + 40;
          }

          return { baseImage, compositeTop: cTop, compositeBottom: cBottom, compositeLeft: cLeft, compositeRight: cRight };
        }
      }
    }

    // Fallback: If no image layer exists (e.g. text-only layout), return a textured procedural canvas
    const gradientSvg = `
      <svg width="${ctx.w}" height="${ctx.h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="bgGrad" cx="50%" cy="0%" r="100%">
            <stop offset="0%" stop-color="${ctx.validSecondaryColor}" stop-opacity="0.3" />
            <stop offset="100%" stop-color="${ctx.validBackgroundColor}" stop-opacity="0" />
          </radialGradient>
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.15 0" />
          </filter>
        </defs>
        <rect width="${ctx.w}" height="${ctx.h}" fill="url(#bgGrad)" />
        <rect width="${ctx.w}" height="${ctx.h}" filter="url(#noise)" opacity="0.6" style="mix-blend-mode: overlay;" />
        <!-- Giant Typography as Art watermark -->
        <text x="50%" y="60%" font-family="sans-serif" font-weight="900" font-size="${ctx.w * 0.4}px" fill="${ctx.validSecondaryColor}" fill-opacity="0.05" text-anchor="middle" letter-spacing="-0.05em">
          ${((ctx as any).rawName || 'Brand').substring(0, 3).toUpperCase()}
        </text>
      </svg>
    `;

    const solidCanvas = sharp({
      create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validBackgroundColor },
    }).composite([{ input: Buffer.from(gradientSvg), top: 0, left: 0 }]);

    return { baseImage: solidCanvas, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
  },

  polaroid_stack: async (ctx) => {
    const minDim = Math.floor(Math.min(ctx.w, ctx.h) * 0.85);
    const photo = await processPortraitFit(ctx.imageBuffer, minDim, minDim, ctx.validBackgroundColor);
    const frameW = minDim + 60;
    const frameH = minDim + 160;
    const polaroidFrame = await sharp({ create: { width: frameW, height: frameH, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const baseImage = sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor } })
      .composite([
        { input: polaroidFrame, top: Math.floor((ctx.h - frameH) / 2), left: Math.floor((ctx.w - frameW) / 2) },
        { input: photo, top: Math.floor((ctx.h - frameH) / 2) + 30, left: Math.floor((ctx.w - frameW) / 2) + 30 }
      ]);
    return { baseImage, compositeTop: Math.floor((ctx.h - frameH) / 2) + minDim + 50, compositeBottom: ctx.paddingBottom, compositeLeft: Math.floor((ctx.w - frameW) / 2) + 40, compositeRight: Math.floor((ctx.w - frameW) / 2) + 40 };
  },

  circle_crop: async (ctx) => {
    const minDim = Math.floor(Math.min(ctx.w, ctx.h) * 0.75);
    const photo = await processPortraitFit(ctx.imageBuffer, minDim, minDim, ctx.validBackgroundColor);
    const circleSvg = Buffer.from(`<svg width="${minDim}" height="${minDim}"><circle cx="${minDim / 2}" cy="${minDim / 2}" r="${minDim / 2}" fill="white"/></svg>`);
    const masked = await sharp(photo).composite([{ input: circleSvg, blend: 'dest-in' }]).png().toBuffer();
    const baseImage = sharp({ create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor } })
      .composite([{ input: masked, top: Math.floor((ctx.h - minDim) / 2), left: Math.floor((ctx.w - minDim) / 2) }]);
    return { baseImage, compositeTop: Math.floor((ctx.h - minDim) / 2) + minDim + 40, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
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
  structuredText?: { headline?: string; subheadline?: string; cta?: string; };
};

function splitTextIntoLines(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

const tspans = (ctx: TextCtx, x: string, dyFirst = 0) => {
  // Canva-level Typographic Hierarchy Injection
  if (ctx.structuredText && (ctx.structuredText.headline || ctx.structuredText.subheadline)) {
    let svg = '';
    const headline = ctx.structuredText.headline ? ctx.escapeXml(ctx.structuredText.headline.toUpperCase()) : '';
    const subheadline = ctx.structuredText.subheadline ? ctx.escapeXml(ctx.structuredText.subheadline) : '';
    let currentDy = dyFirst;

    // Headline (Massive, Bold)
    if (headline) {
      const hLines = splitTextIntoLines(headline, 22);
      const hSize = ctx.dynamicFontSize;
      svg += `<tspan x="${x}" dy="${currentDy}" font-weight="800" font-family="'${ctx.brandFont}', sans-serif" font-size="${hSize}px" letter-spacing="2px">${hLines[0]}</tspan>`;
      for (let i = 1; i < hLines.length; i++) {
        svg += `<tspan x="${x}" dy="${Math.round(hSize * 1.2)}">${hLines[i]}</tspan>`;
      }
      currentDy = Math.round(hSize * 1.5); // Push subheadline down
    }

    // Subheadline (Smaller, Lighter, Italic)
    if (subheadline) {
      const sLines = splitTextIntoLines(subheadline, 40);
      const sSize = Math.round(ctx.dynamicFontSize * 0.55);
      const fontStyle = "italic";
      const fontWeight = "300";
      svg += `<tspan x="${x}" dy="${currentDy}" font-weight="${fontWeight}" font-style="${fontStyle}" font-size="${sSize}px" font-family="'Georgia', serif" letter-spacing="1px">${sLines[0]}</tspan>`;
      for (let i = 1; i < sLines.length; i++) {
        svg += `<tspan x="${x}" dy="${Math.round(sSize * 1.4)}">${sLines[i]}</tspan>`;
      }
    }
    return svg;
  }

  // Fallback to legacy lines
  return ctx.escapedLines.map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? dyFirst : ctx.dyOffset}">${line}</tspan>`).join('');
};

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
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
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
  validDepthColor: string;
  brandFont: string;
  rawName: string;
  photoDataUri: string;
  escapedLines: string[];
  dyOffset: number;
  dynamicFontSize: number;
  dynamicTextColor: string;
  overlayText: string;
  maxLength: number;
  visionResult?: any;
  faceCoordinates?: any;
  injectedFeatures?: string[];
  designTokens?: any;
  designRecipe?: any;
  designSpec?: ISemanticDesignSpec;
  designLanguage?: IDesignLanguage;
  structuredText?: { headline?: string; subheadline?: string; cta?: string; };
  typographyMetrics?: any;
  faceBox?: any;
  subjectBox?: any;
  additionalSubjects?: any[];
  optimizedDsl?: any;
  activeTheme?: string;
  visualRanking?: string[];
  capitalizationRule?: string;
};

export const DECORATIONS: Record<string, (ctx: DecoCtx) => string> = {
  brand_scrim_heavy: (ctx) => `
      <!-- Heavy brand-colored scrim to make backgrounds semi-transparent behind hero elements -->
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.55" />`,

  dark_scrim_overlay: (ctx) => `
      <!-- Deep luxury dark scrim overlay. Toned down from 0.32 -> 0.15: at
           0.32 it read as a heavy gray/black cover on warm/light-toned
           photos rather than a subtle mood shift (see primitive-engine.ts's
           'dark_scrim', kept in sync with this one). -->
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.15" />`,

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
      <defs><clipPath id="sidePhotoClip"><rect x="${ctx.w - sidePanelW}" y="0" width="${sidePanelW}" height="${ctx.h}" /></clipPath></defs>
      <image href="${ctx.photoDataUri}" x="${ctx.w - sidePanelW}" y="0" width="${sidePanelW}" height="${ctx.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#sidePhotoClip)" />
      <rect x="${ctx.w - sidePanelW - 2}" y="0" width="4" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="0.5" />`;
  },

  universal_dynamic_deco: (ctx) => {
    let dsl = ctx.optimizedDsl || COMPILED_LAYOUTS[ctx.layoutType];

    if (!dsl || !dsl.layers) return '';

    let svg = themeEngine.generateGlobalDefs(ctx.validBrandColor, ctx.validSecondaryColor);

    // === DSL VALIDATION: Template Signature Contract ===
    const contract = (dsl as any).contract;
    if (contract && Array.isArray(contract.required)) {
      for (const req of contract.required) {
        const hasPrimitive = dsl.layers.some((l: any) => ('component' in l && l.component === req)) ||
          (ctx.injectedFeatures || []).includes(req);
        if (!hasPrimitive) {
          console.warn(`[Renderer] Template '${dsl.id}' is missing required primitive: '${req}'.`);
        }
      }
    }

    // Check if we need to apply a global overlay (like noise) based on brand DNA
    let overlayLayers = dsl.layers.filter((l: any) => l.type === 'decoration' || l.type === 'text' || (l.type === 'image' && l.component));

    // Generate the Visual Recipe instead of relying on rigid family names
    let visualRecipe;
    let family: LayoutFamily = 'minimal';

    if (ctx.designLanguage && ctx.designLanguage.intent) {
      visualRecipe = artDirectionEngine.generateVisualRecipe(ctx.designLanguage.intent, ctx.activeTheme || 'editorial_beauty');
      family = (ctx.designLanguage.intent.family as LayoutFamily) || 'minimal';
    } else {
      // Defensive fallback only — every call site in ai-image-generation.service.ts now
      // threads designLanguage into decoCtx, so this branch shouldn't fire in practice.
      // Still passes designSpec (if present) so a grounded Design Intent is used instead
      // of guessing from the id string, should some other caller reach this path.
      const fallbackIntent = artDirectionEngine.generateDesignIntent(ctx.layoutType || 'minimal', undefined, undefined, ctx.designSpec);
      visualRecipe = artDirectionEngine.generateVisualRecipe(fallbackIntent, ctx.activeTheme || 'editorial_beauty');
      family = (fallbackIntent.family as LayoutFamily) || 'minimal';
    }

    // PHASE 3A: Thematic Mood Injection
    // Inject textures/overlays dynamically via the VisualRecipe (TextureRecipe).
    // decorations.density gates this additive overlay (never the family's own
    // structural decoration layers, which are untouched design DNA) — 'none'/'low'
    // keeps the design clean, 'medium'/'high' allows the mood texture through. This
    // is the first real, generic effect decorations.density has ever had; previously
    // it was parsed by the LLM prompt but read nowhere downstream.
    const decorationDensity = ctx.designSpec?.decorations?.density;
    const moodDecorations = (decorationDensity === 'none' || decorationDensity === 'low')
      ? []
      : themeEngine.getMoodDecorations(visualRecipe.texture);
    overlayLayers = [...overlayLayers, ...moodDecorations];

    overlayLayers.sort((a: any, b: any) => a.zIndex - b.zIndex);



    // Initialize LayoutEngine to calculate constraints for PrimitiveCtx

    // Construct an estimated face BoundingBox from the vision result's Y coordinates
    // (Already extracted above for the optimizer)

    const layoutEngine = new LayoutEngine(
      ctx.w,
      ctx.h,
      ctx.faceBox,
      ctx.subjectBox,
      ctx.additionalSubjects || [],
    );
    const isTensionEnabled = family === 'editorial';
    const behaviorProfile = (dsl as any)?.behavior;
    const constraints = layoutEngine.calculateConstraints(family, 'balanced', isTensionEnabled, behaviorProfile);

    // BrandDNA palette: background is canvas-locked; primary/secondary/accent/depth
    // may rotate for visual variety — never use background as text ink.
    const basePalette: ColorPalette = {
      brandColor: ctx.validBrandColor,
      secondaryColor: ctx.validSecondaryColor,
      backgroundColor: ctx.validBackgroundColor,
      accentColor: ctx.validAccentColor || ctx.validBrandColor,
      depthColor: ctx.validDepthColor || ctx.validBrandColor,
      textColor: ctx.validDepthColor || ctx.dynamicTextColor,
    };
    const rotationIndex = compositionQC.hashRotationIndex(
      `${ctx.layoutType || ''}_${ctx.rawName || 'brand'}_${ctx.activeTheme || ''}`,
    );
    const colorPalette = compositionQC.rotateInkPalette(basePalette, rotationIndex);

    const colorHierarchy = colorEngine.resolveHierarchy(colorPalette, visualRecipe.color);

    // Ensure text inks never equal the locked background
    const bg = (ctx.validBackgroundColor || '').toUpperCase();
    if (colorHierarchy.primaryText?.toUpperCase() === bg) {
      colorHierarchy.primaryText = colorEngine.resolveTextInk(
        colorHierarchy.cardSurface || colorHierarchy.primaryBackground,
        colorPalette,
        'primary',
      );
    }
    if (colorHierarchy.secondaryText?.toUpperCase() === bg) {
      colorHierarchy.secondaryText = colorEngine.resolveTextInk(
        colorHierarchy.cardSurface || colorHierarchy.primaryBackground,
        colorPalette,
        'secondary',
      );
    }

    // Resolve typography recipe from family + BrandDNA visual ranking / casing
    const brandStyle = Array.isArray(ctx.visualRanking) && ctx.visualRanking[0]
      ? String(ctx.visualRanking[0])
      : String(ctx.activeTheme || 'balanced');
    const designRecipe = designLanguageResolver.generateRecipe(
      ctx.layoutType || dsl.id || 'layout',
      String(family),
      brandStyle,
    );
    if (ctx.capitalizationRule) {
      const rule = String(ctx.capitalizationRule).toLowerCase();
      if (rule === 'uppercase' || rule === 'force_uppercase') {
        designRecipe.typography.casing = 'force_uppercase';
      } else if (rule === 'lowercase' || rule === 'force_lowercase') {
        designRecipe.typography.casing = 'force_lowercase';
      } else if (rule === 'natural' || rule === 'sentence') {
        designRecipe.typography.casing = 'natural';
      }
    }

    const primitiveCtx: PrimitiveContext = {
      w: ctx.w,
      h: ctx.h,
      validBrandColor: ctx.validBrandColor,
      validSecondaryColor: ctx.validSecondaryColor,
      validBackgroundColor: ctx.validBackgroundColor,
      constraints,
      behavior: behaviorProfile,
      layoutState: { occupiedRegions: [], family, renderedStrings: [] },
      colorHierarchy,
      recipe: visualRecipe.primitive
    };

    const layoutState = primitiveCtx.layoutState!;
    // Do not seed a fake full-frame hero-image occupied region — that lied about free space
    // for any fallback path without allocatedBox.

    // Text-band readability scrim: when type sits in a dedicated band over the photo
    const textBand = (dsl as any)?.canvasRegions?.textRegion;
    const priority = ctx.designLanguage?.intent?.visualPriority || ctx.designSpec?.composition?.visualPriority;
    if (textBand && (priority === 'image_hero' || priority === 'cta_hero' || priority === 'composition_hero')) {
      const pad = 16;
      const scrimOpacity = priority === 'cta_hero' ? 0.55 : 0.42;
      const scrimFill = (ctx.validDepthColor && getLuminanceSafe(ctx.validDepthColor) < 140)
        ? ctx.validDepthColor
        : '#0A0A0A';
      svg += `<rect x="${Math.max(0, textBand.x - pad)}" y="${Math.max(0, textBand.y - pad)}" width="${textBand.width + pad * 2}" height="${textBand.height + pad * 2}" fill="${scrimFill}" fill-opacity="${scrimOpacity}" rx="12" />`;
    }

    // Iteratively render each layer using the Primitive Engine
    for (const layer of overlayLayers) {
      if (layer.type === 'decoration') {
        const componentName = (layer as IDSLDecorationLayer).component;
        if (!componentName) continue;

        const renderedPrimitive = primitiveEngine.renderPrimitive(componentName, primitiveCtx, layer as IDSLDecorationLayer);
        if (renderedPrimitive) {
          console.log(`[Renderer Sprint] SUCCESS: Applied primitive decoration '${componentName}' to layout.`);
          svg += renderedPrimitive;
        } else {
          // Strict Validation: Unknown components fail loudly
          console.error(`[Renderer Sprint] CRITICAL ERROR: Component '${componentName}' requested by DSL but not found in PrimitiveEngine!`);
          // Render a visible placeholder block so developers see the missing component immediately
          svg += `
            <g transform="translate(40, ${Math.floor(Math.random() * (ctx.h - 100))})">
              <rect width="300" height="40" fill="red" opacity="0.8" />
              <text x="10" y="25" fill="white" font-weight="bold" font-family="sans-serif">MISSING COMPONENT: ${componentName}</text>
            </g>
          `;
        }
      } else if (layer.type === 'image') {
        // Many layout families (like desktop_course_hero, tablet_workbook_cover) define device mockups
        // or masks (die_cut, arch) inside the 'image' layer definition. We must render these components.
        const imageLayer = layer as any;
        if (imageLayer.component) {
          const renderedPrimitive = primitiveEngine.renderPrimitive(imageLayer.component, primitiveCtx, imageLayer);
          if (renderedPrimitive) {
            console.log(`[Renderer Sprint] SUCCESS: Applied primitive image component '${imageLayer.component}' to layout.`);
            svg += renderedPrimitive;
          } else {
            console.error(`[Renderer Sprint] CRITICAL ERROR: Image Component '${imageLayer.component}' not found in PrimitiveEngine!`);
          }
        }
      } else if (layer.type === 'text') {
        const textLayer = layer as IDSLTextLayer;

        // If the text layer defines a background component (e.g. editorial_sidebar, metric_panel), render it FIRST
        if (textLayer.component) {
          // 'solid_card', 'pill_label', 'inset_card' are text-container components: their
          // background rect is rendered by the TypographyEngine as part of the text pass,
          // so PrimitiveEngine intentionally returns '' for them. Treat empty return as success.
          const TEXT_CONTAINER_COMPONENTS = ['solid_card', 'pill_label', 'inset_card'];
          const isDelegatedContainer = TEXT_CONTAINER_COMPONENTS.includes(textLayer.component);

          const renderedPrimitive = primitiveEngine.renderPrimitive(textLayer.component, primitiveCtx, textLayer);
          if (renderedPrimitive) {
            svg += renderedPrimitive;
          } else if (!isDelegatedContainer) {
            console.error(`[Renderer Sprint] CRITICAL ERROR: Text Component '${textLayer.component}' not found in PrimitiveEngine!`);
          }
        }


        // CONDITIONAL SCRIM REMOVED IN SPRINT 3.
        // We now rely on high-contrast Structural Containers (Cards/Pills) instead of muddy full-bleed gradients.

        // Then render the text on top
        const typoCtx: TypographyContext = {
          ...ctx,
          constraints,
          layoutEngine,
          layoutState,
          colorHierarchy,
          designTokens: ctx.designTokens,
          typographyMetrics: ctx.typographyMetrics,
          typographyTokens: designRecipe.typography,
          designSpec: ctx.designSpec,
          designLanguage: ctx.designLanguage,
          visualPriority: ctx.designLanguage?.intent?.visualPriority || ctx.designSpec?.composition?.visualPriority,
          escapeXml: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
        };
        svg += typographyEngine.renderTextLayer(typoCtx, textLayer);
      } else if (layer.type === 'text_group') {
        const textGroupLayer = layer as import('../services/template-engine/interfaces').IDSLTextGroupLayer;
        const typoCtx: import('../services/template-engine/engines/typography-engine').TypographyContext = {
          ...ctx,
          constraints,
          layoutEngine,
          layoutState,
          colorHierarchy,
          designTokens: ctx.designTokens,
          typographyMetrics: ctx.typographyMetrics,
          typographyTokens: designRecipe.typography,
          designSpec: ctx.designSpec,
          designLanguage: ctx.designLanguage,
          visualPriority: ctx.designLanguage?.intent?.visualPriority || ctx.designSpec?.composition?.visualPriority,
          escapeXml: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
        };
        svg += typographyEngine.renderTextGroupLayer(typoCtx, textGroupLayer);
      }
    }

    // Global theme overlay removed to prevent librsvg feTurbulence canvas blanketing
    return svg;
  },
};
