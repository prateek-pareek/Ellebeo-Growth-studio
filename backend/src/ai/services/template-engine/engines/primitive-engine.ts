import { IDSLDecorationLayer, IDSLTextLayer, CanonicalGeometry } from '../interfaces';
import { LayoutConstraints, BoundingBox } from './layout-engine';

export type PrimitiveCategory = 'geometry' | 'layout' | 'effects' | 'typography' | 'illustration';

export interface PrimitiveContext {
  w: number;
  h: number;
  validBrandColor: string;
  validSecondaryColor: string;
  validBackgroundColor: string;
  validAccentColor?: string;
  constraints: any; // Using any for brevity, typically LayoutConstraints
  behavior?: any; // Semantic Design Behavior Profile
  layoutState?: import('../interfaces').ILayoutState; // Shared geometric state
  colorHierarchy?: import('./color-composition-engine').ColorHierarchy;
  recipe?: import('../interfaces').PrimitiveRecipe;
  tokens?: Partial<import('../interfaces').PrimitiveTokens>;
  canonicalGeometry?: CanonicalGeometry;
  
  // Helper methods injected at runtime
  scaleStroke?: (basePx: number) => number;
  resolveOpacity?: (baseOpacity: number) => number;
  resolveShadow?: (intent: 'soft' | 'medium' | 'deep') => string;
  isSafePlacement?: (candidateBox: BoundingBox) => boolean;
}

export type PrimitiveRenderer = (ctx: PrimitiveContext, layer?: IDSLDecorationLayer | IDSLTextLayer) => string;

export class PrimitiveEngine {
  public registry: Record<string, { category: PrimitiveCategory, render: PrimitiveRenderer }> = {};

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    // ==========================================
    // GEOMETRY PRIMITIVES
    // ==========================================
    this.registry['measurement_lines'] = {
      category: 'geometry',
      render: (ctx) => `
        <!-- Architectural Measurement Lines -->
        <g opacity="${ctx.resolveOpacity!(0.3)}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" stroke-dasharray="4 4">
          <line x1="${ctx.constraints.safeX}" y1="0" x2="${ctx.constraints.safeX}" y2="${ctx.h}" />
          <line x1="${ctx.w - ctx.constraints.safeX}" y1="0" x2="${ctx.w - ctx.constraints.safeX}" y2="${ctx.h}" />
          <line x1="0" y1="${ctx.constraints.safeY}" x2="${ctx.w}" y2="${ctx.constraints.safeY}" />
          <line x1="0" y1="${ctx.h - ctx.constraints.safeY}" x2="${ctx.w}" y2="${ctx.h - ctx.constraints.safeY}" />
        </g>
        <g fill="${ctx.validBrandColor}" font-family="monospace" font-size="10" opacity="${ctx.resolveOpacity!(0.5)}">
          <text x="${ctx.constraints.safeX + 5}" y="15">X:${ctx.constraints.safeX}</text>
          <text x="15" y="${ctx.constraints.safeY + 15}" transform="rotate(-90 15, ${ctx.constraints.safeY + 15})">Y:${ctx.constraints.safeY}</text>
        </g>
      `
    };

    this.registry['blueprint_grid'] = {
      category: 'geometry',
      render: (ctx) => {


        // Create an SVG pattern for a technical grid
        return `
          <defs>
            <pattern id="blueprintGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="none" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" opacity="${ctx.resolveOpacity!(0.15)}" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#blueprintGrid)" />
        `;
      }
    };

    this.registry['split_seam_line'] = {
      category: 'geometry',
      render: (ctx, layer) => {
        const profile = ctx.recipe?.split_seam_line;
        const strokeWidth = profile?.strokeWidth ?? 4;
        const opacity = profile?.opacity ?? 1.0;

        // Use canonicalGeometry to find the exact edge of the text panel
        let isHorizontal = false;
        let splitCoord = ctx.w / 2;

        if (ctx.canonicalGeometry?.splitAxis === 'vertical') {
          isHorizontal = true;
          // Vertical split means text/image are top/bottom. Line should be horizontal.
          if (ctx.canonicalGeometry.textRegion) {
             const tr = ctx.canonicalGeometry.textRegion;
             // If text is top, line is at bottom of text region. If text is bottom, line is at top.
             splitCoord = (tr.y < ctx.h / 2) ? tr.y + tr.height + 10 : tr.y - 10;
          } else {
             splitCoord = ctx.h / 2;
          }
        } else {
          // Horizontal split means text/image are left/right. Line should be vertical.
          if (ctx.canonicalGeometry?.textRegion) {
             const tr = ctx.canonicalGeometry.textRegion;
             splitCoord = (tr.x < ctx.w / 2) ? tr.x + tr.width + 10 : tr.x - 10;
          } else if (ctx.layoutState && ctx.layoutState.occupiedRegions) {
            const img = ctx.layoutState.occupiedRegions.find(r => r.role === 'image' && r.id !== 'hero-image');
            if (img) splitCoord = (img.x < ctx.w / 2) ? img.x + img.width : img.x;
          }
        }

        if (isHorizontal) {
           return `<line x1="0" y1="${splitCoord}" x2="${ctx.w}" y2="${splitCoord}" stroke="${ctx.validBrandColor}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
        }
        return `<line x1="${splitCoord}" y1="0" x2="${splitCoord}" y2="${ctx.h}" stroke="${ctx.validBrandColor}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      }
    };

    this.registry['rounded_corners'] = {
      category: 'geometry',
      render: (ctx) => {
        const radius = ctx.behavior?.borderRadius || 24;
        const inset = 16;
        return `
          <rect x="${inset}" y="${inset}" width="${ctx.w - (inset * 2)}" height="${ctx.h - (inset * 2)}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" rx="${radius}" opacity="${ctx.resolveOpacity!(0.4)}" />
        `;
      }
    };

    this.registry['handmade_mark'] = {
      category: 'effects',
      render: (ctx, layer) => {
        const color = ctx.colorHierarchy ? ctx.colorHierarchy.accent : ctx.validBrandColor;
        return `
        <!-- Abstract Handmade Mark (Brush Stroke) -->
        <path d="M${ctx.w * 0.8},${ctx.h * 0.15} Q${ctx.w * 0.85},${ctx.h * 0.12} ${ctx.w * 0.9},${ctx.h * 0.16} T${ctx.w * 0.95},${ctx.h * 0.14}" fill="none" stroke="${color}" stroke-width="${ctx.scaleStroke!(4)}" stroke-linecap="round" opacity="${ctx.resolveOpacity!(0.6)}" />
      `;
      }
    };

    this.registry['museum_border'] = {
      category: 'geometry',
      render: (ctx) => `
        <rect x="${ctx.constraints.safeX - 20}" y="${ctx.constraints.safeY - 20}" width="${ctx.w - (ctx.constraints.safeX - 20) * 2}" height="${ctx.h - (ctx.constraints.safeY - 20) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.4)}" />
        <rect x="${ctx.constraints.safeX - 26}" y="${ctx.constraints.safeY - 26}" width="${ctx.w - (ctx.constraints.safeX - 26) * 2}" height="${ctx.h - (ctx.constraints.safeY - 26) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" opacity="${ctx.resolveOpacity!(0.8)}" />
      `
    };

    this.registry['thin_divider'] = {
      category: 'geometry',
      render: (ctx) => `
        <line x1="${ctx.w / 2 - 80}" y1="${ctx.h / 2 + 120}" x2="${ctx.w / 2 + 80}" y2="${ctx.h / 2 + 120}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.4)}" />
      `
    };

    // Migrated divider with behavior wiring
    this.registry['divider'] = {
      category: 'geometry',
      render: (ctx) => {
        const weight = ctx.behavior?.dividerStrokeWeight || 2;
        const padding = ctx.behavior?.dividerPadding || 60;
        
        let cx = ctx.w / 2;
        let cy = ctx.h / 2 + 100;
        
        // Follow the text flow center if available
        if (ctx.canonicalGeometry?.textRegion) {
            const tr = ctx.canonicalGeometry.textRegion;
            cx = tr.x + (tr.width / 2);
        }

        return `
          <line x1="${cx - padding}" y1="${cy}" x2="${cx + padding}" y2="${cy}" stroke="${ctx.validBrandColor}" stroke-width="${weight}" opacity="${ctx.resolveOpacity!(0.5)}" />
          <circle cx="${cx}" cy="${cy}" r="${weight * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${weight}" />
        `;
      }
    };

    this.registry['editorial_badge'] = {
      category: 'geometry',
      render: (ctx, layer) => {
        // Place badge near top-right corner if possible, overlapping slightly
        const attachX = layer && layer.anchor === 'top_right' ? ctx.w - 180 : ctx.w - 140;
        const attachY = 120;
        return `
        <!-- Circular Editorial Badge / Sticker -->
        <g transform="translate(${attachX}, ${attachY})">
          <circle cx="0" cy="0" r="55" fill="${ctx.validSecondaryColor}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" stroke-dasharray="2 4" />
          <path id="badge-curve" d="M -40,0 A 40,40 0 1,1 40,0 A 40,40 0 1,1 -40,0" fill="none" />
          <!-- SVG <textPath> can be added in typography-engine, but we draw a small icon or text here -->
          <circle cx="0" cy="0" r="40" fill="${ctx.validSecondaryColor}" fill-opacity="${ctx.resolveOpacity!(0.95)}" />
          <text x="0" y="5" font-family="serif" font-style="italic" font-size="14" fill="${ctx.validBrandColor}" text-anchor="middle">NEW</text>
        </g>
        `;
      }
    };

    // ==========================================
    // LAYOUT PRIMITIVES (Background Panels)
    // ==========================================
    this.registry['editorial_sidebar'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.constraints.safeX - 20}, 100)">
          <rect x="0" y="0" width="4" height="${ctx.h - 200}" fill="${ctx.validBrandColor}" />
        </g>
      `
    };

    this.registry['floating_panel'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- SVG Filter for Premium Glassmorphism (will be used by premium elements) -->
        <defs>
          <filter id="premium_glass" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
          <filter id="premium_shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000000" flood-opacity="${ctx.resolveOpacity!(0.15)}"/>
          </filter>
        </defs>
        <rect x="40" y="${ctx.h - 320}" width="${ctx.w - 80}" height="280" rx="16" fill="${ctx.validSecondaryColor}" fill-opacity="${ctx.resolveOpacity!(0.85)}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" filter="url(#premium_shadow)" />
      `
    };

    this.registry['editorial_title'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Minimal accent rule for editorial title (no opaque background box) -->
        <g transform="translate(${ctx.constraints.safeX}, ${ctx.h - 280})">
          <line x1="0" y1="0" x2="${ctx.w - (ctx.constraints.safeX * 2)}" y2="0" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.3)}" />
        </g>
      `
    };

    this.registry['chapter_tabs'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 80}, ${ctx.constraints.safeY})">
          <rect x="0" y="0" width="80" height="40" fill="${ctx.validBrandColor}" />
          <rect x="10" y="45" width="70" height="40" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
          <rect x="20" y="90" width="60" height="40" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.3)}" />
        </g>
      `
    };

    this.registry['metadata_label'] = {
      category: 'layout',
      render: (ctx, layer) => {
        const attachY = layer && (layer.anchor === 'top_left' || layer.anchor === 'top_right') ? 40 : ctx.h - 100;
        const attachX = layer && layer.anchor.includes('right') ? ctx.w - 200 : 40;
        return `
        <g transform="translate(${attachX}, ${attachY})">
          <rect x="0" y="0" width="160" height="30" rx="15" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.5)}" />
        </g>
        `;
      }
    };

    this.registry['corner_badge'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 180}, 40)">
          <path d="M 0 0 L 140 0 L 140 140 Z" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" />
          <polygon points="140,0 140,140 0,0" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(2)}" opacity="${ctx.resolveOpacity!(0.5)}" />
        </g>
      `
    };

    this.registry['sticker'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w / 2 - 80}, ${ctx.h - 200}) rotate(-12)">
          <circle cx="80" cy="80" r="70" fill="${ctx.validSecondaryColor}" filter="url(#premium_shadow)" />
          <circle cx="80" cy="80" r="60" fill="none" stroke="${ctx.validBrandColor}" stroke-dasharray="4 4" stroke-width="${ctx.scaleStroke!(2)}" />
        </g>
      `
    };

    this.registry['pricing_pill'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(40, 40)">
          <rect x="0" y="0" width="180" height="60" rx="30" fill="${ctx.validBrandColor}" filter="url(#premium_shadow)" />
        </g>
      `
    };

    this.registry['oversized_index'] = {
      category: 'layout',
      render: (ctx) => `
        <text x="${ctx.w / 2}" y="${ctx.h / 2 + 150}" font-family="Georgia, serif" font-size="600" font-weight="900" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.04)}" text-anchor="middle">
          01
        </text>
      `
    };

    // Migrated metric panel
    this.registry['metric_panel'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(60, ${ctx.h - 220})">
          <rect x="0" y="0" width="${ctx.w - 120}" height="140" rx="20" fill="${ctx.validSecondaryColor}" fill-opacity="${ctx.resolveOpacity!(0.85)}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" stroke-opacity="${ctx.resolveOpacity!(0.4)}" filter="drop-shadow(0 20px 40px rgba(0,0,0,0.2))" />
          <rect x="20" y="20" width="80" height="100" rx="10" fill="${ctx.validBrandColor}" fill-opacity="${ctx.resolveOpacity!(0.1)}" />
        </g>
      `
    };

    this.registry['status_chip'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w / 2 - 80}, 60)">
          <rect x="0" y="0" width="160" height="36" rx="18" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.15))" />
        </g>
      `
    };

    // ==========================================
    // EFFECTS PRIMITIVES
    // ==========================================
    this.registry['wax_seal'] = {
      category: 'effects',
      render: (ctx) => `
        <g transform="translate(${ctx.w - ctx.constraints.safeX - 40}, ${ctx.constraints.safeY})">
          <circle cx="0" cy="0" r="45" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" filter="drop-shadow(0 8px 12px rgba(0,0,0,0.3))" />
          <circle cx="0" cy="0" r="38" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.6)}" />
          <path d="M -15,-15 L 15,15 M -15,15 L 15,-15" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(2)}" opacity="${ctx.resolveOpacity!(0.8)}" />
        </g>
      `
    };

    this.registry['film_sprockets'] = {
      category: 'effects',
      render: (ctx) => `
        <g fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.6)}">
          ${Array.from({ length: 20 }).map((_, i) => `<rect x="15" y="${i * 60 + 20}" width="12" height="30" rx="2" />`).join('')}
          ${Array.from({ length: 20 }).map((_, i) => `<rect x="${ctx.w - 27}" y="${i * 60 + 20}" width="12" height="30" rx="2" />`).join('')}
        </g>
      `
    };

    // --- Phase 3C: Editorial Breather Textures ---
    this.registry['noise_texture'] = {
      category: 'effects',
      render: (ctx) => {
        const intensity = ctx.behavior?.noiseIntensity || 0.20;
        return `
        <defs>
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
          </filter>
        </defs>
        <!-- Toned down from 0.15 to 0.05 so it doesn't create fog -->
        <rect width="100%" height="100%" opacity="${ctx.resolveOpacity!(0.05)}" style="mix-blend-mode: multiply;" filter="url(#noiseFilter)" />
        `;
      }
    };

    this.registry['paper_texture'] = {
      category: 'effects',
      render: (ctx) => {
        const profile = ctx.recipe?.paper_texture;
        const opacity = profile?.opacity ?? 0.20;
        const blendMode = ctx.behavior?.colorBlendingMode || 'multiply';
        return `
        <defs>
          <filter id="paperFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" result="noise" />
            <feDiffuseLighting in="noise" lighting-color="#fff" surfaceScale="1">
              <feDistantLight azimuth="45" elevation="60" />
            </feDiffuseLighting>
          </filter>
        </defs>
        <!-- Subtlety Rule: Texture should be noticed after 3-5 seconds, not immediately -->
        <rect width="100%" height="100%" opacity="${opacity}" style="mix-blend-mode: ${blendMode};" filter="url(#paperFilter)" />
        `;
      }
    };

    this.registry['ticket_notches'] = {
      category: 'effects',
      render: (ctx) => `
        <circle cx="0" cy="${ctx.h / 2}" r="25" fill="${ctx.validBackgroundColor}" />
        <circle cx="${ctx.w}" cy="${ctx.h / 2}" r="25" fill="${ctx.validBackgroundColor}" />
      `
    };

    this.registry['paper_attachment'] = {
      category: 'effects',
      render: (ctx) => `
        <!-- Generic paper attachment (e.g., masking tape, folded corner) -->
        <g transform="translate(${ctx.w / 2 - 80}, ${ctx.constraints.safeY - 40}) rotate(-4)">
          <rect x="0" y="0" width="160" height="35" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.9)}" filter="drop-shadow(1px 2px 3px rgba(0,0,0,0.1))" />
          <path d="M 0,0 L -3,8 L 1,17 L -2,25 L 0,35" fill="${ctx.validSecondaryColor}" />
          <path d="M 160,0 L 163,8 L 159,17 L 162,25 L 160,35" fill="${ctx.validSecondaryColor}" />
        </g>
      `
    };

    // ==========================================
    // PHASE 4: EDITORIAL BEHAVIOR PRIMITIVES
    // ==========================================
    this.registry['striped_background'] = {
      category: 'effects',
      render: (ctx) => `
        <!-- Minimal, Elegant Stripes for Visual Texture -->
        <defs>
          <pattern id="premiumStripes" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.15)}" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#premiumStripes)" />
      `
    };

    this.registry['grain_overlay'] = {
      category: 'effects',
      render: (ctx) => `
        <!-- High-end film grain texture simulation -->
        <filter id="film_grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.20 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film_grain)" style="mix-blend-mode: multiply;" pointer-events="none" />
      `
    };

    this.registry['editorial_tape'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Semi-transparent masking tape holding up the image -->
        <g transform="translate(${ctx.w / 2}, ${ctx.constraints.safeY - 10}) rotate(-3)">
          <rect x="-60" y="-15" width="120" height="30" fill="#FFFFFF" opacity="${ctx.resolveOpacity!(0.85)}" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))" />
          <rect x="-60" y="-15" width="120" height="30" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.05)}" />
          <!-- Jagged edges -->
          <path d="M-60 -15 L-57 -5 L-60 5 L-58 15 M60 -15 L57 -5 L60 5 L58 15" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(2)}" fill="none" opacity="${ctx.resolveOpacity!(0.5)}" />
        </g>
      `
    };

    this.registry['asymmetric_block'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Massive block of solid color pushing tension to the edge -->
        <rect x="0" y="${ctx.h - 300}" width="${ctx.w * 0.85}" height="300" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.95)}" />
      `
    };

    // ==========================================
    // INSTAGRAM COURSE & CLINIC CANVA TEMPLATES
    // ==========================================
    this.registry['desktop_monitor_mockup'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- iMac Desktop Monitor Frame (bezel-only: screen area is transparent so client photo shows through) -->
        <g transform="translate(40, ${ctx.h * 0.28})">
          <!-- Outer monitor border ring only — fill none so the photo underneath is visible through the screen -->
          <rect x="0" y="0" width="480" height="320" rx="14" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(12)}" />
          <!-- Inner screen border accent -->
          <rect x="10" y="10" width="460" height="276" rx="4" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="${ctx.scaleStroke!(1)}" />
          <!-- Bottom chin of the monitor (below the screen) -->
          <rect x="0" y="296" width="480" height="24" rx="0" fill="${ctx.validSecondaryColor}" />
          <rect x="0" y="308" width="480" height="12" rx="0" fill="${ctx.validBrandColor}" />
          <!-- Stand -->
          <path d="M 200 320 L 280 320 L 295 375 L 185 375 Z" fill="${ctx.validSecondaryColor}" />
          <rect x="170" y="372" width="140" height="6" rx="3" fill="${ctx.validBrandColor}" />
        </g>
      `
    };

    this.registry['tablet_device_mockup'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- iPad / Tablet Device Frame (bezel-only: screen area transparent so client photo shows through) -->
        <g transform="translate(${ctx.w / 2 - 190}, ${ctx.h * 0.25})">
          <!-- Outer tablet border ring only — fill none so the photo underneath is visible -->
          <rect x="0" y="0" width="380" height="520" rx="26" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(18)}" />
          <!-- Inner screen accent border -->
          <rect x="14" y="14" width="352" height="492" rx="14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${ctx.scaleStroke!(1)}" />
          <!-- Camera dot -->
          <circle cx="190" cy="8" r="4" fill="${ctx.validSecondaryColor}" />
          <!-- Home bar -->
          <rect x="140" y="512" width="100" height="4" rx="2" fill="${ctx.validSecondaryColor}" />
        </g>
      `
    };

    this.registry['number_plate'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Minimal Number Plate for Fashion Lookbook -->
        <g transform="translate(40, 40)">
          <rect x="0" y="0" width="100" height="30" fill="${ctx.validBrandColor}" />
          <text x="10" y="20" font-family="monospace" font-size="12" fill="${ctx.validSecondaryColor}" font-weight="bold">LOOK 01</text>
        </g>
      `
    };

    this.registry['glass_card'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(60, ${ctx.h - 260})">
          <rect x="0" y="0" width="${ctx.w - 120}" height="200" rx="24" fill="${ctx.validSecondaryColor}" fill-opacity="${ctx.resolveOpacity!(0.8)}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" style="backdrop-filter: blur(10px);" filter="drop-shadow(0 20px 40px rgba(0,0,0,0.15))" />
        </g>
      `
    };

    this.registry['organic_blob'] = {
      category: 'effects',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 150}, ${ctx.h - 150}) scale(1.5)">
          <path d="M45.7,-76.1C58.9,-69.3,69.1,-55.4,75.4,-40.4C81.7,-25.4,84.1,-9.3,81.1,5.6C78.1,20.5,69.7,34.2,59.3,45.4C48.9,56.6,36.5,65.3,22.4,70.9C8.3,76.5,-7.5,79,-22.1,75.2C-36.7,71.4,-50.1,61.3,-60.7,49.2C-71.3,37.1,-79.1,23,-81.4,8.1C-83.7,-6.8,-80.5,-22.5,-72.7,-35.3C-64.9,-48.1,-52.5,-58,-39.3,-64.5C-26.1,-71,-13,-74.1,1.4,-76.3C15.8,-78.5,31.6,-79.8,45.7,-76.1Z" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.85)}" />
        </g>
      `
    };

    this.registry['swipe_button_arrow'] = {
      category: 'geometry',
      render: (ctx) => `
        <!-- Circular SWIPE -> Button -->
        <g transform="translate(${ctx.w - 180}, ${ctx.h - 95})">
          <text x="0" y="22" font-family="sans-serif" font-size="11" font-weight="600" letter-spacing="3px" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.75)}">SWIPE</text>
          <circle cx="75" cy="16" r="22" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" />
          <path d="M 67 16 L 83 16 M 77 10 L 83 16 L 77 22" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      `
    };

    this.registry['floating_frame'] = {
      category: 'layout',
      render: (ctx) => {
        const anchorPoint = ctx.layoutState?.occupiedRegions?.find(r => r.role === 'heading') || { x: ctx.w / 2 - 150, y: ctx.h / 2 - 100, width: 300, height: 200 };
        const circleRadius = Math.max(anchorPoint.width, anchorPoint.height) * 0.7;
        const color = ctx.colorHierarchy ? ctx.colorHierarchy.accent : ctx.validSecondaryColor;

        return `
        <!-- Minimalist Circular Frame -->
        <circle cx="${anchorPoint.x + anchorPoint.width / 2}" cy="${anchorPoint.y + anchorPoint.height / 2}" r="${circleRadius}" stroke="${color}" stroke-width="${ctx.scaleStroke!(1.5)}" fill="none" opacity="${ctx.resolveOpacity!(0.6)}" />
      `;
      }
    };
    // ==========================================
    // SIGNATURE CONTRACT PRIMITIVES
    // ==========================================
    this.registry['floating_shadow'] = {
      category: 'effects',
      render: (ctx) => `
        <!-- High-quality soft shadow for die-cut reveals -->
        <defs>
          <filter id="soft_floating_shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#000000" flood-opacity="${ctx.resolveOpacity!(0.25)}"/>
          </filter>
        </defs>
        <rect x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY}" width="${ctx.w - ctx.constraints.safeX * 2}" height="${ctx.h - ctx.constraints.safeY * 2}" fill="none" filter="url(#soft_floating_shadow)" />
      `
    };

    this.registry['shadow'] = {
      category: 'effects',
      render: (ctx) => `
        <!-- Generic shadow primitive requested by some templates -->
        <defs>
          <filter id="generic_shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#000000" flood-opacity="${ctx.resolveOpacity!(0.20)}"/>
          </filter>
        </defs>
        <!-- The primitive renderer creates the filter, the actual shadow is applied to other elements via filter="url(#generic_shadow)" -->
      `
    };

    this.registry['catalog_metadata'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Catalog Technical Metadata Block -->
        <g transform="translate(${ctx.w - 180}, ${ctx.constraints.safeY + 20})" fill="${ctx.validBrandColor}" font-family="monospace" font-size="12">
          <text x="0" y="0" opacity="${ctx.resolveOpacity!(0.5)}">REF NO.</text>
          <text x="0" y="15" font-weight="bold">#${Math.floor(Math.random() * 9000) + 1000}-A</text>
          <line x1="0" y1="30" x2="120" y2="30" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" opacity="${ctx.resolveOpacity!(0.3)}" />
          <text x="0" y="50" opacity="${ctx.resolveOpacity!(0.5)}">DIMENSIONS</text>
          <text x="0" y="65">${ctx.w}x${ctx.h}px</text>
        </g>
      `
    };

    this.registry['specimen_border'] = {
      category: 'geometry',
      render: (ctx) => `
        <!-- Ultra-thin scientific specimen border -->
        <rect x="${ctx.constraints.safeX - 4}" y="${ctx.constraints.safeY - 4}" width="${ctx.w - (ctx.constraints.safeX - 4) * 2}" height="${ctx.h - (ctx.constraints.safeY - 4) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" opacity="${ctx.resolveOpacity!(0.4)}" />
        <circle cx="${ctx.constraints.safeX - 4}" cy="${ctx.constraints.safeY - 4}" r="2" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
        <circle cx="${ctx.w - ctx.constraints.safeX + 4}" cy="${ctx.constraints.safeY - 4}" r="2" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
        <circle cx="${ctx.constraints.safeX - 4}" cy="${ctx.h - ctx.constraints.safeY + 4}" r="2" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
        <circle cx="${ctx.w - ctx.constraints.safeX + 4}" cy="${ctx.h - ctx.constraints.safeY + 4}" r="2" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
      `
    };

    this.registry['swipe_indicator'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Carousel Swipe Indicator -->
        <g transform="translate(${ctx.w - ctx.constraints.safeX - 60}, ${ctx.h - ctx.constraints.safeY - 20})">
          <circle cx="0" cy="0" r="25" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" />
          <path d="M 5,-8 L 13,0 L 5,8" fill="none" stroke="#FFFFFF" stroke-width="${ctx.scaleStroke!(2)}" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="#FFFFFF" stroke-width="${ctx.scaleStroke!(2)}" stroke-linecap="round" />
        </g>
      `
    };

    this.registry['dominant_headline'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- High Contrast Dominant Headline Accent Line -->
        <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY + 80})">
          <line x1="0" y1="0" x2="60" y2="0" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(3)}" opacity="${ctx.resolveOpacity!(0.8)}" />
        </g>
      `
    };

    this.registry['off_center_crop'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Framing Corner Registration Ticks -->
        <g stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.35)}" fill="none">
          <path d="M ${ctx.constraints.safeX},${ctx.constraints.safeY + 20} L ${ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.constraints.safeX + 20},${ctx.constraints.safeY}" />
          <path d="M ${ctx.w - ctx.constraints.safeX - 20},${ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.constraints.safeY + 20}" />
        </g>
      `
    };

    this.registry['die_cut_mask'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Soft Die-Cut Window Frame Outline -->
        <rect x="${ctx.constraints.safeX + 10}" y="${ctx.constraints.safeY + 10}" width="${ctx.w - (ctx.constraints.safeX + 10) * 2}" height="${ctx.h - (ctx.constraints.safeY + 10) * 2}" rx="12" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" stroke-dasharray="6 6" opacity="${ctx.resolveOpacity!(0.4)}" />
      `
    };

    // ==========================================
    // PHASE 2: DYNAMIC DECORATOR PRIMITIVES
    // ==========================================
    this.registry['flower'] = {
      category: 'effects', render: (ctx) => `
      <!-- Minimal Botanical Line Art (Brand Accent) -->
      <g transform="translate(${ctx.constraints.safeX + 20}, ${ctx.constraints.safeY + 20}) scale(0.6)" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" fill="none" opacity="${ctx.resolveOpacity!(0.8)}">
        <path d="M50 50 C 30 10, 10 30, 50 50 C 90 30, 70 10, 50 50 C 70 90, 90 70, 50 50 C 10 70, 30 90, 50 50 Z" />
        <circle cx="50" cy="50" r="5" fill="${ctx.validBrandColor}" />
      </g>`
    };

    this.registry['tape'] = {
      category: 'layout', render: (ctx) => `
      <!-- Masking Tape Overlay -->
      <g transform="translate(${ctx.w / 2}, 30) rotate(-2)">
        <rect x="-80" y="0" width="160" height="35" fill="#FFFFFF" opacity="${ctx.resolveOpacity!(0.85)}" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
        <path d="M-80 0 Q-75 17 -80 35 M80 0 Q75 17 80 35" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(1.5)}" fill="none" opacity="${ctx.resolveOpacity!(0.3)}" />
      </g>`
    };

    this.registry['doodle'] = {
      category: 'effects', render: (ctx) => `
      <!-- Hand-drawn abstract swoosh -->
      <path d="M ${ctx.constraints.safeX + 40} ${ctx.h - ctx.constraints.safeY - 60} Q ${ctx.w / 2} ${ctx.h - ctx.constraints.safeY - 20}, ${ctx.w - ctx.constraints.safeX - 40} ${ctx.h - ctx.constraints.safeY - 80}" fill="none" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(3)}" stroke-linecap="round" opacity="${ctx.resolveOpacity!(0.7)}" />`
    };

    this.registry['sparkle'] = {
      category: 'effects', render: (ctx) => `
      <!-- Premium Sparkle/Star Accent -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 60}, ${ctx.constraints.safeY + 40}) scale(0.8)" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}">
        <path d="M20 0 Q20 20 40 20 Q20 20 20 40 Q20 20 0 20 Q20 20 20 0 Z" />
        <path d="M50 30 Q50 40 60 40 Q50 40 50 50 Q50 40 40 40 Q50 40 50 30 Z" transform="scale(0.6) translate(20, -30)" />
      </g>`
    };

    this.registry['quote_marks'] = {
      category: 'typography',
      render: (ctx, layer) => {
        const color = ctx.colorHierarchy ? ctx.colorHierarchy.accent : ctx.validSecondaryColor;
        const anchorPoint = ctx.layoutState?.occupiedRegions?.find(r => r.role === 'heading') || { x: ctx.w / 2, y: ctx.h / 2 };
        return `
        <!-- Minimalist Quotation Marks -->
        <text x="${anchorPoint.x - 40}" y="${anchorPoint.y + 40}" font-family="Georgia, serif" font-size="120px" fill="${color}" opacity="${ctx.resolveOpacity!(0.4)}" style="pointer-events:none;">&ldquo;</text>
      `;
      }
    };

    this.registry['thin_border'] = {
      category: 'geometry', render: (ctx) => `
      <!-- Museum Matte Thin Border -->
      <rect x="${ctx.constraints.safeX + 10}" y="${ctx.constraints.safeY + 10}" width="${ctx.w - (ctx.constraints.safeX + 10) * 2}" height="${ctx.h - (ctx.constraints.safeY + 10) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.6)}" />`
    };

    this.registry['geometric_badge'] = {
      category: 'geometry', render: (ctx) => `
      <!-- Geometric Circle Badge -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 80}, ${ctx.h - ctx.constraints.safeY - 80})">
        <circle cx="0" cy="0" r="45" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.9)}" />
        <circle cx="0" cy="0" r="38" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" stroke-dasharray="2 4" />
        <text x="0" y="5" font-family="sans-serif" font-size="10" font-weight="bold" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="2px">EST. 2026</text>
      </g>`
    };

    this.registry['metadata_label'] = {
      category: 'geometry', render: (ctx) => `
      <!-- Minimal Metadata Label (Top Right) -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 120}, ${ctx.constraints.safeY + 20})">
        <rect x="0" y="0" width="120" height="24" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
        <text x="60" y="16" font-family="monospace" font-size="10" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="1px">FIG. 01 // VSN</text>
      </g>`
    };

    this.registry['quote_marks'] = {
      category: 'effects', render: (ctx) => `
      <!-- Oversized Editorial Quote Marks -->
      <text x="${ctx.constraints.safeX + 20}" y="${ctx.constraints.safeY + 80}" font-family="Georgia, serif" font-size="120" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.2)}">"</text>`
    };

    this.registry['minimal_grid'] = {
      category: 'geometry', render: (ctx) => `
      <!-- Architectural Minimal Grid Overlay -->
      <g opacity="${ctx.resolveOpacity!(0.1)}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}">
        <line x1="${ctx.w * 0.33}" y1="0" x2="${ctx.w * 0.33}" y2="${ctx.h}" />
        <line x1="${ctx.w * 0.66}" y1="0" x2="${ctx.w * 0.66}" y2="${ctx.h}" />
        <line x1="0" y1="${ctx.h * 0.33}" x2="${ctx.w}" y2="${ctx.h * 0.33}" />
        <line x1="0" y1="${ctx.h * 0.66}" x2="${ctx.w}" y2="${ctx.h * 0.66}" />
      </g>`
    };

    this.registry['geometric_shape'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Renders a sleek solid geometric block for quotes or offset accents
        const size = 160;
        const x = layer && layer.anchor && layer.anchor.includes('right') ? ctx.w - ctx.constraints.safeX - size : ctx.constraints.safeX;
        const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - size : ctx.constraints.safeY;
        return `
      <!-- Solid Geometric Accent Shape -->
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
      <rect x="${x + 20}" y="${y + 20}" width="${size - 40}" height="${size - 40}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" opacity="${ctx.resolveOpacity!(0.2)}" />`;
      }
    };

    // ==========================================
    // PHASE 5: PREMIUM TEXT-ONLY DECORATORS
    // ==========================================

    this.registry['meteor_shower'] = {
      category: 'effects', render: (ctx) => {
        // Find the CTA or Headline to point towards to guide reading flow
        const targetRegion = ctx.layoutState?.occupiedRegions?.find(r => r.role === 'cta') || ctx.layoutState?.occupiedRegions?.find(r => r.role === 'heading');

        let tx = ctx.w - 150;
        let ty = ctx.h * 0.7; // default

        if (targetRegion) {
          tx = targetRegion.x + targetRegion.width;
          ty = targetRegion.y + (targetRegion.height / 2);
        }

        return `
      <!-- Premium Meteor Shower Accent (Anchored for Reading Flow) -->
      <g stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-linecap="round" opacity="${ctx.resolveOpacity!(0.95)}">
        <line x1="${tx + 100}" y1="${ty - 200}" x2="${tx}" y2="${ty - 100}" opacity="${ctx.resolveOpacity!(0.6)}" stroke-width="${ctx.scaleStroke!(2)}" />
        <line x1="${tx + 180}" y1="${ty - 150}" x2="${tx + 30}" y2="${ty}" opacity="${ctx.resolveOpacity!(1.0)}" stroke-width="${ctx.scaleStroke!(3)}" />
        <line x1="${tx + 220}" y1="${ty - 60}" x2="${tx + 120}" y2="${ty + 40}" opacity="${ctx.resolveOpacity!(0.4)}" stroke-width="${ctx.scaleStroke!(1.5)}" />
        <!-- Glowing heads -->
        <circle cx="${tx}" cy="${ty - 100}" r="2.5" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.8)}" />
        <circle cx="${tx + 30}" cy="${ty}" r="4" fill="${ctx.validAccentColor || ctx.validBrandColor}" />
        <circle cx="${tx + 120}" cy="${ty + 40}" r="2" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}" />
      </g>`;
      }
    };

    this.registry['elegant_line_art'] = {
      category: 'geometry', render: (ctx) => {
        return `
      <!-- Elegant Wavy Line Art -->
      <path d="M -50 ${ctx.h * 0.8} C ${ctx.w * 0.2} ${ctx.h * 0.9}, ${ctx.w * 0.3} ${ctx.h * 0.6}, ${ctx.w * 0.5} ${ctx.h * 0.7} S ${ctx.w * 0.8} ${ctx.h * 0.9}, ${ctx.w + 50} ${ctx.h * 0.85}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.7)}" />
      <path d="M -50 ${ctx.h * 0.82} C ${ctx.w * 0.25} ${ctx.h * 0.95}, ${ctx.w * 0.35} ${ctx.h * 0.65}, ${ctx.w * 0.55} ${ctx.h * 0.75} S ${ctx.w * 0.85} ${ctx.h * 0.95}, ${ctx.w + 50} ${ctx.h * 0.87}" fill="none" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.9)}" />`;
      }
    };

    this.registry['premium_stars'] = {
      category: 'effects', render: (ctx) => {
        let sx1 = ctx.constraints.safeX + 50;
        let sy1 = ctx.constraints.safeY + 80;
        let sx2 = ctx.w - ctx.constraints.safeX - 80;
        let sy2 = ctx.h * 0.6;

        if (ctx.canonicalGeometry?.textRegion) {
          const tr = ctx.canonicalGeometry.textRegion;
          sx1 = Math.max(ctx.constraints.safeX, tr.x - 40);
          sy1 = Math.max(ctx.constraints.safeY, tr.y - 40);
          sx2 = Math.min(ctx.w - ctx.constraints.safeX, tr.x + tr.width + 40);
          sy2 = Math.min(ctx.h - ctx.constraints.safeY, tr.y + tr.height + 40);
        } else {
          const headlineRegion = ctx.layoutState?.occupiedRegions?.find(r => r.role === 'heading');
          if (headlineRegion) {
            sx1 = Math.max(ctx.constraints.safeX, headlineRegion.x - 40);
            sy1 = Math.max(ctx.constraints.safeY, headlineRegion.y - 40);
            sx2 = Math.min(ctx.w - ctx.constraints.safeX, headlineRegion.x + headlineRegion.width + 40);
            sy2 = Math.min(ctx.h - ctx.constraints.safeY, headlineRegion.y + headlineRegion.height + 40);
          }
        }

        const drawStar = (x: number, y: number, r: number) => {
          return `<path d="M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z" />`;
        };

        // Added wrapper with dataset for collision engine
        return `
      <!-- Premium Four-Point Stars (Anchored to Focal Point) -->
      <g data-bounds="${sx1},${sy1},${Math.abs(sx2-sx1)+40},${Math.abs(sy2-sy1)+40}" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(1.0)}">
        ${drawStar(sx1, sy1, 24)}
        <g opacity="${ctx.resolveOpacity!(0.8)}">
           ${drawStar(sx2, sy2, 16)}
        </g>
      </g>`;
      }
    };

    this.registry['abstract_rings'] = {
      category: 'geometry', render: (ctx) => {
        // Find the headline region to anchor to
        const headlineRegion = ctx.layoutState?.occupiedRegions?.find(r => r.role === 'heading' || r.role === 'ghost_headline');

        let cx = ctx.w / 2;
        let cy = ctx.h / 2;

        if (headlineRegion && headlineRegion.opticalCenter) {
          cx = headlineRegion.opticalCenter.x;
          cy = headlineRegion.opticalCenter.y;
        } else if (headlineRegion) {
          cx = headlineRegion.x + (headlineRegion.width / 2);
          cy = headlineRegion.y + (headlineRegion.height / 2);
        } else {
          cx = ctx.w - 100;
          cy = ctx.h / 2;
        }

        return `
      <!-- Abstract Concentric Rings (Anchored as Compositional Base) -->
      <g transform="translate(${cx}, ${cy})" opacity="${ctx.resolveOpacity!(0.3)}">
        <circle cx="0" cy="0" r="${ctx.w * 0.45}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2.5)}" />
        <circle cx="0" cy="0" r="${ctx.w * 0.6}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(3.5)}" stroke-dasharray="8 16" opacity="${ctx.resolveOpacity!(0.75)}" />
        <circle cx="0" cy="0" r="${ctx.w * 0.75}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.5)}" />
      </g>`;
      }
    };

    // ==========================================
    // SEMANTIC CATEGORY DELEGATES
    // ==========================================

    this.registry['organic_accent'] = {
      category: 'effects',
      render: (ctx, layer) => {
        const choices = ['flower', 'doodle', 'sparkle', 'organic_blob'];
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return this.registry[choice] ? this.registry[choice].render(ctx, layer) : '';
      }
    };

    this.registry['structural_border'] = {
      category: 'geometry',
      render: (ctx, layer) => {
        const choices = ['museum_border', 'thin_border', 'minimal_grid', 'die_cut_mask'];
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return this.registry[choice] ? this.registry[choice].render(ctx, layer) : '';
      }
    };

    this.registry['handmade_mark'] = {
      category: 'effects',
      render: (ctx, layer) => {
        const choices = ['tape', 'editorial_tape', 'wax_seal', 'ticket_notches', 'paper_attachment'];
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return this.registry[choice] ? this.registry[choice].render(ctx, layer) : '';
      }
    };

    this.registry['margin_notes'] = {
      category: 'typography',
      render: (ctx, layer) => {
        const profile = ctx.recipe?.margin_notes;
        const opacity = profile?.opacity ?? 0.8;
        const xPos = ctx.constraints.safeX;
        const yPos = ctx.h - ctx.constraints.safeY + 20; // Anchor bottom left inside margin
        return `
        <!-- Hand-written margin note -->
        <text x="${xPos}" y="${yPos}" fill="${ctx.validBrandColor}" opacity="${opacity}" font-family="Georgia, serif" font-style="italic" font-size="14">
          ( Notes &amp; Observations )
        </text>
      `;
      }
    };

    this.registry['editorial_number_block'] = {
      category: 'layout',
      render: (ctx, layer) => {
        const choices = ['oversized_index', 'number_plate'];
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return this.registry[choice] ? this.registry[choice].render(ctx, layer) : '';
      }
    };

    this.registry['ink_stamp'] = {
      category: 'effects',
      render: (ctx, layer) => `
        <g transform="translate(${ctx.w - 120}, ${ctx.constraints.safeY + 80}) rotate(15)">
          <circle cx="40" cy="40" r="38" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" stroke-dasharray="1 3" opacity="${ctx.resolveOpacity!(0.4)}" />
          <text x="40" y="44" font-family="monospace" font-size="12" font-weight="bold" fill="${ctx.validBrandColor}" text-anchor="middle" opacity="${ctx.resolveOpacity!(0.6)}">NO. 1</text>
        </g>
      `
    };

    this.registry['fold_line'] = {
      category: 'geometry',
      render: (ctx, layer) => `
        <!-- Creased Fold Line -->
        <g opacity="${ctx.resolveOpacity!(0.3)}">
          <line x1="0" y1="${ctx.h / 2}" x2="${ctx.w}" y2="${ctx.h / 2}" stroke="#fff" stroke-width="${ctx.scaleStroke!(2)}" filter="blur(1px)" />
          <line x1="0" y1="${ctx.h / 2 + 1}" x2="${ctx.w}" y2="${ctx.h / 2 + 1}" stroke="#000" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.2)}" />
        </g>
      `
    };

    this.registry['corner_frame'] = {
      category: 'geometry',
      render: (ctx, layer) => `
        <!-- Minimal Corner Framing Brackets -->
        <g stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" fill="none" opacity="${ctx.resolveOpacity!(0.7)}">
          <path d="M ${ctx.constraints.safeX + 20},${ctx.constraints.safeY} L ${ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.constraints.safeX},${ctx.constraints.safeY + 20}" />
          <path d="M ${ctx.w - ctx.constraints.safeX - 20},${ctx.h - ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.h - ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.h - ctx.constraints.safeY - 20}" />
        </g>
      `
    };

    // CANVA-STYLE PREMIUM PRIMITIVES (Phase 3 Additions)

    this.registry['starburst_badge'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Draw a Canva-style 12-point starburst
        const cx = layer && layer.anchor && layer.anchor.includes('right') ? ctx.w - ctx.constraints.safeX - 90 : ctx.constraints.safeX + 90;
        const cy = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - 90 : ctx.constraints.safeY + 90;
        let starPath = "";
        const outerR = 60;
        const innerR = 48;
        const points = 12;
        for (let i = 0; i < points * 2; i++) {
          const radius = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / points) * i;
          const x = cx + radius * Math.sin(angle);
          const y = cy - radius * Math.cos(angle);
          starPath += (i === 0 ? "M " : "L ") + x + "," + y;
        }
        starPath += " Z";

        return `
      <!-- Canva-style Starburst Badge -->
      <g opacity="${ctx.resolveOpacity!(0.95)}">
        <path d="${starPath}" fill="${ctx.validAccentColor || ctx.validBrandColor}" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(3)}" filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.25))" />
        <circle cx="${cx}" cy="${cy}" r="${innerR - 6}" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(1)}" stroke-dasharray="2 4" />
      </g>`;
      }
    };

    this.registry['text_pill'] = {
      category: 'layout', render: (ctx, layer) => {
        // Renders a simple pill shape behind CTA text
        const y = layer && layer.anchor && layer.anchor.includes('top') ? ctx.constraints.safeY + 20 : ctx.h - ctx.constraints.safeY - 60;
        return `
      <!-- Typography Pill Background -->
      <rect x="${ctx.w / 2 - 120}" y="${y}" width="240" height="46" rx="23" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))" />`;
      }
    };

    this.registry['3d_emoji'] = {
      category: 'effects', render: (ctx, layer) => {
        // AI sometimes requests "3d_emoji". We map this to the starburst so it renders beautifully.
        return this.registry['starburst_badge'].render(ctx, layer);
      }
    };

    // --- TYPOGRAPHY PRIMITIVES ---

    this.registry['ghost_headline'] = {
      category: 'typography', render: (ctx, layer) => {
        const text = (ctx as any).structuredText?.headline || "EDITORIAL";

        // Phase 3: Relative Anchor logic for Ghost Headline
        let anchorY = ctx.h / 2 + 150;
        if (layer?.attachTo && ctx.layoutState) {
          const target = ctx.layoutState.occupiedRegions.find((r: any) => r.id === layer.attachTo);
          if (target) {
            anchorY = target.y + target.height + 80;
          }
        }

        // Phase 5: Massive structural rhythm instead of faint centered text
        // We push it slightly off-canvas to the left, massively scaled, very low opacity
        return `
      <!-- Ghost Headline (Structural) -->
      <text x="-40" y="${anchorY}" font-family="sans-serif" font-size="800" font-weight="900" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.04)}" text-anchor="start" letter-spacing="-10px" transform="scale(1, 1.2)">
        ${text.toUpperCase()}
      </text>`;
      }
    };

    this.registry['outline_headline'] = {
      category: 'typography', render: (ctx, layer) => {
        const text = (ctx as any).structuredText?.headline || "ELEGANCE";
        const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - 40 : ctx.constraints.safeY + 120;
        return `
      <!-- Outline Headline -->
      <text x="${ctx.constraints.safeX}" y="${y}" font-family="sans-serif" font-size="140" font-weight="800" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(3)}" text-anchor="start">
        ${text.toUpperCase()}
      </text>`;
      }
    };

    this.registry['vertical_label'] = {
      category: 'typography', render: (ctx, layer) => {
        const text = (ctx as any).rawName || "EDITORIAL";
        return `
      <!-- Vertical Label -->
      <g transform="translate(${ctx.constraints.safeX + 20}, ${ctx.h - ctx.constraints.safeY}) rotate(-90)">
        <text x="0" y="0" font-family="sans-serif" font-size="14" font-weight="600" fill="${ctx.validBrandColor}" letter-spacing="4px" opacity="${ctx.resolveOpacity!(0.6)}">${text.toUpperCase()}</text>
      </g>`;
      }
    };

    this.registry['running_header'] = {
      category: 'typography', render: (ctx) => {
        const text = (ctx as any).rawName || "EDITORIAL";
        return `
      <!-- Running Header -->
      <text x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY - 10}" font-family="sans-serif" font-size="12" font-weight="500" fill="${ctx.validBrandColor}" letter-spacing="2px" opacity="${ctx.resolveOpacity!(0.5)}">
        ${text.toUpperCase()} // VOL. 1
      </text>`;
      }
    };

    this.registry['pull_quote'] = {
      category: 'typography', render: (ctx) => {
        const text = (ctx as any).overlayText || "Design is intelligence made visible.";
        return `
      <!-- Pull Quote -->
      <g transform="translate(${ctx.w / 2}, ${ctx.h / 2})">
        <text x="0" y="-40" font-family="Georgia, serif" font-size="160" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" text-anchor="middle">"</text>
        <text x="0" y="0" font-family="Georgia, serif" font-size="32" font-style="italic" fill="${ctx.validBrandColor}" text-anchor="middle">
          ${text}
        </text>
      </g>`;
      }
    };

    // --- SHAPE PRIMITIVES ---

    this.registry['glass_card'] = {
      category: 'geometry', render: (ctx, layer) => {
        const w = 400;
        const h = 250;
        const x = ctx.constraints.safeX;
        const y = ctx.h - ctx.constraints.safeY - h;
        return `
      <!-- Glassmorphism Card -->
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.6)}" filter="blur(8px)" />
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.8)}" />
      </g>`;
      }
    };

    this.registry['organic_blob'] = {
      category: 'geometry', render: (ctx, layer) => {
        return `
      <!-- Organic Blob -->
      <path d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.3,-40.4C85.5,-25.5,91.7,-9.6,90.4,5.7C89,20.9,80.1,35.6,69.5,47.9C58.8,60.2,46.5,70.1,32.3,76.5C18.2,82.9,2.2,85.8,-13.2,83.5C-28.7,81.1,-43.5,73.5,-55.6,62.8C-67.6,52.1,-76.8,38.3,-82.4,22.8C-88,7.3,-89.9,-9.8,-85.1,-24.8C-80.4,-39.8,-69,-52.7,-55.2,-59.5C-41.4,-66.3,-25.2,-67.1,-9.5,-64.1C6.1,-61,22.3,-54.2,32.5,-60.7Z" transform="translate(${ctx.w * 0.8}, ${ctx.h * 0.2}) scale(4)" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.05)}" />`;
      }
    };

    this.registry['torn_paper'] = {
      category: 'geometry', render: (ctx) => {
        return `
      <!-- Torn Paper Edge (Top) -->
      <path d="M0,0 L${ctx.w},0 L${ctx.w},40 Q${ctx.w * 0.75},10 ${ctx.w * 0.5},45 T0,30 Z" fill="${ctx.validSecondaryColor}" />`;
      }
    };

    this.registry['pill_tag'] = {
      category: 'geometry', render: (ctx, layer) => {
        const text = "NEW IN";
        return `
      <!-- Pill Tag -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="80" height="28" rx="14" fill="${ctx.validBrandColor}" />
        <text x="40" y="18" font-family="sans-serif" font-size="10" font-weight="bold" fill="${ctx.validSecondaryColor}" text-anchor="middle" letter-spacing="1px">${text}</text>
      </g>`;
      }
    };

    // --- LINE PRIMITIVES ---

    this.registry['double_divider'] = {
      category: 'geometry', render: (ctx, layer) => {
        const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY : ctx.constraints.safeY;
        return `
      <!-- Double Divider -->
      <g transform="translate(${ctx.constraints.safeX}, ${y})">
        <line x1="0" y1="0" x2="100" y2="0" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" />
        <line x1="0" y1="6" x2="100" y2="6" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" />
      </g>`;
      }
    };

    this.registry['margin_rule'] = {
      category: 'geometry', render: (ctx) => {
        return `
      <!-- Editorial Margin Hairline Rule -->
      <g opacity="${ctx.resolveOpacity!(0.85)}">
        <line x1="${ctx.constraints.safeX / 2}" y1="${ctx.constraints.safeY}" x2="${ctx.constraints.safeX / 2}" y2="${ctx.h - ctx.constraints.safeY}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.75)}" />
        <rect x="${ctx.constraints.safeX / 2 - 2}" y="${ctx.constraints.safeY}" width="4" height="1" fill="${ctx.validBrandColor}" />
        <rect x="${ctx.constraints.safeX / 2 - 2}" y="${ctx.h - ctx.constraints.safeY}" width="4" height="1" fill="${ctx.validBrandColor}" />
      </g>`;
      }
    };

    this.registry['accent_rule'] = {
      category: 'geometry', render: (ctx, layer) => {
        let y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY : ctx.constraints.safeY;
        let x = ctx.constraints.safeX;

        // Phase 3: Connect accent rule to text baseline if specified
        if (layer?.attachTo && ctx.layoutState) {
          const target = ctx.layoutState.occupiedRegions.find((r: any) => r.id === layer.attachTo);
          if (target) {
            y = (target.baseline || target.y + target.height) + (layer.attachOffset || 20);
            x = target.x;
          }
        }

        return `
      <!-- Editorial Accent Rule -->
      <g transform="translate(${x}, ${y})">
        <line x1="0" y1="0" x2="80" y2="0" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" />
        <line x1="0" y1="4" x2="80" y2="4" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(0.5)}" opacity="${ctx.resolveOpacity!(0.5)}" />
      </g>`;
      }
    };

    // --- TEXTURE PRIMITIVES ---

    this.registry['noise_texture'] = {
      category: 'effects', render: (ctx) => {
        return `
      <!-- Subtle Noise Texture -->
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" result="noise" />
        <!-- Convert to monochromatic noise -->
        <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0.20 0" in="noise" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" style="pointer-events:none;" filter="url(#noiseFilter)" />`;
      }
    };

    this.registry['subtle_grain'] = {
      category: 'effects', render: (ctx) => {
        return `
      <!-- Subtle Film Grain Overlay (high-frequency, very low opacity — photographic feel) -->
      <filter id="subtleGrainFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" result="grain" />
        <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0.10 0" in="grain" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" style="pointer-events:none; mix-blend-mode: overlay;" filter="url(#subtleGrainFilter)" opacity="${ctx.resolveOpacity!(0.6)}" />`;
      }
    };

    this.registry['paper_texture'] = {
      category: 'effects', render: (ctx, layer) => {
        const profile = ctx.recipe?.paper_texture;
        const opacity = profile?.opacity ?? 0.25;  // Reduced from 0.45 → 0.25 for a subtler premium look
        const blendMode = profile?.blendMode ?? 'multiply';

        return `
      <!-- Paper Texture -->
      <filter id="paperFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" result="noise" />
        <!-- Convert to monochromatic noise before lighting -->
        <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" in="noise" result="monoNoise" />
        <feDiffuseLighting in="monoNoise" lighting-color="#fff" surfaceScale="2" result="light">
          <feDistantLight azimuth="45" elevation="60" />
        </feDiffuseLighting>
        <feBlend mode="multiply" in="SourceGraphic" in2="light" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validSecondaryColor}" filter="url(#paperFilter)" opacity="${opacity}" style="mix-blend-mode: ${blendMode}; pointer-events:none;" />`;
      }
    };

    this.registry['linen_texture'] = {
      category: 'effects', render: (ctx) => {
        return `
      <!-- Subtle Linen Texture -->
      <filter id="linenFilter">
        <!-- Linen has directional fibers, hence the asymmetric frequency -->
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.2" numOctaves="2" result="noise" />
        <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0   0.33 0.33 0.33 0 0   0.33 0.33 0.33 0 0   0 0 0 0.1 0" in="noise" result="coloredNoise" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" filter="url(#linenFilter)" style="pointer-events:none; mix-blend-mode: multiply;" />`;
      }
    };

    this.registry['light_leak'] = {
      category: 'effects', render: (ctx) => {
        return `
      <!-- Light Leak Gradient -->
      <defs>
        <radialGradient id="lightLeakGrad" cx="0%" cy="0%" r="70%">
          <stop offset="0%" stop-color="${ctx.validAccentColor || '#ff9900'}" stop-opacity="${ctx.resolveOpacity!(0.25)}" />
          <stop offset="100%" stop-color="${ctx.validAccentColor || '#ff9900'}" stop-opacity="${ctx.resolveOpacity!(0)}" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="url(#lightLeakGrad)" style="mix-blend-mode: screen;" />`;
      }
    };

    this.registry['soft_scrim'] = {
      category: 'effects', render: (ctx) => {
        // Optional explicit soft scrim for editorial families, instead of a universal muddy default.
        return `
      <!-- Soft Scrim Gradient -->
      <defs>
        <linearGradient id="softScrim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${ctx.validBackgroundColor}" stop-opacity="${ctx.resolveOpacity!(0.1)}" />
          <stop offset="100%" stop-color="${ctx.validBackgroundColor}" stop-opacity="${ctx.resolveOpacity!(0.8)}" />
        </linearGradient>
      </defs>
      <rect x="0" y="${ctx.h * 0.4}" width="${ctx.w}" height="${ctx.h * 0.6}" fill="url(#softScrim)" />`;
      }
    };

    // Text Containers (Delegated to TypographyEngine)
    this.registry['solid_card'] = { category: 'geometry', render: () => '' };
    this.registry['pill_label'] = { category: 'geometry', render: () => '' };
    this.registry['inset_card'] = { category: 'geometry', render: () => '' };

    // ==========================================
    // BATCH 3 NEW PRIMITIVES (from 1040 new templates)
    // ==========================================

    // Subtle full-canvas texture: low-opacity grain overlay, similar to paper_texture but warmer
    this.registry['textured_background'] = {
      category: 'effects', render: (ctx) => `
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBackgroundColor}" opacity="${ctx.resolveOpacity!(0.3)}" />
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" style="mix-blend-mode: overlay;"
        opacity="${ctx.resolveOpacity!(0.12)}">
        <animate attributeName="opacity" values="0.10;0.14;0.10" dur="8s" repeatCount="indefinite"/>
      </rect>
      <filter id="bg_grain_filter" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.70" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" filter="url(#bg_grain_filter)" opacity="${ctx.resolveOpacity!(0.10)}" style="mix-blend-mode: overlay;"/>`
    };

    // Clean geometric circle accent — editorial ring or decorative element
    this.registry['circle'] = {
      category: 'geometry', render: (ctx) => {
        const cx = Math.round(ctx.w / 2);
        const r = Math.round(Math.min(ctx.w, ctx.h) * 0.18);
        return `
      <!-- Decorative editorial ring accent -->
      <circle cx="${cx}" cy="${Math.round(ctx.h * 0.15)}" r="${r}" fill="none"
        stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.35)}" />`;
      }
    };

    // Thin inset frame border around the canvas edges — premium editorial look
    this.registry['frame_border'] = {
      category: 'geometry', render: (ctx) => {
        const m = 20;
        return `
      <!-- Thin frame border -->
      <rect x="${m}" y="${m}" width="${ctx.w - m * 2}" height="${ctx.h - m * 2}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.2)}" opacity="${ctx.resolveOpacity!(0.40)}" rx="2"/>`;
      }
    };

    // Rounded-corner frame — softer, organic framing alternative to frame_border
    this.registry['rounded_frame'] = {
      category: 'geometry', render: (ctx) => {
        const m = 18;
        return `
      <!-- Rounded frame -->
      <rect x="${m}" y="${m}" width="${ctx.w - m * 2}" height="${ctx.h - m * 2}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.35)}" rx="24"/>`;
      }
    };

    // Light stroke outline following the canvas — sits behind image/text
    this.registry['outline'] = {
      category: 'geometry', render: (ctx) => {
        const m = 14;
        return `
      <!-- Structural outline -->
      <rect x="${m}" y="${m}" width="${ctx.w - m * 2}" height="${ctx.h - m * 2}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.28)}" rx="0"/>`;
      }
    };

    // Thin horizontal underline — accent beneath headings or brand labels
    this.registry['underline'] = {
      category: 'geometry', render: (ctx) => {
        const x1 = Math.round(ctx.w * 0.1);
        const x2 = Math.round(ctx.w * 0.9);
        const y  = Math.round(ctx.h * 0.88);
        return `
      <!-- Editorial underline accent -->
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
        stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.45)}"/>`;
      }
    };

    // Dashed/dotted perimeter border — scrapbook / editorial feel
    this.registry['dotted_border'] = {
      category: 'geometry', render: (ctx) => {
        const m = 22;
        return `
      <!-- Dotted decorative border -->
      <rect x="${m}" y="${m}" width="${ctx.w - m * 2}" height="${ctx.h - m * 2}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}"
        stroke-dasharray="4 6" opacity="${ctx.resolveOpacity!(0.38)}" rx="3"/>`;
      }
    };

    // Speech bubble shape — used by text_only and testimonial families
    this.registry['speech_bubble'] = {
      category: 'geometry', render: (ctx) => {
        const bw = Math.round(ctx.w * 0.72);
        const bh = 110;
        const bx = Math.round((ctx.w - bw) / 2);
        const by = Math.round(ctx.h * 0.1);
        const tailX = Math.round(ctx.w / 2);
        return `
      <!-- Speech bubble decoration -->
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="18"
        fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.22)}"/>
      <path d="M ${tailX - 14} ${by + bh} L ${tailX} ${by + bh + 22} L ${tailX + 14} ${by + bh} Z"
        fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.22)}"/>`;
      }
    };

    // Soft heart shape — beauty / wellness accent
    this.registry['heart'] = {
      category: 'geometry', render: (ctx) => {
        const cx = Math.round(ctx.w * 0.85);
        const cy = Math.round(ctx.h * 0.12);
        const s  = 28;
        return `
      <!-- Heart accent -->
      <path d="M ${cx},${cy + s * 0.3}
        C ${cx},${cy - s * 0.1} ${cx - s},${cy - s * 0.1} ${cx - s},${cy + s * 0.3}
        C ${cx - s},${cy + s * 0.8} ${cx},${cy + s * 1.2} ${cx},${cy + s * 1.2}
        C ${cx},${cy + s * 1.2} ${cx + s},${cy + s * 0.8} ${cx + s},${cy + s * 0.3}
        C ${cx + s},${cy - s * 0.1} ${cx},${cy - s * 0.1} ${cx},${cy + s * 0.3} Z"
        fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.18)}"/>`;
      }
    };

    // Floral SVG — delicate petal cluster for beauty/wellness layouts
    this.registry['floral'] = {
      category: 'geometry', render: (ctx) => {
        const cx = Math.round(ctx.w * 0.88);
        const cy = Math.round(ctx.h * 0.10);
        return `
      <!-- Floral accent -->
      <g transform="translate(${cx},${cy})" opacity="${ctx.resolveOpacity!(0.18)}">
        <ellipse rx="10" ry="22" fill="${ctx.validBrandColor}" transform="rotate(0)"/>
        <ellipse rx="10" ry="22" fill="${ctx.validBrandColor}" transform="rotate(60)"/>
        <ellipse rx="10" ry="22" fill="${ctx.validBrandColor}" transform="rotate(120)"/>
        <circle r="8" fill="${ctx.validSecondaryColor}"/>
      </g>`;
      }
    };

    // Organic pattern — flowing wavy lines for organic/ayurvedic layouts
    this.registry['organic_pattern'] = {
      category: 'effects', render: (ctx) => {
        return `
      <!-- Organic wavy pattern -->
      <path d="M 0 ${ctx.h * 0.75} Q ${ctx.w * 0.25} ${ctx.h * 0.68} ${ctx.w * 0.5} ${ctx.h * 0.75}
               Q ${ctx.w * 0.75} ${ctx.h * 0.82} ${ctx.w} ${ctx.h * 0.75}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.18)}"/>
      <path d="M 0 ${ctx.h * 0.80} Q ${ctx.w * 0.25} ${ctx.h * 0.73} ${ctx.w * 0.5} ${ctx.h * 0.80}
               Q ${ctx.w * 0.75} ${ctx.h * 0.87} ${ctx.w} ${ctx.h * 0.80}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" opacity="${ctx.resolveOpacity!(0.12)}"/>`;
      }
    };

    // Illustration placeholder — abstract geometric shape acting as a decorative illustration
    this.registry['illustration'] = {
      category: 'geometry', render: (ctx) => {
        const cx = Math.round(ctx.w * 0.15);
        const cy = Math.round(ctx.h * 0.82);
        return `
      <!-- Decorative illustration accent (abstract geometric) -->
      <circle cx="${cx}" cy="${cy}" r="48" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.10)}"/>
      <circle cx="${cx + 18}" cy="${cy - 18}" r="28" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.12)}"/>`;
      }
    };

    // Polka dot pattern — playful repeating dots
    this.registry['polka_dot_pattern'] = {
      category: 'geometry', render: (ctx) => {
        let dots = '';
        const spacing = 48;
        const r = 3;
        for (let x = spacing; x < ctx.w; x += spacing) {
          for (let y = spacing; y < ctx.h; y += spacing) {
            dots += `<circle cx="${x}" cy="${y}" r="${r}" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.10)}"/>`;
          }
        }
        return `<!-- Polka dot texture -->${dots}`;
      }
    };

    // Simple directional arrow — used for transformation/process layouts
    this.registry['arrow'] = {
      category: 'geometry', render: (ctx) => {
        const cx = Math.round(ctx.w / 2);
        const y  = Math.round(ctx.h * 0.52);
        const aw = 36;
        const ah = 14;
        return `
      <!-- Directional arrow accent -->
      <path d="M ${cx - aw} ${y} L ${cx} ${y} M ${cx - ah} ${y - ah} L ${cx} ${y} L ${cx - ah} ${y + ah}"
        fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" stroke-linecap="round"
        stroke-linejoin="round" opacity="${ctx.resolveOpacity!(0.40)}"/>`;
      }
    };

    // Repeated text watermark — ghost brand name in the background
    this.registry['repeated text'] = {
      category: 'geometry', render: (ctx) => {
        const text = ctx.validBrandColor ? 'BRAND' : 'BRAND';
        return `
      <!-- Repeated text watermark -->
      <text x="${ctx.w / 2}" y="${ctx.h / 2}" text-anchor="middle"
        font-family="sans-serif" font-weight="900" font-size="180px"
        fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.04)}" letter-spacing="0.05em">${text}</text>`;
      }
    };

    // ==========================================
    // PHASE 3 & 4: CLINICAL AND EDUCATIONAL PRIMITIVES
    // ==========================================
    this.registry['clinical_callout_box'] = {
      category: 'geometry', render: (ctx, layer) => {
        return `
      <!-- Clinical Callout Box with Data / Analysis Style -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.h / 2 - 40})">
        <rect x="0" y="0" width="360" height="220" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(1)}" filter="drop-shadow(0 15px 30px rgba(0,0,0,0.15))" />
        <rect x="0" y="0" width="360" height="40" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
        <rect x="0" y="0" width="4" height="220" fill="${ctx.validBrandColor}" />
        <text x="20" y="25" font-family="monospace" font-size="12" font-weight="bold" fill="${ctx.validBrandColor}" letter-spacing="2px">CLINICAL ANALYSIS</text>
        <!-- Mock Data Bars -->
        <rect x="20" y="70" width="320" height="6" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
        <rect x="20" y="70" width="240" height="6" fill="${ctx.validBrandColor}" />
        <text x="20" y="95" font-family="monospace" font-size="10" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}">EFFICACY 85%</text>
        
        <rect x="20" y="120" width="320" height="6" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
        <rect x="20" y="120" width="160" height="6" fill="${ctx.validBrandColor}" />
        <text x="20" y="145" font-family="monospace" font-size="10" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}">TISSUE REPAIR 60%</text>
        
        <rect x="20" y="170" width="320" height="6" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />
        <rect x="20" y="170" width="280" height="6" fill="${ctx.validBrandColor}" />
        <text x="20" y="195" font-family="monospace" font-size="10" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.6)}">HYDRATION 92%</text>
      </g>`;
      }
    };

    this.registry['step_badge'] = {
      category: 'geometry', render: (ctx, layer) => {
        return `
      <!-- Clinical Step Badge (e.g., Step 1, Step 2) -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="120" height="36" rx="18" fill="${ctx.validBrandColor}" />
        <text x="60" y="22" font-family="sans-serif" font-size="12" font-weight="bold" fill="${ctx.validSecondaryColor}" text-anchor="middle" letter-spacing="2px">STEP 01</text>
      </g>`;
      }
    };

    this.registry['large_numeral_bullet'] = {
      category: 'geometry', render: (ctx, layer) => {
        return `
      <!-- Educational Large Numeral Background -->
      <text x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY + 180}" font-family="Georgia, serif" font-size="250" font-weight="900" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.08)}" text-anchor="start">
        1.
      </text>`;
      }
    };

    this.registry['myth_fact_badge'] = {
      category: 'geometry', render: (ctx, layer) => {
        return `
      <!-- Educational Myth vs Fact Floating Badge -->
      <g transform="translate(${ctx.w / 2 - 100}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="200" height="50" rx="25" fill="${ctx.validSecondaryColor}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" filter="drop-shadow(0 10px 20px rgba(0,0,0,0.1))" />
        <text x="100" y="30" font-family="sans-serif" font-size="14" font-weight="800" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="3px">MYTH VS FACT</text>
      </g>`;
      }
    };

    this.registry['quote_mark_accent'] = {
      category: 'effects', render: (ctx, layer) => {
        return `
      <!-- Centered Premium Quote Mark Background -->
      <text x="${ctx.w / 2}" y="${ctx.h / 2 + 100}" font-family="Georgia, serif" font-size="300" font-style="italic" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.08)}" text-anchor="middle">
        "
      </text>`;
      }
    };

    // ─── SPLIT / COUNTDOWN PROMO / PRODUCT SHOWCASE PRIMITIVES ───

    this.registry['split_seam_line'] = {
      category: 'layout', render: (ctx, layer) => {
        // Thin accent line marking the seam between the photo band and the text block
        const offsetPercent = layer && (layer as IDSLDecorationLayer).offsetPercent != null ? (layer as IDSLDecorationLayer).offsetPercent : 40;
        const y = Math.round((offsetPercent / 100) * ctx.h);
        return `
      <!-- Split Family Seam Line (Architectural Divider) -->
      <g transform="translate(0, ${y})">
        <rect x="${ctx.constraints.safeX}" y="-4" width="${ctx.w - ctx.constraints.safeX * 2}" height="8" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.9)}" />
        <rect x="0" y="0" width="${ctx.w}" height="1" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.2)}" />
      </g>`;
      }
    };

    this.registry['countdown_urgency_badge'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Small rounded urgency/CTA badge, anchored near the layer's declared corner
        const attachX = layer && layer.anchor && layer.anchor.includes('right') ? ctx.w - ctx.constraints.safeX - 130 : ctx.constraints.safeX;
        const attachY = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - 40 : ctx.constraints.safeY;
        return `
      <!-- Countdown Promo Urgency Badge -->
      <g transform="translate(${attachX}, ${attachY})">
        <rect x="0" y="0" width="130" height="40" rx="20" fill="${ctx.validAccentColor || ctx.validBrandColor}" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.2))" />
        <text x="65" y="25" font-family="sans-serif" font-size="13" font-weight="800" fill="${ctx.validBackgroundColor}" text-anchor="middle" letter-spacing="1.5px">LIMITED TIME</text>
      </g>`;
      }
    };

    this.registry['product_halo_ring'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Two concentric decorative rings behind a centered circle-masked product photo
        const cx = ctx.w / 2;
        const cy = ctx.h / 2;
        const outerR = Math.round(Math.min(ctx.w, ctx.h) * 0.38);
        const innerR = Math.round(Math.min(ctx.w, ctx.h) * 0.34);
        return `
      <!-- Product Showcase Halo Ring -->
      <g opacity="${ctx.resolveOpacity!(0.9)}">
        <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="${ctx.scaleStroke!(2)}" />
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1)}" stroke-dasharray="3 6" opacity="${ctx.resolveOpacity!(0.6)}" />
      </g>`;
      }
    };

    this.registry['transformation_arrow'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Bold directional arrow marking the seam between a before-photo and an
        // after-photo, with small "BEFORE"/"AFTER" labels either side. Grounded
        // in the "arrow" decoration tag seen across real mined before/after
        // templates. Defaults to a vertical seam (side-by-side photos); pass
        // offsetPercent near 50 to sit on a horizontal seam (stacked photos).
        const orientation = layer?.orientation === 'horizontal' ? 'horizontal' : 'vertical';
        const cx = ctx.w / 2;
        const cy = ctx.h / 2;
        if (orientation === 'horizontal') {
          return `
        <!-- Before/After Transformation Arrow (horizontal seam) -->
        <g transform="translate(${cx}, ${cy})">
          <circle cx="0" cy="0" r="26" fill="${ctx.validBackgroundColor}" filter="drop-shadow(0 3px 6px rgba(0,0,0,0.25))" />
          <path d="M -8 -6 L 8 0 L -8 6 Z" fill="${ctx.validBrandColor}" />
        </g>
        <text x="${ctx.constraints.safeX}" y="${cy - 34}" font-family="sans-serif" font-size="11" font-weight="800" letter-spacing="2px" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.85)}">BEFORE</text>
        <text x="${ctx.w - ctx.constraints.safeX}" y="${cy + 46}" text-anchor="end" font-family="sans-serif" font-size="11" font-weight="800" letter-spacing="2px" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.85)}">AFTER</text>`;
        }
        return `
      <!-- Before/After Transformation Arrow (vertical seam) -->
      <g transform="translate(${cx}, ${cy})">
        <circle cx="0" cy="0" r="26" fill="${ctx.validBackgroundColor}" filter="drop-shadow(0 3px 6px rgba(0,0,0,0.25))" />
        <path d="M -6 -8 L 0 8 L 6 -8 Z" fill="${ctx.validBrandColor}" transform="rotate(90)" />
      </g>
      <text x="${cx - 40}" y="${ctx.constraints.safeY + 6}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="800" letter-spacing="2px" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.85)}">BEFORE</text>
      <text x="${cx + 40}" y="${ctx.constraints.safeY + 6}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="800" letter-spacing="2px" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.85)}">AFTER</text>`;
      }
    };

    this.registry['star_rating_row'] = {
      category: 'effects', render: (ctx, layer) => {
        // Row of 5 filled stars, anchored near the layer's declared position.
        // Grounded in the "star_rating" decoration tag seen across real mined
        // testimonial templates.
        const anchor = layer?.anchor || 'top_center';
        const startX = anchor.includes('left') ? ctx.constraints.safeX : anchor.includes('right') ? ctx.w - ctx.constraints.safeX - 130 : ctx.w / 2 - 65;
        const y = anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - 30 : ctx.constraints.safeY + 10;
        const starPath = "M12 1 L15 8 L23 9 L17 15 L18 23 L12 19 L6 23 L7 15 L1 9 L9 8 Z";
        let stars = '';
        for (let i = 0; i < 5; i++) {
          stars += `<g transform="translate(${startX + i * 26}, ${y}) scale(1.1)"><path d="${starPath}" fill="${ctx.validAccentColor || ctx.validBrandColor}" /></g>`;
        }
        return `<!-- Testimonial Star Rating -->\n${stars}`;
      }
    };

    // Pre-existing gap (not introduced this session): ThemeEngine.getMoodDecorations('luxury_black')
    // has always requested a decoration named 'dark_scrim', but only 'dark_scrim_overlay' was ever
    // registered — and only in the legacy DECORATIONS registry (layout-renderers.ts), a different,
    // non-DSL rendering surface. universal_dynamic_deco's scene-graph loop only consults THIS
    // registry, so every DSL-based layout that lands on the 'luxury_black' mood has been silently
    // dropping its scrim (PrimitiveEngine.renderPrimitive() logs a warning and returns '', it does
    // not throw). Registering it here, matching the legacy version's exact visual (32% opacity
    // brand-color wash), makes 'luxury_black' actually do what it says for every family.
    this.registry['dark_scrim'] = {
      category: 'effects', render: (ctx) => `
      <!-- Luxury Black mood: full-canvas dark brand-color scrim. Toned down
           from 0.32 -> 0.15: at 0.32 it read as a heavy gray/black cover on
           warm/light-toned photos rather than a subtle mood shift. -->
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validBrandColor}" fill-opacity="${ctx.resolveOpacity!(0.15)}" />`
    };

    // Pre-existing gap: clinical_benefits_grid (composition-engine.ts) references this
    // component but it was never registered — rendered as a red "MISSING COMPONENT" box.
    // Small stat/metric callout chip, anchor-aware to match how the recipe uses it
    // (anchor: 'bottom_center', offsetPercent: 10).
    this.registry['metric_label'] = {
      category: 'geometry', render: (ctx, layer) => {
        const anchor = layer?.anchor || 'bottom_center';
        const offsetPercent = layer && (layer as IDSLDecorationLayer).offsetPercent != null ? (layer as IDSLDecorationLayer).offsetPercent : 10;
        const cx = ctx.w / 2;
        const y = anchor.includes('bottom')
          ? ctx.h - Math.round((offsetPercent / 100) * ctx.h) - 30
          : Math.round((offsetPercent / 100) * ctx.h);
        return `
      <!-- Clinical Benefits Grid: small metric/stat callout chip -->
      <g transform="translate(${cx - 90}, ${y})">
        <rect x="0" y="0" width="180" height="46" rx="23" fill="${ctx.validBrandColor}" filter="drop-shadow(0 6px 16px rgba(0,0,0,0.18))" />
        <text x="90" y="29" font-family="sans-serif" font-size="13" font-weight="800" fill="${ctx.validBackgroundColor}" text-anchor="middle" letter-spacing="2px">KEY BENEFIT</text>
      </g>`;
      }
    };

    // --- PHASE 5 MISSING PRIMITIVES (V2) ---
    const addDeco = (name: string, svg: (ctx: any, layer: any) => string) => {
      this.registry[name] = { category: 'illustration', render: svg };
    };

    addDeco('divider', (ctx) => `<line x1="${ctx.constraints.safeX}" y1="${ctx.h / 2}" x2="${ctx.w - ctx.constraints.safeX}" y2="${ctx.h / 2}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" opacity="${ctx.resolveOpacity!(0.5)}" />`);
    addDeco('arrow', (ctx) => `<g transform="translate(${ctx.w / 2}, ${ctx.h / 2})"><line x1="0" y1="0" x2="50" y2="0" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}"/><polygon points="50,0 40,-5 40,5" fill="${ctx.validBrandColor}"/></g>`);

    const vectorProxy = (ctx: any) => `<g transform="translate(${ctx.w / 2 - 25}, ${ctx.h / 2 - 25})"><rect width="50" height="50" rx="12" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.2)}"/><text x="25" y="35" text-anchor="middle" fill="${ctx.validBrandColor}" font-size="24">✦</text></g>`;

    ['butterfly', 'floral', 'heart', 'disco_ball', 'doodle', 'speech_bubble', 'paper_clip', 'collage elements'].forEach(name => {
      addDeco(name, vectorProxy);
    });

    this.registry['shadow'] = { category: 'effects', render: (ctx) => `<rect width="${ctx.w}" height="${ctx.h}" fill="#000000" opacity="${ctx.resolveOpacity!(0.2)}" filter="url(#premium_shadow)" />` };
    this.registry['star_rating'] = { category: 'illustration', render: (ctx) => `<text x="${ctx.constraints.safeX}" y="${ctx.h / 2}" fill="${ctx.validBrandColor}" font-size="24">★★★★★</text>` };
    this.registry['rounded_corners'] = { category: 'geometry', render: (ctx) => `<rect x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY}" width="${ctx.w - ctx.constraints.safeX * 2}" height="${ctx.h - ctx.constraints.safeY * 2}" rx="24" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />` };
    this.registry['geometric_shape'] = { category: 'geometry', render: (ctx) => `<rect width="200" height="200" rx="24" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />` };
    this.registry['color_block'] = { category: 'geometry', render: (ctx) => `<rect width="200" height="200" rx="24" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.1)}" />` };

    this.registry['polaroid'] = { category: 'geometry', render: (ctx) => `<g transform="translate(${ctx.w / 2 - 100}, ${ctx.h / 2 - 125})"><rect width="200" height="250" fill="#ffffff" filter="url(#premium_shadow)" /><rect x="10" y="10" width="180" height="180" fill="#000000" opacity="${ctx.resolveOpacity!(0.1)}" /></g>` };
    this.registry['paper_tape'] = { category: 'geometry', render: (ctx) => `<g transform="translate(${ctx.w / 2 - 50}, 50) rotate(-2)"><rect width="100" height="25" fill="#fdfdfd" opacity="${ctx.resolveOpacity!(0.85)}" filter="url(#premium_shadow)" /></g>` };

    this.registry['dotted border'] = { category: 'geometry', render: (ctx) => `<rect x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY}" width="${ctx.w - ctx.constraints.safeX * 2}" height="${ctx.h - ctx.constraints.safeY * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" stroke-dasharray="4 4" />` };
    this.registry['dotted_border'] = this.registry['dotted border'];

    this.registry['circular_frame'] = {
      category: 'geometry', render: (ctx) => {
        const color = ctx.colorHierarchy ? ctx.colorHierarchy.accent : ctx.validBrandColor;
        return `<circle cx="${ctx.w / 2}" cy="${ctx.h / 2}" r="200" fill="none" stroke="${color}" stroke-width="${ctx.scaleStroke!(3)}" />`;
      }
    };
    this.registry['circle'] = this.registry['circular_frame'];

    this.registry['film_strip'] = { category: 'illustration', render: (ctx) => `<g transform="translate(${ctx.constraints.safeX}, ${ctx.h / 2 - 50})"><rect width="200" height="100" fill="#111111" /><circle cx="15" cy="15" r="5" fill="#ffffff" /><circle cx="45" cy="15" r="5" fill="#ffffff" /><circle cx="15" cy="85" r="5" fill="#ffffff" /><circle cx="45" cy="85" r="5" fill="#ffffff" /></g>` };

    const backgroundFiller = (ctx: any) => `<rect width="${ctx.w}" height="${ctx.h}" fill="${ctx.validSecondaryColor}" opacity="${ctx.resolveOpacity!(0.05)}" />`;
    this.registry['geometric_background'] = { category: 'layout', render: backgroundFiller };
    this.registry['striped_background'] = { category: 'layout', render: backgroundFiller };
    this.registry['background_image'] = { category: 'layout', render: backgroundFiller };
    this.registry['quotation_marks'] = { category: 'effects', render: (ctx) => `<text x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY + 80}" font-family="serif" font-size="120px" font-weight="900" fill="${ctx.validBrandColor}" opacity="${ctx.resolveOpacity!(0.15)}">"</text>` };
    // ─── TRANSFORMATION FAMILY PRIMITIVES ───

    this.registry['timeline_track'] = {
      category: 'layout', render: (ctx, layer) => {
        // Horizontal progress line with 4 evenly-spaced milestone dots, the
        // last one filled solid to read as "current/final step". Grounded in
        // the "arrow"/"geometric_badge" step-guide decorations seen across real
        // mined transformation templates (journey/process narrative, not a
        // dual-photo split like before_after).
        const offsetPercent = layer && (layer as IDSLDecorationLayer).offsetPercent != null ? (layer as IDSLDecorationLayer).offsetPercent : 50;
        const y = Math.round((offsetPercent / 100) * ctx.h);
        const x1 = ctx.constraints.safeX;
        const x2 = ctx.w - ctx.constraints.safeX;
        const steps = 4;
        let dots = '';
        for (let i = 0; i < steps; i++) {
          const cx = x1 + ((x2 - x1) / (steps - 1)) * i;
          const isLast = i === steps - 1;
          dots += `<circle cx="${cx}" cy="${y}" r="${isLast ? 8 : 5}" fill="${isLast ? ctx.validBrandColor : ctx.validBackgroundColor}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(2)}" />`;
        }
        return `
      <!-- Transformation Family Timeline Track -->
      <g>
        <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ctx.validBrandColor}" stroke-width="${ctx.scaleStroke!(1.5)}" opacity="${ctx.resolveOpacity!(0.35)}" />
        ${dots}
      </g>`;
      }
    };

    // ─── POLAROID FAMILY PRIMITIVES ───

    this.registry['polaroid_frame'] = {
      category: 'layout', render: (ctx, layer) => {
        // Real white polaroid card border with a taller bottom caption strip,
        // drawn as an SVG overlay on top of the plain-rectangle photo (the
        // 'polaroid' image mask has no real pixel-clip implementation in the
        // Sharp compositor — see universal_dynamic_base in layout-renderers.ts
        // — so this decoration is what actually produces the polaroid look,
        // same faking technique editorial_tape/floating_frame already use).
        // Grounded in the "polaroid frame" decoration tag seen across real
        // mined polaroid templates, with a slight rotation for the candid,
        // overlapping-snapshot feel those samples describe.
        const anchor = layer?.anchor || 'center';
        const rotation = layer && (layer as IDSLDecorationLayer).offsetPercent != null ? ((layer as IDSLDecorationLayer).offsetPercent % 7) - 3 : -2;
        const frameW = Math.round(ctx.w * 0.72);
        const frameH = Math.round(ctx.h * 0.68);
        const borderSide = Math.round(frameW * 0.045);
        const borderBottom = Math.round(frameH * 0.14);
        const cx = anchor.includes('left') ? ctx.constraints.safeX + frameW / 2 : anchor.includes('right') ? ctx.w - ctx.constraints.safeX - frameW / 2 : ctx.w / 2;
        const cy = anchor.includes('top') ? ctx.constraints.safeY + frameH / 2 : anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - frameH / 2 : ctx.h / 2;
        const totalH = frameH + borderBottom;
        // 4 non-overlapping border strips (transparent center so the photo underneath shows through)
        return `
      <!-- Polaroid Frame -->
      <g transform="translate(${cx - frameW / 2}, ${cy - frameH / 2}) rotate(${rotation}, ${frameW / 2}, ${frameH / 2})" filter="drop-shadow(0 10px 24px rgba(0,0,0,0.25))">
        <rect x="0" y="0" width="${frameW}" height="${borderSide}" fill="${ctx.validBackgroundColor}" />
        <rect x="0" y="${totalH - borderBottom}" width="${frameW}" height="${borderBottom}" fill="${ctx.validBackgroundColor}" />
        <rect x="0" y="0" width="${borderSide}" height="${totalH}" fill="${ctx.validBackgroundColor}" />
        <rect x="${frameW - borderSide}" y="0" width="${borderSide}" height="${totalH}" fill="${ctx.validBackgroundColor}" />
        <rect x="${borderSide}" y="${borderSide}" width="${frameW - borderSide * 2}" height="${frameH - borderSide}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="${ctx.scaleStroke!(1)}" />
      </g>`;
      }
    };

    // ─── NOTIFICATION CARD FAMILY PRIMITIVES ───

    this.registry['notification_icon_badge'] = {
      category: 'geometry', render: (ctx, layer) => {
        // Small circular app-notification-style icon chip with a simple bell
        // glyph. Grounded in the "icon_badge" decoration tag from the real
        // mined notification_card sample, whose own designRules explicitly
        // call for "icon badge at the top center of the card for emphasis".
        const anchor = layer?.anchor || 'top_center';
        const r = 34;
        const cx = anchor.includes('left') ? ctx.constraints.safeX + r : anchor.includes('right') ? ctx.w - ctx.constraints.safeX - r : ctx.w / 2;
        const cy = anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - r : ctx.constraints.safeY + r;
        return `
      <!-- Notification Card Icon Badge -->
      <g transform="translate(${cx}, ${cy})">
        <circle cx="0" cy="0" r="${r}" fill="${ctx.validBrandColor}" filter="drop-shadow(0 6px 14px rgba(0,0,0,0.2))" />
        <path d="M -10 4 Q -10 -10 0 -12 Q 10 -10 10 4 L 13 9 L -13 9 Z" fill="${ctx.validBackgroundColor}" />
        <circle cx="0" cy="13" r="3" fill="${ctx.validBackgroundColor}" />
      </g>`;
      }
    };

    // ─── ANNOUNCEMENT FAMILY PRIMITIVES ───

    this.registry['announcement_banner_ribbon'] = {
      category: 'layout', render: (ctx, layer) => {
        // Solid brand-color banner ribbon with a small megaphone glyph.
        // Grounded in the "megaphone graphic" decoration tag from the real
        // mined announcement sample (the only real sample for this family) —
        // its own designRules call for "a graphic element related to
        // communication to reinforce the announcement theme".
        const anchor = layer?.anchor || 'top_center';
        const w = Math.round(ctx.w * 0.9);
        const h = 64;
        const x = (ctx.w - w) / 2;
        const y = anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - h : ctx.constraints.safeY;
        return `
      <!-- Announcement Banner Ribbon -->
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${w}" height="${h}" fill="${ctx.validBrandColor}" filter="drop-shadow(0 6px 16px rgba(0,0,0,0.18))" />
        <g transform="translate(28, ${h / 2})">
          <path d="M -14 -8 L -2 -8 L 10 -16 L 10 16 L -2 8 L -14 8 Z" fill="${ctx.validBackgroundColor}" />
          <path d="M -14 -8 L -14 8 L -20 8 L -20 -8 Z" fill="${ctx.validBackgroundColor}" />
        </g>
        <text x="${w / 2 + 14}" y="${h / 2 + 5}" font-family="sans-serif" font-size="14" font-weight="800" fill="${ctx.validBackgroundColor}" text-anchor="middle" letter-spacing="2px">ANNOUNCEMENT</text>
      </g>`;
      }
    };
  }


  /**
   * Helper to extract the primary hex/rgb color from an SVG string for contrast analysis
   */
  private extractDominantColor(svg: string, fallback: string): string {
    const match = svg.match(/fill="([^"]+)"/);
    if (match && match[1] !== 'none' && match[1].startsWith('#')) {
      return match[1];
    }
    const strokeMatch = svg.match(/stroke="([^"]+)"/);
    if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1].startsWith('#')) {
      return strokeMatch[1];
    }
    return fallback;
  }

  /**
   * Simple relative luminance calculation for contrast scoring
   */
  private getLuminance(hexColor: string): number {
    if (!hexColor || !hexColor.startsWith('#')) return 128; // Fallback mid-tone
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
    if (hex.length !== 6) return 128;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  public renderPrimitive(name: string, ctx: PrimitiveContext, layer?: IDSLDecorationLayer | IDSLTextLayer): string {
    const primitive = this.registry[name];
    if (!primitive) {
      console.warn(`[PrimitiveEngine] Warning: Primitive '${name}' not found.`);
      return '';
    }

    // --- Inject Responsive Helpers ---
    ctx.scaleStroke = (basePx: number) => {
      let scaled = basePx * (ctx.w / 1080); // Base target is 1080px wide
      if (ctx.tokens && ctx.tokens.baseStrokeWeight !== undefined) {
        scaled = scaled * (ctx.tokens.baseStrokeWeight / 1.5); // 1.5 is default
      }
      return parseFloat(scaled.toFixed(2));
    };

    ctx.resolveOpacity = (baseOpacity: number) => {
      let finalOpacity = baseOpacity;
      if (ctx.tokens && ctx.tokens.opacityMultiplier !== undefined) {
        finalOpacity = baseOpacity * ctx.tokens.opacityMultiplier;
      }
      return Math.min(1.0, Math.max(0.02, parseFloat(finalOpacity.toFixed(2))));
    };

    ctx.isSafePlacement = (candidateBox: BoundingBox): boolean => {
      if (!ctx.canonicalGeometry) return true; // graceful fallback
      const zones = ctx.canonicalGeometry.protectedZones;
      const halo = Math.round(Math.min(ctx.w, ctx.h) * 0.03);
      for (const zone of zones) {
        const expanded = {
          x: zone.x - halo, y: zone.y - halo,
          width: zone.width + halo * 2, height: zone.height + halo * 2,
        };
        if (candidateBox.x < expanded.x + expanded.width &&
            candidateBox.x + candidateBox.width > expanded.x &&
            candidateBox.y < expanded.y + expanded.height &&
            candidateBox.y + candidateBox.height > expanded.y) {
          return false;
        }
      }
      return true;
    };

    ctx.resolveShadow = (intent: 'soft' | 'medium' | 'deep') => {
      const depth = ctx.tokens?.shadowDepth || intent;
      if (depth === 'none') return '';
      if (depth === 'soft') return 'filter="drop-shadow(0 2px 6px rgba(0,0,0,0.1))"';
      if (depth === 'medium') return 'filter="drop-shadow(0 6px 16px rgba(0,0,0,0.18))"';
      if (depth === 'deep') return 'filter="drop-shadow(0 15px 30px rgba(0,0,0,0.25))"';
      return '';
    };
    
    let rawSvg = primitive.render(ctx, layer);
    if (!rawSvg.trim()) return '';

    // ==========================================
    // PRIMITIVE COLLISION ENGINE
    // ==========================================
    
    // Attempt to extract position to check collision
    // Look for data-bounds="x,y,w,h" OR translate(x, y) OR cx="x" cy="y"
    let bounds: BoundingBox | null = null;
    const boundsMatch = rawSvg.match(/data-bounds="([^"]+)"/);
    if (boundsMatch) {
       const parts = boundsMatch[1].split(',').map(Number);
       if (parts.length === 4) bounds = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    } else {
       const translateMatch = rawSvg.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
       if (translateMatch) {
         bounds = { x: parseFloat(translateMatch[1]), y: parseFloat(translateMatch[2]), width: 100, height: 100 };
       }
    }

    if (bounds && ctx.isSafePlacement && !ctx.isSafePlacement(bounds)) {
       // 1. Attempt minor Relocation (shift down or away)
       const relocatedBounds = { ...bounds, y: bounds.y + (ctx.h * 0.1) }; // Push it down slightly
       if (ctx.isSafePlacement(relocatedBounds)) {
           rawSvg = `<g transform="translate(0, ${ctx.h * 0.1})">${rawSvg}</g>`;
           console.warn(`[PrimitiveEngine] Collision detected for '${name}' - relocated Y`);
       } else {
           // 2. Minor Scale Down (0.8 instead of crushing 0.5)
           const shrunkBounds = { ...bounds, width: bounds.width * 0.8, height: bounds.height * 0.8 };
           if (ctx.isSafePlacement(shrunkBounds)) {
               rawSvg = `<g transform="scale(0.8) translate(${bounds.x * 0.2}, ${bounds.y * 0.2})">${rawSvg}</g>`;
               console.warn(`[PrimitiveEngine] Collision detected for '${name}' - scaled to 80%`);
           } else {
               // 3. Disable
               console.warn(`[PrimitiveEngine] Hard collision detected for '${name}' - Silently disabling primitive.`);
               return ''; // Disable primitive completely
           }
       }
    }

    // ==========================================
    // PRIMITIVE VISIBILITY ENGINE
    // ==========================================
    
    const dominantColor = this.extractDominantColor(rawSvg, ctx.validBrandColor);
    const bgColor = ctx.validBackgroundColor; 
    
    const primLum = this.getLuminance(dominantColor);
    const bgLum = this.getLuminance(bgColor);
    const contrast = Math.abs(primLum - bgLum);
    
    let visibility = 'HIGH';
    let autoAdjusted = 'NO';
    let adjustments: string[] = [];
    
    if (contrast < 45) {
       visibility = 'LOW';
       autoAdjusted = 'YES';
       
       // Inject adaptive drop-shadow to separate primitive from similar background
       const shadowOpacity = bgLum > 180 ? '0.2' : '0.4';
       rawSvg = `<g filter="drop-shadow(0 4px 12px rgba(0,0,0,${shadowOpacity}))">${rawSvg}</g>`;
       adjustments.push('Shadow: enabled (strong)');
       
    } else if (contrast < 80) {
       visibility = 'MEDIUM';
       autoAdjusted = 'YES';
       
       // Inject soft shadow for subtle separation
       const shadowOpacity = bgLum > 180 ? '0.1' : '0.2';
       rawSvg = `<g filter="drop-shadow(0 2px 6px rgba(0,0,0,${shadowOpacity}))">${rawSvg}</g>`;
       adjustments.push('Shadow: enabled (soft)');
    }

    console.log(`[PrimitiveEngine] Primitive: ${name} | Contrast: ${contrast.toFixed(1)} | Visibility: ${visibility} | Auto adjusted: ${autoAdjusted} ${adjustments.length ? '| ' + adjustments.join(', ') : ''}`);

    return rawSvg;
  }
}

