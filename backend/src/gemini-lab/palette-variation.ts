/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { LabPalette } from './gemini-lab-compositor';

/**
 * Per-post colour treatments derived from the brand's own palette.
 *
 * The palette is fixed per brand — five colours, applied in exactly the same
 * roles on every post that brand ever makes. That is defensible as brand
 * consistency and indefensible as design: a real studio's feed varies its
 * ground (a pale post, then a deep one, then a colour-blocked one) while
 * staying unmistakably itself. Locking the roles made every post the same
 * temperature and the same weight.
 *
 * Nothing here invents a colour. Every value is the brand's own hue, either
 * used in a different role or mixed with another brand colour, so a treatment
 * can be dramatic without ever going off-brand. The one hard rule is that the
 * result must stay legible: `ink` is always chosen against the ground it
 * lands on rather than assumed.
 */

export type PaletteTreatment = {
  id: string;
  /** How this reads, for the log and for creative memory. */
  label: string;
  palette: LabPalette;
};

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend between two brand colours. `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of the brand's own dark/light extremes actually reads on this ground. */
function inkFor(ground: string, p: LabPalette): string {
  const candidates = [p.depth, p.primary, p.background, '#141210', '#FFFFFF'];
  return candidates.reduce((best, c) => (contrast(ground, c) > contrast(ground, best) ? c : best), candidates[0]);
}

/**
 * The treatments. Each is a different ANSWER to "what is the ground, and what
 * carries the accent" using only colours the brand already owns.
 */
const TREATMENTS: Array<{ id: string; label: string; build: (p: LabPalette) => LabPalette }> = [
  {
    id: 'signature',
    label: 'signature light ground',
    build: (p) => p,
  },
  {
    id: 'inverted',
    label: 'deep ground, light type',
    // The brand's dark colour becomes the canvas. This is the single biggest
    // perceived change available without leaving the palette.
    build: (p) => ({
      background: p.depth,
      secondary: mix(p.depth, p.background, 0.22),
      depth: p.background,
      accent: p.accent,
      primary: mix(p.background, p.depth, 0.25),
    }),
  },
  {
    id: 'tinted',
    label: 'accent-tinted ground',
    build: (p) => ({
      ...p,
      background: mix(p.background, p.accent, 0.22),
      secondary: mix(p.secondary, p.accent, 0.3),
    }),
  },
  {
    id: 'paper',
    label: 'raised paper ground',
    build: (p) => ({
      ...p,
      background: mix(p.background, '#FFFFFF', 0.45),
      secondary: mix(p.secondary, p.background, 0.4),
    }),
  },
  {
    id: 'accent_field',
    label: 'accent as the field',
    // The accent stops being a detail and becomes the whole ground.
    build: (p) => ({
      background: p.accent,
      secondary: mix(p.accent, p.depth, 0.2),
      depth: p.depth,
      accent: mix(p.accent, p.depth, 0.45),
      primary: mix(p.depth, p.accent, 0.3),
    }),
  },
  {
    id: 'duotone',
    label: 'two-tone brand field',
    build: (p) => ({
      background: mix(p.background, p.secondary, 0.55),
      secondary: p.secondary,
      depth: p.depth,
      accent: p.depth,
      primary: mix(p.depth, p.secondary, 0.3),
    }),
  },
];

export const TREATMENT_IDS = TREATMENTS.map((t) => t.id);

/** Minimum contrast a headline must clear against its own ground before a treatment is offered. */
const MIN_READABLE = 4.5;

/**
 * A treatment for this post, weighted away from the ones recently used.
 *
 * Rejects any treatment whose own ground cannot carry legible type — a
 * variation that has to be rescued by a plate behind the text is not a
 * variation, it is a bug with a colour.
 */
export function pickPaletteTreatment(
  base: LabPalette,
  recentIds: readonly string[] = [],
  random: () => number = Math.random,
): PaletteTreatment {
  const built = TREATMENTS.map((t) => {
    const palette = t.build(base);
    return { id: t.id, label: t.label, palette, ink: inkFor(palette.background, palette) };
  }).filter((t) => contrast(t.palette.background, t.ink) >= MIN_READABLE);

  const usable = built.length ? built : [{ id: 'signature', label: 'signature light ground', palette: base }];
  const recent = new Set(recentIds.slice(-3));
  const weights = usable.map((t) => (recent.has(t.id) ? 0.08 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < usable.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return { id: usable[i].id, label: usable[i].label, palette: usable[i].palette };
  }
  const last = usable[usable.length - 1];
  return { id: last.id, label: last.label, palette: last.palette };
}
