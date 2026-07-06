// ============================================================================
// visual-style-library.ts
// Source of truth for all 10 brand visual style rule sets.
// Derived from the Mood Board Descriptions design document.
// Used by prompt-builder to inject concrete visual direction into every
// generation — replaces the generic "aesthetic direction" fallback.
// ============================================================================

export type VisualStyleId =
  | 'quiet_luxury'
  | 'editorial_beauty'
  | 'clinical_minimalist'
  | 'warm_wellness'
  | 'high_fashion'
  | 'polished_commercial'
  | 'soft_feminine'
  | 'bold_campaign'
  | 'natural_organic'
  | 'contemporary_cool';

export interface VisualStyleRule {
  title: string;
  tagline: string;
  colour: string;
  lighting: string;
  material: string;
  composition: string;
  photography: string;
  alwaysPresent: string;
  never: string;
  toneOfVoice: string;
}

export const VISUAL_STYLE_LIBRARY: Record<VisualStyleId, VisualStyleRule> = {
  quiet_luxury: {
    title: 'Quiet Luxury',
    tagline: "I don't need to convince you. I already know what I'm worth.",
    colour: 'travertine, bone, oatmeal, warm greige, soft taupe; brushed brass as the only metallic, used sparingly',
    lighting: 'soft directional daylight, long calm shadows; never flat or shadowless',
    material: 'cashmere, washed linen, travertine, aged leather, brushed brass, hand-thrown stone; nothing synthetic or glossy',
    composition: 'generous negative space, one hero object per frame, calm asymmetry',
    photography: 'still life and interiors favoured over posed people; if people appear, candid and unbranded',
    alwaysPresent: 'negative space, matte finish, one considered object',
    never: 'gold logos, high shine, slogans, clutter, exclamation points, obvious luxury signifiers',
    toneOfVoice: 'understated, precise, few adjectives, confident without needing to convince',
  },

  editorial_beauty: {
    title: 'Editorial Beauty',
    tagline: 'My work belongs on a page, not just on a client.',
    colour: 'high contrast, honest skin tones, true blacks, one saturated accent (true red or cobalt) used deliberately not decoratively',
    lighting: 'crisp beauty light, controlled speculars, dewy rather than matte highlights',
    material: 'skin texture shown honestly (pores, freckles, real texture), gloss, wet finishes',
    composition: 'confident close crops that cut the frame intentionally, macro detail on eyes, lips, texture',
    photography: 'extreme close-up, intelligent cropping; never full-body or lifestyle context',
    alwaysPresent: 'one true saturated colour moment, real skin texture, sharp intentional cropping',
    never: 'soft focus, pastel wash, busy backgrounds, generic smiling stock, over-retouched skin',
    toneOfVoice: 'confident, technical when useful, opinionated about colour and technique',
  },

  clinical_minimalist: {
    title: 'Clinical Minimalist',
    tagline: 'Trust the process, trust the evidence, trust me.',
    colour: 'cool whites, soft blues, chrome, glass-clear; no warmth introduced anywhere',
    lighting: 'even, bright, single clean shadow or shadowless entirely',
    material: 'glass, brushed steel, frosted acrylic, water, serum, laboratory glassware',
    composition: 'ordered, centred or grid-like, restrained, symmetrical where possible',
    photography: 'product and texture led, minimal human presence; where people appear, cropped and impersonal',
    alwaysPresent: 'a single clean light source, glass or chrome surface, uncluttered negative space',
    never: 'warmth, clutter, decorative flourish, mood lighting, film grain',
    toneOfVoice: 'precise, evidence-led, sparing with adjectives, confident in claims backed by fact',
  },

  warm_wellness: {
    title: 'Warm Wellness',
    tagline: 'Come here to be looked after, not processed.',
    colour: 'amber, honey, sand, terracotta, oat; always warm',
    lighting: 'golden hour, sun through linen, warm backlight, visible steam',
    material: 'linen, raw timber, clay vessels, oils, dried botanicals, towelling',
    composition: 'relaxed, sensory, room to breathe, ritual objects arranged with intention rather than styled perfectly',
    photography: 'hands, skin and gesture over posed portraiture; candid over composed',
    alwaysPresent: 'warm directional light, at least one tactile natural material, a sense of unhurried time',
    never: 'cool tones, clinical edges, hard flash, busy graphics, urgency-driven copy',
    toneOfVoice: 'gentle, sensory, permission-giving ("slow down," "this is your time")',
  },

  high_fashion: {
    title: 'High Fashion',
    tagline: 'This is couture-level work, and it is not for everyone.',
    colour: 'deep blacks, oxblood, dramatic darks, one bold saturated note used sparingly',
    lighting: 'hard directional light, deep shadow, sculptural chiaroscuro contrast',
    material: 'structured fabric, silk, taffeta, couture volume, sculptural collars and sleeves',
    composition: 'sculptural, dramatic angles, runway authority, strong negative space around the subject',
    photography: 'studio-controlled, formal posing; nothing candid or casual',
    alwaysPresent: 'hard shadow, structured silhouette, deliberate darkness',
    never: 'soft, casual, friendly, bright commercial cheer, anything that reads warmly approachable',
    toneOfVoice: 'authoritative, spare, no explaining or softening',
  },

  polished_commercial: {
    title: 'Polished Commercial',
    tagline: 'This is the good life, and you\'re welcome in it.',
    colour: 'bright cream, white, soft beige, champagne; always light and airy',
    lighting: 'bright, even, glossy, genuine sunlit interiors rather than studio-flat light',
    material: 'marble, glossy product finishes, white interiors, fresh florals',
    composition: 'clean aspirational lifestyle staging, product as hero, billboard-level polish',
    photography: 'lifestyle scenes with genuine warmth alongside glossy product beauty shots',
    alwaysPresent: 'bright even light, a genuine human moment somewhere in the mix, glossy but believable retouching',
    never: 'gritty, moody, dark, raw, low-fidelity or amateur-looking imagery',
    toneOfVoice: 'warm, aspirational, benefit-led, approachable premium',
  },

  soft_feminine: {
    title: 'Soft Feminine',
    tagline: 'This moment deserves to feel tender.',
    colour: 'powder pink, lilac, blush, cream, soft sage',
    lighting: 'gentle diffused light, soft glow; never hard or directional',
    material: 'tulle, silk, ribbon, florals, pearl, lace',
    composition: 'romantic, airy, delicate layering; nothing sparse or severe',
    photography: 'soft portraiture, florals and fabric detail, gentle gesture over posed authority',
    alwaysPresent: 'soft light, at least one delicate material (tulle, silk, florals), a gentle colour palette',
    never: 'hard light, dark tones, graphic edges, loud colour blocking',
    toneOfVoice: 'tender, warm, personal, gentle enthusiasm rather than bold claims',
  },

  bold_campaign: {
    title: 'Bold Campaign',
    tagline: 'Look here, right now, and don\'t look away.',
    colour: 'primary colour blocking — true red, cobalt, yellow, black; no muted tones anywhere',
    lighting: 'hard punchy light, clean deliberate shadow',
    material: 'flat colour fields, graphic negative space; subject isolated against single flat colour',
    composition: 'graphic colour fields, single hero subject, deliberate tension and asymmetry, space reserved for type-led impact',
    photography: 'studio-controlled, high contrast, subject isolated against a single flat colour field',
    alwaysPresent: 'a single dominant colour field, hard shadow, one clear hero subject per frame',
    never: 'muted, soft, busy, decorative, timid colour choices',
    toneOfVoice: 'punchy, short, declarative, confident to the point of provocative',
  },

  natural_organic: {
    title: 'Natural / Organic',
    tagline: 'Nothing here is performing, it\'s just honest.',
    colour: 'clay, oat, stone, undyed linen, timber brown',
    lighting: 'natural daylight, soft shadow; never artificial or harsh',
    material: 'linen, raw wood, clay, ceramic, woven jute, stone; all shown with visible imperfection',
    composition: 'grounded still life, relaxed imperfection, tactile arrangement rather than styled perfection',
    photography: 'still life led, natural materials in natural light; minimal to no posed people',
    alwaysPresent: 'visible natural imperfection (grain, weave, hand-thrown irregularity), natural light',
    never: 'gloss, chrome, synthetic surfaces, neon, heavy retouching',
    toneOfVoice: 'honest, unpolished, sensory, values-led',
  },

  contemporary_cool: {
    title: 'Contemporary Cool',
    tagline: "I'm not trying to be liked, I'm trying to be right.",
    colour: 'muted greys, cool neutrals, slate, washed blue, concrete tones',
    lighting: 'cool overcast or hard flash, architectural shadow',
    material: 'concrete, raw fabric, tailoring; shadow itself treated as a material',
    composition: 'cropped angles, architectural tension, off-centre framing, fashion-adjacent restraint',
    photography: 'documentary-adjacent, slightly grainy, unposed or barely posed',
    alwaysPresent: 'an architectural or shadow element, muted cool palette, off-centre composition',
    never: 'warm, romantic, decorative, bright commercial, busy staging',
    toneOfVoice: 'dry, understated, minimal explanation, confident in its own coolness',
  },
};

/**
 * Build a compact visual direction block for injection into AI prompts.
 * styleIds[0] = lead style (drives the output)
 * styleIds[1] = secondary influence
 * styleIds[2] = accent only
 */
export function buildStyleDirectionBlock(styleIds: string[]): string {
  if (!styleIds || styleIds.length === 0) return '';

  const ranks = ['Lead style', 'Secondary influence', 'Accent only'];
  const lines: string[] = ['**Visual Style Direction:**'];

  styleIds.slice(0, 3).forEach((id, i) => {
    const rule = VISUAL_STYLE_LIBRARY[id as VisualStyleId];
    if (!rule) return;
    lines.push(
      `${ranks[i]}: ${rule.title} — ` +
      `Colour: ${rule.colour}. ` +
      `Lighting: ${rule.lighting}. ` +
      `Material/texture: ${rule.material}. ` +
      `Composition: ${rule.composition}. ` +
      `Always present: ${rule.alwaysPresent}. ` +
      `Never: ${rule.never}.`,
    );
  });

  return lines.join('\n');
}
