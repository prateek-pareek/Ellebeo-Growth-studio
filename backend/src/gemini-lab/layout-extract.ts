/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';
import type { StoredTemplate } from './template-store';

/**
 * Deriving a layout from a post the studio likes the look of.
 *
 * Two problems meet here.
 *
 * The first is that the layout library is hand-written. Twenty-one layouts is
 * enough to prove the model and far too few to carry a product: adding one
 * costs an engineer and a deploy, so the library grows at the speed of
 * releases rather than the speed of design. That is the real ceiling on
 * variety, and no amount of weighting the existing twenty-one gets past it.
 *
 * The second is that the style-reference upload — a technician saying "make it
 * look like this" — has never influenced layout at all. It is shown to the
 * copy model and used to tint generated art; the arrangement of the page,
 * which is the thing they are actually pointing at, ignores it entirely.
 *
 * Extraction answers both. A vision model reads the reference and returns the
 * arrangement as grid regions, and that goes through exactly the same import
 * gate a hand-authored layout does — so an extracted layout is either provably
 * renderable or refused with a reason. The library grows from what studios
 * show us instead of from what an engineer had time to draw.
 *
 * What is NOT copied is as important: no colours, no fonts, no words, no
 * imagery. Those come from the salon's own brand tokens. Copying them would
 * make every studio look like whatever they screenshotted, which is the
 * opposite of the point.
 */

export const EXTRACT_PROMPT = [
  'You are a design director reading the LAYOUT of a social media post so it can be rebuilt for a different brand.',
  '',
  'Describe only the ARRANGEMENT. Ignore the colours, the fonts, the words and the photograph itself — those will all come from elsewhere. You are tracing where things sit, not what they are.',
  '',
  'The canvas is a 12x12 grid. Regions are {"col":1-12,"row":1-12,"colSpan":n,"rowSpan":n}, 1-indexed, and must stay inside the grid.',
  '',
  'Return JSON only:',
  '{"name":"","intent":"","photoMode":"framed|full_bleed|typographic|dual_framed","regions":{"photo":{...},"text":{...},"block":{...}},"defaults":{"textAlign":"left|center|right","typeAlign":"top|center|bottom","typeScale":"compact|balanced|dramatic","photoShapes":["rect"]}}',
  '',
  'Rules that decide whether this is usable, so read them before answering:',
  '- photoMode "framed" and "dual_framed" need a photo region. "full_bleed" means the photograph fills the whole canvas — give no photo region. "typographic" means there is no photograph at all.',
  '- The photo and text regions must NOT overlap, and must leave at least one full grid cell of gutter between them.',
  '- The text region needs at least 5 of the 12 columns.',
  '- Do not centre both the photo and the text — a composition needs an anchor.',
  '- Include "block" only if the post has a distinct list, price table or quote area, and it must not overlap the other two.',
  '',
  '"name" is two or three words for a designer. "intent" is one sentence on what this arrangement is FOR — it is shown to the writer so they can write copy that fits the shape.',
].join('\n');

const EXTRACT_MODEL = process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';

/** Parses the model's reply into the shape the template store validates. Null when unusable. */
export function parseExtracted(raw: string, key: string): StoredTemplate | null {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const photoMode = String(parsed.photoMode ?? '');
  const regions = parsed.regions;
  if (!regions || typeof regions !== 'object') return null;

  return {
    key,
    name: String(parsed.name || 'Extracted layout').slice(0, 60),
    intent: String(parsed.intent || 'A layout taken from a post this studio liked.').slice(0, 300),
    photoMode,
    regions,
    defaults: parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {},
    // Extracted layouts stay general on purpose. Claiming a format would let
    // one screenshot dominate a format's specialist slot on the strength of a
    // model's guess about what the post was for.
    suits: [],
  };
}

/** A stable, readable key for a layout taken from a reference. */
export function extractedKey(seed: string): string {
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `ref-${slug || 'layout'}-${Date.now().toString(36).slice(-4)}`;
}

/** Reads the arrangement out of a reference image. Returns null when the model gives nothing usable. */
export async function extractLayout(params: {
  apiKey: string;
  reference: Buffer;
  key: string;
}): Promise<StoredTemplate | null> {
  const jpeg = await sharp(params.reference)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(EXTRACT_MODEL)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: EXTRACT_PROMPT },
              { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.15 },
      }),
    },
  );
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message || 'Could not read that layout.');
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  return parseExtracted(text, params.key);
}
