import { IDSLDecorationLayer, IDSLTextLayer } from '../interfaces';
import { LayoutConstraints } from './layout-engine';

export type PrimitiveCategory = 'geometry' | 'layout' | 'effects';

export interface PrimitiveContext {
  w: number;
  h: number;
  validBrandColor: string;
  validSecondaryColor: string;
  validBackgroundColor: string;
  constraints: LayoutConstraints;
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

    // Migrated divider
    this.registry['divider'] = {
      category: 'geometry',
      render: (ctx) => `
        <line x1="${ctx.w / 2 - 60}" y1="${ctx.h / 2 + 100}" x2="${ctx.w / 2 + 60}" y2="${ctx.h / 2 + 100}" stroke="${ctx.validBrandColor}" stroke-width="2" opacity="0.5" />
        <circle cx="${ctx.w / 2}" cy="${ctx.h / 2 + 100}" r="4" fill="${ctx.validBackgroundColor}" stroke="${ctx.validBrandColor}" stroke-width="2" />
      `
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
    // INSTAGRAM COURSE & CLINIC CANVA TEMPLATES
    // ==========================================
    this.registry['desktop_monitor_mockup'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- iMac Desktop Monitor Frame (bezel-only: screen area is transparent so client photo shows through) -->
        <g transform="translate(40, ${ctx.h * 0.28})">
          <!-- Outer monitor border ring only — fill none so the photo underneath is visible through the screen -->
          <rect x="0" y="0" width="480" height="320" rx="14" fill="none" stroke="#CBD5E1" stroke-width="12" />
          <!-- Inner screen border accent -->
          <rect x="10" y="10" width="460" height="276" rx="4" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
          <!-- Bottom chin of the monitor (below the screen) -->
          <rect x="0" y="296" width="480" height="24" rx="0" fill="#D1D9E6" />
          <rect x="0" y="308" width="480" height="12" rx="0" fill="#CBD5E1" />
          <!-- Stand -->
          <path d="M 200 320 L 280 320 L 295 375 L 185 375 Z" fill="#CBD5E1" />
          <rect x="170" y="372" width="140" height="6" rx="3" fill="#94A3B8" />
        </g>
      `
    };

    this.registry['tablet_device_mockup'] = {
      category: 'layout',
      render: (ctx) => `
        <!-- iPad / Tablet Device Frame (bezel-only: screen area transparent so client photo shows through) -->
        <g transform="translate(${ctx.w / 2 - 190}, ${ctx.h * 0.25})">
          <!-- Outer tablet border ring only — fill none so the photo underneath is visible -->
          <rect x="0" y="0" width="380" height="520" rx="26" fill="none" stroke="#334155" stroke-width="18" />
          <!-- Inner screen accent border -->
          <rect x="14" y="14" width="352" height="492" rx="14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
          <!-- Camera dot -->
          <circle cx="190" cy="8" r="4" fill="#475569" />
          <!-- Home bar -->
          <rect x="140" y="512" width="100" height="4" rx="2" fill="#64748B" />
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
