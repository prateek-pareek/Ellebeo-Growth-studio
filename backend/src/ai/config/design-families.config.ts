import { IDesignFamily } from '../services/template-engine/interfaces';

export const DESIGN_FAMILIES: Record<string, IDesignFamily> = {
  scrapbook_memory: {
    id: 'scrapbook_memory',
    allowedBackgrounds: ['pastel_paper', 'watercolor', 'kraft_paper', 'solid_brand'],
    allowedMasks: ['polaroid', 'torn_paper', 'film_strip', 'rectangle'],
    allowedDecorations: ['flower', 'tape', 'doodle', 'sparkle'],
    typographySystems: ['handwritten', 'romantic', 'script']
  },
  editorial_magazine: {
    id: 'editorial_magazine',
    allowedBackgrounds: ['solid_brand', 'linen_beige', 'travertine'],
    allowedMasks: ['rectangle', 'full_bleed'],
    allowedDecorations: ['thin_border', 'editorial_badge', 'metadata_label'],
    typographySystems: ['luxury_serif', 'editorial', 'bold_sans']
  },
  text_palette_minimal: {
    id: 'text_palette_minimal',
    allowedBackgrounds: ['solid_brand', 'film_grain', 'soft_gradient', 'css_mesh'],
    allowedMasks: [], // Text-only slides don't have image masks
    allowedDecorations: ['thin_divider', 'quote_marks', 'minimal_grid'],
    typographySystems: ['massive_heading', 'elegant_quote', 'clean_minimal']
  },
  playful_social: {
    id: 'playful_social',
    allowedBackgrounds: ['soft_gradient', 'solid_brand', 'dot_grid'],
    allowedMasks: ['circle', 'arch', 'soft_rectangle'],
    allowedDecorations: ['speech_bubble', 'sticker', '3d_emoji'],
    typographySystems: ['bubbly', 'bold_sans', 'marker']
  },
  luxury_minimal: {
    id: 'luxury_minimal',
    allowedBackgrounds: ['marble', 'silk', 'dark_charcoal'],
    allowedMasks: ['rectangle', 'die_cut', 'arch'],
    allowedDecorations: ['gold_accents', 'thin_border', 'seal'],
    typographySystems: ['luxury_serif', 'elegant_script']
  }
};
