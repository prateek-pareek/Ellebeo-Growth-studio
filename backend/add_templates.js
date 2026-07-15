const fs = require('fs');
const file = './src/ai/config/layout-templates.config.json';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));

const bases = ['bordered_default', 'full_bleed', 'full_bleed_duotone', 'solid_canvas_full', 'solid_canvas_bordered', 'asymmetric_offset', 'split_before_after', 'arch_mask', 'polaroid_stack', 'circle_crop', 'torn_paper_edge'];
const texts = ['passepartout_bottom', 'randomized_overlay', 'left_negative_space', 'poster_high_contrast', 'duotone_high_contrast', 'quote_centered_middle', 'rotated_note_card', 'giant_word_plus_caption', 'stacked_headline_tag', 'speech_bubble', 'testimonial_avatar_card', 'editorial_date_stamp', 'technician_signature_card', 'translucent_left_panel', 'side_panel_label', 'editorial_magazine_cover', 'minimalist_corner_text'];
const decos = ['monogram_watermark', 'translucent_pane', 'ticket_notches_dashed', 'arch_outline', 'film_sprockets', 'gallery_hairline', 'side_photo_embed', 'dark_scrim_overlay', 'brand_scrim_heavy', 'masking_tape_corners', 'gold_foil_accents', null];

let added = 0;
// We will explicitly create curated aesthetic combinations instead of purely random to guarantee high quality.
const combinations = [
  // Polaroid aesthetic
  { b: 'polaroid_stack', t: 'rotated_note_card', d: 'masking_tape_corners' },
  { b: 'polaroid_stack', t: 'passepartout_bottom', d: null },
  { b: 'polaroid_stack', t: 'minimalist_corner_text', d: null },
  { b: 'polaroid_stack', t: 'editorial_magazine_cover', d: null },
  // Circle crop aesthetic
  { b: 'circle_crop', t: 'giant_word_plus_caption', d: null },
  { b: 'circle_crop', t: 'minimalist_corner_text', d: 'gold_foil_accents' },
  { b: 'circle_crop', t: 'left_negative_space', d: 'monogram_watermark' },
  // Torn paper aesthetic
  { b: 'torn_paper_edge', t: 'speech_bubble', d: null },
  { b: 'torn_paper_edge', t: 'poster_high_contrast', d: null },
  { b: 'torn_paper_edge', t: 'testimonial_avatar_card', d: 'masking_tape_corners' },
  // Magazine covers
  { b: 'full_bleed', t: 'editorial_magazine_cover', d: 'gold_foil_accents' },
  { b: 'full_bleed', t: 'editorial_magazine_cover', d: 'brand_scrim_heavy' },
  { b: 'bordered_default', t: 'editorial_magazine_cover', d: 'gallery_hairline' },
  { b: 'full_bleed_duotone', t: 'editorial_magazine_cover', d: null },
  // Minimalist corners
  { b: 'full_bleed', t: 'minimalist_corner_text', d: null },
  { b: 'solid_canvas_full', t: 'minimalist_corner_text', d: null },
  { b: 'arch_mask', t: 'minimalist_corner_text', d: 'arch_outline' },
  { b: 'asymmetric_offset', t: 'minimalist_corner_text', d: 'monogram_watermark' },
];

for (let i = 0; i < 70; i++) {
  const b = bases[Math.floor(Math.random()*bases.length)];
  const t = texts[Math.floor(Math.random()*texts.length)];
  const d = decos[Math.floor(Math.random()*decos.length)];
  combinations.push({ b, t, d });
}

combinations.forEach(combo => {
  const name = 'auto_' + combo.b.replace('_default', '').substring(0, 10) + '_' + combo.t.substring(0, 10) + (combo.d ? '_' + combo.d.substring(0, 10) : '');
  if (!config[name] && name.length <= 50) {
    config[name] = {
      base: combo.b,
      textTemplate: combo.t,
      decoration: combo.d,
      showWatermark: Math.random() > 0.5,
      showFooter: Math.random() > 0.5
    };
    added++;
  }
});

fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log('Added ' + added + ' templates');
