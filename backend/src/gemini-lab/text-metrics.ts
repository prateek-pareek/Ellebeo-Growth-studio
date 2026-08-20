/** Gemini Lab–only. Do not import from the /generate pipeline. */

import fs from 'fs';
import path from 'path';

/**
 * Real glyph metrics, read from the TTFs the renderer already embeds.
 *
 * Text was previously measured as `fontSize * 0.58` characters per line — one
 * flat ratio for every font at every size. That is the root of the layout and
 * text-placement problems:
 *
 *  - It cannot tell "WILLOW" from "illili". Headlines are short and set
 *    large, which is exactly where per-glyph width variance dominates, so a
 *    wide-lettered headline overflowed its region and a narrow one wrapped a
 *    line early and left a ragged orphan.
 *  - 0.58 is wrong for every face in the registry — the display serifs
 *    (Playfair, Cormorant, Cinzel) and the grotesques (Inter, Outfit) sit on
 *    either side of it, so the error had a different sign per mood.
 *  - It ignored `tracking` and `headingWeight` entirely, both of which the
 *    AI authors per slide and the renderer applies as real letter-spacing and
 *    font-weight. A headline measured as fitting at tracking 0 overflowed
 *    once 1.5px per character was added back at render time.
 *
 * Parsing the font is the only way to measure the font. This reads the four
 * tables needed for advance widths (head, hhea, hmtx, cmap) and caches the
 * result per family — the files are already read and base64'd for the
 * @font-face block, so this adds no I/O in steady state.
 *
 * Fail-soft by design, matching loadFontFace(): if a font cannot be parsed we
 * fall back to the old ratio rather than failing the render. A slightly
 * mis-measured post beats no post.
 */

/** Advance widths in em units (1.0 = the em square), keyed by code point. */
type FontMetrics = {
  /** Advance per code point, in ems. */
  widths: Map<number, number>;
  /** Advance for anything not in the map. */
  fallback: number;
};

const FONT_FILES: Record<string, string> = {
  'Playfair Display': 'PlayfairDisplay-Regular.ttf',
  'Cormorant Garamond': 'CormorantGaramond-Variable.ttf',
  Fraunces: 'Fraunces-Variable.ttf',
  Cinzel: 'Cinzel-Variable.ttf',
  Outfit: 'Outfit-Variable.ttf',
  Inter: 'Inter-Variable.ttf',
  'Source Sans 3': 'SourceSans3-Variable.ttf',
};

/** The ratio the whole renderer used to assume. Still the fallback when a font will not parse. */
export const FALLBACK_ADVANCE_RATIO = 0.58;

const cache = new Map<string, FontMetrics | null>();

function fontPathFor(family: string): string | null {
  const fileName = FONT_FILES[family];
  if (!fileName) return null;
  const candidates = [
    path.join(__dirname, '../../assets/fonts', fileName),
    path.join(process.cwd(), 'assets/fonts', fileName),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function metricsFor(family: string): FontMetrics | null {
  if (cache.has(family)) return cache.get(family)!;
  let parsed: FontMetrics | null = null;
  try {
    const file = fontPathFor(family);
    if (file) parsed = parseTtf(fs.readFileSync(file));
  } catch {
    parsed = null;
  }
  cache.set(family, parsed);
  return parsed;
}

/**
 * Width of `text` in pixels, including letter-spacing.
 *
 * `tracking` is per-character spacing in px, exactly as the renderer emits it
 * (SVG letter-spacing), and applies between and after each glyph in most
 * renderers — we count it per character, which is the conservative reading.
 */
export function measureText(
  text: string,
  family: string,
  fontSize: number,
  tracking = 0,
): number {
  if (!text) return 0;
  const metrics = metricsFor(family);
  const chars = [...text];
  let ems = 0;
  if (metrics) {
    for (const ch of chars) {
      ems += metrics.widths.get(ch.codePointAt(0)!) ?? metrics.fallback;
    }
  } else {
    ems = chars.length * FALLBACK_ADVANCE_RATIO;
  }
  return ems * fontSize + chars.length * tracking;
}

/** True when this family's real metrics are available — lets callers report honestly rather than guess. */
export function hasRealMetrics(family: string): boolean {
  return metricsFor(family) !== null;
}

// ── TTF parsing ──────────────────────────────────────────────────────────
// Only the tables needed for horizontal advance. Deliberately narrow: this is
// not a font library, it is a ruler.

function parseTtf(buf: Buffer): FontMetrics | null {
  if (buf.length < 12) return null;
  const tag = buf.readUInt32BE(0);
  // 0x00010000 = TrueType outlines, 'OTTO' = CFF outlines, 'true'/'ttcf' seen
  // in the wild. All of them still carry head/hhea/hmtx/cmap.
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;

  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (rec + 16 > buf.length) return null;
    const name = buf.toString('ascii', rec, rec + 4);
    tables.set(name, { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) });
  }

  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (!head || !hhea || !hmtx || !cmap) return null;

  const unitsPerEm = buf.readUInt16BE(head.offset + 18);
  if (!unitsPerEm) return null;
  const numberOfHMetrics = buf.readUInt16BE(hhea.offset + 34);
  if (!numberOfHMetrics) return null;

  // hmtx: numberOfHMetrics x {advanceWidth u16, lsb i16}, then the trailing
  // glyphs all reuse the final advance.
  const advanceOf = (glyphId: number): number => {
    const i = Math.min(glyphId, numberOfHMetrics - 1);
    const at = hmtx.offset + i * 4;
    if (at + 2 > buf.length) return FALLBACK_ADVANCE_RATIO * unitsPerEm;
    return buf.readUInt16BE(at);
  };

  const charToGlyph = parseCmap(buf, cmap.offset);
  if (!charToGlyph) return null;

  const widths = new Map<number, number>();
  for (const [code, glyphId] of charToGlyph) {
    widths.set(code, advanceOf(glyphId) / unitsPerEm);
  }
  if (!widths.size) return null;

  // Anything outside the map (an emoji, an unusual dash) measures as the
  // font's own lowercase-n advance rather than a global guess.
  const fallback = widths.get(0x6e) ?? FALLBACK_ADVANCE_RATIO;
  return { widths, fallback };
}

/** Code point → glyph id, from the best available Unicode subtable. */
function parseCmap(buf: Buffer, offset: number): Map<number, number> | null {
  if (offset + 4 > buf.length) return null;
  const numTables = buf.readUInt16BE(offset + 2);
  let best: number | null = null;
  let bestScore = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = offset + 4 + i * 8;
    if (rec + 8 > buf.length) break;
    const platformId = buf.readUInt16BE(rec);
    const encodingId = buf.readUInt16BE(rec + 2);
    const subOffset = offset + buf.readUInt32BE(rec + 4);
    // Prefer Windows BMP (3,1), then Unicode (0,x), then Windows symbol (3,0).
    const score =
      platformId === 3 && encodingId === 1 ? 3 : platformId === 0 ? 2 : platformId === 3 ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = subOffset;
    }
  }
  if (best === null || best + 4 > buf.length) return null;

  const format = buf.readUInt16BE(best);
  // Format 4 is the segmented BMP mapping every one of these fonts uses for
  // Latin. Other formats fall back to the ratio rather than being guessed at.
  if (format !== 4) return null;

  const segCountX2 = buf.readUInt16BE(best + 6);
  const segCount = segCountX2 / 2;
  const endCodes = best + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  if (idRangeOffsets + segCountX2 > buf.length) return null;

  const map = new Map<number, number>();
  for (let seg = 0; seg < segCount; seg += 1) {
    const end = buf.readUInt16BE(endCodes + seg * 2);
    const start = buf.readUInt16BE(startCodes + seg * 2);
    if (start > end || start === 0xffff) continue;
    const delta = buf.readInt16BE(idDeltas + seg * 2);
    const rangeOffsetAt = idRangeOffsets + seg * 2;
    const rangeOffset = buf.readUInt16BE(rangeOffsetAt);
    // Only the ranges text is actually set in — walking all of Unicode would
    // build a 60k-entry map to measure a six-word headline.
    const from = Math.max(start, 0x20);
    const to = Math.min(end, 0x24f);
    for (let code = from; code <= to; code += 1) {
      let glyphId: number;
      if (rangeOffset === 0) {
        glyphId = (code + delta) & 0xffff;
      } else {
        const at = rangeOffsetAt + rangeOffset + (code - start) * 2;
        if (at + 2 > buf.length) continue;
        const raw = buf.readUInt16BE(at);
        glyphId = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyphId) map.set(code, glyphId);
    }
  }
  return map.size ? map : null;
}
