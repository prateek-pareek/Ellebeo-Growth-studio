import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import type { SubjectBox } from './subject-box';
import {
  BLOCK_KINDS,
  MIN_BLOCK_SPAN,
  coercePlacedBlocks,
  hasContentFor,
  type BlockKind,
  type FormatContent,
  type GridRegion,
  type PlacedBlock,
} from './gemini-lab-blocks';
import { FALLBACK_ADVANCE_RATIO, measureText } from './text-metrics';

export type { GridRegion, PlacedBlock, FormatContent } from './gemini-lab-blocks';

export type LabLayout = 'cover' | 'split' | 'banner' | 'framed_cta' | 'type_step' | 'minimal_caption' | 'stacked_quote';

export type LabTypography = { heading: string; body: string };

export type LabDecoration = 'none' | 'hairline' | 'corner' | 'dots' | 'grid' | 'sparkle';

export type MoodHint =
  | 'SOFT_GLAM'
  | 'CLEAN_CLINICAL'
  | 'EDITORIAL_MINIMAL'
  | 'NATURAL_ORGANIC'
  | 'BOLD_LUXE'
  | 'PLAYFUL_FRESH';

export type LabSlideSpec = {
  layout: LabLayout;
  headline: string;
  subhead?: string;
  pill?: string;
  cta?: string;
  photo: 'before' | 'after' | 'both';
  leftPill?: string;
  rightPill?: string;
  decoration?: LabDecoration;
  /**
   * Content beyond the four text roles — steps, price rows, a checklist, a
   * quote, a badge. Populated per post format. Absent for a plain statement
   * post, which is why every existing caller keeps working untouched.
   */
  content?: FormatContent;
};

// AI-authored numeric design brief — replaces picking from a small fixed
// preset table as the primary style source. `layout`/`decoration` stay
// enums (they select genuinely different compositor code paths), but HOW
// that layout looks — mat padding, border, shadow, corner radius, type
// weight/tracking, motif intensity — is now authored per-slide by the same
// creative-director call that already writes copy/layout, instead of being
// looked up from mood alone. Every field is clamped to a safe range before
// it ever reaches the renderer (see clampDesignSpec) — "AI decides" and
// "must always render legibly" aren't in tension if the clamp is explicit.
export type LabDesignSpec = {
  matPad: number;
  borderWidth: number;
  borderOpacity: number;
  shadowOpacity: number;
  shadowBlur: number;
  radius: number;
  headingWeight: number;
  tracking: number;
  decorationIntensity: number;
};

/** A rectangle in canvas fractions (0..1), resolution-independent. */
export type FractionRect = { x: number; y: number; w: number; h: number };

/**
 * Where the photo and the type actually sit. This is the piece that used to
 * be hardcoded into a 7-branch if/else in renderLabSlide — each branch was
 * just a different (photoBox, typeBox, full-bleed?) triple over the same
 * rendering primitives. Making it data means the AI can author genuinely
 * new arrangements instead of picking one of seven, while
 * COMPOSITION_PRESETS keeps those seven as a known-good floor.
 */
export type PhotoShape = 'rect' | 'rounded' | 'arch' | 'circle' | 'pill';
export type TextRole = 'kicker' | 'headline' | 'subhead' | 'cta';
export type ColorRole = 'primary' | 'secondary' | 'accent' | 'depth' | 'background';

/**
 * The design grid. Placement is authored in grid units rather than raw
 * floats: snapping is what produces automatic alignment and consistent
 * margins, which is the difference between "designed" and "arbitrary".
 * A 12x12 grid still affords a very large placement space — this
 * constrains craft, not creativity.
 */
export const GRID = 12;

export type TypeScaleId = 'compact' | 'balanced' | 'dramatic';

/** Ratio between successive type sizes — a modular scale is what makes typography read as designed rather than randomly sized. */
const TYPE_SCALE_RATIO: Record<TypeScaleId, number> = {
  compact: 1.15,
  balanced: 1.25,
  dramatic: 1.4,
};

/** One role may sit apart from the group — but validation requires it to share an alignment edge, so it never floats orphaned. */
export type LabDetachedText = {
  role: TextRole;
  box: FractionRect;
  align: 'left' | 'center' | 'right';
};

export type LabPanel = {
  box: FractionRect;
  colorRole: ColorRole;
  opacity: number;
};

export type LabComposition = {
  /**
   * `typographic` carries no photograph at all — brand colour fields, type
   * and content blocks only.
   *
   * A price list, a sale, or "three slots left this week" is a designed
   * poster, not a photograph with words on it. Without this mode the
   * pipeline had only two ways to make one: demand a client photo that has
   * nothing to do with the message, or spend an image-generation call on a
   * decorative still life to sit behind the prices. Both put an irrelevant
   * picture at the centre of a commercial post.
   */
  photoMode: 'framed' | 'full_bleed' | 'dual_framed' | 'typographic';
  photoBox: FractionRect;
  photoShape: PhotoShape;
  typeBox: FractionRect;
  /** Type sits over the photo — adds the scrim + light-ink treatment. */
  typeOnPhoto: boolean;
  typeAlign: 'top' | 'center' | 'bottom';
  /** Horizontal alignment of the text group within its box. */
  textAlign: 'left' | 'center' | 'right';
  typeScale: TypeScaleId;
  detached?: LabDetachedText;
  panels?: LabPanel[];
  /**
   * Content blocks, already resolved from grid units to canvas fractions —
   * the same input-region → output-box shape photoRegion/photoBox uses, so
   * the renderer never needs the safe area a second time.
   */
  blocks?: ResolvedBlock[];
};

export type ResolvedBlock = { kind: BlockKind; box: FractionRect };

const TEXT_ROLES: TextRole[] = ['kicker', 'headline', 'subhead', 'cta'];
const PHOTO_SHAPES: PhotoShape[] = ['rect', 'rounded', 'arch', 'circle', 'pill'];
const COLOR_ROLES: ColorRole[] = ['primary', 'secondary', 'accent', 'depth', 'background'];

// Role-aware minimums: a kicker/cta renders as a ~38px pill (~0.028 of a
// 1350px canvas), so a blanket minimum sized for multi-line headlines would
// reject perfectly renderable pill boxes.
/** Regions closer than this read as colliding rather than composed. */
const MIN_GUTTER = 0.02;
/** How close two edges must be to count as intentionally aligned. */
const ALIGN_TOLERANCE = 0.02;

const MIN_TEXT_SIZE: Record<TextRole, { w: number; h: number }> = {
  kicker: { w: 0.10, h: 0.025 },
  cta: { w: 0.10, h: 0.025 },
  subhead: { w: 0.16, h: 0.04 },
  headline: { w: 0.16, h: 0.05 },
};

const MIN_PHOTO_FRACTION = 0.18;
const MIN_TYPE_W_FRACTION = 0.28;
const MIN_TYPE_H_FRACTION = 0.12;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function sanitizeRect(r: Partial<FractionRect> | undefined): FractionRect | null {
  if (!r) return null;
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.w);
  const h = Number(r.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const cx = clamp01(x);
  const cy = clamp01(y);
  return { x: cx, y: cy, w: clamp01(Math.min(w, 1 - cx)), h: clamp01(Math.min(h, 1 - cy)) };
}

/** Grid units → canvas fractions, over the safe area (inside margins and any logo strip). */
function gridToFraction(r: GridRegion, safe: { x0: number; y0: number; x1: number; y1: number }): FractionRect | null {
  const col = Math.round(Number(r?.col));
  const row = Math.round(Number(r?.row));
  const colSpan = Math.round(Number(r?.colSpan));
  const rowSpan = Math.round(Number(r?.rowSpan));
  if (![col, row, colSpan, rowSpan].every(Number.isFinite)) return null;
  if (col < 1 || row < 1 || colSpan < 1 || rowSpan < 1) return null;
  if (col + colSpan - 1 > GRID || row + rowSpan - 1 > GRID) return null;
  const cw = (safe.x1 - safe.x0) / GRID;
  const ch = (safe.y1 - safe.y0) / GRID;
  return {
    x: safe.x0 + (col - 1) * cw,
    y: safe.y0 + (row - 1) * ch,
    w: colSpan * cw,
    h: rowSpan * ch,
  };
}

function unionRect(rects: FractionRect[]): FractionRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

function rectsOverlap(a: FractionRect, b: FractionRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const DESIGN_SPEC_RANGES: Record<keyof LabDesignSpec, [number, number]> = {
  matPad: [0, 32],
  borderWidth: [0, 8],
  borderOpacity: [0, 1],
  shadowOpacity: [0, 0.5],
  shadowBlur: [2, 16],
  radius: [0, 36],
  headingWeight: [300, 800],
  tracking: [-2, 3],
  decorationIntensity: [0, 1],
};

/** Drops missing/NaN fields and clamps everything present to a safe render range — never trusts AI-authored numbers unchecked. */
export function clampDesignSpec(spec: Partial<Record<keyof LabDesignSpec, unknown>> | undefined): Partial<LabDesignSpec> {
  if (!spec) return {};
  const out: Partial<LabDesignSpec> = {};
  for (const key of Object.keys(DESIGN_SPEC_RANGES) as Array<keyof LabDesignSpec>) {
    const raw = spec[key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      const [min, max] = DESIGN_SPEC_RANGES[key];
      out[key] = Math.min(max, Math.max(min, n));
    }
  }
  return out;
}

export type LabPalette = {
  background: string;
  secondary: string;
  depth: string;
  accent: string;
  primary: string;
};

export type LogoPosition = 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';

const LOGO_BOX_W = 240;
const LOGO_BOX_H = 80;
const SAFE = 48;
const BRAND_STRIP = 108;
const MAT = 14;
const SHADOW = 36;

const SIZES: Record<string, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
};

// Registry of every embedded font family available to renderLabSlide. Keyed
// by the exact family name used in guided-dna/contract.ts's TYPE_PAIRINGS,
// so a mood's heading/body choice maps straight to a file here with no
// translation layer. 'Playfair Display' is the fail-soft default — every
// mood renders through it if its own file is ever missing (matches the old
// single-font behavior instead of erroring).
const FONT_FILES: Record<string, string> = {
  'Playfair Display': 'PlayfairDisplay-Regular.ttf',
  'Cormorant Garamond': 'CormorantGaramond-Variable.ttf',
  Fraunces: 'Fraunces-Variable.ttf',
  Cinzel: 'Cinzel-Variable.ttf',
  Outfit: 'Outfit-Variable.ttf',
  Inter: 'Inter-Variable.ttf',
  'Source Sans 3': 'SourceSans3-Variable.ttf',
};
const DEFAULT_FONT_FAMILY = 'Playfair Display';

/** Per-mood weight/tracking so typography reads distinctly, not just as a different face at the same settings. */
const MOOD_TYPE_STYLE: Record<MoodHint, { weight: number; tracking: number }> = {
  SOFT_GLAM: { weight: 500, tracking: -0.6 },
  CLEAN_CLINICAL: { weight: 600, tracking: 0.1 },
  EDITORIAL_MINIMAL: { weight: 400, tracking: 0.6 },
  NATURAL_ORGANIC: { weight: 500, tracking: -0.3 },
  BOLD_LUXE: { weight: 600, tracking: 1.3 },
  PLAYFUL_FRESH: { weight: 600, tracking: -0.2 },
};
const DEFAULT_TYPE_STYLE = { weight: 500, tracking: -1.1 };

const fontFaceCache = new Map<string, string>();

function loadFontFace(family: string): string {
  const cached = fontFaceCache.get(family);
  if (cached !== undefined) return cached;
  const fileName = FONT_FILES[family] || FONT_FILES[DEFAULT_FONT_FAMILY];
  const candidates = [
    path.join(__dirname, '../../assets/fonts', fileName),
    path.join(process.cwd(), 'assets/fonts', fileName),
  ];
  let css = '';
  try {
    const fontPath = candidates.find((p) => fs.existsSync(p));
    if (!fontPath) throw new Error('font missing');
    const b64 = fs.readFileSync(fontPath).toString('base64');
    css = `@font-face{font-family:'${family}';src:url('data:font/ttf;base64,${b64}') format('truetype');}`;
  } catch {
    css = '';
  }
  fontFaceCache.set(family, css);
  return css;
}

/** @font-face block covering whichever families this slide actually uses. */
function fontFacesCss(families: string[]): string {
  const unique = [...new Set([DEFAULT_FONT_FAMILY, ...families])];
  return unique.map(loadFontFace).join('');
}

function fontStack(family: string, fallback: string): string {
  return `'${family}', ${fallback}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The face a run of text is actually set in. Without it, text can only be
 * measured as a character count against one flat ratio — see text-metrics.ts
 * for why that was the root of the placement problems.
 */
export type FontSpec = { family: string; tracking?: number };

export type WrapResult = {
  lines: string[];
  /**
   * Words that did not fit in `maxLines` and were cut.
   *
   * The old wrapper dropped them silently: it `break`ed out of the loop on
   * hitting the line limit and returned what it had, so a seven-word headline
   * in a narrow region rendered as the first few words and the studio
   * published a truncated sentence. Callers must now decide deliberately —
   * shrink the type, take another line, or reject the region — and the
   * headline fit test reports honestly instead of measuring the stub it just
   * created and declaring that it fits.
   */
  dropped: boolean;
};

export function wrapMeasured(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  font?: FontSpec,
): WrapResult {
  const width = (s: string): number =>
    font
      ? measureText(s, font.family, fontSize, font.tracking ?? 0)
      : s.length * FALLBACK_ADVANCE_RATIO * fontSize;

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], dropped: false };

  const lines: string[] = [];
  let cur = '';
  let dropped = false;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = cur ? `${cur} ${word}` : word;
    if (width(next) > maxWidth && cur) {
      if (lines.length + 1 >= maxLines) {
        // No line left to start. Keep what fits on this final line and tell
        // the caller the rest was cut, rather than pretending it was set.
        lines.push(cur);
        dropped = true;
        cur = '';
        break;
      }
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);

  // Pull a word down to avoid a lone short orphan on the last line. Measured
  // now, so it triggers on real raggedness rather than on character counts.
  if (lines.length >= 2 && !dropped) {
    const last = lines[lines.length - 1];
    const prev = lines[lines.length - 2];
    if (width(last) < maxWidth * 0.38 && prev.includes(' ')) {
      const parts = prev.split(' ');
      const moved = parts.pop();
      if (moved && width(`${moved} ${last}`) <= maxWidth) {
        lines[lines.length - 2] = parts.join(' ');
        lines[lines.length - 1] = `${moved} ${last}`;
      }
    }
  }
  return { lines: lines.length ? lines : [words[0]], dropped };
}

const HEAD_LH = 1.04;
const SUB_LH = 1.38;
const SUB_SIZE = 24;
const PILL_H = 38;
const ACCENT_H = 2;
const TYPE_PAD = 8;

function wrapToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  font?: FontSpec,
): string[] {
  return wrapMeasured(text, maxWidth, fontSize, maxLines, font).lines;
}

/**
 * Largest size at which the whole headline is set — never a size at which
 * part of it is thrown away.
 *
 * `overflow` is the piece that was missing. Previously every branch returned
 * whatever the wrapper produced, including a truncated stub, and the height
 * was computed from the truncated line count. That made the caller's
 * "does the headline fit?" test tautological: it measured text that had
 * already been cut down until it fit, so it could never answer no, and
 * regions too small for their copy sailed through and rendered clipped.
 */
function fitHeadline(
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  minSize = 34,
  maxLines = 3,
  font?: FontSpec,
): { lines: string[]; size: number; height: number; overflow: boolean } {
  for (let size = startSize; size >= minSize; size -= 2) {
    const { lines, dropped } = wrapMeasured(text, maxWidth, size, maxLines, font);
    const height = Math.ceil(lines.length * size * HEAD_LH);
    if (!dropped && height <= maxHeight) return { lines, size, height, overflow: false };
  }
  // Nothing in the range sets the full text in this box. Return the smallest
  // attempt and say so — the caller decides whether to reject the region or
  // accept a clipped headline, which is a decision it can only make if it is
  // told the truth.
  const { lines } = wrapMeasured(text, maxWidth, minSize, maxLines, font);
  return { lines, size: minSize, height: Math.ceil(lines.length * minSize * HEAD_LH), overflow: true };
}

/** Standardise source — EXIF rotate + sRGB PNG. Colour is not graded. */
export async function prepareLabPhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .toColourspace('srgb')
    .resize({
      width: 2800,
      height: 2800,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 4, quality: 100 })
    .toBuffer();
}

/** Resize only — original colour preserved. Attention crop keeps faces in frame. */
/**
 * White-on-transparent mask body for a photo shape. Composited with
 * `dest-in`, so whatever is white here keeps the photo. Arch and circle are
 * what make beauty content read as editorial rather than as a slide.
 */
function shapeMaskBody(shape: PhotoShape, w: number, h: number, radius: number): string {
  switch (shape) {
    case 'circle':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="white"/>`;
    case 'pill': {
      const r = Math.min(w, h) / 2;
      return `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>`;
    }
    case 'arch': {
      // Semicircular top, straight sides and base — the classic archway crop.
      const r = Math.min(w / 2, h);
      return `<path d="M 0 ${h} L 0 ${r} A ${w / 2} ${r} 0 0 1 ${w} ${r} L ${w} ${h} Z" fill="white"/>`;
    }
    case 'rounded': {
      const r = Math.max(2, radius || Math.min(w, h) * 0.06);
      return `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>`;
    }
    case 'rect':
    default: {
      const r = Math.max(0, radius);
      return `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>`;
    }
  }
}

/**
 * Where the crop window should aim.
 *
 * `fx`/`fy` are the subject's centre in SOURCE fractions (from subject-box,
 * which measures the rotated image, as we crop the rotated image). `ty` is
 * where in the OUTPUT window that centre should land — 0.42 by default, the
 * classic portrait position, and overridden per layout so a full-bleed post
 * can steer the face away from wherever its type sits.
 */
export type PhotoFocus = { fx: number; fy: number; ty?: number };

const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Where the face should sit on a full-bleed post, given where the type sits.
 *
 * On full-bleed the photograph and the words share one canvas. The type's
 * geometry is designed and validated, so it is the photograph that moves: the
 * crop aims the face at the middle of whichever band the type leaves free.
 * Returned as a fraction of the output height.
 */
/**
 * Which way to split a photo box between two photographs.
 *
 * The pair layout always placed them SIDE BY SIDE and halved the box's width.
 * When the layout had allocated a tall, narrow region — which most of them do,
 * on a 4:5 canvas — halving it again produced two vertical slivers around 0.18
 * aspect, and two portrait photographs were cropped down to a strip of cheek
 * each. Meanwhile the rest of the post sat empty.
 *
 * Stacking the same two portraits in the same tall box gives each one nearly
 * its own aspect ratio, uses the whole region, and crops almost nothing. Which
 * way round that falls depends on the box and the photographs, so it is
 * measured rather than fixed: whichever orientation produces a cell closest in
 * shape to the photograph itself wins. Compared in log space so that "twice as
 * wide as it should be" and "half as wide" count equally badly.
 */
/** A photograph's own width/height, or a portrait default if it cannot be read. */
async function photoAspect(buffer: Buffer): Promise<number> {
  try {
    const m = await sharp(buffer).metadata();
    // EXIF orientation 5-8 mean the stored pixels are rotated a quarter turn.
    const swap = (m.orientation ?? 1) >= 5;
    const wPx = swap ? m.height : m.width;
    const hPx = swap ? m.width : m.height;
    if (wPx && hPx) return wPx / hPx;
  } catch {
    // Unreadable metadata is not a reason to fail a render.
  }
  return 0.8;
}

export function splitOrientationFor(
  box: { w: number; h: number },
  photoAspect: number,
  gap: number,
): 'side_by_side' | 'stacked' {
  if (!(photoAspect > 0) || box.w <= 0 || box.h <= 0) return 'side_by_side';
  const sideCell = Math.max(1, (box.w - gap) / 2) / Math.max(1, box.h);
  const stackCell = Math.max(1, box.w) / Math.max(1, (box.h - gap) / 2);
  const cost = (cell: number) => Math.abs(Math.log(cell / photoAspect));
  return cost(stackCell) < cost(sideCell) ? 'stacked' : 'side_by_side';
}

/**
 * The largest box of a given aspect ratio that fits inside another.
 *
 * A slot is a rectangle a layout chose; a photograph is a rectangle whoever
 * took it chose. When they disagree badly the compositor used to settle it
 * entirely at the photograph's expense. Reshaping the SLOT spends some empty
 * space; cropping the PHOTO spends the subject.
 *
 * Only worth doing when the disagreement is large — a slot trimmed to match
 * every photograph exactly would leave the layout full of holes — so callers
 * pass the tolerance they will accept.
 */
export function fitBoxToAspect(
  box: { x: number; y: number; w: number; h: number },
  aspect: number,
  tolerance = 1.35,
): { x: number; y: number; w: number; h: number } {
  if (!(aspect > 0) || box.w <= 0 || box.h <= 0) return box;
  const current = box.w / box.h;
  const disagreement = current > aspect ? current / aspect : aspect / current;
  // Within tolerance the crop is ordinary framing, not damage.
  if (disagreement <= tolerance) return box;

  // Meet it partway: going all the way to the photo's own aspect can leave a
  // large hole, so the slot moves to the edge of what it will tolerate.
  const target = current > aspect ? current / tolerance : current * tolerance;
  let w = box.w;
  let h = box.h;
  if (current > target) w = Math.round(box.h * target);
  else h = Math.round(box.w / target);
  return {
    x: box.x + Math.round((box.w - w) / 2),
    y: box.y + Math.round((box.h - h) / 2),
    w,
    h,
  };
}

export function faceTargetAwayFromType(typeBox: { y: number; h: number }): number {
  const top = clampN(typeBox.y, 0, 1);
  const bottom = clampN(typeBox.y + typeBox.h, 0, 1);
  const typeCentre = (top + bottom) / 2;
  // Type in the upper half → the face belongs in the free band below it, and
  // the other way round. Clamped so an oversized type box cannot push the
  // face against an edge.
  const target = typeCentre < 0.5 ? (bottom + 1) / 2 : top / 2;
  return clampN(target, 0.2, 0.8);
}

async function coverSlot(
  buffer: Buffer,
  w: number,
  h: number,
  radius = 0,
  shape: PhotoShape = 'rect',
  focus?: PhotoFocus,
): Promise<Buffer> {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const hiW = width * 2;
  const hiH = height * 2;
  let hi: Buffer | null = null;

  // When the subject is known, the crop is arithmetic, not a heuristic.
  // sharp's `attention` strategy finds the highest-entropy region, which on a
  // portrait is sometimes the face and sometimes the patterned scarf or the
  // bright window behind — it has no concept of a face, and "type crowds the
  // photo subject's face" was the design critic's single most common
  // complaint because of it.
  if (focus) {
    try {
      // Decode with rotation applied first: the subject box was measured on
      // the rotated image, and metadata() alone reports pre-EXIF dimensions.
      const base = await sharp(buffer).rotate().toBuffer();
      const meta = await sharp(base).metadata();
      const sw = meta.width ?? 0;
      const sh = meta.height ?? 0;
      if (sw > 0 && sh > 0) {
        const ty = clampN(focus.ty ?? 0.42, 0.2, 0.8);
        const coverScale = Math.max(hiW / sw, hiH / sh);

        // Cover alone often leaves no room to move.
        //
        // A 900x1200 photo into a 1080x1350 slot leaves 180px of vertical
        // slack — so asking for the face at 34% of the frame silently clamped
        // to whatever cover happened to give, and the face landed straight
        // behind the headline. Scaling in past cover buys the travel the aim
        // needs. Capped at 1.35x: beyond that a phone photo starts to soften,
        // and a face that cannot be placed within that budget is better placed
        // approximately than blurrily.
        const MAX_ZOOM = 1.35;
        const wantTopAt = (sc: number) => focus.fy * (sh * sc) - hiH * ty;
        const slackAt = (sc: number) => sh * sc - hiH;
        let scale = coverScale;
        const desired = wantTopAt(coverScale);
        const slack = slackAt(coverScale);
        if (desired < 0 || desired > slack) {
          // How much taller the source must be for the aim to land unclamped.
          const needed = desired < 0
            ? (hiH * ty) / Math.max(focus.fy, 0.01) / sh
            : (hiH * (1 - ty)) / Math.max(1 - focus.fy, 0.01) / sh;
          scale = clampN(Math.max(coverScale, needed), coverScale, coverScale * MAX_ZOOM);
        }

        const scaledW = Math.max(hiW, Math.round(sw * scale));
        const scaledH = Math.max(hiH, Math.round(sh * scale));
        const left = clampN(Math.round(focus.fx * scaledW - hiW / 2), 0, scaledW - hiW);
        const top = clampN(Math.round(focus.fy * scaledH - hiH * ty), 0, scaledH - hiH);
        hi = await sharp(base)
          .resize(scaledW, scaledH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
          .extract({ left, top, width: hiW, height: hiH })
          .toBuffer();
      }
    } catch {
      hi = null; // fall through to the old behaviour
    }
  }

  if (!hi) {
    try {
      hi = await sharp(buffer)
        .rotate()
        .resize(hiW, hiH, { fit: 'cover', position: sharp.strategy.attention, kernel: sharp.kernel.lanczos3 })
        .toBuffer();
    } catch {
      hi = await sharp(buffer)
        .rotate()
        .resize(hiW, hiH, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
        .toBuffer();
    }
  }
  const fitted = await sharp(hi)
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.85, m1: 0.7, m2: 0.35 })
    .png({ compressionLevel: 6, quality: 100 })
    .toBuffer();
  if (!radius && shape === 'rect') return fitted;
  const mask = await rasterSvg(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${shapeMaskBody(shape, width, height, radius)}</svg>`,
    width,
    height,
  );
  return sharp(fitted)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * Fit generated background art to the canvas without the softness the plain
 * `.resize(w, h, { fit: 'cover' })` produced.
 *
 * Two things matter here. Lanczos3 is stated explicitly rather than relied on
 * as a default. And an upscale is compensated with a light unsharp mask —
 * resampling always costs acuity, and a background that has been enlarged is
 * the difference between "premium" and "slightly blurry" across the whole
 * post, since this layer covers the entire canvas.
 */
async function fitBackgroundArt(art: Buffer, w: number, h: number): Promise<Buffer> {
  const meta = await sharp(art).metadata().catch(() => null);
  const scale = meta?.width && meta?.height ? Math.max(w / meta.width, h / meta.height) : 1;
  let pipeline = sharp(art).resize(w, h, { fit: 'cover', kernel: sharp.kernel.lanczos3 });
  if (scale > 1.02) {
    // Enlarged: restore edge definition proportionally to how far it stretched.
    const amount = Math.min(1.1, 0.45 + (scale - 1) * 1.2);
    pipeline = pipeline.sharpen({ sigma: 0.8, m1: amount, m2: amount * 0.5 });
  } else {
    pipeline = pipeline.sharpen({ sigma: 0.6, m1: 0.35, m2: 0.2 });
  }
  return pipeline.png({ compressionLevel: 6, quality: 100 }).toBuffer();
}

async function rasterSvg(svg: string, w: number, h: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 288 })
    .resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

/** Soft diagonal brand-tint gradient, replacing the old flat background fill. */
async function backgroundGradient(w: number, h: number, p: LabPalette): Promise<Buffer> {
  const deep = mixToward(p.background, p.secondary, 0.55);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.background}"/>
        <stop offset="100%" stop-color="${deep}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
  </svg>`;
  return rasterSvg(svg, w, h);
}

/** Soft accent-colour glow centred behind a framed photo — gives the mat a "spotlit" premium feel instead of sitting flat on the background. */
async function photoGlow(w: number, h: number, frame: Rect, accent: string): Promise<Buffer> {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const r = Math.round(Math.max(frame.w, frame.h) * 0.62);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
  </svg>`;
  return rasterSvg(svg, w, h);
}

async function softShadow(w: number, h: number, matW: number, matH: number, rx: number, opacity = 0.28, blur = 7): Promise<Buffer> {
  const pad = Math.round(SHADOW * 0.35);
  const raw = await rasterSvg(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${pad + 4}" y="${pad + 8}" width="${matW}" height="${matH}" rx="${rx}" fill="#1a1410" opacity="${opacity}"/>
    </svg>`,
    w,
    h,
  );
  return sharp(raw).blur(blur).png().toBuffer();
}

/**
 * How a mood presents its photo — the single biggest lever for whether
 * different moods actually LOOK different, since every layout (cover,
 * split, type_step, stacked_quote, framed_cta) routes through framedPhoto().
 * Without this, every mood got the identical paper-mat-plus-soft-shadow
 * treatment and only the accent colour changed underneath it.
 */
type FrameStyle = {
  matPad: number; // 0 = no paper mat at all, photo sits directly in its border/shadow
  borderWidth: number; // hairline/bold rule drawn on the photo edge, independent of the mat
  borderColor: string;
  borderOpacity: number;
  shadowOpacity: number; // 0 = no drop shadow (flush, flat-mounted look)
  shadowBlur: number;
  radius: number;
};

// 3 frame-style variants per mood — a fixed brand mood previously meant a
// permanently fixed frame/mat treatment (only layout/decoration varied),
// which reads as "the same template" even when the AI's copy/layout choice
// genuinely differs. Each variant stays within the mood's character (a
// SOFT_GLAM variant never turns into a BOLD_LUXE hard-shadow look) but
// varies mat/border/shadow/radius enough that consecutive posts for the
// same brand don't look identical.
const FRAME_VARIANTS: Record<MoodHint, (p: LabPalette, baseRadius: number) => FrameStyle[]> = {
  SOFT_GLAM: (p, r) => [
    { matPad: MAT, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.28, shadowBlur: 7, radius: r },
    { matPad: 0, borderWidth: 2, borderColor: p.accent, borderOpacity: 0.8, shadowOpacity: 0.22, shadowBlur: 8, radius: Math.max(r, 10) },
    { matPad: 0, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.18, shadowBlur: 12, radius: Math.max(r, 14) },
  ],
  CLEAN_CLINICAL: (p, r) => [
    { matPad: 0, borderWidth: 1.5, borderColor: p.depth, borderOpacity: 0.35, shadowOpacity: 0.1, shadowBlur: 5, radius: Math.min(r, 4) },
    { matPad: 0, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.08, shadowBlur: 6, radius: 0 },
    { matPad: 12, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.12, shadowBlur: 5, radius: Math.min(r, 6) },
  ],
  EDITORIAL_MINIMAL: (p, r) => [
    { matPad: 0, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.14, shadowBlur: 9, radius: 0 },
    { matPad: 0, borderWidth: 1, borderColor: p.depth, borderOpacity: 0.5, shadowOpacity: 0.1, shadowBlur: 6, radius: 0 },
    { matPad: 10, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.16, shadowBlur: 8, radius: 0 },
  ],
  NATURAL_ORGANIC: (p, r) => [
    { matPad: 22, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.2, shadowBlur: 8, radius: Math.max(r, 20) },
    { matPad: 0, borderWidth: 4, borderColor: p.accent, borderOpacity: 0.9, shadowOpacity: 0.18, shadowBlur: 9, radius: Math.max(r, 24) },
    { matPad: 12, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.16, shadowBlur: 10, radius: Math.max(r, 16) },
  ],
  BOLD_LUXE: (p, r) => [
    { matPad: 0, borderWidth: 5, borderColor: p.accent, borderOpacity: 1, shadowOpacity: 0.42, shadowBlur: 4, radius: Math.min(r, 2) },
    { matPad: 0, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.5, shadowBlur: 3, radius: 0 },
    { matPad: 10, borderWidth: 2, borderColor: p.accent, borderOpacity: 0.9, shadowOpacity: 0.3, shadowBlur: 6, radius: Math.min(r, 6) },
  ],
  PLAYFUL_FRESH: (p, r) => [
    { matPad: 16, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.26, shadowBlur: 6, radius: Math.max(r, 18) },
    { matPad: 0, borderWidth: 6, borderColor: p.accent, borderOpacity: 1, shadowOpacity: 0.2, shadowBlur: 7, radius: Math.max(r, 20) },
    { matPad: 0, borderWidth: 0, borderColor: p.depth, borderOpacity: 0, shadowOpacity: 0.22, shadowBlur: 10, radius: Math.max(r, 26) },
  ],
};

/** Fallback only — used for any field the AI-authored design spec doesn't cover (or when there's no design spec at all, e.g. a failed/omitted AI call). */
function frameStyleFallback(mood: MoodHint | undefined, p: LabPalette, baseRadius: number, variantIndex = 0): FrameStyle {
  const variants = FRAME_VARIANTS[mood ?? 'SOFT_GLAM'](p, baseRadius);
  return variants[variantIndex % variants.length];
}

/** Merges the AI-authored (already-clamped) design spec over the mood-based fallback — AI values win field-by-field where present, fallback fills the rest. */
function resolveFrameStyle(
  mood: MoodHint | undefined,
  p: LabPalette,
  baseRadius: number,
  variantIndex: number,
  designSpec: Partial<LabDesignSpec> | undefined,
): FrameStyle {
  const fallback = frameStyleFallback(mood, p, baseRadius, variantIndex);
  if (!designSpec) return fallback;
  return {
    matPad: designSpec.matPad ?? fallback.matPad,
    borderWidth: designSpec.borderWidth ?? fallback.borderWidth,
    borderColor: fallback.borderColor,
    borderOpacity: designSpec.borderOpacity ?? fallback.borderOpacity,
    shadowOpacity: designSpec.shadowOpacity ?? fallback.shadowOpacity,
    shadowBlur: designSpec.shadowBlur ?? fallback.shadowBlur,
    radius: designSpec.radius ?? fallback.radius,
  };
}

/** Mounts an unchanged photo per the given FrameStyle — mat, border, shadow, corner radius all vary by mood. */
async function framedPhoto(
  buffer: Buffer,
  innerW: number,
  innerH: number,
  radius: number,
  matColor: string,
  style: FrameStyle = { matPad: MAT, borderWidth: 0, borderColor: '#1a1410', borderOpacity: 0, shadowOpacity: 0.28, shadowBlur: 7, radius },
  shape: PhotoShape = 'rect',
  focus?: PhotoFocus,
): Promise<{ img: Buffer; w: number; h: number }> {
  const iw = Math.max(1, Math.round(innerW));
  const ih = Math.max(1, Math.round(innerH));
  // A mat/border drawn as a rectangle around a circle or arch looks broken —
  // shaped photos drop the mat and sit directly on the canvas.
  const shaped = shape !== 'rect' && shape !== 'rounded';
  const matPad = shaped ? 0 : Math.max(0, style.matPad);
  const matW = iw + matPad * 2;
  const matH = ih + matPad * 2;
  const rx = Math.max(matPad > 0 ? 6 : 0, style.radius);
  const pad = style.shadowOpacity > 0 ? SHADOW : Math.max(style.borderWidth * 2, 6);
  const w = matW + pad;
  const h = matH + pad;
  const photoRx = matPad > 0 ? Math.max(2, rx - 8) : rx;
  const photo = await coverSlot(buffer, iw, ih, photoRx, shape, focus);

  const layers: sharp.OverlayOptions[] = [];
  // A rectangular drop shadow behind a circle/arch reads as a bug — shaped
  // photos skip it and rely on the glow layer for separation instead.
  if (style.shadowOpacity > 0 && !shaped) {
    layers.push({ input: await softShadow(w, h, matW, matH, rx, style.shadowOpacity, style.shadowBlur), left: 0, top: 0 });
  }
  if (matPad > 0) {
    const mat = await rasterSvg(
      `<svg width="${matW}" height="${matH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${matW}" height="${matH}" rx="${rx}" fill="${matColor}"/>
        <rect x="0.75" y="0.75" width="${matW - 1.5}" height="${matH - 1.5}" rx="${rx - 0.5}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.25"/>
        <rect x="1.5" y="1.5" width="${matW - 3}" height="${matH - 3}" rx="${rx - 1}" fill="none" stroke="#1a1410" stroke-opacity="0.08" stroke-width="1"/>
      </svg>`,
      matW,
      matH,
    );
    layers.push({ input: mat, left: 0, top: 0 }, { input: photo, left: matPad, top: matPad });
  } else {
    layers.push({ input: photo, left: 0, top: 0 });
    if (style.borderWidth > 0 && !shaped) {
      const half = style.borderWidth / 2;
      const border = await rasterSvg(
        `<svg width="${matW}" height="${matH}" xmlns="http://www.w3.org/2000/svg">
          <rect x="${half}" y="${half}" width="${matW - style.borderWidth}" height="${matH - style.borderWidth}" rx="${rx}" fill="none" stroke="${style.borderColor}" stroke-opacity="${style.borderOpacity}" stroke-width="${style.borderWidth}"/>
        </svg>`,
        matW,
        matH,
      );
      layers.push({ input: border, left: 0, top: 0 });
    }
  }
  const img = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .composite(layers)
    .png()
    .toBuffer();
  return { img, w, h };
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  fill: string,
  font: string,
  weight = 400,
  tracking = 0,
  lineHeight = HEAD_LH,
): string {
  const dy = size * lineHeight;
  return lines
    .map((line, i) =>
      `<text x="${x}" y="${y + i * dy}" dominant-baseline="hanging" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${tracking}">${esc(line)}</text>`,
    )
    .join('');
}

/**
 * The kicker/CTA pill's type size.
 *
 * This was 11px on a 1350px-tall canvas — 0.8% of the height, and under a
 * third of the 38px pill it sits in. A feed thumbnail is about 320px wide, so
 * 11px arrived on screen around 3px tall. The design critic flagged "the tag
 * is not legible at thumbnail size" on three of four options, every run.
 * 17px fills the pill properly and survives the scale-down.
 */
const PILL_FONT = 17;
const PILL_TRACKING = 2.4;

function pillWidth(label: string, maxW: number): number {
  const text = label.toUpperCase();
  // Advance per character at PILL_FONT, plus the letter-spacing, plus padding.
  const perChar = PILL_FONT * 0.62 + PILL_TRACKING;
  return Math.max(100, Math.min(maxW, 32 + text.length * perChar));
}

function pill(x: number, y: number, label: string, bg: string, fg: string, maxW = 340): string {
  const text = label.toUpperCase().slice(0, 22);
  const w = pillWidth(text, maxW);
  return `
    <g filter="url(#pillLift)">
      <rect x="${x}" y="${y}" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}" fill="${bg}"/>
    </g>
    <text x="${x + w / 2}" y="${y + PILL_H / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="${PILL_FONT}" font-weight="700" fill="${fg}" letter-spacing="${PILL_TRACKING}">${esc(text)}</text>
  `;
}

export async function normalizeLogoLockup(logo: Buffer): Promise<Buffer> {
  const fitted = await sharp(logo)
    .rotate()
    .ensureAlpha()
    .resize({
      width: LOGO_BOX_W,
      height: LOGO_BOX_H,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, quality: 100 })
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const left = Math.max(0, Math.round((LOGO_BOX_W - (meta.width || LOGO_BOX_W)) / 2));
  const top = Math.max(0, Math.round((LOGO_BOX_H - (meta.height || LOGO_BOX_H)) / 2));
  return sharp({
    create: {
      width: LOGO_BOX_W,
      height: LOGO_BOX_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite([{ input: fitted, left, top }])
    .png()
    .toBuffer();
}

function logoOrigin(position: LogoPosition, w: number, h: number): { left: number; top: number } {
  const left = position === 'bottom_left' || position === 'top_left' ? SAFE : w - SAFE - LOGO_BOX_W;
  const top = position === 'top_left' || position === 'top_right' ? SAFE : h - SAFE - LOGO_BOX_H;
  return { left, top };
}

export const DEFAULT_LAB_PALETTE: LabPalette = {
  background: '#F6EEE4',
  secondary: '#CBBFB1',
  depth: '#393939',
  accent: '#CBBFB1',
  primary: '#393939',
};

type Rect = { x: number; y: number; w: number; h: number };

function typeColumn(
  canvasW: number,
  canvasH: number,
  topReserve: number,
  bottomReserve: number,
  margin: number,
): Rect {
  return {
    x: margin,
    y: topReserve + margin,
    w: canvasW - margin * 2,
    h: canvasH - topReserve - bottomReserve - margin * 2,
  };
}

type PresetCtx = {
  /** margin as a fraction of width */
  mw: number;
  /** margin as a fraction of height */
  mh: number;
  /** logo-strip reserves, as height fractions */
  topR: number;
  botR: number;
  /** gap between photo and type, as a width fraction */
  gapW: number;
  hasPair: boolean;
};

/**
 * The seven original hardcoded layouts, expressed as data. These are no
 * longer the only possible output — they're the known-good floor the engine
 * falls back to when the AI declines to author a composition or authors an
 * invalid one, and the reference vocabulary shown to the AI in the prompt.
 */
// Presets describe geometry only; photoShape/panels/textElements default at
// the resolve site, so the seven known-good looks stay exactly as they were.
const COMPOSITION_PRESETS: Record<LabLayout, (c: PresetCtx) => Omit<LabComposition, 'photoShape' | 'textAlign' | 'typeScale'>> = {
  cover: (c) => {
    const pw = 0.49;
    const ph = 0.7;
    const py = (1 - ph) / 2;
    const px = 1 - c.mw - pw;
    return {
      photoMode: 'framed',
      photoBox: { x: px, y: py, w: pw, h: ph },
      typeBox: { x: c.mw, y: py, w: Math.max(0.2, px - c.gapW - c.mw), h: ph },
      typeOnPhoto: false,
      typeAlign: 'center',
    };
  },
  framed_cta: (c) => {
    const pw = 0.44;
    const ph = 0.7;
    const py = (1 - ph) / 2;
    const tx = c.mw + pw + c.gapW;
    return {
      photoMode: 'framed',
      photoBox: { x: c.mw, y: py, w: pw, h: ph },
      typeBox: { x: tx, y: py, w: Math.max(0.2, 1 - c.mw - tx), h: ph },
      typeOnPhoto: false,
      typeAlign: 'center',
    };
  },
  banner: (c) => ({
    photoMode: 'full_bleed',
    photoBox: { x: 0, y: 0, w: 1, h: 1 },
    typeBox: { x: c.mw, y: 1 - c.botR - c.mh - 0.36, w: 1 - c.mw * 2, h: 0.36 },
    typeOnPhoto: true,
    typeAlign: 'bottom',
  }),
  minimal_caption: (c) => ({
    photoMode: 'full_bleed',
    photoBox: { x: 0, y: 0, w: 1, h: 1 },
    typeBox: { x: c.mw, y: 1 - c.botR - c.mh - 0.2, w: 1 - c.mw * 2, h: 0.2 },
    typeOnPhoto: true,
    typeAlign: 'bottom',
  }),
  stacked_quote: (c) => {
    const py = c.topR + c.mh;
    const ph = (1 - c.topR - c.botR) * 0.55;
    const ty = py + ph + c.mh;
    return {
      photoMode: 'framed',
      photoBox: { x: c.mw, y: py, w: 1 - c.mw * 2, h: ph },
      typeBox: { x: c.mw, y: ty, w: 1 - c.mw * 2, h: Math.max(0.15, 1 - c.botR - c.mh - ty) },
      typeOnPhoto: false,
      typeAlign: 'top',
    };
  },
  type_step: (c) => {
    const pw = 0.4;
    const ph = 0.32;
    const px = 1 - c.mw - pw;
    return {
      photoMode: 'framed',
      photoBox: { x: px, y: 1 - c.botR - c.mh - ph, w: pw, h: ph },
      typeBox: { x: c.mw, y: c.topR + c.mh, w: Math.min(0.58, px - c.gapW - c.mw), h: 1 - c.topR - c.botR - c.mh * 2 },
      typeOnPhoto: false,
      typeAlign: 'top',
    };
  },
  split: (c) => {
    const ty = c.topR + c.mh;
    const th = 0.24;
    const py = ty + th;
    return {
      photoMode: 'dual_framed',
      photoBox: { x: c.mw, y: py, w: 1 - c.mw * 2, h: Math.max(0.25, 1 - c.botR - c.mh - py) },
      typeBox: { x: c.mw, y: ty, w: 1 - c.mw * 2, h: th },
      typeOnPhoto: false,
      typeAlign: 'top',
    };
  },
};

/**
 * The photo-free poster fallback: type held in the upper half, the content
 * block (prices, steps, a quote) beneath it, and the whole safe area to work
 * in. Deliberately generous — a poster with no photograph has to carry the
 * frame with type and colour alone, so timid margins read as an empty slide.
 */
const TYPOGRAPHIC_PRESET = (c: PresetCtx): Omit<LabComposition, 'photoShape' | 'textAlign' | 'typeScale'> => {
  const top = c.topR + c.mh;
  const bottom = 1 - c.botR - c.mh;
  return {
    photoMode: 'typographic',
    photoBox: { x: 0, y: 0, w: 0, h: 0 },
    typeBox: { x: c.mw, y: top, w: 1 - c.mw * 2, h: (bottom - top) * 0.44 },
    typeOnPhoto: false,
    typeAlign: 'top',
  };
};

/**
 * What the AI actually authors — grid regions rather than resolved boxes.
 * Raw fraction boxes stay accepted so presets and legacy callers still work.
 */
export type LabCompositionInput = Partial<Omit<LabComposition, 'detached' | 'blocks'>> & {
  photoRegion?: GridRegion;
  textRegion?: GridRegion;
  detached?: Partial<LabDetachedText> & { region?: GridRegion };
  blocks?: unknown;
};

/**
 * Nudges the text region just far enough to open a visible gutter.
 *
 * Returns the region unchanged when the gap is already fine, and null when
 * the two regions actually overlap — an overlap is a different mistake and
 * gets its own rejection rather than being silently papered over.
 *
 * Only the text edge moves: the photo region was chosen to suit the
 * photograph's own shape, so shrinking it would re-crop the picture, which is
 * exactly the damage this repair exists to avoid.
 */
function openGutter(photo: FractionRect, type: FractionRect): FractionRect | null {
  const gaps = [
    { need: photo.x - (type.x + type.w), apply: (d: number) => ({ ...type, w: type.w - d }) },
    { need: type.x - (photo.x + photo.w), apply: (d: number) => ({ ...type, x: type.x + d, w: type.w - d }) },
    { need: photo.y - (type.y + type.h), apply: (d: number) => ({ ...type, h: type.h - d }) },
    { need: type.y - (photo.y + photo.h), apply: (d: number) => ({ ...type, y: type.y + d, h: type.h - d }) },
  ];
  const best = gaps.reduce((a, b) => (b.need > a.need ? b : a));
  if (best.need >= MIN_GUTTER) return type;
  if (best.need < 0) return null;
  return best.apply(MIN_GUTTER - best.need);
}

/**
 * Widens the text region until the headline genuinely fits.
 *
 * Rejecting here threw away the model's whole composition — including the
 * photo placement, which may have been perfect for the picture — because the
 * type column was a column too narrow. Widening is the change a designer
 * would make; discarding the layout is not.
 *
 * Grows only into space that is actually free: never over the photo (unless
 * the type is meant to sit on it), never past the safe area, and never closer
 * to the photo than the gutter rule allows.
 */
function widenForHeadline(
  typeBox: FractionRect,
  photoBox: FractionRect,
  opts: {
    typeOnPhoto: boolean;
    photoMode: LabComposition['photoMode'];
    safe: { x0: number; y0: number; x1: number; y1: number };
    fits: (box: FractionRect) => boolean;
  },
): FractionRect | null {
  const blocked = !opts.typeOnPhoto && opts.photoMode !== 'typographic';
  // How far the box may reach on each side before it meets the photo.
  const photoLeft = photoBox.x - MIN_GUTTER;
  const photoRight = photoBox.x + photoBox.w + MIN_GUTTER;
  const verticallyClear =
    typeBox.y + typeBox.h <= photoBox.y || typeBox.y >= photoBox.y + photoBox.h;

  let minX = opts.safe.x0;
  let maxX = opts.safe.x1;
  if (blocked && !verticallyClear) {
    // Beside the photo: it may only grow away from it.
    if (typeBox.x + typeBox.w <= photoBox.x) maxX = Math.min(maxX, photoLeft);
    else if (typeBox.x >= photoBox.x + photoBox.w) minX = Math.max(minX, photoRight);
    else return null;
  }

  const fullX = Math.max(minX, Math.min(typeBox.x, maxX));
  const fullW = Math.max(0, maxX - fullX);
  if (fullW <= typeBox.w) return null;

  // A few steps rather than jumping straight to the widest box: the narrowest
  // region that fits keeps the composition closest to what was authored.
  for (let step = 1; step <= 5; step += 1) {
    const t = step / 5;
    const w = typeBox.w + (fullW - typeBox.w) * t;
    const x = typeBox.x + (fullX - typeBox.x) * t;
    const candidate = { ...typeBox, x, w };
    if (candidate.w >= MIN_TYPE_W_FRACTION && opts.fits(candidate)) return candidate;
  }
  return null;
}

/**
 * Moves a content block into the nearest clear horizontal band.
 *
 * A steps or price block landing on the type region is a placement mistake,
 * not a reason to discard the entire post. This finds the tallest band that
 * clears every obstacle and drops the block into it at its authored height.
 */
function reflowBlock(
  box: FractionRect,
  obstacles: FractionRect[],
  safe: { x0: number; y0: number; x1: number; y1: number },
): FractionRect | null {
  const solid = obstacles.filter((o) => o.w > 0 && o.h > 0);
  const lowest = solid.length ? Math.max(...solid.map((r) => r.y + r.h)) : safe.y0;
  const highest = solid.length ? Math.min(...solid.map((r) => r.y)) : safe.y1;

  const bands = [
    { y: lowest + MIN_GUTTER, h: safe.y1 - (lowest + MIN_GUTTER) },
    { y: safe.y0, h: highest - MIN_GUTTER - safe.y0 },
  ].filter((b) => b.h >= Math.min(box.h, 0.12));

  if (!bands.length) return null;
  const band = bands.reduce((a, b) => (b.h > a.h ? b : a));
  const h = Math.min(box.h, band.h);
  const moved = { x: safe.x0, y: band.y, w: safe.x1 - safe.x0, h };
  return solid.some((o) => rectsOverlap(moved, o)) ? null : moved;
}

export type CompositionRejection = { ok: false; reason: string };
export type CompositionAccepted = { ok: true; composition: LabComposition };

/**
 * Deterministic gate on AI-authored geometry. Nothing here is a judgement
 * call — it's the set of conditions under which the render would come out
 * broken or illegible. Anything rejected falls back to a preset, so an
 * adventurous-but-wrong composition costs variety, never a broken post.
 */
export function validateComposition(
  raw: LabCompositionInput | undefined,
  ctx: {
    canvasW: number;
    canvasH: number;
    hasPair: boolean;
    /** Is there any photograph at all? A photo mode without one renders an empty frame. */
    hasPhoto: boolean;
    /** Does the whole stack (pill + headline + subhead + cta) fit? Used for the legacy typeBox. */
    headlineFits: (typeBoxPx: Rect) => boolean;
    /** Does the headline ALONE fit? Free-placed elements each hold one role, so the stack measure would wrongly reject them. */
    headlineOnlyFits?: (boxPx: Rect) => boolean;
    /** The grid is laid over this region (inside margins and any logo strip). */
    safeArea: { x0: number; y0: number; x1: number; y1: number };
    /** Content the post actually carries — a block with no content would render an empty hole. */
    content?: FormatContent;
  },
): CompositionAccepted | CompositionRejection {
  if (!raw) return { ok: false, reason: 'no composition supplied' };

  const photoMode = raw.photoMode;
  if (
    photoMode !== 'framed' &&
    photoMode !== 'full_bleed' &&
    photoMode !== 'dual_framed' &&
    photoMode !== 'typographic'
  ) {
    return { ok: false, reason: `invalid photoMode "${String(photoMode)}"` };
  }
  if (photoMode === 'dual_framed' && !ctx.hasPair) {
    return { ok: false, reason: 'dual_framed requires two photos' };
  }
  // A photo-carrying mode with no photo to carry would render an empty frame.
  if (photoMode !== 'typographic' && !ctx.hasPhoto) {
    return { ok: false, reason: `photoMode "${photoMode}" needs a photo, and this post has none` };
  }

  // Grid regions are the authoring surface; raw fraction boxes remain
  // supported so the presets (and any legacy caller) keep working.
  const safe = ctx.safeArea;
  const photoFromGrid = raw.photoRegion ? gridToFraction(raw.photoRegion as GridRegion, safe) : null;
  const textFromGrid = raw.textRegion ? gridToFraction(raw.textRegion as GridRegion, safe) : null;
  if (raw.photoRegion && !photoFromGrid) return { ok: false, reason: 'photoRegion is outside the 12x12 grid' };
  if (raw.textRegion && !textFromGrid) return { ok: false, reason: 'textRegion is outside the 12x12 grid' };

  // A typographic poster has no photo box. Zero-sized rather than optional so
  // every downstream consumer (signatures, fallback block placement, the
  // renderer) keeps working on one shape without a null check at each site.
  const photoBox =
    photoMode === 'typographic'
      ? { x: 0, y: 0, w: 0, h: 0 }
      : photoMode === 'full_bleed'
        ? { x: 0, y: 0, w: 1, h: 1 }
        : (photoFromGrid ?? sanitizeRect(raw.photoBox));
  if (!photoBox) return { ok: false, reason: 'invalid photoBox/photoRegion' };
  let typeBox = textFromGrid ?? sanitizeRect(raw.typeBox);
  if (!typeBox) return { ok: false, reason: 'invalid typeBox/textRegion' };

  if (photoMode !== 'full_bleed' && photoMode !== 'typographic' && (photoBox.w < MIN_PHOTO_FRACTION || photoBox.h < MIN_PHOTO_FRACTION)) {
    return { ok: false, reason: `photo region too small (${photoBox.w.toFixed(2)}x${photoBox.h.toFixed(2)})` };
  }
  if (typeBox.w < MIN_TYPE_W_FRACTION || typeBox.h < MIN_TYPE_H_FRACTION) {
    return { ok: false, reason: `text region too small (${typeBox.w.toFixed(2)}x${typeBox.h.toFixed(2)})` };
  }

  const typeOnPhoto = photoMode === 'typographic'
    ? false
    : raw.typeOnPhoto === true || photoMode === 'full_bleed';
  if (photoMode !== 'typographic' && !typeOnPhoto && rectsOverlap(photoBox, typeBox)) {
    return { ok: false, reason: 'photo and text regions overlap without typeOnPhoto' };
  }
  // Craft: regions that merely touch read as a collision, not a composition.
  // (typeOnPhoto is always true for full_bleed, so this branch is framed-only.)
  //
  // Repaired rather than rejected. Grid regions are integers, so the natural
  // thing for the model to author — photo in columns 6-12, type in 1-5 — puts
  // the two edges exactly together and scores a gap of precisely zero. That
  // was throwing away the entire authored composition (and with it the
  // photo placement that actually suited the picture) over a quarter of a
  // grid cell, which is the single most common rejection in the logs. Nudging
  // one edge is a smaller intervention than replacing the whole design with a
  // preset, and it keeps the model's intent.
  if (photoMode !== 'typographic' && !typeOnPhoto) {
    const opened = openGutter(photoBox, typeBox);
    if (!opened) {
      return { ok: false, reason: 'photo and text regions need a visible gutter between them' };
    }
    if (opened.w < MIN_TYPE_W_FRACTION || opened.h < MIN_TYPE_H_FRACTION) {
      return { ok: false, reason: 'no room for a gutter between the photo and the text' };
    }
    typeBox = opened;
  }

  let typeBoxPx: Rect = {
    x: Math.round(typeBox.x * ctx.canvasW),
    y: Math.round(typeBox.y * ctx.canvasH),
    w: Math.round(typeBox.w * ctx.canvasW),
    h: Math.round(typeBox.h * ctx.canvasH),
  };
  if (!ctx.headlineFits(typeBoxPx)) {
    // Widen rather than discard — see widenForHeadline.
    const widened = widenForHeadline(typeBox, photoBox, {
      typeOnPhoto,
      photoMode,
      safe,
      fits: (box) =>
        ctx.headlineFits({
          x: Math.round(box.x * ctx.canvasW),
          y: Math.round(box.y * ctx.canvasH),
          w: Math.round(box.w * ctx.canvasW),
          h: Math.round(box.h * ctx.canvasH),
        }),
    });
    if (!widened) return { ok: false, reason: 'headline does not fit in typeBox' };
    typeBox = widened;
  }

  const typeAlign = raw.typeAlign === 'top' || raw.typeAlign === 'center' || raw.typeAlign === 'bottom'
    ? raw.typeAlign
    : 'center';

  const photoShape: PhotoShape = PHOTO_SHAPES.includes(raw.photoShape as PhotoShape)
    ? (raw.photoShape as PhotoShape)
    : 'rect';

  // Panels are cosmetic and clamped, so a bad one is dropped rather than
  // failing the whole composition.
  const panels: LabPanel[] = Array.isArray(raw.panels)
    ? raw.panels
        .map((panel) => {
          const box = sanitizeRect(panel?.box);
          if (!box || box.w < 0.05 || box.h < 0.05) return null;
          const opacity = Number(panel?.opacity);
          return {
            box,
            colorRole: COLOR_ROLES.includes(panel?.colorRole as ColorRole) ? (panel.colorRole as ColorRole) : 'secondary',
            opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.04, opacity)) : 0.5,
          };
        })
        .filter((x): x is LabPanel => !!x)
        .slice(0, 3)
    : [];

  const textAlign: 'left' | 'center' | 'right' =
    raw.textAlign === 'center' || raw.textAlign === 'right' ? raw.textAlign : 'left';
  const typeScale: TypeScaleId =
    raw.typeScale === 'compact' || raw.typeScale === 'dramatic' ? raw.typeScale : 'balanced';

  // Craft: a centred text block against a centred photo is the "everything
  // stacked down the middle" look that reads as a template. One of the two
  // has to carry the composition.
  const photoCentred = Math.abs(photoBox.x + photoBox.w / 2 - 0.5) < 0.08;
  const textCentred = Math.abs(typeBox.x + typeBox.w / 2 - 0.5) < 0.08;
  // Repaired, not rejected: the fault is one alignment value, and left-setting
  // the type gives the composition the anchor the rule is asking for without
  // throwing away the geometry around it.
  let resolvedAlign = textAlign;
  if (photoMode !== 'full_bleed' && photoMode !== 'typographic' && textAlign === 'center' && photoCentred && textCentred) {
    resolvedAlign = 'left';
  }

  // A detached role must share an alignment edge with the group or the photo.
  // Without this rule the last build produced CTAs floating in a corner with
  // no relationship to anything on the canvas.
  let detached: LabDetachedText | undefined;
  const rawDetached: any = raw.detached;
  if (rawDetached && TEXT_ROLES.includes(rawDetached.role as TextRole)) {
    const box = gridToFraction(rawDetached.region as GridRegion, safe) ?? sanitizeRect(rawDetached.box);
    if (!box) return { ok: false, reason: 'detached element has an invalid region' };
    const min = MIN_TEXT_SIZE[rawDetached.role as TextRole];
    if (box.w < min.w || box.h < min.h) {
      return { ok: false, reason: `detached "${rawDetached.role}" too small (${box.w.toFixed(2)}x${box.h.toFixed(2)})` };
    }
    if (rectsOverlap(box, typeBox) || (!typeOnPhoto && photoMode !== 'typographic' && rectsOverlap(box, photoBox))) {
      return { ok: false, reason: `detached "${rawDetached.role}" overlaps another region` };
    }
    const edges = [typeBox.x, typeBox.x + typeBox.w, photoBox.x, photoBox.x + photoBox.w];
    const aligned = edges.some((e) => Math.abs(box.x - e) < ALIGN_TOLERANCE || Math.abs(box.x + box.w - e) < ALIGN_TOLERANCE);
    if (!aligned) {
      return { ok: false, reason: `detached "${rawDetached.role}" shares no alignment edge with the text or photo` };
    }
    detached = {
      role: rawDetached.role as TextRole,
      box,
      align: rawDetached.align === 'center' || rawDetached.align === 'right' ? rawDetached.align : 'left',
    };
  }

  // Content blocks. These are what make a post a different KIND of post
  // rather than the same parts re-parked, so they get the same deterministic
  // gate as everything else: too small to read, off-grid, or colliding with
  // the photo or type means the whole composition falls back to a preset.
  const blocks: ResolvedBlock[] = [];
  const placed = coercePlacedBlocks(raw.blocks, ctx.content);
  for (const b of placed) {
    let box = gridToFraction(b.region, safe);
    if (!box) return { ok: false, reason: `block "${b.kind}" is outside the 12x12 grid` };
    const min = MIN_BLOCK_SPAN[b.kind];
    if (b.region.colSpan < min.colSpan || b.region.rowSpan < min.rowSpan) {
      return {
        ok: false,
        reason: `block "${b.kind}" too small (${b.region.colSpan}x${b.region.rowSpan}, needs ${min.colSpan}x${min.rowSpan})`,
      };
    }
    // A badge is a chip and reads fine over an image; everything else needs
    // its own clear ground to stay legible.
    const mayOverlapPhoto = b.kind === 'badge';
    if (!mayOverlapPhoto && photoMode !== 'full_bleed' && photoMode !== 'typographic' && rectsOverlap(box, photoBox)) {
      return { ok: false, reason: `block "${b.kind}" overlaps the photo` };
    }
    if (rectsOverlap(box, typeBox)) {
      // Observed live: the critic widened a text region, the steps block then
      // collided with it, and the whole post fell back to a preset. Moving the
      // block is the smaller, better correction.
      const moved = reflowBlock(box, [typeBox, ...(photoMode === 'typographic' || photoMode === 'full_bleed' ? [] : [photoBox])], safe);
      if (!moved) return { ok: false, reason: `block "${b.kind}" overlaps the text region` };
      box = moved;
    }
    if (detached && rectsOverlap(box, detached.box)) {
      return { ok: false, reason: `block "${b.kind}" overlaps the detached ${detached.role}` };
    }
    for (const other of blocks) {
      if (rectsOverlap(box, other.box)) {
        return { ok: false, reason: `blocks "${b.kind}" and "${other.kind}" overlap` };
      }
    }
    blocks.push({ kind: b.kind, box });
  }

  return { ok: true, composition: { photoMode, photoBox, photoShape, typeBox, typeOnPhoto, typeAlign, textAlign: resolvedAlign, typeScale, detached, panels, blocks } };
}

/**
 * Shapes that must stay geometrically true. A circle mask over a 3:1
 * region isn't a circle — it's a squashed ellipse. Arches also collapse
 * into a lozenge when the region is much wider than tall, so their aspect
 * is capped rather than squared.
 */
function squareRegionForShape(box: Rect, shape: PhotoShape): Rect {
  if (shape === 'circle' || shape === 'pill') {
    const side = Math.min(box.w, box.h);
    return {
      x: box.x + Math.round((box.w - side) / 2),
      y: box.y + Math.round((box.h - side) / 2),
      w: side,
      h: side,
    };
  }
  if (shape === 'arch') {
    // An arch reads correctly when it is at least as tall as it is wide.
    const width = Math.min(box.w, box.h);
    return { x: box.x + Math.round((box.w - width) / 2), y: box.y, w: width, h: box.h };
  }
  return box;
}

/**
 * Places content blocks when the AI's composition was rejected and we fell
 * back to a preset.
 *
 * Without this, a rejected composition silently drops the blocks: an "offer"
 * post loses its price rows and its discount badge and renders as an ordinary
 * statement post, with the studio none the wiser. The content is the whole
 * reason that format was chosen, so it has to survive the fallback.
 *
 * Deterministic: find the largest clear horizontal band inside the safe area
 * that misses the photo and the type, and stack the blocks into it.
 */
function fallbackBlockPlacement(
  kinds: BlockKind[],
  photoBox: FractionRect,
  typeBox: FractionRect,
  typeOnPhoto: boolean,
  safe: { x0: number; y0: number; x1: number; y1: number },
): ResolvedBlock[] {
  if (!kinds.length) return [];
  const obstacles = typeOnPhoto ? [typeBox] : [photoBox, typeBox];
  const lowest = Math.max(...obstacles.map((r) => r.y + r.h));
  const highest = Math.min(...obstacles.map((r) => r.y));

  const below = { top: lowest + MIN_GUTTER, height: safe.y1 - (lowest + MIN_GUTTER) };
  const above = { top: safe.y0, height: highest - MIN_GUTTER - safe.y0 };
  const band = below.height >= above.height ? below : above;
  if (band.height < 0.13) return [];

  const width = safe.x1 - safe.x0;
  // A badge is a chip and shares its row; the rest stack.
  const stacked = kinds.filter((k) => k !== 'badge');
  const badge = kinds.includes('badge') ? 'badge' : null;
  const out: ResolvedBlock[] = [];

  const badgeH = badge ? Math.min(0.07, band.height * 0.3) : 0;
  if (badge) {
    out.push({ kind: 'badge', box: { x: safe.x0, y: band.top, w: Math.min(0.3, width), h: badgeH } });
  }
  const rest = band.height - badgeH - (badge ? MIN_GUTTER : 0);
  if (stacked.length && rest >= 0.1) {
    const each = (rest - MIN_GUTTER * (stacked.length - 1)) / stacked.length;
    let y = band.top + badgeH + (badge ? MIN_GUTTER : 0);
    for (const kind of stacked) {
      out.push({ kind, box: { x: safe.x0, y, w: width, h: each } });
      y += each + MIN_GUTTER;
    }
  }
  return out;
}

function colorForRole(role: ColorRole, p: LabPalette): string {
  switch (role) {
    case 'primary': return p.primary;
    case 'secondary': return p.secondary;
    case 'accent': return p.accent;
    case 'depth': return p.depth;
    case 'background':
    default: return p.background;
  }
}

function fracToPx(r: FractionRect, w: number, h: number): Rect {
  return { x: Math.round(r.x * w), y: Math.round(r.y * h), w: Math.round(r.w * w), h: Math.round(r.h * h) };
}

/**
 * Renders a framed photo sized to fit inside `box` and centred in it.
 * framedPhoto() grows the image by the mat and shadow padding, so the inner
 * photo dimensions are derived by subtracting that chrome from the target
 * box — this is what lets arbitrary AI-authored boxes drive placement.
 */
async function framedPhotoInBox(
  buffer: Buffer,
  box: Rect,
  radius: number,
  matColor: string,
  style: FrameStyle,
  shape: PhotoShape = 'rect',
  focus?: PhotoFocus,
): Promise<{ img: Buffer; rect: Rect }> {
  const shaped = shape !== 'rect' && shape !== 'rounded';
  const chrome = shaped ? 0 : style.matPad * 2 + (style.shadowOpacity > 0 ? SHADOW : Math.max(style.borderWidth * 2, 6));
  const innerW = Math.max(40, box.w - chrome);
  const innerH = Math.max(40, box.h - chrome);
  const framed = await framedPhoto(buffer, innerW, innerH, radius, matColor, style, shape, focus);
  const left = box.x + Math.round((box.w - framed.w) / 2);
  const top = box.y + Math.round((box.h - framed.h) / 2);
  return { img: framed.img, rect: { x: left, y: top, w: framed.w, h: framed.h } };
}

export async function renderLabSlide(params: {
  spec: LabSlideSpec;
  aspectRatio: string;
  palette: LabPalette;
  before?: Buffer;
  after?: Buffer;
  logo?: Buffer;
  logoPosition?: LogoPosition;
  typography?: LabTypography;
  mood?: MoodHint;
  // Abstract, on-mood AI-generated art (see guided-dna/generate-art.ts) — a
  // fully separate generation with no photo input at all, never the real
  // client photo. Only used on layouts where the photo doesn't already fill
  // the whole frame (banner/minimal_caption have nowhere for it to go).
  backgroundArt?: Buffer;
  // Which of 3 frame/mat treatments to use for this mood (see FRAME_VARIANTS)
  // — without this, every post for the same brand mood got the identical
  // frame/mat/shadow treatment even as layout/decoration varied.
  frameVariantIndex?: number;
  // AI-authored per-slide design brief (already clamped by the caller via
  // clampDesignSpec) — overrides the mood-based fallback field-by-field.
  designSpec?: Partial<LabDesignSpec>;
  // AI-authored geometry. Validated here; falls back to this layout's
  // preset (the original hardcoded look) if absent or invalid.
  composition?: LabCompositionInput;
  /** Called with the rejection reason when an authored composition is refused — lets callers measure how often the AI's geometry is unusable. */
  onCompositionFallback?: (reason: string) => void;
  /** Called with the composition that actually rendered (authored or preset) — this, not the request, is what creative memory should record. */
  onCompositionResolved?: (composition: LabComposition) => void;
  /**
   * Where the person is in the hero photograph, when known. Steers every crop
   * so the face stays in frame, and steers the full-bleed crop so the face
   * lands away from the type. Null degrades to the old attention heuristic.
   */
  subject?: SubjectBox | null;
}): Promise<Buffer> {
  const { w, h } = SIZES[params.aspectRatio] ?? SIZES['4:5'];
  const p = params.palette;
  const stampLogo = !!params.logo;
  const position = params.logoPosition || 'bottom_right';
  const photo = params.spec.photo === 'before' ? params.before : params.after;
  const before = params.before;
  const after = params.after ?? params.before;
  const hero = photo ?? after ?? before;
  // Deliberately not thrown here any more: whether a photo is required is a
  // property of the resolved composition, which is decided below. A
  // typographic poster has none by design, so the check moved to the point
  // where the mode is known.
  const wantsTypographic = params.composition?.photoMode === 'typographic';
  if (!hero && !wantsTypographic) throw new Error('No original photo to composite');

  const ink = contrastInk(p.background, p.depth);
  const typePalette: LabPalette = { ...p, depth: ink, primary: contrastInk(p.background, p.primary) };
  const canvas = sharp({
    create: { width: w, height: h, channels: 3, background: p.background },
  }).png();

  const layout = params.spec.layout;
  const m = Math.round(w * 0.065);
  const topReserve = stampLogo && position.startsWith('top') ? BRAND_STRIP : 0;
  const bottomReserve = stampLogo && position.startsWith('bottom') ? BRAND_STRIP : 0;
  const matColor = paperFrom(p.background);
  const gap = 32;

  // ── Composition resolution ────────────────────────────────────────────
  // Geometry is data now, not a branch per layout. The AI may author any
  // arrangement; anything missing or invalid falls back to the preset for
  // this layout, so the seven original looks remain a guaranteed floor.
  const hasPair = !!(before && after);
  const presetCtx: PresetCtx = {
    mw: m / w,
    mh: m / h,
    topR: topReserve / h,
    botR: bottomReserve / h,
    gapW: gap / w,
    hasPair,
  };
  const presetFor = COMPOSITION_PRESETS[layout] ?? COMPOSITION_PRESETS.cover;
  const fonts = stackFonts(params.typography, params.mood, params.designSpec);
  const headlineFits = (boxPx: Rect): boolean => {
    const planned = planCopy(params.spec, Math.max(160, boxPx.w), boxPx.h, w, fonts);
    // A region that can only hold the headline by throwing words away does
    // not fit it. Checking the stack height alone could never catch that,
    // because the height was computed from the shortened text.
    return !planned.head.overflow && planned.stackH <= boxPx.h;
  };
  const headlineOnlyFits = (boxPx: Rect): boolean => {
    const fitted = fitHeadline(
      params.spec.headline || 'The result',
      Math.max(80, boxPx.w),
      boxPx.h,
      Math.round(w * 0.06),
      24,
      4,
      fonts.heading,
    );
    return !fitted.overflow && fitted.height <= boxPx.h;
  };
  const safeArea = {
    x0: presetCtx.mw,
    y0: presetCtx.topR + presetCtx.mh,
    x1: 1 - presetCtx.mw,
    y1: 1 - presetCtx.botR - presetCtx.mh,
  };
  const validated = validateComposition(params.composition, {
    canvasW: w, canvasH: h, hasPair, hasPhoto: !!hero, headlineFits, headlineOnlyFits, safeArea,
    content: params.spec.content,
  });
  if (!validated.ok && params.composition) params.onCompositionFallback?.(validated.reason);
  let composition: LabComposition = validated.ok
    ? validated.composition
    : hero && !wantsTypographic
      ? { ...presetFor(presetCtx), photoShape: 'rect', textAlign: 'left', typeScale: 'balanced' }
      // Every named preset places a photo, so falling back to one would put a
      // photograph into a post that was deliberately composed without one —
      // or render an empty frame when there is nothing to place. A poster
      // falls back to a poster.
      : { ...TYPOGRAPHIC_PRESET(presetCtx), photoShape: 'rect', textAlign: 'left', typeScale: 'dramatic' };
  if (!validated.ok && params.spec.content) {
    // Keep the format's content alive through the fallback — see fallbackBlockPlacement.
    const kinds = BLOCK_KINDS.filter((k) => hasContentFor(k, params.spec.content));
    const placed = fallbackBlockPlacement(
      kinds, composition.photoBox, composition.typeBox, composition.typeOnPhoto, safeArea,
    );
    if (placed.length) composition = { ...composition, blocks: placed };
  }
  params.onCompositionResolved?.(composition);

  // Background art only makes sense when the photo doesn't already fill the
  // frame — keyed off the resolved composition, not a layout name, so an
  // AI-authored full-bleed correctly suppresses it too.
  // A typographic poster is brand colour and type — that is the whole idea of
  // it. Compositing a photographic texture behind one was an irrelevant
  // pairing with three costs: it buried the per-post colour treatment (six
  // brand-derived grounds) under a photograph, it made every poster look like
  // the same material because a mood only has three textures and a brand only
  // has one mood, and it put type over imagery so the plate logic fired and
  // added a panel that was never needed. Posters now sit on their own ground.
  const useBackgroundArt =
    !!params.backgroundArt &&
    composition.photoMode !== 'full_bleed' &&
    composition.photoMode !== 'typographic';
  const baseLayer = useBackgroundArt
    ? await fitBackgroundArt(params.backgroundArt!, w, h)
    : await backgroundGradient(w, h, p);
  const composites: sharp.OverlayOptions[] = [{ input: baseLayer, left: 0, top: 0 }];

  // Colour blocking sits under the photo and type — the split-field and
  // banded compositions that carry a lot of editorial design. Restricted to
  // palette roles, so it can never go off-brand.
  if (composition.panels?.length) {
    const rects = composition.panels
      .map((panel) => {
        const r = fracToPx(panel.box, w, h);
        return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${colorForRole(panel.colorRole, p)}" fill-opacity="${panel.opacity}"/>`;
      })
      .join('');
    composites.push({
      input: await rasterSvg(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`, w, h),
      left: 0,
      top: 0,
    });
  }

  const frameStyle = resolveFrameStyle(params.mood, p, 8, params.frameVariantIndex ?? 0, params.designSpec);
  const type: Rect = fracToPx(composition.typeBox, w, h);
  // A circle/pill mask stretched across a non-square region renders as a
  // squashed ellipse, which reads as a mistake rather than a crop. Square
  // the region (centred on where the AI put it) so the shape is a true
  // circle regardless of the region it was given.
  const photoBoxPx = squareRegionForShape(fracToPx(composition.photoBox, w, h), composition.photoShape);
  let photoA: Rect | null = null;
  let photoB: Rect | null = null;

  // The face steers every crop from here down. fx/fy are the subject's
  // centre in the source; where it LANDS depends on the layout.
  const focus: PhotoFocus | undefined = params.subject
    ? { fx: params.subject.x + params.subject.w / 2, fy: params.subject.y + params.subject.h / 2 }
    : undefined;

  if (composition.photoMode === 'typographic') {
    // Nothing to composite. The poster is carried by the colour fields, the
    // type and the content blocks that follow.
  } else if (composition.photoMode === 'full_bleed') {
    // On a full-bleed post the photograph and the type share one canvas, so
    // the crop is aimed to put the face in the band the type does NOT occupy.
    // This was the critic's most common failure: headline set straight across
    // the subject's head. The type's geometry is designed and validated, so
    // the photograph moves, not the words.
    const fullBleedFocus = focus
      ? { ...focus, ty: faceTargetAwayFromType(composition.typeBox) }
      : undefined;
    composites.push({ input: await coverSlot(hero!, w, h, 0, 'rect', fullBleedFocus), left: 0, top: 0 });
  } else if (composition.photoMode === 'dual_framed' && before && after) {
    // Let the photographs decide which way the pair splits. Halving the WIDTH
    // of a tall region — which is what this did unconditionally — turned two
    // portraits into two 0.18-aspect slivers.
    const pairAspect = await photoAspect(before);
    const orientation = splitOrientationFor(photoBoxPx, pairAspect, gap);
    let boxA: Rect;
    let boxB: Rect;
    if (orientation === 'stacked') {
      const halfH = Math.max(80, Math.floor((photoBoxPx.h - gap) / 2));
      boxA = { ...photoBoxPx, h: halfH };
      boxB = { ...photoBoxPx, y: photoBoxPx.y + halfH + gap, h: halfH };
    } else {
      const halfW = Math.max(80, Math.floor((photoBoxPx.w - gap) / 2));
      boxA = { ...photoBoxPx, w: halfW };
      boxB = { ...photoBoxPx, x: photoBoxPx.x + halfW + gap, w: halfW };
    }
    // The subject box was measured on the BEFORE photo; the after shot is a
    // different exposure of the same person, so the same centre is a better
    // guess than a texture heuristic for both.
    const a = await framedPhotoInBox(before, boxA, 8, matColor, frameStyle, composition.photoShape, focus);
    const b = await framedPhotoInBox(after, boxB, 8, matColor, frameStyle, composition.photoShape, focus);
    composites.push(
      { input: await photoGlow(w, h, a.rect, p.accent), left: 0, top: 0 },
      { input: await photoGlow(w, h, b.rect, p.accent), left: 0, top: 0 },
      { input: a.img, left: a.rect.x, top: a.rect.y },
      { input: b.img, left: b.rect.x, top: b.rect.y },
    );
    photoA = a.rect;
    photoB = b.rect;
  } else {
    // Same principle for a single photo: a slot whose shape disagrees badly
    // with the photograph gets reshaped rather than eating the subject.
    const heroBox = composition.photoShape === 'rect' || composition.photoShape === 'rounded'
      ? fitBoxToAspect(photoBoxPx, await photoAspect(hero!))
      : photoBoxPx;
    const framed = await framedPhotoInBox(hero!, heroBox, 8, matColor, frameStyle, composition.photoShape, focus);
    composites.push(
      { input: await photoGlow(w, h, framed.rect, p.accent), left: 0, top: 0 },
      { input: framed.img, left: framed.rect.x, top: framed.rect.y },
    );
    photoA = framed.rect;
  }

  // Measured, not assumed: only plate the type when the pixels actually
  // behind it are busy or low-contrast. Type over a photo already has the
  // scrim treatment, so it never needs this.
  // Measured against everything drawn so far — background AND photo — rather
  // than against the brand's background colour. Type sitting on a photo was
  // previously always painted white on the assumption that a bottom-anchored
  // scrim would carry it; that scrim contributes almost nothing above the 42%
  // mark, so white type on a pale photo at the top of the frame was
  // effectively invisible.
  const beneath = composites.length
    ? await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: baseLayer, left: 0, top: 0 }, ...composites])
        .png()
        .toBuffer()
        .catch(() => baseLayer)
    : baseLayer;
  const ground = await measureGround(beneath, type, w, h);

  let photoTypeInk: string | undefined;
  let needsTypePlate = false;
  if (ground) {
    const preferred = composition.typeOnPhoto ? '#FFFFFF' : typePalette.depth;
    const ink = inkForGround(ground.meanHex, preferred);
    if (composition.typeOnPhoto) photoTypeInk = ink;
    // A plate is the last resort: only when even the best-contrasting ink
    // can't clear the bar, or the ground is too textured to read type over.
    //
    // "Too textured" may only be argued when there is actually an image
    // behind the type. `busy` is the region's overall spread, which a smooth
    // background gradient scores just as highly as real texture does — so on
    // a plain brand canvas it was drawing an opaque plate behind type that
    // already had 6:1 contrast, and the post gained a UI-looking card for no
    // legibility benefit. Over a flat or gradient ground, contrast alone
    // decides; over imagery, texture still gets its say.
    const overImagery = composition.typeOnPhoto || useBackgroundArt;
    const required = overImagery && ground.busy > 0.10 ? MIN_TEXT_CONTRAST : MIN_DISPLAY_CONTRAST;
    needsTypePlate =
      (overImagery && ground.busy > 0.16) || contrastRatio(ground.meanHex, ink) < required;
  } else {
    needsTypePlate = !composition.typeOnPhoto && useBackgroundArt;
  }

  // Each block gets its ground measured the same way the type group does, so
  // its ink contrasts with what is actually behind it and it only receives a
  // plate when the pixels demand one.
  const measuredBlocks = composition.blocks
    ? await Promise.all(
        composition.blocks.map(async (b) => {
          const box = fracToPx(b.box, w, h);
          const g = await measureGround(beneath, box, w, h);
          if (!g) return { kind: b.kind, box };
          const ink = inkForGround(g.meanHex, typePalette.depth);
          const required = g.busy > 0.10 ? MIN_TEXT_CONTRAST : MIN_DISPLAY_CONTRAST;
          // A badge is already a solid filled chip carrying its own contrast —
          // plating it just draws an empty card around it.
          const plate = b.kind !== 'badge' && (g.busy > 0.16 || contrastRatio(g.meanHex, ink) < required);
          return { kind: b.kind, box, ink, plate };
        }),
      )
    : undefined;

  const svg = buildChromeSvg({
    w, h, spec: params.spec, palette: typePalette, logoPosition: position, showBrandStrip: stampLogo, type, photoA, photoB,
    typography: params.typography, mood: params.mood, needsTypePlate, designSpec: params.designSpec,
    typeOnPhoto: composition.typeOnPhoto, typeAlign: composition.typeAlign, photoTypeInk,
    designSystem: validated.ok
      ? { textAlign: composition.textAlign, typeScale: composition.typeScale, detached: composition.detached }
      : undefined,
    blocks: measuredBlocks,
  });
  composites.push({ input: await rasterSvg(svg, w, h), left: 0, top: 0 });

  if (params.logo) {
    const { left, top } = logoOrigin(position, w, h);
    // A logo over a full-bleed photo needs its own plate to stay legible.
    if (composition.photoMode === 'full_bleed') {
      const plate = await rasterSvg(
        `<svg width="${LOGO_BOX_W + 28}" height="${LOGO_BOX_H + 20}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${LOGO_BOX_W + 28}" height="${LOGO_BOX_H + 20}" rx="10" fill="${p.background}" fill-opacity="0.92"/>
        </svg>`,
        LOGO_BOX_W + 28,
        LOGO_BOX_H + 20,
      );
      composites.push({ input: plate, left: left - 14, top: top - 10 });
    }
    composites.push({ input: params.logo, left, top });
  }

  return canvas.composite(composites).png({ compressionLevel: 8, quality: 100 }).toBuffer();
}

/** Heading and body faces for measurement. Optional so callers without typography still work, on the old ratio. */
type StackFonts = { heading: FontSpec; body: FontSpec };

/**
 * The faces and letter-spacing a slide will actually be set in.
 *
 * Resolved exactly the way buildTypeStack resolves them — same designSpec
 * override, same per-mood fallback — so measurement and rendering cannot
 * drift apart. The body face carries no tracking because textLines() draws
 * the subhead at letter-spacing 0.
 */
function stackFonts(
  typography: LabTypography | undefined,
  mood: MoodHint | undefined,
  designSpec: Partial<LabDesignSpec> | undefined,
): StackFonts {
  const fallback = mood ? MOOD_TYPE_STYLE[mood] : DEFAULT_TYPE_STYLE;
  return {
    heading: {
      family: typography?.heading || DEFAULT_FONT_FAMILY,
      tracking: designSpec?.tracking ?? fallback.tracking,
    },
    body: { family: typography?.body || 'Inter', tracking: 0 },
  };
}

function planCopy(
  spec: LabSlideSpec,
  typeW: number,
  typeH: number,
  canvasW: number,
  fonts?: StackFonts,
) {
  const layout = spec.layout;
  const startSize = layout === 'banner'
    ? Math.round(canvasW * 0.05)
    : layout === 'type_step' || layout === 'stacked_quote'
      ? Math.round(canvasW * 0.068)
      : layout === 'split'
        ? Math.round(canvasW * 0.052)
        : layout === 'minimal_caption'
          ? Math.round(canvasW * 0.036)
          : Math.round(canvasW * 0.06);
  const inTypePill = layout !== 'split' && !!spec.pill;
  const inTypeCta = layout !== 'split' && !!spec.cta;
  const accent = layout !== 'banner';
  const sub = spec.subhead ? wrapToWidth(spec.subhead, SUB_SIZE, typeW, 2, fonts?.body) : [];
  const chrome = stackHeight({ pill: inTypePill, headH: 0, subLines: sub.length, cta: inTypeCta, accent });
  const head = fitHeadline(
    spec.headline || 'The result',
    typeW,
    // No floor. The old Math.max(72, …) handed the headline 72px of room that
    // the box did not have whenever the pill/subhead/CTA chrome consumed it,
    // so the stack was measured as fitting and then rendered overlapping
    // whatever sat below it.
    typeH - chrome - TYPE_PAD,
    startSize,
    layout === 'banner' ? 36 : layout === 'minimal_caption' ? 22 : 32,
    layout === 'split' || layout === 'minimal_caption' ? 2 : 3,
    fonts?.heading,
  );
  return {
    head,
    sub,
    stackH: stackHeight({ pill: inTypePill, headH: head.height, subLines: sub.length, cta: inTypeCta, accent }),
    inTypePill,
    inTypeCta,
    accent,
  };
}

function stackHeight(opts: {
  pill?: boolean;
  headH: number;
  subLines: number;
  cta?: boolean;
  accent?: boolean;
}): number {
  let y = 0;
  if (opts.accent !== false) y += ACCENT_H + 18;
  if (opts.pill) y += PILL_H + 22;
  y += opts.headH;
  if (opts.subLines) y += 16 + Math.ceil(opts.subLines * SUB_SIZE * SUB_LH);
  if (opts.cta) y += 26 + PILL_H;
  return y;
}

function buildTypeStack(opts: {
  x: number;
  y: number;
  w: number;
  spec: LabSlideSpec;
  palette: LabPalette;
  head: { lines: string[]; size: number; height: number };
  sub: string[];
  serif: string;
  sans: string;
  accent?: boolean;
  headFill?: string;
  subFill?: string;
  pillBg?: string;
  pillFg?: string;
  mood?: MoodHint;
  typeStyleOverride?: { headingWeight?: number; tracking?: number };
}): string {
  const p = opts.palette;
  const fallbackStyle = opts.mood ? MOOD_TYPE_STYLE[opts.mood] : DEFAULT_TYPE_STYLE;
  const typeStyle = {
    weight: opts.typeStyleOverride?.headingWeight ?? fallbackStyle.weight,
    tracking: opts.typeStyleOverride?.tracking ?? fallbackStyle.tracking,
  };
  let y = opts.y;
  let svg = '';
  if (opts.accent !== false) {
    svg += `<rect x="${opts.x}" y="${y}" width="44" height="${ACCENT_H}" fill="${p.accent}"/>`;
    y += ACCENT_H + 18;
  }
  if (opts.spec.pill) {
    svg += pill(opts.x, y, opts.spec.pill, opts.pillBg || p.depth, opts.pillFg || '#fff', opts.w);
    y += PILL_H + 22;
  }
  svg += textLines(opts.head.lines, opts.x, y, opts.head.size, opts.headFill || p.depth, opts.serif, typeStyle.weight, typeStyle.tracking);
  y += opts.head.height;
  if (opts.sub.length) {
    y += 16;
    svg += textLines(opts.sub, opts.x, y, SUB_SIZE, opts.subFill || p.primary, opts.sans, 400, 0, SUB_LH);
    y += Math.ceil(opts.sub.length * SUB_SIZE * SUB_LH);
  }
  if (opts.spec.cta) {
    y += 26;
    svg += pill(opts.x, y, opts.spec.cta, opts.pillBg || p.depth, opts.pillFg || '#fff', opts.w);
  }
  return svg;
}

// Mood → its default decorative motif, used only when the AI didn't specify
// one (or specified an off-vocab value) for a slide. Purely additive/low-
// opacity — never sits under text, never touches the photo region.
const MOOD_DECORATION: Record<MoodHint, LabDecoration> = {
  SOFT_GLAM: 'corner',
  CLEAN_CLINICAL: 'grid',
  EDITORIAL_MINIMAL: 'hairline',
  NATURAL_ORGANIC: 'dots',
  BOLD_LUXE: 'sparkle',
  PLAYFUL_FRESH: 'dots',
};

function decorationSvg(decoration: LabDecoration, mood: MoodHint | undefined, w: number, h: number, p: LabPalette, type: Rect, intensity = 1): string {
  if (decoration === 'none') return '';
  const accent = p.accent;
  switch (decoration) {
    case 'corner': {
      // Soft-glam / quiet-luxury corner bracket, top-right of the canvas.
      const s = Math.round(w * 0.09);
      const x = w - SAFE - s;
      const y = SAFE;
      return `<g opacity="${0.22 * intensity}" stroke="${accent}" stroke-width="1.5" fill="none">
        <path d="M ${x} ${y + s} L ${x} ${y} L ${x + s} ${y}"/>
      </g>`;
    }
    case 'grid': {
      // Clean-clinical fine tick marks along the left margin.
      const x = Math.round(w * 0.04);
      const top = Math.round(h * 0.08);
      const rows = 5;
      const gapY = Math.round(h * 0.05);
      let ticks = '';
      for (let i = 0; i < rows; i += 1) {
        const y = top + i * gapY;
        ticks += `<line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="${accent}" stroke-width="1"/>`;
      }
      return `<g opacity="${0.28 * intensity}">${ticks}</g>`;
    }
    case 'hairline': {
      // Editorial-minimal: a single quiet rule spanning the canvas above the
      // type block, echoing a magazine section break.
      const y = Math.max(SAFE, type.y - 22);
      return `<line x1="${SAFE}" y1="${y}" x2="${w - SAFE}" y2="${y}" stroke="${accent}" stroke-opacity="${0.3 * intensity}" stroke-width="1"/>`;
    }
    case 'dots': {
      // Natural/playful: a loose scatter of small dots in the corner
      // furthest from the type block, never overlapping it.
      const onRight = type.x < w / 2;
      const baseX = onRight ? w - Math.round(w * 0.16) : Math.round(w * 0.06);
      const baseY = Math.round(h * 0.08);
      const offsets = [[0, 0], [22, 10], [10, 26], [34, 30], [4, 44]];
      let dots = '';
      for (const [dx, dy] of offsets) {
        dots += `<circle cx="${baseX + dx}" cy="${baseY + dy}" r="3.5" fill="${accent}"/>`;
      }
      return `<g opacity="${0.24 * intensity}">${dots}</g>`;
    }
    case 'sparkle': {
      // Bold-luxe: a small four-point sparkle mark near the accent rule.
      const x = type.x + 6;
      const y = Math.max(SAFE, type.y - 34);
      return `<g opacity="${0.55 * intensity}" fill="${accent}">
        <path d="M ${x} ${y - 10} L ${x + 3} ${y - 2} L ${x + 11} ${y} L ${x + 3} ${y + 2} L ${x} ${y + 10} L ${x - 3} ${y + 2} L ${x - 11} ${y} L ${x - 3} ${y - 2} Z"/>
      </g>`;
    }
    default:
      return '';
  }
}

/**
 * Does the type actually need a plate behind it, or can it sit directly on
 * the background? An unconditional plate turns every art-backed post into
 * the same "floating cream card" template regardless of geometry — which is
 * its own kind of sameness. Measuring the real pixels under the type box
 * means calm backgrounds render clean and only busy/low-contrast ones pay
 * for the plate.
 */
/**
 * What is actually behind a region, after everything drawn so far. Ink choice
 * used to be made from the BRAND background colour, which is not what the
 * viewer sees once a photo or generated art covers the canvas — that is how
 * white type ended up on a pale photo, and dark type on dark art.
 */
async function measureGround(
  layer: Buffer,
  region: Rect,
  canvasW: number,
  canvasH: number,
): Promise<{ meanHex: string; busy: number } | null> {
  const left = Math.max(0, Math.min(canvasW - 1, region.x));
  const top = Math.max(0, Math.min(canvasH - 1, region.y));
  const width = Math.max(1, Math.min(canvasW - left, region.w));
  const height = Math.max(1, Math.min(canvasH - top, region.h));
  try {
    const stats = await sharp(layer).extract({ left, top, width, height }).stats();
    const [r, g, b] = stats.channels;
    if (!r || !g || !b) return null;
    // NOTE: this is the region's overall spread, so a smooth gradient scores
    // as "busy" alongside genuine texture. Callers must not treat it as a
    // texture measure on its own — see the plate decision, which only lets it
    // speak when there is actually imagery behind the type.
    return {
      meanHex: toHex(r.mean, g.mean, b.mean),
      busy: Math.max(r.stdev, g.stdev, b.stdev) / 255,
    };
  } catch {
    return null;
  }
}

/** Best-contrasting ink for a measured ground, preferring the brand ink when it genuinely reads. */
function inkForGround(meanHex: string, brandInk: string): string {
  if (contrastRatio(meanHex, brandInk) >= MIN_TEXT_CONTRAST) return brandInk;
  const light = '#FFFFFF';
  const dark = '#141210';
  return contrastRatio(meanHex, light) >= contrastRatio(meanHex, dark) ? light : dark;
}

async function regionNeedsPlate(baseLayer: Buffer, region: Rect, canvasW: number, canvasH: number, inkHex: string): Promise<boolean> {
  const left = Math.max(0, Math.min(canvasW - 1, region.x));
  const top = Math.max(0, Math.min(canvasH - 1, region.y));
  const width = Math.max(1, Math.min(canvasW - left, region.w));
  const height = Math.max(1, Math.min(canvasH - top, region.h));
  try {
    const stats = await sharp(baseLayer).extract({ left, top, width, height }).stats();
    const [r, g, b] = stats.channels;
    if (!r || !g || !b) return true;
    const busiest = Math.max(r.stdev, g.stdev, b.stdev) / 255;
    // Measured against the region's actual mean colour as a WCAG ratio, not
    // as a raw luminance delta — the old `< 0.34` test let genuinely muddy
    // combinations through, which is how text ended up low-contrast over
    // generated art even though this check was running.
    const meanHex = toHex(r.mean, g.mean, b.mean);
    const ratio = contrastRatio(meanHex, inkHex);
    // A busy region needs more headroom than a flat one: texture eats
    // legibility that a ratio measured on the mean cannot see.
    const required = busiest > 0.10 ? MIN_TEXT_CONTRAST : MIN_DISPLAY_CONTRAST;
    return busiest > 0.16 || ratio < required;
  } catch {
    return true; // Unreadable stats — take the safe path.
  }
}

/**
 * Renders each type role where the AI placed it, instead of welding all
 * four into one fixed-order column. This is what stops two posts reading as
 * the same design with the block moved — a headline top-left with the CTA
 * bottom-right is a different composition, not a repositioned one.
 */
// ── Content block renderers ──────────────────────────────────────────────
// These are the reason a Gemini Lab post can now be a different KIND of post
// rather than the same photo-plus-headline re-parked. Each draws itself into
// an AI-placed grid region using the same type primitives as the rest of the
// renderer, so a steps card and a statement post share one visual language.
//
// All sizing is derived from the region: a block never overflows the box it
// was given, and never renders text below its legibility floor.

type BlockCtx = {
  palette: LabPalette;
  serif: string;
  sans: string;
  content: FormatContent;
  /**
   * The bare families behind `serif`/`sans` (which are CSS stacks and cannot
   * be measured). Optional so the block renderers stay callable without them,
   * falling back to the flat ratio exactly as before.
   */
  fonts?: StackFonts;
};

/**
 * Width of a run of block text.
 *
 * Real metrics when the caller supplied the families. This matters most for
 * the price list: its leader dots are drawn FROM the end of the label TO the
 * start of the value, so a width that is 40% too wide (which the flat 0.58
 * was for Source Sans 3) either buries the dots under the label or opens a
 * visible gap before them.
 */
function textWidthApprox(text: string, size: number, font?: FontSpec): number {
  return font
    ? measureText(text, font.family, size, font.tracking ?? 0)
    : text.length * size * FALLBACK_ADVANCE_RATIO;
}

function clampSize(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Blocks size to their CONTENT and then align inside the region — they never
 * stretch to fill it. Dividing the region by item count spreads three steps
 * across half a canvas with holes between them, which reads as a layout bug
 * rather than as spacing. The type size is fitted down until the natural
 * height fits, exactly like fitHeadline does for headlines.
 */
function fitBlockSize(maxSize: number, minSize: number, naturalHeight: (size: number) => number, budget: number): number {
  for (let size = maxSize; size > minSize; size -= 1) {
    if (naturalHeight(size) <= budget) return size;
  }
  return minSize;
}

/** Vertically centre a content-height group inside its region. */
/**
 * Where a block's content starts inside its region.
 *
 * Lists read top-down and belong under the heading that introduces them.
 * Centring them opened a band of dead space between the headline and the
 * first row whenever a region was bigger than its content — three price rows
 * centred in an eight-row slot put half the canvas of nothing above them,
 * which is precisely the "significant dead space, looks unfinished" the
 * render critic reported on nearly every poster.
 *
 * A quote is the exception: it is one object, not a list, and centring is what
 * makes it read as a pull quote rather than a stray paragraph.
 */
/**
 * Row height that lets a short list fill the space it was given.
 *
 * A block packs its rows at their natural height and then sits in a region
 * sized for the longest list the format allows — so three price rows in a slot
 * built for five left most of the card empty. Top-aligning them only moved
 * that emptiness to the bottom.
 *
 * Opening the rows up instead uses the space as rhythm: a three-item price
 * card reads as a considered, airy list rather than a short one adrift in a
 * large box. Capped, because rows spaced further apart than this stop reading
 * as a list at all.
 */
function distributedRowHeight(natural: number, count: number, boxH: number): number {
  if (count <= 0) return natural;
  const available = Math.floor(boxH / count);
  return Math.max(natural, Math.min(available, Math.round(natural * 1.8)));
}

function blockStartY(box: Rect, total: number, align: 'top' | 'center' = 'top'): number {
  if (align === 'center') return box.y + Math.max(0, Math.round((box.h - total) / 2));
  return box.y;
}

/** Numbered technique steps — the "how it's done" walkthrough that gets saved. */
function renderStepsBlock(box: Rect, ctx: BlockCtx): string {
  const items = ctx.content.steps ?? [];
  if (!items.length) return '';
  const p = ctx.palette;
  const n = items.length;

  const metrics = (size: number) => {
    const detailSize = clampSize(size * 0.68, 11, 18);
    const numCol = Math.round(size * 1.5 * 1.25);
    const textW = Math.max(60, box.w - numCol);
    const gap = Math.round(size * 1.15);
    const heights = items.map((item) => {
      const labelLines = wrapToWidth(item.label, size, textW, 2, ctx.fonts?.body);
      const labelH = Math.ceil(labelLines.length * size * 1.22);
      const detailH = item.detail ? Math.round(detailSize * 0.35) + Math.ceil(detailSize * 1.3) : 0;
      return { labelLines, labelH, detailH, h: labelH + detailH };
    });
    return { detailSize, numCol, textW, gap, heights, total: heights.reduce((a, b) => a + b.h, 0) + gap * (n - 1) };
  };

  const size = fitBlockSize(clampSize(box.w * 0.046, 15, 27), 13, (s) => metrics(s).total, box.h);
  const m = metrics(size);
  if (m.total > box.h * 1.02) return '';

  const numSize = clampSize(size * 1.5, 18, 42);
  const textX = box.x + m.numCol;
  let y = blockStartY(box, m.total);
  let svg = '';

  items.forEach((item, i) => {
    const h = m.heights[i];
    // The oversized figure IS the design element here, not a bullet.
    svg += `<text x="${box.x}" y="${y}" font-family="${ctx.serif}" font-size="${numSize}" font-weight="600" fill="${p.accent}" dominant-baseline="hanging">${esc(String(i + 1))}</text>`;
    svg += textLinesAligned(h.labelLines, textX, y, size, p.depth, ctx.sans, 650, 0, 1.22, 'left');
    if (item.detail && h.detailH) {
      svg += textLinesAligned(
        wrapToWidth(item.detail, m.detailSize, m.textW, 1, ctx.fonts?.body),
        textX, y + h.labelH + Math.round(m.detailSize * 0.35),
        m.detailSize, p.primary, ctx.sans, 400, 0, 1.3, 'left',
      );
    }
    y += h.h;
    if (i < n - 1) {
      const ly = y + Math.round(m.gap / 2);
      svg += `<line x1="${textX}" y1="${ly}" x2="${box.x + box.w}" y2="${ly}" stroke="${p.depth}" stroke-opacity="0.14" stroke-width="1"/>`;
      y += m.gap;
    }
  });
  return svg;
}

/** Service and price rows — label left, value right, leader between. The classic menu setting. */
function renderRowsBlock(box: Rect, ctx: BlockCtx): string {
  const rows = ctx.content.rows ?? [];
  if (!rows.length) return '';
  const p = ctx.palette;
  const n = rows.length;

  const rowHeight = (size: number) => Math.round(size * 2.1);
  const size = fitBlockSize(clampSize(box.w * 0.038, 13, 24), 11, (s) => rowHeight(s) * n, box.h);
  const rowH = distributedRowHeight(rowHeight(size), n, box.h);
  const total = rowH * n;
  if (total > box.h * 1.02) return '';

  const rightX = box.x + box.w;
  const startY = blockStartY(box, total);
  let svg = '';

  rows.forEach((row, i) => {
    const top = startY + i * rowH + Math.round((rowH - size * 1.2) / 2);
    const label = wrapToWidth(row.label, size, box.w * 0.62, 1, ctx.fonts?.body)[0] ?? row.label;
    svg += textLinesAligned([label], box.x, top, size, p.depth, ctx.sans, 500, 0, 1.2, 'left');
    // Values share one right edge — that alignment is what makes a price list
    // read as a list rather than as stray pairs of words.
    svg += textLinesAligned([row.value], rightX, top, size, p.depth, ctx.sans, 650, 0, 1.2, 'right');

    const leaderY = top + Math.round(size * 0.72);
    const startX = box.x + textWidthApprox(label, size, ctx.fonts?.body) + 12;
    const endX = rightX - textWidthApprox(row.value, size, ctx.fonts?.body) - 12;
    if (endX - startX > 24) {
      svg += `<line x1="${startX}" y1="${leaderY}" x2="${endX}" y2="${leaderY}" stroke="${p.depth}" stroke-opacity="0.22" stroke-width="1" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    }
  });
  return svg;
}

/** Do / don't and myth / fact — marks drawn as strokes, never glyphs, so no font can fail to carry them. */
function renderChecklistBlock(box: Rect, ctx: BlockCtx): string {
  const items = ctx.content.checklist ?? [];
  if (!items.length) return '';
  const p = ctx.palette;
  const n = items.length;

  const metrics = (size: number) => {
    const mark = clampSize(size * 1.3, 16, 32);
    const textX = box.x + mark + Math.round(mark * 0.55);
    const textW = Math.max(60, box.w - (textX - box.x));
    const gap = Math.round(size * 0.95);
    const heights = items.map((item) => {
      const lines = wrapToWidth(item.text, size, textW, 2, ctx.fonts?.body);
      return { lines, h: Math.max(mark, Math.ceil(lines.length * size * 1.25)) };
    });
    return { mark, textX, gap, heights, total: heights.reduce((a, b) => a + b.h, 0) + gap * (n - 1) };
  };

  const size = fitBlockSize(clampSize(box.w * 0.04, 13, 24), 11, (s) => metrics(s).total, box.h);
  const m = metrics(size);
  if (m.total > box.h * 1.02) return '';

  const good = p.accent;
  const bad = mixToward(p.depth, '#B4443C', 0.55);
  let y = blockStartY(box, m.total);
  let svg = '';

  items.forEach((item, i) => {
    const h = m.heights[i];
    const r = m.mark / 2;
    const cx = box.x + r;
    // Centre the mark on the first line of text, not on the whole item — a
    // two-line entry otherwise pushes its tick down out of alignment.
    const cy = y + size * 0.62;
    const stroke = item.positive ? good : bad;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${stroke}" fill-opacity="0.12"/>`;
    const u = r * 0.5;
    svg += item.positive
      ? `<path d="M ${cx - u} ${cy} L ${cx - u * 0.15} ${cy + u * 0.8} L ${cx + u} ${cy - u * 0.75}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1.6, r * 0.24)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M ${cx - u * 0.7} ${cy - u * 0.7} L ${cx + u * 0.7} ${cy + u * 0.7} M ${cx + u * 0.7} ${cy - u * 0.7} L ${cx - u * 0.7} ${cy + u * 0.7}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1.6, r * 0.24)}" stroke-linecap="round"/>`;
    svg += textLinesAligned(h.lines, m.textX, y, size, p.depth, ctx.sans, 500, 0, 1.25, 'left');
    y += h.h + m.gap;
  });
  return svg;
}

/** A client's own words, set large. Social proof carries further than any claim the studio makes itself. */
function renderQuoteBlock(box: Rect, ctx: BlockCtx): string {
  const quote = ctx.content.quote;
  if (!quote?.text) return '';
  const p = ctx.palette;
  const markSize = clampSize(box.h * 0.34, 40, 130);
  // The quotation mark is decoration, so it sits behind the text rather than
  // pushing it around — a glyph that shoves the quote off-centre reads as a bug.
  const svgMark = `<text x="${box.x}" y="${box.y}" font-family="${ctx.serif}" font-size="${markSize}" font-weight="600" fill="${p.accent}" fill-opacity="0.22" dominant-baseline="hanging">&#8220;</text>`;

  const attribH = quote.attribution ? Math.round(markSize * 0.28) + 14 : 0;
  const textTop = box.y + Math.round(markSize * 0.42);
  const availH = Math.max(40, box.h - (textTop - box.y) - attribH);
  const fit = fitHeadline(quote.text, box.w, availH, clampSize(box.w * 0.085, 20, 46), 16, 5, ctx.fonts?.heading);

  let svg = svgMark;
  svg += textLinesAligned(fit.lines, box.x, textTop, fit.size, p.depth, ctx.serif, 400, 0, 1.3, 'left');
  if (quote.attribution) {
    const aSize = clampSize(fit.size * 0.42, 12, 18);
    const ay = textTop + Math.ceil(fit.lines.length * fit.size * 1.3) + 12;
    if (ay + aSize <= box.y + box.h) {
      svg += `<text x="${box.x}" y="${ay}" font-family="${ctx.sans}" font-size="${aSize}" font-weight="600" fill="${p.primary}" letter-spacing="1.6" dominant-baseline="hanging">${esc(('— ' + quote.attribution).toUpperCase())}</text>`;
    }
  }
  return svg;
}

/** Emphasis chip — "20% OFF", "3 SPOTS LEFT", "DIWALI". Louder than a kicker pill by design. */
function renderBadgeBlock(box: Rect, ctx: BlockCtx): string {
  const text = (ctx.content.badge ?? '').toUpperCase();
  if (!text) return '';
  const p = ctx.palette;
  const h = Math.min(box.h, Math.max(34, Math.round(box.h * 0.7)));
  const size = clampSize(h * 0.42, 13, 30);
  const w = Math.min(box.w, Math.round(textWidthApprox(text, size, ctx.fonts?.body) + size * 2.4));
  const x = box.x;
  const y = box.y + Math.round((box.h - h) / 2);
  const fg = contrastInk(p.accent, p.background);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.24)}" fill="${p.accent}"/>
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${ctx.sans}" font-size="${size}" font-weight="700" fill="${fg}" letter-spacing="${Math.max(1, size * 0.09)}">${esc(text)}</text>
  `;
}

function renderBlock(kind: BlockKind, box: Rect, ctx: BlockCtx): string {
  switch (kind) {
    case 'steps': return renderStepsBlock(box, ctx);
    case 'rows': return renderRowsBlock(box, ctx);
    case 'checklist': return renderChecklistBlock(box, ctx);
    case 'quote': return renderQuoteBlock(box, ctx);
    case 'badge': return renderBadgeBlock(box, ctx);
    default: return '';
  }
}

/**
 * Renders kicker → headline → subhead as ONE cohesive group with spacing
 * derived from the type size, and sizes derived from a modular scale.
 *
 * The previous free-placement version let the model choose arbitrary
 * positions and arbitrary size multipliers, which produced technically
 * novel but badly-designed posts (cramped headlines, uneven gaps, orphaned
 * elements). Rhythm and scale are craft decisions the system should own;
 * the model decides WHERE the group goes, not how type is set.
 */
function buildGroupedText(opts: {
  box: Rect;
  align: 'left' | 'center' | 'right';
  vAlign: 'top' | 'center' | 'bottom';
  scaleId: TypeScaleId;
  spec: LabSlideSpec;
  palette: LabPalette;
  serif: string;
  sans: string;
  weight: number;
  tracking: number;
  onPhoto: boolean;
  includeCta: boolean;
  /** Measured ink for type over a photo — overrides the old unconditional white. */
  inkOverride?: string;
  /** Bare families behind serif/sans. The CSS stacks cannot be measured; these can. */
  headingFamily: string;
  bodyFamily: string;
}): string {
  const p = opts.palette;
  const ratio = TYPE_SCALE_RATIO[opts.scaleId];
  const measured = opts.onPhoto ? opts.inkOverride : undefined;
  const onDarkGround = !measured || relativeLuminance(measured) > 0.5;
  const headFill = measured ?? (opts.onPhoto ? '#ffffff' : p.depth);
  const subFill = measured
    ? measured
    : opts.onPhoto ? 'rgba(255,255,255,0.9)' : p.primary;
  // The pill must invert against the same ground the type sits on, or a light
  // chip lands on a light photo and disappears with it.
  const pillBg = opts.onPhoto ? (onDarkGround ? p.background : p.depth) : p.depth;
  const pillFg = opts.onPhoto ? (onDarkGround ? p.depth : '#fff') : '#fff';

  const kicker = opts.spec.pill;
  const subhead = opts.spec.subhead;
  const cta = opts.includeCta ? opts.spec.cta : undefined;

  // Reserve room for the fixed-height chrome before fitting the headline, so
  // the headline is never sized into space the pills will occupy.
  const kickerBlock = kicker ? PILL_H + Math.round(PILL_H * 0.55) : 0;
  const ctaBlock = cta ? PILL_H + Math.round(PILL_H * 0.7) : 0;
  const headStart = Math.max(28, Math.round(opts.box.w * 0.16 * (ratio / 1.25)));
  const headFont: FontSpec = { family: opts.headingFamily, tracking: opts.tracking };

  /**
   * Largest size that reads well — not merely the largest that fits.
   *
   * Allowing more lines can only ever permit a bigger size, so an algorithm
   * that maximises size alone always chooses the maximum line count. That is
   * how a six-word headline in a narrow column came out as four cramped
   * lines: every one of them fit the height budget, so the biggest size won
   * and nothing ever weighed the raggedness against it.
   *
   * A display headline wants two or three lines. So: take the fewest lines
   * that still sets the type within 20% of the best size available. Dropping
   * from four lines to two is worth a slightly smaller headline; dropping to
   * a headline half the size is not.
   */
  const fitHead = (budget: number) => {
    const height = Math.max(60, budget);
    const text = opts.spec.headline || 'The result';
    const candidates = [2, 3, 4].map((maxLines) =>
      fitHeadline(text, opts.box.w, height, headStart, 26, maxLines, headFont),
    );
    const usable = candidates.filter((c) => !c.overflow);
    if (!usable.length) return candidates[candidates.length - 1];
    const best = Math.max(...usable.map((c) => c.size));
    return usable.find((c) => c.size >= best * 0.8) ?? usable[usable.length - 1];
  };

  const measureSub = (headSize: number) => {
    const subSize = Math.max(15, Math.min(30, Math.round(headSize / (ratio * ratio))));
    const subLines = subhead ? wrapToWidth(subhead, subSize, opts.box.w, 3, { family: opts.bodyFamily }) : [];
    const subBlock = subLines.length ? Math.round(headSize * 0.34) + Math.ceil(subLines.length * subSize * SUB_LH) : 0;
    return { subSize, subLines, subBlock };
  };

  // The subhead used to be measured only AFTER the headline had already
  // claimed the space, so a kicker + headline + subhead + CTA stack could
  // overflow the bottom of its box and collide with whatever sat below it.
  // One re-fit pass with the subhead's real height reserved closes that.
  let head = fitHead(opts.box.h - kickerBlock - ctaBlock);
  let { subSize, subLines, subBlock } = measureSub(head.size);
  if (kickerBlock + head.height + subBlock + ctaBlock > opts.box.h) {
    head = fitHead(opts.box.h - kickerBlock - ctaBlock - subBlock);
    ({ subSize, subLines, subBlock } = measureSub(head.size));
  }

  const total = kickerBlock + head.height + subBlock + ctaBlock;
  const startY =
    opts.vAlign === 'top' ? opts.box.y
    : opts.vAlign === 'bottom' ? opts.box.y + Math.max(0, opts.box.h - total)
    : opts.box.y + Math.max(0, Math.round((opts.box.h - total) / 2));

  const anchorX = opts.align === 'center' ? opts.box.x + opts.box.w / 2 : opts.align === 'right' ? opts.box.x + opts.box.w : opts.box.x;
  const pillX = (text: string) => {
    const pw = pillWidth(text.toUpperCase(), opts.box.w);
    return opts.align === 'center' ? opts.box.x + (opts.box.w - pw) / 2
      : opts.align === 'right' ? opts.box.x + opts.box.w - pw
      : opts.box.x;
  };

  let y = startY;
  let svg = '';
  if (kicker) {
    svg += pill(pillX(kicker), y, kicker, pillBg, pillFg, opts.box.w);
    y += kickerBlock;
  }
  svg += textLinesAligned(head.lines, anchorX, y, head.size, headFill, opts.serif, opts.weight, opts.tracking, HEAD_LH, opts.align);
  y += head.height;
  if (subLines.length) {
    y += Math.round(head.size * 0.34);
    svg += textLinesAligned(subLines, anchorX, y, subSize, subFill, opts.sans, 400, 0, SUB_LH, opts.align);
    y += Math.ceil(subLines.length * subSize * SUB_LH);
  }
  if (cta) {
    y += Math.round(PILL_H * 0.7);
    svg += pill(pillX(cta), y, cta, pillBg, pillFg, opts.box.w);
  }
  return svg;
}

/** A single detached role (normally the CTA) placed in its own region — alignment-locked by validation. */
function buildDetachedText(opts: {
  detached: LabDetachedText;
  box: Rect;
  spec: LabSlideSpec;
  palette: LabPalette;
  sans: string;
  onPhoto: boolean;
}): string {
  const p = opts.palette;
  const text =
    opts.detached.role === 'cta' ? opts.spec.cta
    : opts.detached.role === 'kicker' ? opts.spec.pill
    : opts.detached.role === 'subhead' ? opts.spec.subhead
    : opts.spec.headline;
  if (!text) return '';
  const pillBg = opts.onPhoto ? p.background : p.depth;
  const pillFg = opts.onPhoto ? p.depth : '#fff';

  if (opts.detached.role === 'cta' || opts.detached.role === 'kicker') {
    const pw = pillWidth(text.toUpperCase(), opts.box.w);
    const x = opts.detached.align === 'center' ? opts.box.x + (opts.box.w - pw) / 2
      : opts.detached.align === 'right' ? opts.box.x + opts.box.w - pw
      : opts.box.x;
    return pill(x, opts.box.y + Math.max(0, Math.round((opts.box.h - PILL_H) / 2)), text, pillBg, pillFg, opts.box.w);
  }
  const anchorX = opts.detached.align === 'center' ? opts.box.x + opts.box.w / 2
    : opts.detached.align === 'right' ? opts.box.x + opts.box.w
    : opts.box.x;
  const lines = wrapToWidth(text, SUB_SIZE, opts.box.w, 3);
  return textLinesAligned(lines, anchorX, opts.box.y, SUB_SIZE, opts.onPhoto ? 'rgba(255,255,255,0.9)' : p.primary, opts.sans, 400, 0, SUB_LH, opts.detached.align);
}

/** textLines() always anchors left; free placement needs real alignment. */
function textLinesAligned(
  lines: string[],
  anchorX: number,
  y: number,
  size: number,
  fill: string,
  font: string,
  weight: number,
  tracking: number,
  lineHeight: number,
  align: 'left' | 'center' | 'right',
): string {
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const dy = size * lineHeight;
  return lines
    .map((line, i) =>
      `<text x="${anchorX}" y="${y + i * dy}" text-anchor="${anchor}" dominant-baseline="hanging" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${tracking}">${esc(line)}</text>`,
    )
    .join('');
}

/** Vertical placement of the type stack inside its box, per the composition's alignment. */
function alignedTypeY(type: Rect, stackH: number, align: 'top' | 'center' | 'bottom'): number {
  if (align === 'top') return type.y;
  if (align === 'bottom') return type.y + Math.max(0, type.h - stackH);
  return type.y + Math.max(0, Math.round((type.h - stackH) / 2));
}

function buildChromeSvg(params: {
  w: number;
  h: number;
  spec: LabSlideSpec;
  palette: LabPalette;
  logoPosition: LogoPosition;
  showBrandStrip: boolean;
  type: Rect;
  photoA: Rect | null;
  photoB: Rect | null;
  typography?: LabTypography;
  mood?: MoodHint;
  needsTypePlate?: boolean;
  designSpec?: Partial<LabDesignSpec>;
  typeOnPhoto?: boolean;
  typeAlign?: 'top' | 'center' | 'bottom';
  /** Present when an AI-authored composition was accepted — switches to the grouped/rhythm renderer. */
  designSystem?: { textAlign: 'left' | 'center' | 'right'; typeScale: TypeScaleId; detached?: LabDetachedText };
  /** Content blocks, already resolved to pixel boxes. Absent on a statement post. */
  blocks?: Array<{ kind: BlockKind; box: Rect; ink?: string; plate?: boolean }>;
  /** Ink measured against the pixels actually behind the type when it sits on the photo. */
  photoTypeInk?: string;
}): string {
  const { w, h, spec, palette: p, logoPosition, showBrandStrip, type, photoA, photoB, typography, mood, needsTypePlate, designSpec, typeOnPhoto, typeAlign, designSystem, blocks, photoTypeInk } = params;
  const typeStyleOverride = designSpec ? { headingWeight: designSpec.headingWeight, tracking: designSpec.tracking } : undefined;
  const decorationIntensity = designSpec?.decorationIntensity ?? 1;
  const stripY = logoPosition.startsWith('top') ? 0 : h - BRAND_STRIP;
  const brandPlate = showBrandStrip
    ? `<rect x="0" y="${stripY}" width="${w}" height="${BRAND_STRIP}" fill="${p.background}"/>`
    : '';
  const headingFamily = typography?.heading || DEFAULT_FONT_FAMILY;
  const bodyFamily = typography?.body || 'Inter';
  const serif = fontStack(headingFamily, 'Georgia, serif');
  const sans = fontStack(bodyFamily, 'Helvetica, Arial, sans-serif');
  const typeW = Math.max(160, type.w);
  // Measured in the faces and at the letter-spacing this slide actually
  // renders with — the same values passed to buildTypeStack below, so the
  // wrap decision and the drawn text can no longer disagree.
  const fonts = stackFonts(typography, mood, designSpec);
  const { head, sub, stackH } = planCopy(spec, typeW, type.h, w, fonts);
  const decoration: LabDecoration = spec.decoration && spec.decoration !== 'none'
    ? spec.decoration
    : mood
      ? MOOD_DECORATION[mood]
      : 'none';
  // A dual-photo composition draws its own divider; type sitting over a
  // photo is already busy enough that a motif would just add noise.
  const isDual = !!photoB;
  const motif = isDual || typeOnPhoto
    ? ''
    : decorationSvg(decoration, mood, w, h, p, type, decorationIntensity);

  let extra = '';
  if (designSystem) {
    // Grouped type with modular scale and spacing rhythm — the system owns
    // craft (sizes, gaps, alignment); the model owns placement.
    if (typeOnPhoto) extra += `<rect width="${w}" height="${h}" fill="url(#scrim)"/>`;
    extra += motif;
    if (needsTypePlate) {
      const padX = 28;
      const padY = 24;
      // The plate has to oppose the ink. A light plate under light ink is
      // just a brighter version of the problem it was drawn to solve.
      const inkIsLight = photoTypeInk ? relativeLuminance(photoTypeInk) > 0.5 : false;
      const plateFill = inkIsLight ? p.depth : p.background;
      const plateOpacity = typeOnPhoto ? 0.62 : 0.86;
      extra += `<rect x="${type.x - padX}" y="${type.y - padY}" width="${type.w + padX * 2}" height="${type.h + padY * 2}" rx="18" fill="${plateFill}" fill-opacity="${plateOpacity}"/>`;
    }
    extra += `<g${typeOnPhoto ? ' filter="url(#typeShadow)"' : ''}>`;
    extra += buildGroupedText({
      box: type,
      align: designSystem.textAlign,
      vAlign: typeAlign ?? 'center',
      scaleId: designSystem.typeScale,
      spec, palette: p, serif, sans,
      headingFamily: fonts.heading.family,
      bodyFamily: fonts.body.family,
      weight: typeStyleOverride?.headingWeight ?? (mood ? MOOD_TYPE_STYLE[mood].weight : DEFAULT_TYPE_STYLE.weight),
      tracking: typeStyleOverride?.tracking ?? (mood ? MOOD_TYPE_STYLE[mood].tracking : DEFAULT_TYPE_STYLE.tracking),
      onPhoto: !!typeOnPhoto,
      inkOverride: photoTypeInk,
      // The CTA leaves the group only when it has been placed separately.
      includeCta: designSystem.detached?.role !== 'cta',
    });
    if (designSystem.detached) {
      extra += buildDetachedText({
        detached: designSystem.detached,
        box: fracToPx(designSystem.detached.box, w, h),
        spec, palette: p, sans, onPhoto: !!typeOnPhoto,
      });
    }
    extra += `</g>`;
    if (photoA && isDual) extra += pill(photoA.x + MAT + 10, photoA.y + MAT + 10, spec.leftPill || 'LOOK', p.depth, '#fff', Math.min(220, photoA.w - MAT * 2 - 20));
    if (photoB) extra += pill(photoB.x + MAT + 10, photoB.y + MAT + 10, spec.rightPill || 'LOOK', p.depth, '#fff', Math.min(220, photoB.w - MAT * 2 - 20));
  } else if (isDual) {
    extra += `<line x1="${type.x}" y1="${type.y + type.h - 8}" x2="${type.x + type.w}" y2="${type.y + type.h - 8}" stroke="${p.depth}" stroke-opacity="0.12" stroke-width="1"/>`;
    extra += buildTypeStack({
      x: type.x, y: type.y, w: typeW, spec: { ...spec, pill: undefined, cta: undefined }, palette: p, head, sub, serif, sans, mood, typeStyleOverride,
    });
    if (photoA) extra += pill(photoA.x + MAT + 10, photoA.y + MAT + 10, spec.leftPill || spec.pill || 'LOOK', p.depth, '#fff', Math.min(220, photoA.w - MAT * 2 - 20));
    if (photoB) extra += pill(photoB.x + MAT + 10, photoB.y + MAT + 10, spec.rightPill || 'LOOK', p.depth, '#fff', Math.min(220, photoB.w - MAT * 2 - 20));
  } else if (typeOnPhoto) {
    const y = alignedTypeY(type, stackH, typeAlign ?? 'bottom');
    // Bottom-anchored type gets the full-canvas gradient (the original
    // banner/minimal_caption treatment). Type placed anywhere else can't
    // rely on a bottom-heavy gradient, so it gets a localized soft plate —
    // legible wherever the AI decided to put it.
    if ((typeAlign ?? 'bottom') === 'bottom') {
      extra += `<rect width="${w}" height="${h}" fill="url(#scrim)"/>`;
    } else {
      const padX = 28;
      const padY = 24;
      extra += `<rect x="${type.x - padX}" y="${y - padY}" width="${typeW + padX * 2}" height="${stackH + padY * 2}" rx="18" fill="${p.depth}" fill-opacity="0.55"/>`;
    }
    extra += `<g filter="url(#typeShadow)">`;
    extra += buildTypeStack({
      x: type.x, y, w: typeW, spec, palette: p, head, sub, serif, sans, mood, typeStyleOverride,
      accent: false, headFill: '#ffffff', subFill: 'rgba(255,255,255,0.9)',
      pillBg: p.background, pillFg: p.depth,
    });
    extra += `</g>`;
  } else {
    const y = alignedTypeY(type, stackH, typeAlign ?? 'center');
    extra += motif;
    // Only when the measured pixels behind the type demand it (see
    // regionNeedsPlate) — an always-on card is its own template.
    if (needsTypePlate) {
      const padX = 28;
      const padY = 24;
      const plateX = type.x - padX;
      const plateY = y - padY;
      const plateW = typeW + padX * 2;
      const plateH = stackH + padY * 2;
      extra += `<rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="18" fill="${p.background}" fill-opacity="0.86"/>`;
    }
    extra += buildTypeStack({ x: type.x, y, w: typeW, spec, palette: p, head, sub, serif, sans, mood, typeStyleOverride });
  }

  // Content blocks last, so they sit above any motif or scrim. Validation has
  // already guaranteed each one has content, fits the grid, and doesn't
  // collide with the photo or the type group.
  if (blocks?.length && spec.content) {
    for (const b of blocks) {
      // A block sitting on a photo needs the same legibility treatment the
      // type group gets. Without this, price rows and checklists were drawn
      // straight onto whatever texture happened to be underneath them.
      if (b.plate) {
        const padX = 22;
        const padY = 18;
        const inkIsLight = b.ink ? relativeLuminance(b.ink) > 0.5 : false;
        extra += `<rect x="${b.box.x - padX}" y="${b.box.y - padY}" width="${b.box.w + padX * 2}" height="${b.box.h + padY * 2}" rx="16" fill="${inkIsLight ? p.depth : p.background}" fill-opacity="0.78"/>`;
      }
      const inkPalette: LabPalette = b.ink
        ? { ...p, depth: b.ink, primary: mixToward(b.ink, p.background, 0.32) }
        : p;
      extra += renderBlock(b.kind, b.box, { palette: inkPalette, serif, sans, content: spec.content, fonts });
    }
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>${fontFacesCss([headingFamily, bodyFamily])} text{dominant-baseline:hanging}</style>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.depth}" stop-opacity="0"/>
        <stop offset="42%" stop-color="${p.depth}" stop-opacity="0.08"/>
        <stop offset="72%" stop-color="${p.depth}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${p.depth}" stop-opacity="0.82"/>
      </linearGradient>
      <filter id="typeShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
      </filter>
      <filter id="pillLift" x="-30%" y="-60%" width="160%" height="260%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="${p.depth}" flood-opacity="0.22"/>
      </filter>
    </defs>
    ${extra}
    ${brandPlate}
  </svg>`;
}

function rgb(hexColor: string): { r: number; g: number; b: number } {
  const raw = hexColor.replace('#', '');
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(n.slice(0, 2), 16) || 0,
    g: parseInt(n.slice(2, 4), 16) || 0,
    b: parseInt(n.slice(4, 6), 16) || 0,
  };
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance(hexColor: string): number {
  const { r, g, b } = rgb(hexColor);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mixToward(hexColor: string, target: string, t: number): string {
  const a = rgb(hexColor);
  const b = rgb(target);
  return toHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function paperFrom(bg: string): string {
  return mixToward(bg, '#FFFFFF', luminance(bg) > 0.72 ? 0.78 : 0.5);
}

/** sRGB channel → linear light, per WCAG. The plain mean this replaced badly mis-ranks mid-tones. */
function srgbToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexColor: string): number {
  const { r, g, b } = rgb(hexColor);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio, 1:1 (identical) to 21:1 (black on white). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Body text needs 4.5:1; large display type is legible from 3:1. */
const MIN_TEXT_CONTRAST = 4.5;
const MIN_DISPLAY_CONTRAST = 3.2;

/**
 * Previously this compared raw luminance and accepted any difference of 0.32
 * or more, which is not a contrast measure at all: a background at L=0.60
 * with ink at L=0.28 passed, despite being a 1.97:1 ratio — far below the
 * 4.5:1 needed to read comfortably. Brand palettes in this space are full of
 * mid-tone taupes and creams, which is exactly where that approximation is
 * worst, so muddy low-contrast type was reaching real posts.
 */
function contrastInk(bg: string, preferred: string): string {
  if (contrastRatio(bg, preferred) >= MIN_TEXT_CONTRAST) return preferred;
  // The brand ink can't carry on this ground — fall back to whichever
  // near-neutral extreme actually wins, rather than assuming light-vs-dark
  // from a fixed luminance cutoff.
  const dark = '#1A1714';
  const light = '#FBF8F4';
  const darkRatio = contrastRatio(bg, dark);
  const lightRatio = contrastRatio(bg, light);
  // Keep the brand ink if it is genuinely close and still display-legible —
  // swapping to near-black for a marginal gain loses the brand's character.
  if (contrastRatio(bg, preferred) >= MIN_DISPLAY_CONTRAST && Math.max(darkRatio, lightRatio) < MIN_TEXT_CONTRAST + 1) {
    return preferred;
  }
  return darkRatio >= lightRatio ? dark : light;
}

function hex(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{3,8}$/.test(withHash) ? withHash : fallback;
}

/**
 * True only when the legacy row carries at least one real colour.
 *
 * A legacy brandDNA row that EXISTS but has null colours is worse than no
 * row at all: paletteFromBrand() silently resolves every field to
 * DEFAULT_LAB_PALETTE, so every post for that tenant renders in the same
 * hardcoded cream/grey forever — and, because the row is truthy, the
 * mood-derived palette never gets a chance to apply. Callers must gate on
 * this rather than on `!!dna`.
 */
export function brandPaletteIsUsable(dna: any): boolean {
  if (!dna) return false;
  const v2 = typeof dna.brandDnaV2 === 'string' ? safeJson(dna.brandDnaV2) : dna.brandDnaV2;
  const pal = v2?.visual_identity?.palette || {};
  const candidates = [
    pal.background, pal.secondary, pal.depth, pal.accent, pal.primary,
    dna.backgroundBrandColor, dna.secondaryBrandColor, dna.depthBrandColor,
    dna.accentBrandColor, dna.primaryBrandColor,
  ];
  return candidates.some((c) => typeof c === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(c.trim()));
}

export function paletteFromBrand(dna: any): LabPalette {
  if (!dna) return { ...DEFAULT_LAB_PALETTE };
  const v2 = typeof dna.brandDnaV2 === 'string' ? safeJson(dna.brandDnaV2) : dna.brandDnaV2;
  const pal = v2?.visual_identity?.palette || {};
  return {
    background: hex(pal.background || dna.backgroundBrandColor, DEFAULT_LAB_PALETTE.background),
    secondary: hex(pal.secondary || dna.secondaryBrandColor, DEFAULT_LAB_PALETTE.secondary),
    depth: hex(pal.depth || dna.depthBrandColor || pal.primary || dna.primaryBrandColor, DEFAULT_LAB_PALETTE.depth),
    accent: hex(pal.accent || dna.accentBrandColor, DEFAULT_LAB_PALETTE.accent),
    primary: hex(pal.primary || dna.primaryBrandColor, DEFAULT_LAB_PALETTE.primary),
  };
}

/** Guided v2 palette is [background, secondary, depth, accent]. */
export function paletteFromGuided(palette: string[] | undefined): LabPalette {
  const [background, secondary, depth, accent] = palette || [];
  return {
    background: hex(background, DEFAULT_LAB_PALETTE.background),
    secondary: hex(secondary, DEFAULT_LAB_PALETTE.secondary),
    depth: hex(depth, DEFAULT_LAB_PALETTE.depth),
    accent: hex(accent, DEFAULT_LAB_PALETTE.accent),
    primary: hex(depth, DEFAULT_LAB_PALETTE.primary),
  };
}

export function logoPositionFromBrand(dna: any): LogoPosition {
  const raw = String(dna.logoPosition || v2Logo(dna) || 'bottom_right');
  if (raw === 'bottom_left' || raw === 'top_right' || raw === 'top_left' || raw === 'bottom_right') return raw;
  return 'bottom_right';
}

function v2Logo(dna: any): string | undefined {
  const v2 = typeof dna.brandDnaV2 === 'string' ? safeJson(dna.brandDnaV2) : dna.brandDnaV2;
  return v2?.logo_position || v2?.visual_identity?.logo_position;
}

function safeJson(value: string): Record<string, any> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
