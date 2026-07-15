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
import { processPortraitFit } from '../services/ai-image-generation.service';

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

export function resolveLayoutTemplate(layoutType: string): LayoutTemplate {
  // If it's a hardcoded legacy layout, use it natively
  if (LAYOUT_TEMPLATES[layoutType]) {
    return LAYOUT_TEMPLATES[layoutType]!;
  }
  
  // Otherwise, route to the Universal Dynamic Renderer engines
  return {
    base: 'universal_dynamic_base',
    textTemplate: 'universal_dynamic_text',
    decoration: 'universal_dynamic_deco',
    showWatermark: true,
    showFooter: true
  };
}

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
    // Read the semantic metadata of the AI-selected template
    const metadata = (templateLibraryData as any)[ctx.layoutType] || {};
    const category = metadata.category || '';
    const concept = (metadata.concept || '').toLowerCase();
    const isSplit = concept.includes('split') || category.includes('Split');
    const isCircle = concept.includes('circle') || concept.includes('round');
    const isComposition = category.includes('Composition') || concept.includes('mask') || concept.includes('arch') || concept.includes('shape');

    if (isSplit) {
      // Dynamic Split Screen MVP
      const halfW = Math.floor(ctx.w / 2);
      const splitPhoto = await processPortraitFit(ctx.imageBuffer, halfW, ctx.h, ctx.validBackgroundColor);
      const baseImage = sharp({
        create: { width: ctx.w, height: ctx.h, channels: 3, background: ctx.validSecondaryColor },
      }).composite([
        { input: splitPhoto, top: 0, left: 0 }
      ]);
      return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: halfW + ctx.paddingX, compositeRight: ctx.paddingX };
    } else if (isCircle) {
      // Dynamic Circle Mask MVP
      try {
        const minDim = Math.min(ctx.innerW, ctx.innerH);
        const r = minDim / 2;
        const cx = ctx.innerW / 2;
        const cy = ctx.innerH / 2;
        const circlePhoto = await processPortraitFit(ctx.imageBuffer, ctx.innerW, ctx.innerH, ctx.validBackgroundColor);
        const circleMask = Buffer.from(
          `<svg width="${ctx.innerW}" height="${ctx.innerH}">
             <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" />
           </svg>`
        );
        const maskedImage = await sharp(circlePhoto)
          .composite([{ input: circleMask, blend: 'dest-in' }])
          .png()
          .toBuffer();

        const baseImage = sharp({
          create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: ctx.validSecondaryColor },
        }).composite([{ input: maskedImage, top: 0, left: 0 }]);
        return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
      } catch (err) {
        return fullBleedBase(ctx);
      }
    } else if (isComposition) {
      // Dynamic Masking Logic MVP (Arch)
      try {
        const archPhoto = await processPortraitFit(ctx.imageBuffer, ctx.innerW, ctx.innerH, ctx.validBackgroundColor);
        const archMask = Buffer.from(
          `<svg width="${ctx.innerW}" height="${ctx.innerH}">
             <path d="M0 ${ctx.innerW / 2} A ${ctx.innerW / 2} ${ctx.innerW / 2} 0 0 1 ${ctx.innerW} ${ctx.innerW / 2} V ${ctx.innerH} H 0 Z" fill="white" />
           </svg>`
        );
        const maskedImage = await sharp(archPhoto)
          .composite([{ input: archMask, blend: 'dest-in' }])
          .png()
          .toBuffer();

        const baseImage = sharp({
          create: { width: ctx.innerW, height: ctx.innerH, channels: 3, background: ctx.validSecondaryColor },
        }).composite([{ input: maskedImage, top: 0, left: 0 }]);
        return { baseImage, compositeTop: ctx.paddingTop, compositeBottom: ctx.paddingBottom, compositeLeft: ctx.paddingX, compositeRight: ctx.paddingX };
      } catch (err) {
        return fullBleedBase(ctx);
      }
    } else {
      // Fallback: standard full bleed image (untinted)
      const base = await fullBleedBase(ctx);
      // Removed the brandColor tinting to preserve true Before/After treatment colors
      return base;
    }
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
};

const tspans = (ctx: TextCtx, x: string, dyFirst = 0) =>
  ctx.escapedLines.map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? dyFirst : ctx.dyOffset}">${line}</tspan>`).join('');

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
        ${ctx.escapedLines.map((line, idx) => `<tspan x="${ctx.w - 50}" dy="${idx === 0 ? 0 : 25}">${line}</tspan>`).join('')}
      </text>`;
  },

  universal_dynamic_text: (ctx) => {
    const metadata = (templateLibraryData as any)[ctx.layoutType] || {};
    const textRegions = (metadata.visual_structure?.text_regions || '').toLowerCase();
    const concept = (metadata.concept || '').toLowerCase();
    const isScattered = textRegions.includes('scattered') || concept.includes('cloud') || concept.includes('floating');

    const isSide = textRegions.includes('side') || textRegions.includes('vertical');
    const isBottomLeft = textRegions.includes('bottom') || textRegions.includes('corner');

    if (isScattered) {
      // Dynamic Scattered Word Cloud MVP
      let svg = '';
      const words = ctx.overlayText.split(/\s+/);
      let currentY = 150;
      words.forEach((word, index) => {
        // Scatter x between 20% and 80% of width
        const x = (ctx.w * 0.2) + (Math.random() * (ctx.w * 0.6));
        svg += `
          <text x="${x}" y="${currentY}" text-anchor="middle" class="overlay-text" style="font-size: ${ctx.dynamicFontSize + (Math.random() * 20)}px; fill: ${ctx.dynamicTextColor}; font-weight: ${index % 2 === 0 ? 'bold' : 'normal'};">
            ${ctx.escapeXml(word)}
          </text>`;
        currentY += ctx.dyOffset + 20;
      });
      return svg;
    } else if (isSide) {
      // Dynamic Side Rotated MVP
      return `
        <!-- Dynamic Side Rotated Text Block -->
        <text x="${ctx.w - 40}" y="${ctx.h / 2}" text-anchor="middle" font-family="'${ctx.bodyFont}', system-ui, sans-serif" font-weight="bold" font-size="18px" fill="${ctx.dynamicTextColor}" fill-opacity="0.8" letter-spacing="4px" transform="rotate(90 ${ctx.w - 40} ${ctx.h / 2})">${ctx.escapedSpacedName}</text>
        <text x="60" y="120" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor};">
          ${tspans(ctx, '60')}
        </text>`;
    } else if (isBottomLeft) {
      return `
        <!-- Dynamic Bottom Left Poster Block -->
        <text x="40" y="${ctx.h - (ctx.lines.length * ctx.dyOffset) - 60}" class="overlay-text text-left" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor}; font-weight: bold;">
          ${tspans(ctx, '40')}
        </text>`;
    } else {
      // Sleek Centered Editorial MVP
      return `
        <!-- Dynamic Centered Editorial Block -->
        <text x="${ctx.w / 2}" y="${ctx.h / 2 - (ctx.lines.length * ctx.dyOffset) / 2}" class="overlay-text text-centered" style="font-size: ${ctx.dynamicFontSize}px; fill: ${ctx.dynamicTextColor}; letter-spacing: 2px;">
          ${tspans(ctx, `${ctx.w / 2}`)}
        </text>`;
    }
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
  brandFont: string;
  rawName: string;
  photoDataUri: string;
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
      <!-- Masking tape overlays at top-left and bottom-right corners -->
      <polygon points="20,80 100,50 110,80 30,110" fill="#E8E5DF" fill-opacity="0.8" transform="rotate(-15 65 80)" />
      <polygon points="${ctx.w - 100},${ctx.h - 80} ${ctx.w - 20},${ctx.h - 50} ${ctx.w - 30},${ctx.h - 20} ${ctx.w - 110},${ctx.h - 50}" fill="#E8E5DF" fill-opacity="0.8" transform="rotate(15 ${ctx.w - 65} ${ctx.h - 50})" />`,

  gold_foil_accents: (ctx) => `
      <!-- Elegant thin gold foil lines decorating the edges -->
      <rect x="30" y="30" width="${ctx.w - 60}" height="${ctx.h - 60}" fill="none" stroke="#D4AF37" stroke-width="2" />
      <circle cx="30" cy="30" r="4" fill="#D4AF37" />
      <circle cx="${ctx.w - 30}" cy="30" r="4" fill="#D4AF37" />
      <circle cx="30" cy="${ctx.h - 30}" r="4" fill="#D4AF37" />
      <circle cx="${ctx.w - 30}" cy="${ctx.h - 30}" r="4" fill="#D4AF37" />`,

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
    const metadata = (templateLibraryData as any)[ctx.layoutType] || {};
    const deco = (metadata.visual_structure?.decorative_elements || '').toLowerCase();
    const isFrame = deco.includes('frame') || deco.includes('border') || deco.includes('mat');

    const isFilm = deco.includes('film') || deco.includes('sprocket');
    const isTicket = deco.includes('ticket') || deco.includes('notch');

    if (isFilm) {
      // Dynamic Film Sprockets MVP
      const holeCount = 8;
      const holeSpacing = ctx.innerH / holeCount;
      let holes = '';
      for (let i = 0; i <= holeCount; i++) {
        const cy = ctx.paddingTop + i * holeSpacing;
        holes += `<rect x="${Math.round(ctx.paddingX * 0.3)}" y="${cy - 10}" width="16" height="20" rx="3" fill="${ctx.validBrandColor}" /><rect x="${ctx.w - Math.round(ctx.paddingX * 0.3) - 16}" y="${cy - 10}" width="16" height="20" rx="3" fill="${ctx.validBrandColor}" />`;
      }
      return `<!-- Dynamic Film Sprocket Perforations -->${holes}`;
    } else if (isTicket) {
      // Dynamic Ticket Notches MVP
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
        <!-- Dynamic Ticket Notches -->
        <rect x="${ctx.paddingX}" y="${ctx.paddingTop}" width="${ctx.innerW}" height="${ctx.innerH}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="3" stroke-dasharray="14 10" />
        ${notches}`;
    } else if (isFrame) {
      // Minimal Gallery Frame MVP
      return `
        <!-- Dynamic Minimal Gallery Frame -->
        <rect x="20" y="20" width="${ctx.w - 40}" height="${ctx.h - 40}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" stroke-opacity="0.8" />
        <rect x="35" y="35" width="${ctx.w - 70}" height="${ctx.h - 70}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.5" stroke-opacity="0.5" />`;
    } else {
      // Heavy Gradient Scrim MVP
      return `
        <!-- Dynamic Contrast Gradient Scrim -->
        <defs>
          <linearGradient id="dynamicScrim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${ctx.validBackgroundColor}" stop-opacity="0.1" />
            <stop offset="100%" stop-color="${ctx.validBackgroundColor}" stop-opacity="0.85" />
          </linearGradient>
        </defs>
        <rect x="0" y="${ctx.h * 0.4}" width="${ctx.w}" height="${ctx.h * 0.6}" fill="url(#dynamicScrim)" />`;
    }
  },
};
