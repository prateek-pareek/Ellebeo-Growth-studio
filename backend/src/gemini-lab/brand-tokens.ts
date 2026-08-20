/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { LabPalette, LabTypography, MoodHint } from './gemini-lab-compositor';

/**
 * A salon's brand as structured, machine-readable data.
 *
 * The problem this replaces: brand identity is currently a single `mood` enum
 * with six values, and that one field determines palette, typeface pairing,
 * type weight, decoration, photo grade and art vocabulary — permanently. A
 * thousand salons therefore share six visual identities, and two studios that
 * both pick SOFT_GLAM are not similar, they are identical. No amount of
 * per-post variation fixes that, because the variation is drawn from the same
 * six seeds.
 *
 * The model here is the one brand-management platforms settled on: brand is a
 * structured document of typed values, authored or extracted per brand, that
 * any tool can read. Frontify calls its guidelines "AI-readable by design" for
 * exactly this reason — the generator, the critic and the prompt all read one
 * source of truth instead of each interpreting a form.
 *
 * The format is the W3C Design Tokens Community Group specification, which
 * reached its first stable version in October 2025 and is supported by Figma,
 * Sketch, Style Dictionary and Tokens Studio. Adopting the standard rather
 * than inventing a shape means a salon's brand can be imported from, and
 * exported to, the tools their designer already uses.
 *
 * This module is the foundation, deliberately non-breaking: tokens are
 * currently DERIVED from the existing guided profile, so behaviour is
 * unchanged. What it buys is that mood becomes a seed that produces tokens
 * rather than the identity itself — so a palette extracted from a logo, or a
 * typeface a studio actually chose, can replace the seeded value without
 * touching anything downstream.
 */

/** Vendor namespace for the brand facts the W3C spec has no type for. */
export const EXT = 'com.mathionix.growthstudio';

export type TokenType =
  | 'color'
  | 'fontFamily'
  | 'fontWeight'
  | 'dimension'
  | 'number'
  | 'typography';

export type DesignToken = {
  $value: unknown;
  $type?: TokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
};

/** A group is any object without a `$value` — the spec's own rule. */
export type TokenGroup = { [key: string]: DesignToken | TokenGroup };

export type BrandTokens = TokenGroup;

function isToken(node: DesignToken | TokenGroup): node is DesignToken {
  return typeof node === 'object' && node !== null && '$value' in node;
}

/** `#F6EEE4` → sRGB components, as the stable spec represents colour. */
function colorToken(hex: string, description: string): DesignToken {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  const components = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  return {
    $type: 'color',
    $description: description,
    $value: {
      colorSpace: 'srgb',
      components: components.map((c) => Number(c.toFixed(4))),
      hex: `#${full.toLowerCase()}`,
    },
  };
}

/** The hex of a colour token, following one level of alias if needed. */
export function hexOf(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const value = (node as DesignToken).$value;
  if (typeof value === 'string') return value.startsWith('#') ? value : null;
  if (value && typeof value === 'object' && typeof (value as any).hex === 'string') {
    return (value as any).hex;
  }
  return null;
}

/**
 * Follows `{group.token}` aliases to the value they point at.
 *
 * The spec allows an alias to reference another alias, so this walks the chain
 * and refuses to loop — a circular reference is invalid per the spec and would
 * otherwise hang the renderer.
 */
export function resolveToken(tokens: BrandTokens, path: string): DesignToken | null {
  const seen = new Set<string>();
  let current = path;
  for (let hops = 0; hops < 16; hops += 1) {
    if (seen.has(current)) return null;
    seen.add(current);

    let node: DesignToken | TokenGroup | undefined = tokens;
    for (const key of current.split('.')) {
      if (!node || isToken(node)) return null;
      node = (node as TokenGroup)[key];
    }
    if (!node || !isToken(node)) return null;

    const value = node.$value;
    if (typeof value === 'string' && /^\{[^}]+\}$/.test(value)) {
      current = value.slice(1, -1);
      continue;
    }
    return node;
  }
  return null;
}

/** Brand facts that carry no W3C type — voice, banned words, motifs. Stored under the vendor extension. */
export type BrandVoice = {
  mood?: MoodHint;
  essence?: string[];
  preferredWords?: string[];
  bannedWords?: string[];
  signatureMotif?: string | null;
};

/**
 * Builds a token document from what the guided profile already holds.
 *
 * Non-breaking on purpose: every value here is one the pipeline uses today.
 * The gain is structural — once brand lives in this shape, a palette lifted
 * from a logo or a typeface a studio actually picked simply replaces the
 * corresponding token, and nothing downstream needs to know where it came
 * from.
 */
export function tokensFromBrand(params: {
  palette: LabPalette;
  typography: LabTypography;
  voice?: BrandVoice;
}): BrandTokens {
  const { palette, typography } = params;
  return {
    color: {
      background: colorToken(palette.background, 'The ground most posts are set on.'),
      secondary: colorToken(palette.secondary, 'Supporting field colour, for panels and mats.'),
      depth: colorToken(palette.depth, 'The darkest brand colour. Carries body and headline ink.'),
      accent: colorToken(palette.accent, 'The one colour used sparingly, for emphasis.'),
      primary: colorToken(palette.primary, 'Mid-tone, for subheads and supporting type.'),
      // Aliases, so a role can be re-pointed without duplicating a value —
      // this is how a palette treatment becomes data rather than code.
      ink: { $type: 'color', $description: 'Whatever currently carries headline type.', $value: '{color.depth}' },
      ground: { $type: 'color', $description: 'Whatever the post currently sits on.', $value: '{color.background}' },
    },
    font: {
      heading: {
        $type: 'fontFamily',
        $description: 'Display face. Carries headlines.',
        $value: [typography.heading, 'Georgia', 'serif'],
      },
      body: {
        $type: 'fontFamily',
        $description: 'Text face. Carries subheads, captions and block content.',
        $value: [typography.body, 'Helvetica', 'sans-serif'],
      },
      weightHeading: { $type: 'fontWeight', $description: 'Headline weight.', $value: 500 },
      weightBody: { $type: 'fontWeight', $description: 'Body weight.', $value: 400 },
    },
    type: {
      // Composite typography tokens, exactly as the spec defines them.
      headline: {
        $type: 'typography',
        $description: 'The billboard line on a post.',
        $value: {
          fontFamily: [typography.heading],
          fontSize: { value: 64, unit: 'px' },
          fontWeight: 500,
          lineHeight: 1.04,
          letterSpacing: { value: -0.6, unit: 'px' },
        },
      },
      subhead: {
        $type: 'typography',
        $description: 'One supporting line beneath the headline.',
        $value: {
          fontFamily: [typography.body],
          fontSize: { value: 24, unit: 'px' },
          fontWeight: 400,
          lineHeight: 1.38,
        },
      },
    },
    ...(params.voice
      ? {
          brand: {
            voice: {
              $description: 'Brand facts with no W3C type — kept under the vendor extension, per the spec.',
              $value: 'voice',
              $extensions: { [EXT]: params.voice },
            } as DesignToken,
          },
        }
      : {}),
  };
}

/** The renderer's palette, read back out of the token document. */
export function paletteFromTokens(tokens: BrandTokens, fallback: LabPalette): LabPalette {
  const read = (path: string, fb: string): string => hexOf(resolveToken(tokens, path)) ?? fb;
  return {
    background: read('color.background', fallback.background),
    secondary: read('color.secondary', fallback.secondary),
    depth: read('color.depth', fallback.depth),
    accent: read('color.accent', fallback.accent),
    primary: read('color.primary', fallback.primary),
  };
}

/** The renderer's typeface pairing, read back out of the token document. */
export function typographyFromTokens(tokens: BrandTokens, fallback: LabTypography): LabTypography {
  const family = (path: string, fb: string): string => {
    const token = resolveToken(tokens, path);
    const value = token?.$value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return typeof value === 'string' ? value : fb;
  };
  return {
    heading: family('font.heading', fallback.heading),
    body: family('font.body', fallback.body),
  };
}

/** The brand facts kept under the vendor extension. */
export function voiceFromTokens(tokens: BrandTokens): BrandVoice | null {
  const node = (tokens as any)?.brand?.voice as DesignToken | undefined;
  const ext = node?.$extensions?.[EXT];
  return ext && typeof ext === 'object' ? (ext as BrandVoice) : null;
}

/**
 * Structural check against the spec, for anything imported from a designer's
 * tool rather than generated here.
 *
 * Deliberately narrow: it reports what would break the renderer, not every
 * way a document could differ from the specification.
 */
export function validateTokens(tokens: unknown): string[] {
  const errors: string[] = [];
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return ['Token document must be a JSON object.'];
  }

  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if ('$value' in obj) {
      const type = obj.$type;
      if (type !== undefined && typeof type !== 'string') {
        errors.push(`${path}: $type must be a string.`);
      }
      const value = obj.$value;
      if (typeof value === 'string' && /^\{[^}]+\}$/.test(value)) {
        if (!resolveToken(tokens as BrandTokens, value.slice(1, -1))) {
          errors.push(`${path}: alias ${value} does not resolve.`);
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(tokens, '');

  for (const required of ['color.background', 'color.depth', 'font.heading', 'font.body']) {
    if (!resolveToken(tokens as BrandTokens, required)) {
      errors.push(`Missing required token "${required}".`);
    }
  }
  return errors;
}
