/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';
import type { LabPalette, LabTypography, MoodHint } from './gemini-lab-compositor';
import type { PostFormatId } from './gemini-lab-formats';
import { describeColour, describeTypeface } from './ai-layout';

/**
 * Posts with no client photograph are GENERATED, not composited.
 *
 * The pipeline had one path for everything: template geometry, SVG type
 * setting, grid validation, craft repairs and a long rigid prompt describing
 * regions and constraints. All of that machinery exists for one reason — a
 * real photograph of a real client has to survive the process untouched, and
 * that means the layout around it must be built rather than imagined.
 *
 * A price card, a sale, an aftercare list or a celebration post contains no
 * such photograph. Nothing needs protecting, so none of that machinery earns
 * its cost — and it was actively harming the result: the model was spending
 * its instruction budget on grid coordinates and craft rules instead of on
 * making something good, and the output was bounded by a hand-drawn template
 * library and an SVG renderer with no real typographic shaping.
 *
 * So the split is now the honest one:
 *
 *   CLIENT PHOTO PRESENT   composite it. Template geometry, integrity rules,
 *                          the whole apparatus. The photo is evidence and is
 *                          never altered or re-imagined.
 *
 *   NO CLIENT PHOTO        generate the finished artwork directly. The model
 *                          gets the brand and the facts and is otherwise free.
 *
 * The brand is given as material to design WITH — exact hex values, the type
 * character, the mood, the studio's own words — rather than as constraints to
 * satisfy afterwards.
 */

export type PosterBrief = {
  format: PostFormatId;
  /** The line the studio wants on the artwork. */
  headline: string;
  subhead?: string;
  /** Short chip — "20% OFF", "3 SPOTS LEFT". */
  badge?: string;
  cta?: string;
  /** Rows, steps or checklist items the format carries, already in the studio's words. */
  lines?: string[];
  /** The technician's own sale/price/opening text, verbatim. The source of every figure. */
  offerDetails?: string;
  /**
   * The studio's own instruction for this post, in their words.
   *
   * This reached the copy writer and stopped there, so a photo-free post —
   * which is generated as artwork rather than composed — was designed with no
   * knowledge of it. Someone typing "make it feel like a spring sale, lots of
   * white space" got their words into the caption and nothing on the page.
   */
  direction?: string;
  /** A real client review, verbatim. */
  testimonial?: string;
};

export type PosterBrand = {
  name?: string | null;
  palette: LabPalette;
  typography: LabTypography;
  mood?: MoodHint;
  essence?: string[];
  serviceAreas?: string[];
};

/** How each kind of post wants to be designed, in a designer's terms rather than a grid's. */
const FORMAT_ART_DIRECTION: Partial<Record<PostFormatId, string>> = {
  offer:
    'A sale poster. The saving is the hero — set the number enormous and let everything else be small and quiet beneath it. Deadline stated plainly.',
  menu:
    'A price list. It must be scannable in two seconds: service names ranged left, prices ranged right on one shared edge, even rhythm down the card. Elegant, not decorative.',
  availability:
    'An openings card. Few words, very large. Urgency comes from the scarcity itself, not from exclamation.',
  testimonial:
    'A client quote set large, as the whole artwork. The attribution is small. Nothing competes with the words.',
  tips: 'A short, saveable list. Parallel phrasing, generous spacing, a clear reading order down the card.',
  myth: 'Two opposed halves — the misconception and the correction — visibly separated, with the correction dominant.',
  process: 'Numbered steps in the order they happen, evenly spaced, easy to follow at a glance.',
  occasion: 'A warm, timely celebration piece. Restrained and seasonal, never salesy.',
  own: 'The studio wrote these words. Design around them exactly as written.',
  statement: 'One short line, set as large as the canvas allows, with generous space around it.',
};

const ASPECT_WORD: Record<string, string> = {
  '4:5': 'vertical portrait 4:5',
  '1:1': 'square 1:1',
  '9:16': 'tall vertical 9:16',
  '16:9': 'landscape 16:9',
};

/**
 * The brief the image model receives.
 *
 * Written as a commission to a designer, not as a specification to a
 * renderer: what the piece is for, what it must say, what the brand is made
 * of, and then out of the way. The only hard requirements are the ones that
 * would make the artwork wrong rather than merely different — the studio's own
 * figures, and text that is actually spelled correctly.
 */
export function buildPosterPrompt(brief: PosterBrief, brand: PosterBrand, aspectRatio: string): string {
  const p = brand.palette;
  const direction = FORMAT_ART_DIRECTION[brief.format] ?? FORMAT_ART_DIRECTION.statement!;
  const lines: string[] = [];

  lines.push(
    'Design a finished, publication-ready social media graphic for a premium hair and beauty studio. This is the final artwork, not a mockup or a template — no device frames, no borders, no watermarks.',
  );
  lines.push(`Output ${ASPECT_WORD[aspectRatio] ?? aspectRatio}, full bleed, edge to edge.`);
  lines.push(`WHAT THIS PIECE IS: ${direction}`);

  lines.push(
    [
      'THE BRAND — design WITH these, they are your materials:',
      brand.name ? `  Studio: ${brand.name}` : '',
      // Never the hex itself. Told these values were "to mix with, never to
      // display", the model set `#A3B184C` as the visible headline — and the
      // poster path was still handing it the raw codes long after the layout
      // path stopped.
      `  Colours: ${describeColour(p.background)} as the paper, ${describeColour(p.depth)} as the ink, ${describeColour(p.accent)} as the accent, with ${describeColour(p.secondary)} and ${describeColour(p.primary)} available. Use them as a designer would — you may ground the piece in any of them, including the dark one.`,
      // Nor the typeface name. This exact wording — "a <name> feeling" —
      // is what produced a poster with INTER typeset as body copy.
      `  Type character: ${describeTypeface(brand.typography.heading)} for display, ${describeTypeface(brand.typography.body)} for everything else.`,
      brand.mood ? `  Mood: ${brand.mood.replace(/_/g, ' ').toLowerCase()}.` : '',
      brand.essence?.length ? `  It should feel: ${brand.essence.join(', ').toLowerCase()}.` : '',
      brand.serviceAreas?.length ? `  Local to: ${brand.serviceAreas.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const words: string[] = [];
  if (brief.badge) words.push(`  Chip: ${brief.badge}`);
  words.push(`  Headline: ${brief.headline}`);
  if (brief.subhead) words.push(`  Supporting line: ${brief.subhead}`);
  for (const l of brief.lines ?? []) words.push(`  Line: ${l}`);
  if (brief.cta) words.push(`  Call to action: ${brief.cta}`);
  lines.push(`THE WORDS ON THE ARTWORK — set exactly these, spelled exactly like this:\n${words.join('\n')}`);

  if (brief.offerDetails?.trim()) {
    lines.push(
      `THE STUDIO'S OWN FIGURES — every price, percentage and date on the artwork must come from this text, copied exactly:\n<<<${brief.offerDetails.trim()}>>>`,
    );
  }
  if (brief.testimonial?.trim()) {
    lines.push(`THE CLIENT'S OWN WORDS — quote verbatim, do not reword:\n<<<${brief.testimonial.trim()}>>>`);
  }

  if (brief.direction?.trim()) {
    lines.push(
      `THE STUDIO'S OWN DIRECTION FOR THIS PIECE — follow it:
<<<${brief.direction.trim()}>>>
Apply it to the design itself, not only to the words. It does not override the figures above, and it cannot add a price, a date or a claim that is not already here.`,
    );
  }

  lines.push(
    'CRAFT: real typographic hierarchy, confident use of scale, generous negative space, considered asymmetry. Every word must be legible at thumbnail size and spelled correctly. Do not add any text beyond what is listed above — no invented prices, no lorem, no stray labels.',
  );
  lines.push(
    'Do not include people, faces, hands or bodies. No stock-photo look, no clip art, no emoji, no 3D render.',
  );
  lines.push('Be genuinely inventive with the composition. This should look like a studio commissioned it.');

  return lines.join('\n\n');
}

const MODEL = process.env['GEMINI_IMAGE_MODEL'] || 'gemini-2.5-flash-image';

/** Generates the finished artwork. Returns null when the model gives no image. */
export async function generatePoster(params: {
  apiKey: string;
  brief: PosterBrief;
  brand: PosterBrand;
  aspectRatio: string;
}): Promise<Buffer | null> {
  const prompt = buildPosterPrompt(params.brief, params.brand, params.aspectRatio);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    },
  );
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message || 'Could not generate the artwork just now.');

  for (const part of (json?.candidates?.[0]?.content?.parts ?? []) as any[]) {
    if (part?.inlineData?.data) {
      // Normalised to the canvas size the rest of the pipeline returns, so a
      // generated post and a composited one are interchangeable downstream.
      const raw = Buffer.from(part.inlineData.data, 'base64');
      const { w, h } = CANVAS[params.aspectRatio] ?? CANVAS['4:5'];

      // NEVER crop finished artwork. The model frequently returns a square
      // regardless of the aspect it was asked for, and `fit: cover` then sliced
      // 135px off each side to reach 4:5 — straight through whatever the
      // designer had placed near the edge. Real posts came back with the studio
      // name reading "hing" and an offer box cut to "0% off ... efore 30
      // September". Padding onto the brand's own paper colour keeps every word
      // that was drawn, which matters far more than filling the frame edge to
      // edge.
      const meta = await sharp(raw).metadata();
      const srcRatio = (meta.width ?? w) / (meta.height ?? h);
      const dstRatio = w / h;
      if (Math.abs(srcRatio - dstRatio) > 0.01) {
        // eslint-disable-next-line no-console
        console.warn(
          `[poster] model returned ${meta.width}x${meta.height} for ${params.aspectRatio}; padding rather than cropping`,
        );
      }
      // Contain alone leaves flat bands top and bottom in a colour that rarely
      // matches the artwork's own ground. Filling those with a blurred,
      // over-scaled copy of the same art reads as a deliberate edge-to-edge
      // piece while still keeping every word the designer placed.
      const art = await sharp(raw)
        .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const backdrop = await sharp(raw)
        .resize(w, h, { fit: 'cover', position: 'centre' })
        .blur(48)
        .modulate({ saturation: 0.9 })
        .png()
        .toBuffer();
      return sharp(backdrop).composite([{ input: art }]).png().toBuffer();
    }
  }
  return null;
}

const CANVAS: Record<string, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
};
