import { IDSLDecorationLayer, IDSLTextLayer } from '../interfaces';
import { LayoutConstraints } from './layout-engine';

export type PrimitiveCategory = 'geometry' | 'layout' | 'effects' | 'typography';

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
        <g opacity="0.3" stroke="${ctx.validBrandColor}" stroke-width="1" stroke-dasharray="4 4">
          <line x1="${ctx.constraints.safeX}" y1="0" x2="${ctx.constraints.safeX}" y2="${ctx.h}" />
          <line x1="${ctx.w - ctx.constraints.safeX}" y1="0" x2="${ctx.w - ctx.constraints.safeX}" y2="${ctx.h}" />
          <line x1="0" y1="${ctx.constraints.safeY}" x2="${ctx.w}" y2="${ctx.constraints.safeY}" />
          <line x1="0" y1="${ctx.h - ctx.constraints.safeY}" x2="${ctx.w}" y2="${ctx.h - ctx.constraints.safeY}" />
        </g>
        <g fill="${ctx.validBrandColor}" font-family="monospace" font-size="10" opacity="0.5">
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
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.5" opacity="0.15" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#blueprintGrid)" />
        `;
      }
    };

    this.registry['museum_border'] = {
      category: 'geometry',
      render: (ctx) => `
        <rect x="${ctx.constraints.safeX - 20}" y="${ctx.constraints.safeY - 20}" width="${ctx.w - (ctx.constraints.safeX - 20) * 2}" height="${ctx.h - (ctx.constraints.safeY - 20) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.4" />
        <rect x="${ctx.constraints.safeX - 26}" y="${ctx.constraints.safeY - 26}" width="${ctx.w - (ctx.constraints.safeX - 26) * 2}" height="${ctx.h - (ctx.constraints.safeY - 26) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" opacity="0.8" />
      `
    };

    this.registry['thin_divider'] = {
      category: 'geometry',
      render: (ctx) => `
        <line x1="${ctx.w / 2 - 80}" y1="${ctx.h / 2 + 120}" x2="${ctx.w / 2 + 80}" y2="${ctx.h / 2 + 120}" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.4" />
      `
    };

    // Migrated divider with behavior wiring
    this.registry['divider'] = {
      category: 'geometry',
      render: (ctx) => {
        const weight = ctx.behavior?.dividerStrokeWeight || 2;
        const padding = ctx.behavior?.dividerPadding || 60;
        return `
          <line x1="${ctx.w / 2 - padding}" y1="${ctx.h / 2 + 100}" x2="${ctx.w / 2 + padding}" y2="${ctx.h / 2 + 100}" stroke="${ctx.validBrandColor}" stroke-width="${weight}" opacity="0.5" />
          <circle cx="${ctx.w / 2}" cy="${ctx.h / 2 + 100}" r="${weight * 2}" fill="${ctx.validBackgroundColor}" stroke="${ctx.validBrandColor}" stroke-width="${weight}" />
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
          <circle cx="0" cy="0" r="55" fill="${ctx.validSecondaryColor}" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-dasharray="2 4" />
          <path id="badge-curve" d="M -40,0 A 40,40 0 1,1 40,0 A 40,40 0 1,1 -40,0" fill="none" />
          <!-- SVG <textPath> can be added in typography-engine, but we draw a small icon or text here -->
          <circle cx="0" cy="0" r="40" fill="${ctx.validBackgroundColor}" fill-opacity="0.9" />
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
            <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000000" flood-opacity="0.15"/>
          </filter>
        </defs>
        <rect x="40" y="${ctx.h - 320}" width="${ctx.w - 80}" height="280" rx="16" fill="${ctx.validSecondaryColor}" fill-opacity="0.85" stroke="${ctx.validBrandColor}" stroke-width="1" filter="url(#premium_shadow)" />
      `
    };

    this.registry['editorial_title'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Minimal accent rule for editorial title (no opaque background box) -->
        <g transform="translate(${ctx.constraints.safeX}, ${ctx.h - 280})">
          <line x1="0" y1="0" x2="${ctx.w - (ctx.constraints.safeX * 2)}" y2="0" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.3" />
        </g>
      `
    };

    this.registry['chapter_tabs'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 80}, ${ctx.constraints.safeY})">
          <rect x="0" y="0" width="80" height="40" fill="${ctx.validBrandColor}" />
          <rect x="10" y="45" width="70" height="40" fill="${ctx.validBrandColor}" opacity="0.6" />
          <rect x="20" y="90" width="60" height="40" fill="${ctx.validBrandColor}" opacity="0.3" />
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
          <rect x="0" y="0" width="160" height="30" rx="15" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.5" />
        </g>
        `;
      }
    };

    this.registry['corner_badge'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 180}, 40)">
          <path d="M 0 0 L 140 0 L 140 140 Z" fill="${ctx.validBrandColor}" opacity="0.9" />
          <polygon points="140,0 140,140 0,0" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="2" opacity="0.5" />
        </g>
      `
    };

    this.registry['sticker'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w / 2 - 80}, ${ctx.h - 200}) rotate(-12)">
          <circle cx="80" cy="80" r="70" fill="${ctx.validSecondaryColor}" filter="url(#premium_shadow)" />
          <circle cx="80" cy="80" r="60" fill="none" stroke="${ctx.validBrandColor}" stroke-dasharray="4 4" stroke-width="2" />
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
        <text x="${ctx.w / 2}" y="${ctx.h / 2 + 150}" font-family="Georgia, serif" font-size="600" font-weight="900" fill="${ctx.validBrandColor}" opacity="0.04" text-anchor="middle">
          01
        </text>
      `
    };

    // Migrated metric panel
    this.registry['metric_panel'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(60, ${ctx.h - 220})">
          <rect x="0" y="0" width="${ctx.w - 120}" height="140" rx="20" fill="${ctx.validSecondaryColor}" fill-opacity="0.85" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-opacity="0.4" filter="drop-shadow(0 20px 40px rgba(0,0,0,0.2))" />
          <rect x="20" y="20" width="80" height="100" rx="10" fill="${ctx.validBrandColor}" fill-opacity="0.1" />
        </g>
      `
    };

    this.registry['status_chip'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w / 2 - 80}, 60)">
          <rect x="0" y="0" width="160" height="36" rx="18" fill="${ctx.validBrandColor}" opacity="0.9" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.15))" />
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
          <circle cx="0" cy="0" r="45" fill="${ctx.validBrandColor}" opacity="0.9" filter="drop-shadow(0 8px 12px rgba(0,0,0,0.3))" />
          <circle cx="0" cy="0" r="38" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="1.5" opacity="0.6" />
          <path d="M -15,-15 L 15,15 M -15,15 L 15,-15" stroke="${ctx.validSecondaryColor}" stroke-width="2" opacity="0.8" />
        </g>
      `
    };

    this.registry['film_sprockets'] = {
      category: 'effects',
      render: (ctx) => `
        <g fill="${ctx.validBackgroundColor}" opacity="0.7">
          ${Array.from({ length: 20 }).map((_, i) => `<rect x="15" y="${i * 60 + 20}" width="12" height="30" rx="2" />`).join('')}
          ${Array.from({ length: 20 }).map((_, i) => `<rect x="${ctx.w - 27}" y="${i * 60 + 20}" width="12" height="30" rx="2" />`).join('')}
        </g>
      `
    };

    // --- Phase 3C: Editorial Breather Textures ---
    this.registry['noise_texture'] = {
      category: 'effects',
      render: (ctx) => {
        const intensity = ctx.behavior?.noiseIntensity || 0.15;
        return `
        <defs>
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
          </filter>
        </defs>
        <!-- Toned down from 0.15 to 0.05 so it doesn't create fog -->
        <rect width="100%" height="100%" opacity="0.05" style="mix-blend-mode: multiply;" filter="url(#noiseFilter)" />
        `;
      }
    };

    this.registry['paper_texture'] = {
      category: 'effects',
      render: (ctx) => {
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
        <!-- Toned down from 0.4 to 0.15 to prevent washing out the image/colors -->
        <rect width="100%" height="100%" opacity="0.15" style="mix-blend-mode: ${blendMode};" filter="url(#paperFilter)" />
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
          <rect x="0" y="0" width="160" height="35" fill="${ctx.validSecondaryColor}" opacity="0.9" filter="drop-shadow(1px 2px 3px rgba(0,0,0,0.1))" />
          <path d="M 0,0 L -3,8 L 1,17 L -2,25 L 0,35" fill="${ctx.validSecondaryColor}" />
          <path d="M 160,0 L 163,8 L 159,17 L 162,25 L 160,35" fill="${ctx.validSecondaryColor}" />
        </g>
      `
    };

    this.registry['editorial_badge'] = {
      category: 'layout',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 150}, ${ctx.constraints.safeY + 20})">
          <!-- Generic editorial badge / starburst -->
          <circle cx="60" cy="60" r="50" fill="${ctx.validBrandColor}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))" />
          <path d="M 60 5 L 68 25 L 88 22 L 80 40 L 100 52 L 85 68 L 98 85 L 78 80 L 70 100 L 55 85 L 35 98 L 38 78 L 18 70 L 35 55 L 20 38 L 40 40 L 45 20 Z" fill="${ctx.validBrandColor}" opacity="0.9" />
          <circle cx="60" cy="60" r="42" fill="none" stroke="${ctx.validSecondaryColor}" stroke-dasharray="2 4" stroke-width="1.5" />
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
            <line x1="0" y1="0" x2="0" y2="10" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.15" />
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
          <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.08 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film_grain)" style="mix-blend-mode: multiply;" pointer-events="none" />
      `
    };

    this.registry['editorial_tape'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Semi-transparent masking tape holding up the image -->
        <g transform="translate(${ctx.w / 2}, ${ctx.constraints.safeY - 10}) rotate(-3)">
          <rect x="-60" y="-15" width="120" height="30" fill="${ctx.validBackgroundColor}" opacity="0.9" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))" />
          <rect x="-60" y="-15" width="120" height="30" fill="${ctx.validBrandColor}" opacity="0.1" />
          <!-- Jagged edges -->
          <path d="M-60 -15 L-57 -5 L-60 5 L-58 15 M60 -15 L57 -5 L60 5 L58 15" stroke="${ctx.validSecondaryColor}" stroke-width="2" fill="none" opacity="0.5" />
        </g>
      `
    };

    this.registry['asymmetric_block'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Massive block of solid color pushing tension to the edge -->
        <rect x="0" y="${ctx.h - 300}" width="${ctx.w * 0.85}" height="300" fill="${ctx.validSecondaryColor}" opacity="0.95" />
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
          <rect x="0" y="0" width="480" height="320" rx="14" fill="none" stroke="${ctx.validBrandColor}" stroke-width="12" />
          <!-- Inner screen border accent -->
          <rect x="10" y="10" width="460" height="276" rx="4" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
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
          <rect x="0" y="0" width="380" height="520" rx="26" fill="none" stroke="${ctx.validBrandColor}" stroke-width="18" />
          <!-- Inner screen accent border -->
          <rect x="14" y="14" width="352" height="492" rx="14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
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
          <rect x="0" y="0" width="${ctx.w - 120}" height="200" rx="24" fill="${ctx.validSecondaryColor}" fill-opacity="0.8" stroke="${ctx.validBrandColor}" stroke-width="1.5" style="backdrop-filter: blur(10px);" filter="drop-shadow(0 20px 40px rgba(0,0,0,0.15))" />
        </g>
      `
    };

    this.registry['organic_blob'] = {
      category: 'effects',
      render: (ctx) => `
        <g transform="translate(${ctx.w - 150}, ${ctx.h - 150}) scale(1.5)">
          <path d="M45.7,-76.1C58.9,-69.3,69.1,-55.4,75.4,-40.4C81.7,-25.4,84.1,-9.3,81.1,5.6C78.1,20.5,69.7,34.2,59.3,45.4C48.9,56.6,36.5,65.3,22.4,70.9C8.3,76.5,-7.5,79,-22.1,75.2C-36.7,71.4,-50.1,61.3,-60.7,49.2C-71.3,37.1,-79.1,23,-81.4,8.1C-83.7,-6.8,-80.5,-22.5,-72.7,-35.3C-64.9,-48.1,-52.5,-58,-39.3,-64.5C-26.1,-71,-13,-74.1,1.4,-76.3C15.8,-78.5,31.6,-79.8,45.7,-76.1Z" fill="${ctx.validBrandColor}" opacity="0.85" />
        </g>
      `
    };

    this.registry['swipe_button_arrow'] = {
      category: 'geometry',
      render: (ctx) => `
        <!-- Circular SWIPE -> Button -->
        <g transform="translate(${ctx.w - 180}, ${ctx.h - 95})">
          <text x="0" y="22" font-family="sans-serif" font-size="11" font-weight="600" letter-spacing="3px" fill="${ctx.validBrandColor}" opacity="0.75">SWIPE</text>
          <circle cx="75" cy="16" r="22" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" />
          <path d="M 67 16 L 83 16 M 77 10 L 83 16 L 77 22" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      `
    };

    this.registry['floating_frame'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Generic floating frame (polaroid, glass card, etc) -->
        <g transform="translate(${ctx.constraints.safeX + 20}, ${ctx.constraints.safeY + 20})">
          <rect x="0" y="0" width="${ctx.w / 2}" height="${ctx.h / 1.5}" fill="${ctx.validBackgroundColor}" filter="drop-shadow(0 15px 30px rgba(0,0,0,0.2))" />
          <rect x="20" y="20" width="${ctx.w / 2 - 40}" height="${ctx.h / 1.5 - 100}" fill="rgba(0,0,0,0.05)" />
        </g>
      `
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
            <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#000000" flood-opacity="0.25"/>
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
            <feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#000000" flood-opacity="0.20"/>
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
          <text x="0" y="0" opacity="0.5">REF NO.</text>
          <text x="0" y="15" font-weight="bold">#${Math.floor(Math.random() * 9000) + 1000}-A</text>
          <line x1="0" y1="30" x2="120" y2="30" stroke="${ctx.validBrandColor}" stroke-width="0.5" opacity="0.3" />
          <text x="0" y="50" opacity="0.5">DIMENSIONS</text>
          <text x="0" y="65">${ctx.w}x${ctx.h}px</text>
        </g>
      `
    };

    this.registry['specimen_border'] = {
      category: 'geometry',
      render: (ctx) => `
        <!-- Ultra-thin scientific specimen border -->
        <rect x="${ctx.constraints.safeX - 4}" y="${ctx.constraints.safeY - 4}" width="${ctx.w - (ctx.constraints.safeX - 4) * 2}" height="${ctx.h - (ctx.constraints.safeY - 4) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.5" opacity="0.4" />
        <circle cx="${ctx.constraints.safeX - 4}" cy="${ctx.constraints.safeY - 4}" r="2" fill="${ctx.validBrandColor}" opacity="0.6" />
        <circle cx="${ctx.w - ctx.constraints.safeX + 4}" cy="${ctx.constraints.safeY - 4}" r="2" fill="${ctx.validBrandColor}" opacity="0.6" />
        <circle cx="${ctx.constraints.safeX - 4}" cy="${ctx.h - ctx.constraints.safeY + 4}" r="2" fill="${ctx.validBrandColor}" opacity="0.6" />
        <circle cx="${ctx.w - ctx.constraints.safeX + 4}" cy="${ctx.h - ctx.constraints.safeY + 4}" r="2" fill="${ctx.validBrandColor}" opacity="0.6" />
      `
    };

    this.registry['swipe_indicator'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Carousel Swipe Indicator -->
        <g transform="translate(${ctx.w - ctx.constraints.safeX - 60}, ${ctx.h - ctx.constraints.safeY - 20})">
          <circle cx="0" cy="0" r="25" fill="${ctx.validBrandColor}" opacity="0.9" />
          <path d="M 5,-8 L 13,0 L 5,8" fill="none" stroke="${ctx.validBackgroundColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="${ctx.validBackgroundColor}" stroke-width="2" stroke-linecap="round" />
        </g>
      `
    };
    
    this.registry['dominant_headline'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- High Contrast Dominant Headline Accent Line -->
        <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY + 80})">
          <line x1="0" y1="0" x2="60" y2="0" stroke="${ctx.validBrandColor}" stroke-width="3" opacity="0.8" />
        </g>
      `
    };

    this.registry['off_center_crop'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Framing Corner Registration Ticks -->
        <g stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.35" fill="none">
          <path d="M ${ctx.constraints.safeX},${ctx.constraints.safeY + 20} L ${ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.constraints.safeX + 20},${ctx.constraints.safeY}" />
          <path d="M ${ctx.w - ctx.constraints.safeX - 20},${ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.constraints.safeY + 20}" />
        </g>
      `
    };

    this.registry['die_cut_mask'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- Soft Die-Cut Window Frame Outline -->
        <rect x="${ctx.constraints.safeX + 10}" y="${ctx.constraints.safeY + 10}" width="${ctx.w - (ctx.constraints.safeX + 10) * 2}" height="${ctx.h - (ctx.constraints.safeY + 10) * 2}" rx="12" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-dasharray="6 6" opacity="0.4" />
      `
    };

    // ==========================================
    // PHASE 2: DYNAMIC DECORATOR PRIMITIVES
    // ==========================================
    this.registry['flower'] = { category: 'effects', render: (ctx) => `
      <!-- Minimal Botanical Line Art (Brand Accent) -->
      <g transform="translate(${ctx.constraints.safeX + 20}, ${ctx.constraints.safeY + 20}) scale(0.6)" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="2" fill="none" opacity="0.8">
        <path d="M50 50 C 30 10, 10 30, 50 50 C 90 30, 70 10, 50 50 C 70 90, 90 70, 50 50 C 10 70, 30 90, 50 50 Z" />
        <circle cx="50" cy="50" r="5" fill="${ctx.validBrandColor}" />
      </g>`
    };

    this.registry['tape'] = { category: 'layout', render: (ctx) => `
      <!-- Masking Tape Overlay -->
      <g transform="translate(${ctx.w / 2}, 30) rotate(-2)">
        <rect x="-80" y="0" width="160" height="35" fill="${ctx.validBackgroundColor}" opacity="0.85" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
        <path d="M-80 0 Q-75 17 -80 35 M80 0 Q75 17 80 35" stroke="${ctx.validSecondaryColor}" stroke-width="1.5" fill="none" opacity="0.3" />
      </g>`
    };

    this.registry['doodle'] = { category: 'effects', render: (ctx) => `
      <!-- Hand-drawn abstract swoosh -->
      <path d="M ${ctx.constraints.safeX + 40} ${ctx.h - ctx.constraints.safeY - 60} Q ${ctx.w / 2} ${ctx.h - ctx.constraints.safeY - 20}, ${ctx.w - ctx.constraints.safeX - 40} ${ctx.h - ctx.constraints.safeY - 80}" fill="none" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="3" stroke-linecap="round" opacity="0.7" />`
    };

    this.registry['sparkle'] = { category: 'effects', render: (ctx) => `
      <!-- Premium Sparkle/Star Accent -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 60}, ${ctx.constraints.safeY + 40}) scale(0.8)" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="0.9">
        <path d="M20 0 Q20 20 40 20 Q20 20 20 40 Q20 20 0 20 Q20 20 20 0 Z" />
        <path d="M50 30 Q50 40 60 40 Q50 40 50 50 Q50 40 40 40 Q50 40 50 30 Z" transform="scale(0.6) translate(20, -30)" />
      </g>`
    };

    this.registry['thin_border'] = { category: 'geometry', render: (ctx) => `
      <!-- Museum Matte Thin Border -->
      <rect x="${ctx.constraints.safeX + 10}" y="${ctx.constraints.safeY + 10}" width="${ctx.w - (ctx.constraints.safeX + 10) * 2}" height="${ctx.h - (ctx.constraints.safeY + 10) * 2}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.6" />`
    };

    this.registry['geometric_badge'] = { category: 'geometry', render: (ctx) => `
      <!-- Geometric Circle Badge -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 80}, ${ctx.h - ctx.constraints.safeY - 80})">
        <circle cx="0" cy="0" r="45" fill="${ctx.validSecondaryColor}" opacity="0.9" />
        <circle cx="0" cy="0" r="38" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.5" stroke-dasharray="2 4" />
        <text x="0" y="5" font-family="sans-serif" font-size="10" font-weight="bold" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="2px">EST. 2026</text>
      </g>`
    };

    this.registry['metadata_label'] = { category: 'geometry', render: (ctx) => `
      <!-- Minimal Metadata Label (Top Right) -->
      <g transform="translate(${ctx.w - ctx.constraints.safeX - 120}, ${ctx.constraints.safeY + 20})">
        <rect x="0" y="0" width="120" height="24" fill="${ctx.validBrandColor}" opacity="0.1" />
        <text x="60" y="16" font-family="monospace" font-size="10" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="1px">FIG. 01 // VSN</text>
      </g>`
    };

    this.registry['quote_marks'] = { category: 'effects', render: (ctx) => `
      <!-- Oversized Editorial Quote Marks -->
      <text x="${ctx.constraints.safeX + 20}" y="${ctx.constraints.safeY + 80}" font-family="Georgia, serif" font-size="120" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="0.2">"</text>`
    };

    this.registry['minimal_grid'] = { category: 'geometry', render: (ctx) => `
      <!-- Architectural Minimal Grid Overlay -->
      <g opacity="0.1" stroke="${ctx.validBrandColor}" stroke-width="1">
        <line x1="${ctx.w * 0.33}" y1="0" x2="${ctx.w * 0.33}" y2="${ctx.h}" />
        <line x1="${ctx.w * 0.66}" y1="0" x2="${ctx.w * 0.66}" y2="${ctx.h}" />
        <line x1="0" y1="${ctx.h * 0.33}" x2="${ctx.w}" y2="${ctx.h * 0.33}" />
        <line x1="0" y1="${ctx.h * 0.66}" x2="${ctx.w}" y2="${ctx.h * 0.66}" />
      </g>`
    };

    this.registry['geometric_shape'] = { category: 'geometry', render: (ctx, layer) => {
      // Renders a sleek solid geometric block for quotes or offset accents
      const size = 160;
      const x = layer && layer.anchor && layer.anchor.includes('right') ? ctx.w - ctx.constraints.safeX - size : ctx.constraints.safeX;
      const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - size : ctx.constraints.safeY;
      return `
      <!-- Solid Geometric Accent Shape -->
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="0.1" />
      <rect x="${x + 20}" y="${y + 20}" width="${size - 40}" height="${size - 40}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" opacity="0.2" />`;
    }};

    // ==========================================
    // PHASE 5: PREMIUM TEXT-ONLY DECORATORS
    // ==========================================
    
    this.registry['meteor_shower'] = { category: 'effects', render: (ctx) => {
      return `
      <!-- Premium Meteor Shower Accent -->
      <g stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="1.5" stroke-linecap="round" opacity="0.4">
        <line x1="${ctx.w - 100}" y1="-50" x2="${ctx.w - 300}" y2="150" />
        <line x1="${ctx.w - 50}" y1="20" x2="${ctx.w - 200}" y2="170" opacity="0.2" />
        <line x1="${ctx.w - 180}" y1="-20" x2="${ctx.w - 350}" y2="150" opacity="0.6" stroke-width="2" />
        <!-- Glowing head -->
        <circle cx="${ctx.w - 300}" cy="150" r="2" fill="${ctx.validAccentColor || ctx.validBrandColor}" />
        <circle cx="${ctx.w - 200}" cy="170" r="1.5" fill="${ctx.validAccentColor || ctx.validBrandColor}" />
        <circle cx="${ctx.w - 350}" cy="150" r="3" fill="${ctx.validAccentColor || ctx.validBrandColor}" />
      </g>`;
    }};

    this.registry['elegant_line_art'] = { category: 'geometry', render: (ctx) => {
      return `
      <!-- Elegant Wavy Line Art -->
      <path d="M -50 ${ctx.h * 0.8} C ${ctx.w * 0.2} ${ctx.h * 0.9}, ${ctx.w * 0.3} ${ctx.h * 0.6}, ${ctx.w * 0.5} ${ctx.h * 0.7} S ${ctx.w * 0.8} ${ctx.h * 0.9}, ${ctx.w + 50} ${ctx.h * 0.85}" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.3" />
      <path d="M -50 ${ctx.h * 0.82} C ${ctx.w * 0.25} ${ctx.h * 0.95}, ${ctx.w * 0.35} ${ctx.h * 0.65}, ${ctx.w * 0.55} ${ctx.h * 0.75} S ${ctx.w * 0.85} ${ctx.h * 0.95}, ${ctx.w + 50} ${ctx.h * 0.87}" fill="none" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="0.5" opacity="0.5" />`;
    }};

    this.registry['premium_stars'] = { category: 'effects', render: (ctx) => {
      return `
      <!-- Premium Four-Point Stars -->
      <g fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="0.8">
        <path d="M ${ctx.constraints.safeX + 50} ${ctx.constraints.safeY + 80} Q ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 80} ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 70} Q ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 80} ${ctx.constraints.safeX + 70} ${ctx.constraints.safeY + 80} Q ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 80} ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 90} Q ${ctx.constraints.safeX + 60} ${ctx.constraints.safeY + 80} ${ctx.constraints.safeX + 50} ${ctx.constraints.safeY + 80} Z" />
        <path d="M ${ctx.w - ctx.constraints.safeX - 80} ${ctx.h * 0.6} Q ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6} ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6 - 15} Q ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6} ${ctx.w - ctx.constraints.safeX - 50} ${ctx.h * 0.6} Q ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6} ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6 + 15} Q ${ctx.w - ctx.constraints.safeX - 65} ${ctx.h * 0.6} ${ctx.w - ctx.constraints.safeX - 80} ${ctx.h * 0.6} Z" opacity="0.5" transform="scale(0.6) translate(${ctx.w * 0.4}, ${ctx.h * 0.4})" />
      </g>`;
    }};

    this.registry['abstract_rings'] = { category: 'geometry', render: (ctx) => {
      return `
      <!-- Abstract Concentric Rings -->
      <g transform="translate(${ctx.w}, 0)" opacity="0.15">
        <circle cx="0" cy="0" r="200" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1" />
        <circle cx="0" cy="0" r="280" fill="none" stroke="${ctx.validBrandColor}" stroke-width="1.5" stroke-dasharray="4 8" />
        <circle cx="0" cy="0" r="360" fill="none" stroke="${ctx.validBrandColor}" stroke-width="0.5" />
      </g>`;
    }};

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
        const choices = ['vertical_label', 'running_header', 'metadata_label'];
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return this.registry[choice] ? this.registry[choice].render(ctx, layer) : '';
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
          <circle cx="40" cy="40" r="38" fill="none" stroke="${ctx.validBrandColor}" stroke-width="2" stroke-dasharray="1 3" opacity="0.4" />
          <text x="40" y="44" font-family="monospace" font-size="12" font-weight="bold" fill="${ctx.validBrandColor}" text-anchor="middle" opacity="0.6">NO. 1</text>
        </g>
      `
    };

    this.registry['fold_line'] = {
      category: 'geometry',
      render: (ctx, layer) => `
        <!-- Creased Fold Line -->
        <g opacity="0.3">
          <line x1="0" y1="${ctx.h / 2}" x2="${ctx.w}" y2="${ctx.h / 2}" stroke="#fff" stroke-width="2" filter="blur(1px)" />
          <line x1="0" y1="${ctx.h / 2 + 1}" x2="${ctx.w}" y2="${ctx.h / 2 + 1}" stroke="#000" stroke-width="1" opacity="0.2" />
        </g>
      `
    };

    this.registry['corner_frame'] = {
      category: 'geometry',
      render: (ctx, layer) => `
        <!-- Minimal Corner Framing Brackets -->
        <g stroke="${ctx.validBrandColor}" stroke-width="2" fill="none" opacity="0.7">
          <path d="M ${ctx.constraints.safeX + 20},${ctx.constraints.safeY} L ${ctx.constraints.safeX},${ctx.constraints.safeY} L ${ctx.constraints.safeX},${ctx.constraints.safeY + 20}" />
          <path d="M ${ctx.w - ctx.constraints.safeX - 20},${ctx.h - ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.h - ctx.constraints.safeY} L ${ctx.w - ctx.constraints.safeX},${ctx.h - ctx.constraints.safeY - 20}" />
        </g>
      `
    };

    // CANVA-STYLE PREMIUM PRIMITIVES (Phase 3 Additions)
    
    this.registry['starburst_badge'] = { category: 'geometry', render: (ctx, layer) => {
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
      <g opacity="0.95">
        <path d="${starPath}" fill="${ctx.validAccentColor || ctx.validBrandColor}" stroke="${ctx.validSecondaryColor}" stroke-width="3" filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.25))" />
        <circle cx="${cx}" cy="${cy}" r="${innerR - 6}" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="1" stroke-dasharray="2 4" />
      </g>`;
    }};

    this.registry['text_pill'] = { category: 'layout', render: (ctx, layer) => {
      // Renders a simple pill shape behind CTA text
      const y = layer && layer.anchor && layer.anchor.includes('top') ? ctx.constraints.safeY + 20 : ctx.h - ctx.constraints.safeY - 60;
      return `
      <!-- Typography Pill Background -->
      <rect x="${ctx.w / 2 - 120}" y="${y}" width="240" height="46" rx="23" fill="${ctx.validAccentColor || ctx.validBrandColor}" opacity="0.9" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))" />`;
    }};

    this.registry['3d_emoji'] = { category: 'effects', render: (ctx, layer) => {
      // AI sometimes requests "3d_emoji". We map this to the starburst so it renders beautifully.
      return this.registry['starburst_badge'].render(ctx, layer);
    }};

    // --- TYPOGRAPHY PRIMITIVES ---
    
    this.registry['ghost_headline'] = { category: 'typography', render: (ctx, layer) => {
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
      <text x="-40" y="${anchorY}" font-family="sans-serif" font-size="800" font-weight="900" fill="${ctx.validBrandColor}" opacity="0.04" text-anchor="start" letter-spacing="-10px" transform="scale(1, 1.2)">
        ${text.toUpperCase()}
      </text>`;
    }};

    this.registry['outline_headline'] = { category: 'typography', render: (ctx, layer) => {
      const text = (ctx as any).structuredText?.headline || "ELEGANCE";
      const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY - 40 : ctx.constraints.safeY + 120;
      return `
      <!-- Outline Headline -->
      <text x="${ctx.constraints.safeX}" y="${y}" font-family="sans-serif" font-size="140" font-weight="800" fill="none" stroke="${ctx.validBrandColor}" stroke-width="3" text-anchor="start">
        ${text.toUpperCase()}
      </text>`;
    }};

    this.registry['vertical_label'] = { category: 'typography', render: (ctx, layer) => {
      const text = (ctx as any).rawName || "EDITORIAL";
      return `
      <!-- Vertical Label -->
      <g transform="translate(${ctx.constraints.safeX + 20}, ${ctx.h - ctx.constraints.safeY}) rotate(-90)">
        <text x="0" y="0" font-family="sans-serif" font-size="14" font-weight="600" fill="${ctx.validBrandColor}" letter-spacing="4px" opacity="0.6">${text.toUpperCase()}</text>
      </g>`;
    }};

    this.registry['running_header'] = { category: 'typography', render: (ctx) => {
      const text = (ctx as any).rawName || "EDITORIAL";
      return `
      <!-- Running Header -->
      <text x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY - 10}" font-family="sans-serif" font-size="12" font-weight="500" fill="${ctx.validBrandColor}" letter-spacing="2px" opacity="0.5">
        ${text.toUpperCase()} // VOL. 1
      </text>`;
    }};

    this.registry['pull_quote'] = { category: 'typography', render: (ctx) => {
      const text = (ctx as any).overlayText || "Design is intelligence made visible.";
      return `
      <!-- Pull Quote -->
      <g transform="translate(${ctx.w / 2}, ${ctx.h / 2})">
        <text x="0" y="-40" font-family="Georgia, serif" font-size="160" fill="${ctx.validBrandColor}" opacity="0.1" text-anchor="middle">"</text>
        <text x="0" y="0" font-family="Georgia, serif" font-size="32" font-style="italic" fill="${ctx.validBrandColor}" text-anchor="middle">
          ${text}
        </text>
      </g>`;
    }};

    // --- SHAPE PRIMITIVES ---

    this.registry['glass_card'] = { category: 'geometry', render: (ctx, layer) => {
      const w = 400;
      const h = 250;
      const x = ctx.constraints.safeX;
      const y = ctx.h - ctx.constraints.safeY - h;
      return `
      <!-- Glassmorphism Card -->
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="${ctx.validSecondaryColor}" opacity="0.6" filter="blur(8px)" />
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="none" stroke="${ctx.validSecondaryColor}" stroke-width="1.5" opacity="0.8" />
      </g>`;
    }};

    this.registry['organic_blob'] = { category: 'geometry', render: (ctx, layer) => {
      return `
      <!-- Organic Blob -->
      <path d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.3,-40.4C85.5,-25.5,91.7,-9.6,90.4,5.7C89,20.9,80.1,35.6,69.5,47.9C58.8,60.2,46.5,70.1,32.3,76.5C18.2,82.9,2.2,85.8,-13.2,83.5C-28.7,81.1,-43.5,73.5,-55.6,62.8C-67.6,52.1,-76.8,38.3,-82.4,22.8C-88,7.3,-89.9,-9.8,-85.1,-24.8C-80.4,-39.8,-69,-52.7,-55.2,-59.5C-41.4,-66.3,-25.2,-67.1,-9.5,-64.1C6.1,-61,22.3,-54.2,32.5,-60.7Z" transform="translate(${ctx.w * 0.8}, ${ctx.h * 0.2}) scale(4)" fill="${ctx.validBrandColor}" opacity="0.05" />`;
    }};

    this.registry['torn_paper'] = { category: 'geometry', render: (ctx) => {
      return `
      <!-- Torn Paper Edge (Top) -->
      <path d="M0,0 L${ctx.w},0 L${ctx.w},40 Q${ctx.w * 0.75},10 ${ctx.w * 0.5},45 T0,30 Z" fill="${ctx.validSecondaryColor}" />`;
    }};

    this.registry['pill_tag'] = { category: 'geometry', render: (ctx, layer) => {
      const text = "NEW IN";
      return `
      <!-- Pill Tag -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="80" height="28" rx="14" fill="${ctx.validBrandColor}" />
        <text x="40" y="18" font-family="sans-serif" font-size="10" font-weight="bold" fill="${ctx.validSecondaryColor}" text-anchor="middle" letter-spacing="1px">${text}</text>
      </g>`;
    }};

    // --- LINE PRIMITIVES ---

    this.registry['double_divider'] = { category: 'geometry', render: (ctx, layer) => {
      const y = layer && layer.anchor && layer.anchor.includes('bottom') ? ctx.h - ctx.constraints.safeY : ctx.constraints.safeY;
      return `
      <!-- Double Divider -->
      <g transform="translate(${ctx.constraints.safeX}, ${y})">
        <line x1="0" y1="0" x2="100" y2="0" stroke="${ctx.validBrandColor}" stroke-width="2" />
        <line x1="0" y1="6" x2="100" y2="6" stroke="${ctx.validBrandColor}" stroke-width="0.5" />
      </g>`;
    }};

    this.registry['margin_rule'] = { category: 'geometry', render: (ctx) => {
      return `
      <!-- Margin Rule -->
      <line x1="${ctx.constraints.safeX / 2}" y1="${ctx.constraints.safeY}" x2="${ctx.constraints.safeX / 2}" y2="${ctx.h - ctx.constraints.safeY}" stroke="${ctx.validBrandColor}" stroke-width="1" opacity="0.3" />`;
    }};

    this.registry['accent_rule'] = { category: 'geometry', render: (ctx, layer) => {
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
      <!-- Accent Rule -->
      <line x1="${x}" y1="${y}" x2="${x + 60}" y2="${y}" stroke="${ctx.validAccentColor || ctx.validBrandColor}" stroke-width="4" />`;
    }};

    // --- TEXTURE PRIMITIVES ---

    this.registry['noise_texture'] = { category: 'effects', render: (ctx) => {
      return `
      <!-- Subtle Noise Texture -->
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.08 0" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" style="pointer-events:none;" filter="url(#noiseFilter)" />`;
    }};

    this.registry['paper_texture'] = { category: 'effects', render: (ctx) => {
      return `
      <!-- Paper Texture -->
      <filter id="paperFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" result="noise" />
        <feDiffuseLighting in="noise" lighting-color="#fff" surfaceScale="2">
          <feDistantLight azimuth="45" elevation="60" />
        </feDiffuseLighting>
        <feBlend mode="multiply" in="SourceGraphic" in2="noise" />
      </filter>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="${ctx.validSecondaryColor}" filter="url(#paperFilter)" opacity="0.4" style="mix-blend-mode: multiply;" />`;
    }};

    this.registry['light_leak'] = { category: 'effects', render: (ctx) => {
      return `
      <!-- Light Leak Gradient -->
      <defs>
        <radialGradient id="lightLeakGrad" cx="0%" cy="0%" r="70%">
          <stop offset="0%" stop-color="${ctx.validAccentColor || '#ff9900'}" stop-opacity="0.25" />
          <stop offset="100%" stop-color="${ctx.validAccentColor || '#ff9900'}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="${ctx.w}" height="${ctx.h}" fill="url(#lightLeakGrad)" style="mix-blend-mode: screen;" />`;
    }};

    // ==========================================
    // PHASE 3 & 4: CLINICAL AND EDUCATIONAL PRIMITIVES
    // ==========================================
    this.registry['clinical_callout_box'] = { category: 'geometry', render: (ctx, layer) => {
      return `
      <!-- Clinical Callout Box with Data / Analysis Style -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.h / 2})">
        <rect x="0" y="0" width="320" height="180" fill="${ctx.validSecondaryColor}" opacity="0.95" stroke="${ctx.validBrandColor}" stroke-width="2" />
        <line x1="0" y1="40" x2="320" y2="40" stroke="${ctx.validBrandColor}" stroke-width="1" />
        <text x="20" y="25" font-family="monospace" font-size="12" font-weight="bold" fill="${ctx.validBrandColor}">ANALYSIS RESULTS</text>
        <!-- Mock Data Bars -->
        <rect x="20" y="70" width="280" height="8" fill="${ctx.validBrandColor}" opacity="0.1" />
        <rect x="20" y="70" width="210" height="8" fill="${ctx.validBrandColor}" />
        
        <rect x="20" y="100" width="280" height="8" fill="${ctx.validBrandColor}" opacity="0.1" />
        <rect x="20" y="100" width="160" height="8" fill="${ctx.validBrandColor}" />
        
        <rect x="20" y="130" width="280" height="8" fill="${ctx.validBrandColor}" opacity="0.1" />
        <rect x="20" y="130" width="250" height="8" fill="${ctx.validBrandColor}" />
      </g>`;
    }};

    this.registry['step_badge'] = { category: 'geometry', render: (ctx, layer) => {
      return `
      <!-- Clinical Step Badge (e.g., Step 1, Step 2) -->
      <g transform="translate(${ctx.constraints.safeX}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="120" height="36" rx="18" fill="${ctx.validBrandColor}" />
        <text x="60" y="22" font-family="sans-serif" font-size="12" font-weight="bold" fill="${ctx.validSecondaryColor}" text-anchor="middle" letter-spacing="2px">STEP 01</text>
      </g>`;
    }};

    this.registry['large_numeral_bullet'] = { category: 'geometry', render: (ctx, layer) => {
      return `
      <!-- Educational Large Numeral Background -->
      <text x="${ctx.constraints.safeX}" y="${ctx.constraints.safeY + 180}" font-family="Georgia, serif" font-size="250" font-weight="900" fill="${ctx.validBrandColor}" opacity="0.08" text-anchor="start">
        1.
      </text>`;
    }};

    this.registry['myth_fact_badge'] = { category: 'geometry', render: (ctx, layer) => {
      return `
      <!-- Educational Myth vs Fact Floating Badge -->
      <g transform="translate(${ctx.w / 2 - 100}, ${ctx.constraints.safeY})">
        <rect x="0" y="0" width="200" height="50" rx="25" fill="${ctx.validSecondaryColor}" stroke="${ctx.validBrandColor}" stroke-width="2" filter="drop-shadow(0 10px 20px rgba(0,0,0,0.1))" />
        <text x="100" y="30" font-family="sans-serif" font-size="14" font-weight="800" fill="${ctx.validBrandColor}" text-anchor="middle" letter-spacing="3px">MYTH VS FACT</text>
      </g>`;
    }};

    this.registry['quote_mark_accent'] = { category: 'effects', render: (ctx, layer) => {
      return `
      <!-- Centered Premium Quote Mark Background -->
      <text x="${ctx.w / 2}" y="${ctx.h / 2 + 100}" font-family="Georgia, serif" font-size="300" font-style="italic" fill="${ctx.validBrandColor}" opacity="0.08" text-anchor="middle">
        "
      </text>`;
    }};
  }


  public renderPrimitive(name: string, ctx: PrimitiveContext, layer?: IDSLDecorationLayer | IDSLTextLayer): string {
    const primitive = this.registry[name];
    if (!primitive) {
      console.warn(`[PrimitiveEngine] Warning: Primitive '${name}' not found.`);
      return '';
    }
    return primitive.render(ctx, layer);
  }
}
