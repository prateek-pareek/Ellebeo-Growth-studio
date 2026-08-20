/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';
import type { MoodHint } from './gemini-lab-compositor';

/**
 * Client-photo finishing.
 *
 * Every operation here is a GLOBAL TONAL adjustment — exposure, white balance,
 * contrast, saturation, sharpening. The kind of thing a photographer does to a
 * RAW file before delivering it. Three properties hold by construction:
 *
 *   - No pixel is invented. Values are remapped, never synthesised.
 *   - No geometry changes. Nothing is warped, slimmed, smoothed or moved.
 *   - The person is still the person. Identity, skin texture and the actual
 *     result are untouched.
 *
 * That last property is the whole point. A studio's before/after is a claim
 * about work they did on a real client; making the client look different is
 * misrepresenting that claim to everyone who sees the post. Making their
 * photograph look properly exposed is just competent photography.
 */

export type PhotoFinish = 'off' | 'natural' | 'polished' | 'editorial';

export const PHOTO_FINISHES: PhotoFinish[] = ['off', 'natural', 'polished', 'editorial'];

export function isPhotoFinish(v: unknown): v is PhotoFinish {
  return typeof v === 'string' && (PHOTO_FINISHES as string[]).includes(v);
}

type FinishProfile = {
  /** How far exposure may be pushed toward the target mid-tone. 0 = none, 1 = fully corrected. */
  exposure: number;
  /** Maximum per-channel white-balance correction, as a fraction. Small on purpose: skin goes wrong fast. */
  whiteBalance: number;
  /** Hard ceiling on the exposure multiplier. Without a per-finish ceiling every finish clamps to the same value on a dark photo. */
  exposureMax: number;
  /** Contrast gain around mid-grey. */
  contrast: number;
  /** Saturation multiplier. */
  saturation: number;
  sharpen: { sigma: number; m1: number; m2: number } | null;
};

const PROFILES: Record<Exclude<PhotoFinish, 'off'>, FinishProfile> = {
  // Fixes a badly-lit phone snap without looking processed.
  natural: {
    exposure: 0.55,
    exposureMax: 1.22,
    whiteBalance: 0.06,
    contrast: 1.03,
    saturation: 1.02,
    sharpen: { sigma: 0.7, m1: 0.5, m2: 0.25 },
  },
  // The look most studios want: clean, bright, a little crisp.
  polished: {
    exposure: 0.8,
    exposureMax: 1.45,
    whiteBalance: 0.09,
    contrast: 1.08,
    saturation: 1.06,
    sharpen: { sigma: 0.9, m1: 0.8, m2: 0.35 },
  },
  // Deliberately graded — more contrast, slightly desaturated, magazine-ish.
  editorial: {
    exposure: 0.7,
    exposureMax: 1.34,
    whiteBalance: 0.09,
    contrast: 1.16,
    saturation: 0.94,
    sharpen: { sigma: 1.0, m1: 0.9, m2: 0.4 },
  },
};

/** Mood nudges the grade, so a clinical brand doesn't get a warm golden cast. */
const MOOD_GRADE: Record<MoodHint, { warmth: number; saturation: number }> = {
  SOFT_GLAM: { warmth: 1.03, saturation: 1.04 },
  CLEAN_CLINICAL: { warmth: 0.99, saturation: 0.97 },
  EDITORIAL_MINIMAL: { warmth: 1.0, saturation: 0.96 },
  NATURAL_ORGANIC: { warmth: 1.02, saturation: 1.02 },
  BOLD_LUXE: { warmth: 1.01, saturation: 1.05 },
  PLAYFUL_FRESH: { warmth: 1.01, saturation: 1.08 },
};

/** Mid-tone we aim for. Slightly above centre — under-exposed phone photos are the common case. */
const TARGET_MEAN = 132;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Average channel means across one or more frames.
 *
 * Passing BOTH frames of a before/after is what makes a shared grade fair.
 * Measuring only the "before" derives a correction sized for the darker frame
 * and then dumps it on the brighter one, which blows the result out.
 */
async function measureMeans(buffers: Buffer[]): Promise<{ r: number; g: number; b: number } | null> {
  const sums = { r: 0, g: 0, b: 0 };
  let n = 0;
  for (const buf of buffers) {
    const stats = await sharp(buf).stats().catch(() => null);
    const [r, g, b] = stats?.channels ?? [];
    if (!r || !g || !b) continue;
    sums.r += r.mean; sums.g += g.mean; sums.b += b.mean;
    n += 1;
  }
  if (!n) return null;
  return { r: sums.r / n, g: sums.g / n, b: sums.b / n };
}

export type PhotoFinishResult = {
  buffer: Buffer;
  /** Human-readable record of what was actually applied — logged, and safe to surface in the UI. */
  applied: string[];
  /** The exact per-channel gains used, so a paired photo can be given the identical treatment. */
  gains: [number, number, number] | null;
};

/**
 * Measures the photo, then corrects it. Returns the gains it used so a
 * before/after partner can be graded identically — see finishPhotoPair.
 */
export async function finishClientPhoto(
  buffer: Buffer,
  opts: { finish: PhotoFinish; mood?: MoodHint; forceGains?: [number, number, number]; measureFrom?: Buffer[] },
): Promise<PhotoFinishResult> {
  if (opts.finish === 'off') return { buffer, applied: [], gains: null };
  const profile = PROFILES[opts.finish];
  const grade = opts.mood ? MOOD_GRADE[opts.mood] : { warmth: 1, saturation: 1 };
  const applied: string[] = [];

  let gains: [number, number, number];

  if (opts.forceGains) {
    gains = opts.forceGains;
    applied.push('matched to paired photo');
  } else {
    const measured = await measureMeans(opts.measureFrom ?? [buffer]);
    if (!measured) return { buffer, applied: [], gains: null };
    const { r, g, b } = measured;

    // Exposure: measured mean luminance pulled toward the target, scaled by how
    // assertive this finish is. A correctly-exposed photo gets left alone.
    const meanL = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const rawExposure = meanL > 1 ? TARGET_MEAN / meanL : 1;
    const exposure = clamp(1 + (rawExposure - 1) * profile.exposure, 0.82, profile.exposureMax);

    // White balance, grey-world: assume the average of the scene is neutral and
    // correct the channels toward it. Clamped hard — an over-corrected skin tone
    // looks far worse than a slightly warm one.
    const avg = (r + g + b) / 3;
    const wb = (channelMean: number) =>
      clamp(channelMean > 1 ? avg / channelMean : 1, 1 - profile.whiteBalance, 1 + profile.whiteBalance);

    gains = [
      exposure * wb(r) * grade.warmth,
      exposure * wb(g),
      exposure * wb(b) * (2 - grade.warmth),
    ];
    applied.push(`exposure ${exposure.toFixed(2)}x`, 'white balance');
  }

  // Contrast around mid-grey: y = a*x + b with b chosen so 128 maps to itself.
  const a = profile.contrast;
  const offset = 128 * (1 - a);

  let pipeline = sharp(buffer)
    .linear(
      [gains[0] * a, gains[1] * a, gains[2] * a],
      [offset, offset, offset],
    )
    .modulate({ saturation: profile.saturation * grade.saturation });
  applied.push(`contrast ${a.toFixed(2)}x`, `saturation ${(profile.saturation * grade.saturation).toFixed(2)}x`);

  if (profile.sharpen) {
    pipeline = pipeline.sharpen(profile.sharpen);
    applied.push('sharpen');
  }

  const out = await pipeline.png({ compressionLevel: 4, quality: 100 }).toBuffer();
  return { buffer: out, applied, gains };
}

/**
 * Grades a before/after pair with ONE shared correction, measured across BOTH
 * frames.
 *
 * This is the rule that matters. Grading each frame independently makes the
 * "after" brighter, warmer and crisper purely because it was measured
 * separately — the result looks better without the technician having done
 * anything better. That is a fabricated improvement, and the easiest way for
 * an honest studio to accidentally publish a misleading before/after.
 *
 * The correction is derived from the average of both frames rather than from
 * the "before" alone: a gain sized for the darker frame would clip the
 * brighter one. Fair to the comparison, and correct exposure for both.
 */
export async function finishPhotoPair(
  before: Buffer,
  after: Buffer | undefined,
  opts: { finish: PhotoFinish; mood?: MoodHint },
): Promise<{ before: Buffer; after?: Buffer; applied: string[] }> {
  if (!after) {
    const only = await finishClientPhoto(before, opts);
    return { before: only.buffer, applied: only.applied };
  }
  const frames = [before, after];
  const first = await finishClientPhoto(before, { ...opts, measureFrom: frames });
  const second = await finishClientPhoto(after, { ...opts, forceGains: first.gains ?? undefined });
  return {
    before: first.buffer,
    after: second.buffer,
    applied: first.applied.length ? [...first.applied, 'one identical grade across both frames'] : [],
  };
}
