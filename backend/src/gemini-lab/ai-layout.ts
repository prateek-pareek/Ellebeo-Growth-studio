/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';
import type { LabPalette, LabTypography, MoodHint } from './gemini-lab-compositor';
import { scanReference } from './reference-scan';

/**
 * The AI designs the page; we place the photograph.
 *
 * Posts built around a real client photo used to be composed entirely by the
 * compositor: designed template geometry, SVG type setting, grid validation
 * and craft repairs. The design critic scored that output 40-56 out of 100,
 * run after run, with the same complaints — type colliding with the subject's
 * face, dead space, "feels templated rather than deliberate".
 *
 * The obvious alternative — hand the photo to the image model and tell it not
 * to change it — was measured and does not work. Across three runs with an
 * emphatic instruction to leave the photograph alone, the returned photo
 * differed from the original by 22%, 36% and 37% mean absolute pixel
 * difference, against a 0.2% noise floor for the same image re-encoded. In one
 * run the client gained a nose ring; in another she was a different person
 * entirely. That is not disobedience to be prompted away — regenerating pixels
 * is what an image model does. And a studio publishing "our client's result"
 * over a face that is not the client's is publishing a fabrication about a
 * real person.
 *
 * So neither side of that choice is taken. The model designs the PAGE and
 * never sees the client: it is asked to leave a flat placeholder rectangle
 * where the photograph belongs. We find that rectangle and composite the real
 * photograph into it. The photo is pixel-exact by construction rather than by
 * trust, and the layout is the model's — which is the half it is good at.
 */

export type LayoutBrand = {
  name?: string | null;
  palette: LabPalette;
  typography: LabTypography;
  mood?: MoodHint;
  essence?: string[];
};

export type LayoutCopy = {
  headline: string;
  subhead?: string;
  kicker?: string;
  cta?: string;
};

/** Where the photograph goes, in pixels on the returned canvas. */
export type PhotoSlot = { x: number; y: number; w: number; h: number };

export type SlotDetection = {
  slot: PhotoSlot | null;
  /** Share of the canvas the placeholder covered, 0-1. */
  coverage: number;
  /** How completely the placeholder filled its own bounding box, 0-1. A real
   *  rectangle is ~1; a scattered smear of stray pixels is low. */
  rectangularity: number;
  reason?: string;
};

const CANVAS: Record<string, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
};

const ASPECT_WORD: Record<string, string> = {
  '4:5': 'vertical portrait, taller than it is wide, 4:5',
  '1:1': 'perfectly square, 1:1',
  '9:16': 'tall vertical, 9:16',
  '16:9': 'wide landscape, 16:9',
};

/**
 * The placeholder colour.
 *
 * Pure magenta is chosen because no part of a beauty brand's palette lands
 * near it, so detection cannot confuse the placeholder with the design. The
 * model does drift it toward its own palette — asked for #FF00FF it returned a
 * deep pink — so detection is tolerant of hue while still excluding anything a
 * brand would plausibly use.
 */
const PLACEHOLDER_HEX = '#FF00FF';

/**
 * The brief.
 *
 * Written to fix what the first experiments actually got wrong, not what they
 * might get wrong in theory:
 *  - the slot came back at ~11% of the canvas when 55-65% was asked for, so
 *    the size instruction is now concrete and repeated as a proportion of the
 *    frame rather than a percentage;
 *  - the model printed a colour value ("A3B1A43") as visible text on the post,
 *    so hex values are now explicitly marked as never-render;
 *  - it ignored the aspect ratio, so the shape is stated in words as well as
 *    a ratio.
 */
export function buildLayoutPrompt(params: {
  copy: LayoutCopy;
  brand: LayoutBrand;
  aspectRatio: string;
  /** width / height of the photograph that will be placed, when known. */
  photoAspect?: number;
  /** A layout diagram is attached; read the arrangement from it. */
  hasReference?: boolean;
  /** How many photographs will be placed. 2 is a before-and-after. */
  photoCount?: number;
}): string {
  const { copy, brand } = params;
  const p = brand.palette;
  const lines: string[] = [];

  if (params.hasReference) {
    lines.push(
      "The attached image is a DIAGRAM of a layout from this studio's own library. It is not artwork and must not be copied as artwork. The MAGENTA block marks where the photograph goes. The GREY blocks mark where type and bars go — how many there are, where they sit, how heavy they are. White is empty space.",
    );
    lines.push(
      'Design a NEW, finished, publication-ready social media graphic that follows that arrangement. Do not reproduce the diagram itself — no grey blocks, no white ground, none of its colours. It is a plan, not a picture.',
    );
  } else {
    lines.push(
      'Design a finished, publication-ready social media graphic for a premium hair and beauty studio. This is final artwork: no device frames, no mockups, no watermarks, no borders around the whole page.',
    );
  }
  lines.push(
    `SHAPE: the canvas is ${ASPECT_WORD[params.aspectRatio] ?? params.aspectRatio}. Fill it edge to edge.`,
  );

  lines.push(
    [
      (params.photoCount ?? 1) >= 2
        ? 'THE TWO PHOTOGRAPH AREAS — the most important instruction:'
        : 'THE PHOTOGRAPH AREA — the most important instruction:',
      (params.photoCount ?? 1) >= 2
        // A before-and-after is only readable when the two frames are the same
        // size and squarely aligned: different sizes read as a design flourish
        // rather than a comparison, and the eye stops trusting it.
        ? `  Leave space for TWO photographs and fill each with a SOLID FLAT rectangle of pure magenta ${PLACEHOLDER_HEX}. They must be EXACTLY the same size and shape as each other, level with one another, and separated by a clear gap of the page's own background — side by side, or one above the other. They must not touch.`
        : `  Leave a space for a photograph and fill it with a SOLID FLAT rectangle of pure magenta ${PLACEHOLDER_HEX}.`,
      '  That rectangle must be one single flat colour: hard straight edges, no gradient, no texture, no shadow, no caption, no border, and absolutely nothing drawn on top of it or overlapping it.',
      // Size and placement come from the reference when there is one. Stating
      // them as well made the two fight: told both "match this arrangement" and
      // "cover two-thirds, flush to an edge", the model produced placeholders
      // that were scattered, undersized or absent, and every run was refused.
      params.hasReference
        ? '  SIZE AND PLACEMENT: put it exactly where the magenta block sits in the diagram, at the same size and proportion. The diagram decides this, not you.'
        : (params.photoCount ?? 1) >= 2
          ? '  SIZE: the pair is the hero of the page. Together the two rectangles must cover roughly HALF of the entire canvas, with the type sitting beside or beneath them. Two small rectangles are wrong.'
          : '  SIZE: it is the hero of the page. It must cover roughly HALF TO TWO-THIRDS of the entire canvas — think of a magazine page where the photograph dominates and the type sits beside or beneath it. A small rectangle is wrong.',
      params.hasReference ? '' : shapeInstruction(params.photoAspect),
      params.hasReference
        ? ''
        : '  PLACEMENT: place it with editorial confidence — flush to one or two edges, off-centre. Do not centre it with equal margins all round.',
      (params.photoCount ?? 1) >= 2
        ? '  Do NOT draw any people, faces, hair, hands or photographs anywhere on the page. The two magenta rectangles are the only image areas. Do NOT write the words "before" or "after" on them — those labels are added afterwards.'
        : '  Do NOT draw any people, faces, hair, hands or photographs anywhere on the page. The magenta rectangle is the only image area.',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const words: string[] = [];
  if (copy.kicker) words.push(`  Kicker (small, all caps): ${copy.kicker}`);
  words.push(`  Headline: ${copy.headline}`);
  if (copy.subhead) words.push(`  Supporting line: ${copy.subhead}`);
  if (copy.cta) words.push(`  Call to action: ${copy.cta}`);
  // With a reference, the model tends to fill the reference's own bands by
  // repeating a line it was given. Saying each word is used once, and that an
  // empty band is fine, stops the post carrying its kicker twice.
  const wordList = words.join('\n');
  const heading = 'THE WORDS — set exactly these and nothing else, spelled exactly like this:';
  const noRepeat =
    '\n  Use each of these ONCE. Where the reference has a band or bar carrying text, reproduce the BAND but leave it empty rather than repeating a line.';
  lines.push(`${heading}\n${wordList}${params.hasReference ? noRepeat : ''}`);

  lines.push(
    [
      'THE BRAND — design WITH these as your materials:',
      // Not `Studio: <name>`. Framed as a label-and-value the model typeset
      // the LABEL onto the artwork and anonymised the value, so real posts
      // came back credited "Studio: X" — the same failure as the typeface
      // name and the hex code before it. Naming it inside a sentence, with
      // the instruction attached, leaves nothing that reads like a caption
      // waiting to be set.
      brand.name
        ? `  The studio is called ${brand.name}. If you set its name anywhere, set it exactly as written and nowhere else — never a placeholder, an initial or a stand-in.`
        : '',
      `  Paper: ${describeColour(p.background)}. Ink: ${describeColour(p.depth)}. Accent: ${describeColour(p.accent)}.`,
      `  Also available: ${describeColour(p.secondary)} and ${describeColour(p.primary)}.`,
      `  Type character: ${describeTypeface(brand.typography.heading)} for display, ${describeTypeface(brand.typography.body)} for everything else.`,
      brand.mood ? `  Mood: ${brand.mood.replace(/_/g, ' ').toLowerCase()}.` : '',
      brand.essence?.length ? `  It should feel: ${brand.essence.join(', ').toLowerCase()}.` : '',
      '  Never write a colour value, measurement or any part of these instructions as visible text on the artwork. The only text on the page is the words listed above.',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  lines.push(
    'CRAFT: real typographic hierarchy, confident scale, generous negative space, considered asymmetry. Every word legible at thumbnail size and spelled correctly. No text beyond the words listed above.',
  );

  return lines.join('\n\n');
}

/**
 * Asks for a slot the photograph will actually fit.
 *
 * Without this the model reserved a tall narrow column. Cropping a landscape
 * photograph into 1:2.2 threw most of the frame away and cut the subject's
 * face in half — no smart-crop recovers pixels the slot has no room for.
 */
function shapeInstruction(photoAspect?: number): string {
  if (!photoAspect || !Number.isFinite(photoAspect)) return '';
  if (photoAspect > 1.25) {
    return '  SHAPE OF THE RECTANGLE: the photograph is LANDSCAPE (wider than tall), so make the rectangle wider than it is tall — a full-width band works well. Do not make it a tall narrow column.';
  }
  if (photoAspect < 0.8) {
    return '  SHAPE OF THE RECTANGLE: the photograph is PORTRAIT (taller than wide), so make the rectangle taller than it is wide.';
  }
  return '  SHAPE OF THE RECTANGLE: the photograph is roughly square, so keep the rectangle close to square.';
}

/**
 * A hex turned into the words a designer would use.
 *
 * Colour values are never put in the prompt. Given "#A3B18A" the model set
 * "#A3B184C" as visible type on the finished post — it reads a hex string as
 * copy to typeset, and instructing it not to did not stop it. A described
 * colour cannot be mistaken for copy, and is close enough for a ground the
 * model is mixing anyway.
 */
export function describeColour(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return 'a neutral tone';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;

  // Absolute chroma, NOT HSL saturation. HSL divides by a term that collapses
  // near white, so #F3EDE3 — a cream with 6% chroma — scored 0.40 "saturated"
  // and was described as "a very light terracotta". The model duly produced a
  // terracotta page where the brand's paper is cream.
  const chroma = (max - min) / 255;

  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min)) * 60;
    else if (max === g) hue = (2 + (b - r) / (max - min)) * 60;
    else hue = (4 + (r - g) / (max - min)) * 60;
    if (hue < 0) hue += 360;
  }
  const warm = hue < 100 || hue >= 300;

  if (chroma < 0.04) {
    if (light > 0.9) return 'a clean white';
    if (light < 0.12) return 'a near-black';
    return `a ${light > 0.6 ? 'light' : light > 0.35 ? 'mid' : 'deep'} neutral grey`;
  }

  // Near-white and near-black carry a cast, not a colour. Naming the hue here
  // is what turned cream into terracotta.
  if (light > 0.86 && chroma < 0.16) {
    return warm ? 'a warm cream, almost white' : 'a cool off-white, almost white';
  }
  if (light < 0.16) {
    return warm ? 'a near-black with a warm cast' : 'a near-black with a cool cast';
  }

  const lightness =
    light > 0.72 ? 'light' : light > 0.45 ? 'mid' : light > 0.25 ? 'deep' : 'very deep';

  const name =
    hue < 15 || hue >= 345 ? 'red'
    : hue < 40 ? (light > 0.7 ? 'sand' : 'terracotta')
    : hue < 55 ? (light > 0.75 ? 'oat' : 'amber')
    : hue < 70 ? 'gold'
    : hue < 95 ? (chroma < 0.25 ? 'sage' : 'olive')
    : hue < 150 ? (chroma < 0.2 ? 'sage green' : 'green')
    : hue < 190 ? 'teal'
    : hue < 240 ? 'blue'
    : hue < 280 ? 'violet'
    : hue < 320 ? 'plum'
    : 'rose';

  const intensity = chroma < 0.12 ? 'soft ' : chroma > 0.45 ? 'vivid ' : '';
  return `a ${lightness} ${intensity}${name}`;
}

/**
 * A typeface named by its character rather than its name.
 *
 * Same failure as the hex codes: given "a Source Sans 3 feeling", the model set
 * "Source Sans 3" as the visible headline and dropped the real one. A font name
 * is a proper noun sitting in a prompt full of copy, and it gets typeset. What
 * the model actually needs is the shape, which a description carries better
 * than a name it may not have anyway.
 */
export function describeTypeface(name: string): string {
  const n = (name || '').toLowerCase();
  if (/cormorant|playfair|fraunces|garamond|didot|bodoni|times|georgia|serif/.test(n)) {
    if (/fraunces|bodoni|didot/.test(n)) return 'a high-contrast display serif with real weight';
    return 'an elegant high-contrast serif';
  }
  if (/cinzel|trajan/.test(n)) return 'a classical engraved capital, wide and formal';
  if (/outfit|poppins|futura|circular|geometric/.test(n)) return 'a clean geometric sans';
  if (/inter|helvetica|arial|source sans|roboto|sans/.test(n)) return 'a neutral humanist sans';
  if (/script|cursive|italic/.test(n)) return 'a flowing script';
  return 'a clean, well-proportioned face';
}

/**
 * Turns a reference slide into a DIAGRAM of itself.
 *
 * A reference carries its own copy — banner text, headlines, step numbers — and
 * the model sets that copy on the new post. A real run against a studio deck
 * produced a post with "READ FOR OUR EXACT FORMULA" across both banner bars,
 * because that is what the reference had there. Instructing it to "ignore the
 * words" does not work, for the same reason instructing it to ignore a hex code
 * or a typeface name did not: text visible in the input gets reproduced.
 *
 * The first attempt blurred the slide instead. That did destroy the text, but
 * a blurred photograph is still a photograph: handed one, the model reproduced
 * its subject as the background of the finished post — a soft-focus hand
 * holding a tablet, behind a hair studio's headline. Degrading an image does
 * not stop it being read as content.
 *
 * A diagram cannot be read as content. Grey blocks where the type sits, one
 * magenta block where the photograph sits, white everywhere else. Every
 * structural fact survives — how many blocks of type, where they sit, how
 * heavy, where the photograph goes, how much air is around it — and there is
 * nothing photographic left to copy.
 */
export async function abstractReference(reference: Buffer): Promise<Buffer> {
  const scan = await scanReference(reference);

  const W = 768;
  const H = Math.round(W * 1.25);
  const cellW = W / scan.grid.cols;
  const cellH = H / scan.grid.rows;

  const rects: string[] = [];

  // Type, bars and rules become grey blocks: enough to show how many blocks
  // there are, where they sit and how heavy they are, with no glyph to read.
  for (const c of scan.inkCells) {
    rects.push(
      `<rect x="${(c.x * W).toFixed(1)}" y="${(c.y * H).toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="#9aa0a6"/>`,
    );
  }

  // The photograph becomes a single magenta block — the same colour the model
  // is asked to leave for us, so the instruction and the picture agree.
  if (scan.region) {
    const r = scan.region;
    rects.push(
      `<rect x="${(r.x * W).toFixed(1)}" y="${(r.y * H).toFixed(1)}" width="${(r.w * W).toFixed(1)}" height="${(r.h * H).toFixed(1)}" fill="#FF00FF"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${rects.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Is this pixel the magenta placeholder rather than part of the design? */
function isPlaceholder(r: number, g: number, b: number): boolean {
  // Red and blue both strong, green clearly suppressed. A brand's pinks and
  // nudes keep green much closer to red, so they do not qualify.
  return r > 120 && b > 70 && g < Math.min(r, b) * 0.75 && r - g > 50;
}

/**
 * Finds the photograph slot the model left.
 *
 * Returns the bounding box plus two honesty measures. `rectangularity` is what
 * separates a usable slot from a model that scattered magenta across the page:
 * a true rectangle fills its own bounding box, a smear does not.
 */
/**
 * Every placeholder rectangle on the page, not just the bounding box of all of
 * them.
 *
 * `detectSlot` takes the extent of every placeholder pixel at once. With one
 * rectangle that is exactly right. With TWO — which is what a before-and-after
 * needs — the bounding box spans both rectangles AND the gap between them, so
 * its `rectangularity` lands near 0.5 and the page is rejected as "not a clean
 * rectangle". That single assumption is why the AI-layout path was switched
 * off for pairs and why it fell back on roughly one page in six.
 *
 * Labelling connected regions separately costs one pass and answers both:
 * one region behaves exactly as before, two give a pair its slots.
 */
export async function detectSlots(
  png: Buffer,
  opts: { minCoverage?: number; maxSlots?: number } = {},
): Promise<{ slots: PhotoSlot[]; coverage: number; reason?: string }> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: ch } = info;

  const mark = new Uint8Array(W * H);
  let total = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * ch;
      if (isPlaceholder(data[i], data[i + 1], data[i + 2])) {
        mark[y * W + x] = 1;
        total += 1;
      }
    }
  }
  const coverage = total / (W * H);
  if (total === 0) return { slots: [], coverage: 0, reason: 'no placeholder found' };

  // Flood fill, iterative: a recursive fill overflows the stack on a region
  // covering a third of a 1080x1350 canvas.
  const seen = new Uint8Array(W * H);
  const regions: Array<{ x: number; y: number; w: number; h: number; n: number }> = [];
  const stack: number[] = [];
  for (let p0 = 0; p0 < W * H; p0 += 1) {
    if (!mark[p0] || seen[p0]) continue;
    let minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
    stack.push(p0);
    seen[p0] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && mark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mark[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && mark[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    regions.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, n });
  }

  // Speckle from the model's own antialiasing is not a slot.
  const usable = regions
    .filter((r) => r.n / (r.w * r.h) >= 0.75 && r.n / (W * H) >= (opts.minCoverage ?? 0.04))
    .sort((a, b) => b.n - a.n)
    .slice(0, opts.maxSlots ?? 2);

  if (usable.length === 0) {
    return { slots: [], coverage, reason: 'placeholder is not a clean rectangle' };
  }
  // Reading order: left to right, then top to bottom — a before sits before
  // an after, whichever way the model arranged the pair.
  usable.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
  return { slots: usable.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), coverage };
}

export async function detectSlot(
  png: Buffer,
  opts: {
    /**
     * Smallest share of the canvas a slot may occupy. Lower when a reference
     * dictates the layout: a studio's own design may legitimately place a
     * modest framed photograph, and refusing it would reject the very
     * arrangement we asked the model to follow.
     */
    minCoverage?: number;
  } = {},
): Promise<SlotDetection> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * ch;
      if (isPlaceholder(data[i], data[i + 1], data[i + 2])) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const canvasArea = info.width * info.height;
  if (count === 0) {
    return { slot: null, coverage: 0, rectangularity: 0, reason: 'no placeholder found' };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const rectangularity = count / (w * h);
  const coverage = count / canvasArea;

  // A slot that is not really a rectangle would paste the photo over the
  // design. Better to fall back than to publish that.
  if (rectangularity < 0.75) {
    return { slot: null, coverage, rectangularity, reason: 'placeholder is not a clean rectangle' };
  }
  // A sliver is not a hero image; the model misunderstood the brief.
  if (coverage < (opts.minCoverage ?? 0.08)) {
    return { slot: null, coverage, rectangularity, reason: 'placeholder too small to be the photo' };
  }

  return { slot: { x: minX, y: minY, w, h }, coverage, rectangularity };
}

/**
 * Places the real photograph into the slot.
 *
 * The paste is inset by a couple of pixels. The model's rectangle is not
 * perfectly hard-edged — it antialiases its own border — so a photo pasted to
 * the exact bounding box leaves a magenta fringe around it. Insetting covers
 * the blend and leaves no placeholder visible.
 */
export async function composeWithPhoto(params: {
  page: Buffer;
  photo: Buffer;
  slot: PhotoSlot;
  aspectRatio: string;
  /**
   * Resize the finished page to the pipeline's canvas. Default true.
   *
   * Off while placing the first of a pair: normalising between photographs
   * would resize the page out from under slot coordinates that were measured
   * against it, and the second photo would land in the wrong place.
   */
  normalise?: boolean;
}): Promise<Buffer> {
  const INSET = 3;
  const x = Math.max(0, params.slot.x - INSET);
  const y = Math.max(0, params.slot.y - INSET);
  const w = params.slot.w + INSET * 2;
  const h = params.slot.h + INSET * 2;

  const meta = await sharp(params.page).metadata();
  const pageW = meta.width ?? 0;
  const pageH = meta.height ?? 0;
  const fitW = Math.min(w, pageW - x);
  const fitH = Math.min(h, pageH - y);

  // `attention` keeps the subject of the photograph in frame when the slot's
  // proportions differ from the photo's — a face is not cropped off centre.
  const photo = await sharp(params.photo)
    .rotate()
    .resize(fitW, fitH, { fit: 'cover', position: 'attention' })
    .toBuffer();

  const composed = await sharp(params.page)
    .composite([{ input: photo, left: x, top: y }])
    .png()
    .toBuffer();

  if (params.normalise === false) return composed;

  // Normalised to the canvas the rest of the pipeline returns. Padded, never
  // cropped: the model does not always honour the aspect it was given, and
  // cropping finished artwork cuts through whatever sits near the edge.
  const { w: cw, h: chh } = CANVAS[params.aspectRatio] ?? CANVAS['4:5'];
  // Padded with the page's own GROUND — the colour it uses most — so the
  // extension is invisible.
  //
  // This used to sample the top-left corner, on the reasoning that these
  // layouts sit on a flat ground. They mostly do, but when the model draws a
  // border around the page the corner IS the border, and the pad then
  // extended that border into thick bands across the top and bottom of the
  // finished post. The most common colour is the ground whether or not
  // anything is drawn around it.
  const ground = await modalColour(composed);
  return sharp(composed)
    .resize(cw, chh, { fit: 'contain', background: ground })
    .png()
    .toBuffer();
}

/** The colour a page uses most, sampled coarsely. */
async function modalColour(png: Buffer): Promise<{ r: number; g: number; b: number }> {
  try {
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const tally = new Map<number, number>();
    // Coarse buckets: a photograph's gradient would otherwise out-vote a flat
    // ground by sheer variety.
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const i = (y * W + x) * C;
        const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        tally.set(k, (tally.get(k) || 0) + 1);
      }
    }
    let best = 0;
    let bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { bestN = n; best = k; }
    return { r: ((best >> 10) & 31) << 3, g: ((best >> 5) & 31) << 3, b: (best & 31) << 3 };
  } catch {
    return { r: 255, g: 255, b: 255 };
  }
}

const MODEL = process.env['GEMINI_IMAGE_MODEL'] || 'gemini-2.5-flash-image';

/** Asks the model for the page. Returns null when it gives no image. */
export async function generateLayoutPage(params: {
  apiKey: string;
  /** How many photographs the page must leave room for. */
  photoCount?: number;
  copy: LayoutCopy;
  brand: LayoutBrand;
  aspectRatio: string;
  photoAspect?: number;
  /** A reference slide to take the arrangement from. Blurred before sending. */
  reference?: Buffer;
}): Promise<Buffer | null> {
  const prompt = buildLayoutPrompt({
    copy: params.copy,
    brand: params.brand,
    aspectRatio: params.aspectRatio,
    photoAspect: params.photoAspect,
    hasReference: !!params.reference,
    photoCount: params.photoCount,
  });
  const parts: any[] = [{ text: prompt }];
  if (params.reference) {
    const abstracted = await abstractReference(params.reference);
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: abstracted.toString('base64') } });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    },
  );
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message || 'Could not design the page just now.');

  for (const part of (json?.candidates?.[0]?.content?.parts ?? []) as any[]) {
    if (part?.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
  }
  return null;
}

export type AiLayoutResult =
  | { ok: true; image: Buffer; coverage: number; rectangularity: number }
  | { ok: false; reason: string };

/**
 * The whole path: design the page, find the slot, place the photograph.
 *
 * Every failure is reported rather than patched over, because the caller has a
 * working compositor to fall back to and a bad AI layout is worse than a plain
 * composed one.
 */
export async function renderWithAiLayout(params: {
  apiKey: string;
  /** The photograph, or the pair, in the order they should be read. */
  photo: Buffer | Buffer[];
  copy: LayoutCopy;
  brand: LayoutBrand;
  aspectRatio: string;
  /** One of the studio's own slides, to take the arrangement from. */
  reference?: Buffer;
}): Promise<AiLayoutResult> {
  const photos = Array.isArray(params.photo) ? params.photo.filter(Boolean) : [params.photo];
  if (photos.length === 0) return { ok: false, reason: 'no photograph to place' };

  // The slot is asked for in the photograph's own proportions, so the crop
  // that follows trims rather than amputates. For a pair both frames are the
  // same shape, so the first photo speaks for both.
  let photoAspect: number | undefined;
  try {
    const meta = await sharp(photos[0]).metadata();
    if (meta.width && meta.height) photoAspect = meta.width / meta.height;
  } catch {
    photoAspect = undefined;
  }

  const page = await generateLayoutPage({
    apiKey: params.apiKey,
    copy: params.copy,
    brand: params.brand,
    aspectRatio: params.aspectRatio,
    photoAspect,
    reference: params.reference,
    photoCount: photos.length,
  });
  if (!page) return { ok: false, reason: 'model returned no image' };

  // 3% was too forgiving. Dropping the floor "because the reference decided"
  // let posts ship with the client at 12% of the canvas — a stamp in a field
  // of type, on a post whose entire job is to show that client's hair. A
  // reference may choose WHERE the photograph sits; it does not get to make it
  // incidental.
  // Per-slot floor, not per-page: a pair splits the same area in two, so
  // holding each half to the single-photo floor would refuse every pair.
  const found = await detectSlots(page, {
    minCoverage: 0.16 / photos.length,
    maxSlots: photos.length,
  });
  if (found.slots.length < photos.length) {
    return {
      ok: false,
      reason: found.reason ?? `found ${found.slots.length} photo slot(s), needed ${photos.length}`,
    };
  }

  // There was a floor but no ceiling, and the ceiling matters just as much.
  // A real run came back with an 89% placeholder: the composited photo then
  // covered 97.6% of the canvas and the model's design — type, ground,
  // everything — was buried under it. That is not a designed page, it is a
  // rectangle, and the composited path at least sets the type deliberately.
  //
  // The prompt already asks for half to two-thirds. It was ignored, which is
  // the whole reason this is measured rather than restated.
  const MAX_SLOT_COVERAGE = 0.72;
  if (found.coverage > MAX_SLOT_COVERAGE) {
    return {
      ok: false,
      reason: `placeholder covers ${(found.coverage * 100).toFixed(0)}% of the page — no design left to keep`,
    };
  }

  let image = page;
  for (let i = 0; i < photos.length; i += 1) {
    image = await composeWithPhoto({
      page: image,
      photo: photos[i],
      slot: found.slots[i],
      aspectRatio: params.aspectRatio,
      // Normalise the canvas once, after the last photograph is in. Doing it
      // per photo would resize the page under the slots measured against it.
      normalise: i === photos.length - 1,
    });
  }
  return { ok: true, image, coverage: found.coverage, rectangularity: 1 };
}
