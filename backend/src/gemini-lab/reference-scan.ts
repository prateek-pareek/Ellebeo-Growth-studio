/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';

/**
 * Reads a reference slide and decides what it can be used for.
 *
 * A studio's template library is a mix: some slides are a photograph with type
 * around it, some are pure type — step cards, quote cards, stat cards — and
 * some are device mockups where the "photo" is a phone screen. Only the first
 * kind can carry a client's photograph, and dropping one into a phone frame or
 * behind a stat card is exactly the mistake the library's own review notes
 * warned about.
 *
 * The image model cannot be asked to make this call. Told "if the reference
 * has no photograph, draw no placeholder", it drew one anyway on every
 * type-only step card in a real deck. So the classification is measured here
 * instead, from the pixels.
 *
 * The discriminator is continuous tone. A photograph carries hundreds of
 * distinct colours in any small patch — skin, hair, shadow, background all
 * shading into each other. Flat design carries a handful, even where it is
 * busy with type: text is two colours against a ground, and an edge, however
 * sharp, does not invent new hues.
 */

export type ReferenceKind = 'photo' | 'typographic';

export type Box = { x: number; y: number; w: number; h: number };

export type ReferenceScan = {
  kind: ReferenceKind;
  /** Share of the slide that reads as continuous-tone imagery, 0-1. */
  photoArea: number;
  /** Where that imagery sits, in fractions of the canvas. Null when typographic. */
  region: Box | null;
  /**
   * Where the ink sits — type, bars, rules — as a coarse grid of cells in
   * canvas fractions. This is what a schematic is drawn from.
   */
  inkCells: Box[];
  /** The grid the cells are measured on. */
  grid: { cols: number; rows: number };
};

/**
 * Unique colours a block must carry to read as photographic.
 *
 * Blocks are 16x16 = 256 pixels, so this is a fifth of the block being
 * distinct shades. Flat ground scores 1-3; type on flat ground scores under
 * 20 even where it is dense; a face scores well over 100.
 */
const COLOURS_PER_BLOCK = 55;
/** Below this share of photographic blocks the slide is type-led. */
const MIN_PHOTO_AREA = 0.10;

/** A block this far off the page's ground carries ink rather than paper. */
const INK_CONTRAST = 0.35;

const COLS = 16;
const ROWS = 20;

export async function scanReference(image: Buffer): Promise<ReferenceScan> {
  // 16px blocks: small enough to localise the photo, large enough that the
  // colour count means something.
  const W = COLS * 16;
  const H = ROWS * 16;
  const { data, info } = await sharp(image)
    .resize(W, H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const blockW = Math.floor(info.width / COLS);
  const blockH = Math.floor(info.height / ROWS);

  let photoBlocks = 0;
  // A grid, not a running bounding box. The bounding box of every photographic
  // patch on a page spans nearly the whole page as soon as one stray block is
  // detected in a far corner, which produced diagrams whose photo area covered
  // the canvas. The actual photograph is the largest CONNECTED run of blocks.
  const isPhoto: boolean[][] = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const inkCells: Box[] = [];
  // The page's ground is its MOST COMMON colour, not its top-left pixel. These
  // decks open with a banner bar, so the corner is the banner and every inch of
  // actual paper then counted as ink — the diagram came back a grey smear.
  const tally = new Map<number, number>();
  for (let i = 0; i < data.length; i += ch * 7) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let groundKey = 0;
  let groundCount = -1;
  for (const [k, n] of tally) {
    if (n > groundCount) {
      groundCount = n;
      groundKey = k;
    }
  }
  const ground = [
    ((groundKey >> 8) & 15) * 17,
    ((groundKey >> 4) & 15) * 17,
    (groundKey & 15) * 17,
  ];

  for (let by = 0; by < ROWS; by += 1) {
    for (let bx = 0; bx < COLS; bx += 1) {
      const seen = new Set<number>();
      let offGround = 0;
      let pixels = 0;
      for (let y = by * blockH; y < (by + 1) * blockH; y += 1) {
        for (let x = bx * blockW; x < (bx + 1) * blockW; x += 1) {
          const i = (y * info.width + x) * ch;
          pixels += 1;
          const dist =
            Math.abs(data[i] - ground[0]) +
            Math.abs(data[i + 1] - ground[1]) +
            Math.abs(data[i + 2] - ground[2]);
          if (dist > 90) offGround += 1;
          // 5 bits per channel: enough to separate shades of skin, coarse
          // enough that JPEG noise on a flat field does not read as tone.
          const key =
            ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
          seen.add(key);
        }
      }
      const contrast = pixels > 0 ? offGround / pixels : 0;
      if (seen.size >= COLOURS_PER_BLOCK) {
        photoBlocks += 1;
        isPhoto[by][bx] = true;
      } else if (contrast >= INK_CONTRAST) {
        // Not continuous tone, but clearly not blank paper either: type, a
        // rule, a filled bar. This is the structure a schematic needs.
        inkCells.push({ x: bx / COLS, y: by / ROWS, w: 1 / COLS, h: 1 / ROWS });
      }
    }
  }

  const photoArea = photoBlocks / (COLS * ROWS);
  const grid = { cols: COLS, rows: ROWS };
  const largest = largestRegion(isPhoto);

  // The photograph has to be a real presence, not a scatter of stray blocks.
  if (photoArea < MIN_PHOTO_AREA || !largest || largest.count < COLS * ROWS * 0.05) {
    return { kind: 'typographic', photoArea, region: null, inkCells, grid };
  }

  return {
    kind: 'photo',
    photoArea,
    region: {
      x: largest.minX / COLS,
      y: largest.minY / ROWS,
      w: (largest.maxX - largest.minX + 1) / COLS,
      h: (largest.maxY - largest.minY + 1) / ROWS,
    },
    inkCells,
    grid,
  };
}

/**
 * The biggest connected run of photographic blocks, and its bounds.
 *
 * Flood fill over 4-neighbours. A page with a framed photo and a little noise
 * elsewhere returns the frame, where a bounding box over everything returned
 * the whole page.
 */
function largestRegion(
  grid: boolean[][],
): { count: number; minX: number; minY: number; maxX: number; maxY: number } | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  let best: { count: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!grid[y][x] || seen[y][x]) continue;
      let count = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (!grid[ny][nx] || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
      if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
    }
  }
  return best;
}
