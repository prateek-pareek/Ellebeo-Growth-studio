/** Gemini Lab–only Brand DNA v2. Do not import from the /generate pipeline. */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { MoodHint } from '../gemini-lab-compositor';

const GEMINI_IMAGE_MODEL = process.env['GEMINI_IMAGE_MODEL'] || 'gemini-2.5-flash-image';
const OPENAI_IMAGE_MODEL = process.env['OPENAI_IMAGE_MODEL'] || 'gpt-image-1';

// A fresh image per generation would be slow (10-30s) and costly for
// something meant to be a consistent per-mood backdrop, not a novel artwork
// every call — cached to disk by prompt hash, same discipline as
// growth-studio-poc's generate-background-art.ts.
const CACHE_DIR = path.join(__dirname, '../../../.gemini-lab-art-cache');

// Per-mood material/texture reference — generic "soft organic shapes" reads
// as stock-abstract filler; a real material reference reads as intentional
// art direction. Mirrors growth-studio-poc's TEXTURE_LIBRARY idea, scoped to
// this deployment's 6 moods rather than a flat rotating list.
const MOOD_TEXTURES: Record<MoodHint, string[]> = {
  SOFT_GLAM: ['fine marble veining catching soft warm light', 'silk fabric folds with a gentle sheen', 'a warm late-afternoon light wash with long soft shadows'],
  CLEAN_CLINICAL: ['brushed matte surface with a single soft highlight', 'frosted glass with faint water droplets', 'a clean gradient wash with no visible texture, almost clinical'],
  EDITORIAL_MINIMAL: ['soft 35mm film grain over a warm paper-white wash', 'hand-torn textured paper edges with soft shadow', 'gentle watercolor bleed with feathered edges'],
  NATURAL_ORGANIC: ['dried botanicals and pressed-flower silhouettes', 'linen fiber texture at macro scale', 'raw natural stone with visible grain'],
  BOLD_LUXE: ['brushed metallic sheen catching a single light source', 'deep marble veining in high contrast', 'a rich jewel-toned gradient with a soft vignette'],
  PLAYFUL_FRESH: ['soft watercolor bleed in bright tones', 'a playful gradient wash with gentle grain', 'paper confetti texture, out of focus, abstract'],
};

/**
 * Aspect handling. Without this the model returns 1024x1024 (or 896x1152) and
 * the compositor cover-resizes it to the real canvas — a 17-32% UPSCALE plus a
 * crop on every post. That is visible softness on every background, and the
 * crop removes exactly the calm negative space the prompt asks for, which is
 * where the text is about to be placed.
 *
 * Generating at the target aspect costs nothing and removes both problems.
 */
const GEMINI_ASPECT: Record<string, string> = {
  '1:1': '1:1',
  '4:5': '4:5',
  '9:16': '9:16',
  '16:9': '16:9',
};

/** gpt-image-1 only offers square, portrait (2:3) and landscape (3:2) — pick the closest. */
const OPENAI_SIZE: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
  '1:1': '1024x1024',
  '4:5': '1024x1536',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

function seedFrom(...parts: string[]): number {
  return crypto.createHash('sha1').update(parts.join('|')).digest().readUInt32BE(0);
}

function pickTexture(mood: MoodHint, seed: number): string {
  const list = MOOD_TEXTURES[mood];
  return list[seed % list.length];
}

// Server-controlled prompt only — the AI never chooses WHAT'S in the art,
// only whether art generation is used at all for this slide (same
// "constrained menu, never freeform" discipline as layout/decoration
// elsewhere in this pipeline). Explicitly bans people/faces/hands/text/logos
// /photorealism so a generated background can never be confused with — or
// leak into — the real, untouched client photo elsewhere on the same slide.
/**
 * Independent axes the art is composed along.
 *
 * The prompt used to vary on one thing — a texture picked from a per-mood
 * list of a few entries, seeded by a variantIndex of 0, 1 or 2. Since the
 * cache key is a hash of the prompt and mood/essence are fixed per brand,
 * that made exactly THREE possible background images per salon, cached to
 * disk and recycled behind every post the brand would ever publish.
 *
 * Crossing several axes instead means the pool is combinatorial rather than
 * enumerable, so two posts for the same salon are very unlikely to share a
 * backdrop even after months of daily posting.
 */
const ART_FRAMING = [
  'extreme macro, filling the frame with a single surface',
  'shot from directly overhead, flat and even',
  'a shallow-depth close-up with the far side falling out of focus',
  'a wide, quiet crop with the material occupying only part of the frame',
  'an oblique angle across the surface, raking toward the far edge',
  'a tight detail of where two materials meet',
];

const ART_LIGHT = [
  'soft overcast daylight from a large window',
  'low raking light that grazes the surface and picks out its grain',
  'even, shadowless studio light',
  'warm late-afternoon sun with long soft shadows',
  'diffused light through sheer fabric, very gentle falloff',
  'a single directional source with deep, calm shadow on one side',
];

const ART_TREATMENT = [
  'fine natural grain, no post-processing',
  'a whisper of film grain and gentle halation',
  'crisp and clean, high microcontrast in the texture only',
  'slightly lifted blacks for a matte, editorial finish',
  'very subtle vignette drawing toward the calm area',
];

function buildArtPrompt(mood: MoodHint, essence: string[], variantIndex: number, hasReference: boolean, aspectRatio: string): string {
  const seed = seedFrom(mood, essence.join(','), String(variantIndex));
  const texture = pickTexture(mood, seed);
  // Distinct multipliers so the axes do not move in lockstep with the seed.
  const framing = ART_FRAMING[(seed >>> 3) % ART_FRAMING.length];
  const light = ART_LIGHT[(seed >>> 7) % ART_LIGHT.length];
  const treatment = ART_TREATMENT[(seed >>> 11) % ART_TREATMENT.length];
  const moodDescriptor = mood.replace(/_/g, ' ').toLowerCase();
  const essenceLine = essence.length ? ` Essence: ${essence.join(', ').toLowerCase()}.` : '';
  const variantLine = ` Composition: ${framing}. Lighting: ${light}. Finish: ${treatment}. Make this a genuinely distinct photograph — same material family and palette as its siblings, but not a re-shoot of the same arrangement.`;
  const referenceLine = hasReference
    ? ` A reference image is attached — match ITS colour palette, texture, lighting, and overall visual mood as closely as possible. Do not reproduce or copy any specific object, shape, logo, text, or any person/face/body part from the reference — take only its palette/texture/mood, generate an entirely new abstract composition.`
    : '';
  return [
    `Photographic close-up texture of a real physical material, for a premium beauty-studio Instagram background — NOT an illustration, NOT digital art, NOT a graphic/vector pattern, NOT a painting.`,
    `Output aspect ratio ${aspectRatio} (${aspectRatio === '16:9' ? 'landscape' : aspectRatio === '1:1' ? 'square' : 'vertical portrait'}), full-bleed, edge to edge, filling the entire frame. Maximum detail and sharpness.`,
    `Material: ${texture}.`,
    `Mood: ${moodDescriptor}.${essenceLine}${referenceLine}`,
    `Muted, tonal, low-saturation colour palette true to the mood — NOT rainbow, NOT multicolour, NOT high-saturation graphic colours. Soft, even, diffused lighting.`,
    `At least half the frame must be calm, low-contrast, near-solid negative space with no strong shapes or edges — real text will be placed on top of that space later, so it must stay legible over it.`,
    `No people, no faces, no hands, no body parts, no text, no logos, no watermarks, no recognizable objects, no bold graphic shapes. Not a drawing, not stylised, not an illustration.${variantLine}`,
  ].join(' ');
}

function cacheKeyFor(prompt: string, provider: string): string {
  return crypto.createHash('sha1').update(`${provider}:${prompt}`).digest('hex');
}

function readCache(key: string): Buffer | null {
  const p = path.join(CACHE_DIR, `${key}.png`);
  try {
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, buf: Buffer): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.png`), buf);
  } catch {
    /* cache is best-effort */
  }
}

async function generateViaGemini(prompt: string, aspectRatio: string, referenceImage?: Buffer): Promise<Buffer | null> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });
  const parts: any[] = [{ text: prompt }];
  if (referenceImage) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImage.toString('base64') } });
  }

  let lastReason = 'unknown';
  const readImage = (result: any): Buffer | null => {
    const candidate = result?.response?.candidates?.[0];
    lastReason = candidate?.finishReason || 'no-candidate';
    for (const part of (candidate?.content?.parts || []) as any[]) {
      if (part.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
    }
    return null;
  };

  // imageConfig pins the output aspect but isn't in this SDK version's types,
  // so it's passed through `as any` and every attempt is guarded.
  const aspect = GEMINI_ASPECT[aspectRatio];
  const withText = (text: string) => {
    const next = [...parts];
    next[0] = { text };
    return next;
  };

  // Two shapes of the same prompt: aspect-pinned, then un-pinned in case the
  // endpoint rejects imageConfig. Prompt VARIATION (the effective remedy for
  // a recitation block) is handled a level up in generateMoodArt, where the
  // texture vocabulary lives.
  const attempts: boolean[] = aspect ? [true, false] : [false];
  for (const useAspect of attempts) {
    try {
      const result = useAspect
        ? await model.generateContent({
            contents: [{ role: 'user', parts: withText(prompt) }],
            generationConfig: { imageConfig: { aspectRatio: aspect } },
          } as any)
        : await model.generateContent(withText(prompt));
      const img = readImage(result);
      if (img) return img;
    } catch (err) {
      lastReason = (err as Error).message?.slice(0, 120) || 'threw';
    }
  }
  lastGeminiReason = lastReason;
  return null;
}

/** Surfaced so generateMoodArt can log WHY a background was dropped instead of failing silently. */
let lastGeminiReason = 'unknown';

async function generateViaOpenAi(prompt: string, aspectRatio: string): Promise<Buffer | null> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  const size = OPENAI_SIZE[aspectRatio] ?? '1024x1024';
  const result = await client.images.generate({ model: OPENAI_IMAGE_MODEL, prompt, size, n: 1 });
  const image = result.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, 'base64');
  if (image?.url) {
    const res = await fetch(image.url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

/**
 * Returns abstract, on-mood background art, or null on any failure (no key,
 * request error, timeout, empty response) — callers must fall back to the
 * existing flat/gradient background, same fail-soft discipline as every
 * other AI step in this pipeline. Never called with, or anywhere near, the
 * real client photo — `referenceImage` here is the technician's OWN style
 * reference upload (a mood board / design they like), never the client
 * photo, and is only ever used as style/palette/mood inspiration for a
 * brand-new abstract generation, explicitly barred from reproducing any
 * object/person/face from it.
 */
export async function generateMoodArt(
  mood: MoodHint,
  essence: string[],
  variantIndex = 0,
  referenceImage?: Buffer,
  aspectRatio = '4:5',
): Promise<Buffer | null> {
  // A custom reference makes this generation specific to that upload, not a
  // reusable per-mood asset — factor its bytes into the cache key so
  // different references (or no reference) never collide on the same key.
  const refSuffix = referenceImage ? `:ref:${crypto.createHash('sha1').update(referenceImage).digest('hex').slice(0, 16)}` : '';

  // Gemini is the primary path — reliably configured in this deployment
  // (unlike OPENAI_API_KEY, which is currently unset here). OpenAI stays
  // available as a secondary (text-only) path so this still works if that
  // changes; image-conditioned generation is Gemini-only for now.
  //
  // Each attempt shifts the texture seed, so a retry is a genuinely DIFFERENT
  // prompt rather than the same one resent. That matters because the failure
  // being recovered from is IMAGE_RECITATION, which is prompt-specific and
  // perfectly reproducible — resending the same words just fails again. Every
  // variant is a legitimate on-mood texture, so a recovery still looks right.
  const variants = [variantIndex, variantIndex + 1, variantIndex + 2];
  let prompt = buildArtPrompt(mood, essence, variantIndex, !!referenceImage, aspectRatio);

  for (const v of variants) {
    const attemptPrompt = buildArtPrompt(mood, essence, v, !!referenceImage, aspectRatio);
    const key = cacheKeyFor(attemptPrompt + refSuffix, 'gemini');
    const cached = readCache(key);
    if (cached) return cached;
    try {
      const buf = await generateViaGemini(attemptPrompt, aspectRatio, referenceImage);
      if (buf) {
        writeCache(key, buf);
        return buf;
      }
      console.warn(`Gemini art blocked for ${mood} variant ${v} (${lastGeminiReason}) — retrying with a different texture`);
    } catch (err) {
      console.warn('Gemini background art generation failed:', (err as Error).message);
    }
    prompt = attemptPrompt;
  }
  if (referenceImage) return null; // OpenAI path below is text-only — no reference fidelity to fall back to.

  const openAiKey = cacheKeyFor(prompt, 'openai');
  const cachedOpenAi = readCache(openAiKey);
  if (cachedOpenAi) return cachedOpenAi;

  try {
    const buf = await generateViaOpenAi(prompt, aspectRatio);
    if (buf) {
      writeCache(openAiKey, buf);
      return buf;
    }
  } catch (err) {
    console.warn('OpenAI background art generation failed, falling back to gradient:', (err as Error).message);
  }

  return null;
}
