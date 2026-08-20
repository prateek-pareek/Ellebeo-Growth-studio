/** Gemini Lab–only. Do not import from the /generate pipeline. */

import { createHash } from 'crypto';
import sharp from 'sharp';

/**
 * Where the person is in the photograph.
 *
 * The design critic's most common complaint, by a wide margin, is that type
 * sits on the subject's face — six of ten distinct complaints across every
 * version of this pipeline, in both framed and full-bleed layouts, with
 * average scores flat at 51-56 the whole time. It is the single defect holding
 * composited posts down.
 *
 * The compositor already crops with sharp's `attention` strategy, which finds
 * the highest-entropy region of an image. On a portrait that is often the
 * face, and often the patterned scarf, the window behind, or the brightest
 * corner. It is a saliency heuristic and it has no idea what a face is.
 *
 * So the face is measured instead of guessed: one vision call per photograph,
 * returning a box. Cached on the image's own hash, so re-running a post or
 * generating four options from one upload costs a single call.
 */

export type SubjectBox = {
  /** All in 0-1 fractions of the image. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** What the box encloses, so a caller can treat a face differently. */
  kind: 'face' | 'person' | 'unknown';
};

const MODEL = process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';

const PROMPT = [
  'Look at this photograph and find the MAIN SUBJECT.',
  '',
  'If there is a person, give the box around their HEAD AND FACE only — not their whole body.',
  'If there is no person, give the box around whatever the photograph is actually of.',
  '',
  'Coordinates are fractions of the image, 0 to 1, where x,y is the TOP-LEFT of the box.',
  'Return JSON only: {"x":0.0,"y":0.0,"w":0.0,"h":0.0,"kind":"face|person|unknown"}',
].join('\n');

const cache = new Map<string, SubjectBox | null>();

/** Clamps a model reply into a usable box, or null when it is not usable. */
export function parseSubjectBox(raw: string): SubjectBox | null {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  let x = num(parsed?.x);
  let y = num(parsed?.y);
  let w = num(parsed?.w);
  let h = num(parsed?.h);
  if ([x, y, w, h].some(Number.isNaN)) return null;

  // A box that starts outside the frame, or has no area, tells us nothing.
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0, w));
  h = Math.min(1 - y, Math.max(0, h));
  if (w <= 0.01 || h <= 0.01) return null;

  // A "face" covering most of the frame is the model describing the whole
  // photo, which is not information the compositor can act on.
  if (w > 0.95 && h > 0.95) return null;

  const kind = parsed?.kind === 'face' || parsed?.kind === 'person' ? parsed.kind : 'unknown';
  return { x, y, w, h, kind };
}

/**
 * The region text must stay out of, padded.
 *
 * A headline that merely touches the hairline still reads as crowding, so the
 * keep-out area is larger than the face itself.
 */
export function keepOutRegion(box: SubjectBox, pad = 0.06): SubjectBox {
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    w: Math.min(1 - x, box.w + pad * 2),
    h: Math.min(1 - y, box.h + pad * 2),
    kind: box.kind,
  };
}

/** Do a text region and the subject overlap at all? Both in 0-1 fractions. */
export function overlaps(
  region: { x: number; y: number; w: number; h: number },
  subject: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    region.x < subject.x + subject.w &&
    region.x + region.w > subject.x &&
    region.y < subject.y + subject.h &&
    region.y + region.h > subject.y
  );
}

/**
 * Which horizontal band of the photograph the subject sits in.
 *
 * Used to choose where type can go on a full-bleed post: if the face is up
 * top, the words go to the bottom, and the other way round.
 */
export function safeBandFor(box: SubjectBox): 'top' | 'bottom' {
  const centre = box.y + box.h / 2;
  return centre < 0.5 ? 'bottom' : 'top';
}

/** Asks the model once per image, then remembers. */
export async function findSubject(params: {
  apiKey: string;
  photo: Buffer;
}): Promise<SubjectBox | null> {
  const key = createHash('sha1').update(params.photo).digest('hex');
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    // Small: the box only needs to be roughly right, and a 512px edge keeps
    // the call cheap enough to make on every upload.
    const jpeg = await sharp(params.photo)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'inside' })
      .jpeg({ quality: 75 })
      .toBuffer();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
              ],
            },
          ],
        }),
      },
    );
    const json = (await res.json()) as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const box = parseSubjectBox(String(text));
    cache.set(key, box);
    return box;
  } catch {
    // Not knowing where the face is returns the compositor to exactly the
    // behaviour it had before, which is a worse post but still a post.
    cache.set(key, null);
    return null;
  }
}

/** Clears the cache. Tests only. */
export function resetSubjectCache(): void {
  cache.clear();
}
