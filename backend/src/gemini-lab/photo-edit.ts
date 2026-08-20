/** Gemini Lab–only. Do not import from the /generate pipeline. */

import sharp from 'sharp';

/**
 * Editing a photograph from a written instruction.
 *
 * Retouching is ordinary studio practice — a stray cable in the background, a
 * dim room, a cluttered bench — and blocking it wholesale was stricter than
 * this product needs to be. Editing is allowed by default, and every edited
 * image carries a disclosure so nothing downstream keeps calling it original.
 *
 * Two narrow cases remain, both because they involve a third party rather than
 * the studio's own taste:
 *
 *   BEFORE / AFTER   scenic edits only. Lighting, background and crop are
 *                    fine; changing the subject or the result is not, because
 *                    the comparison exists to prove that result to a customer
 *                    deciding whether to book.
 *
 *   MEDICAL          no edits. Altered images of treatment outcomes are
 *                    restricted advertising in most of the markets this ships
 *                    to — a legal exposure for the salon, not a style rule.
 *
 * Everywhere else — a finished look, behind the scenes, a detail, a still life
 * — any edit the technician asks for is applied.
 */

export type PhotoKind = 'look' | 'bts' | 'before' | 'after' | 'detail';

/** The two halves of a comparison, whose whole purpose is to evidence a result. */
const EVIDENCE_KINDS: PhotoKind[] = ['before', 'after'];

export type EditRefusal = { ok: false; reason: string };
export type EditAllowed = { ok: true };

/** Whether this photo may be edited at all. Checked before any model is called. */
export function canEditPhoto(params: {
  kind: PhotoKind;
  medicalCompliance?: boolean;
}): EditAllowed | EditRefusal {
  // Compliance protects TREATMENT PHOTOS, not everything the studio owns.
  //
  // This used to refuse every edit on every photo the moment a brand turned
  // medical-aesthetics compliance on — so a clinic could not put a sticker on
  // its own promotional shot, retouch a product picture or tidy the background
  // of a room. None of those is a treatment outcome, and refusing them
  // protected nobody while making the tool feel arbitrary.
  //
  // A before or after IS a treatment outcome, and altering one is restricted
  // advertising, so that refusal stays exactly as it was.
  if (params.medicalCompliance && EVIDENCE_KINDS.includes(params.kind)) {
    return {
      ok: false,
      reason:
        'Medical-aesthetics compliance is on for this brand, so before and after photos cannot be edited — altered outcome images are restricted advertising. Other photos can be edited freely.',
    };
  }
  return { ok: true };
}

/**
 * Words for changing the room rather than the subject.
 *
 * Only consulted for before/after photos: everywhere else any instruction is
 * accepted.
 */
const SCENIC =
  /\b(background|backdrop|wall|floor|bench|counter|mirror|clutter|cable|cord|wire|shelf|window|light|lighting|shadow|crop|frame|room|reflection|temperature|white balance|exposure|brighten|straighten|tidy|clean up|declutter)\b/i;

/**
 * Whether this instruction may be applied to this photo.
 *
 * Unrestricted for ordinary shots. For a before/after, the instruction has to
 * be about the photograph rather than the person — that is the one case where
 * an edit changes what the post is claiming.
 */
export function instructionIsInScope(
  instruction: string,
  kind: PhotoKind = 'look',
): EditAllowed | EditRefusal {
  if (!instruction.trim()) {
    return { ok: false, reason: 'Say what you want changed.' };
  }
  if (EVIDENCE_KINDS.includes(kind) && !SCENIC.test(instruction)) {
    return {
      ok: false,
      reason:
        'On a before or after photo you can change the room — lighting, background, clutter, crop — but not the subject or the result. That comparison is what a client books on. Tag the photo as a finished look if you want to retouch it freely.',
    };
  }
  return { ok: true };
}

/** Kept verbatim on the result so the studio always knows the image is no longer the original. */
export function editedDisclosure(instruction: string): string {
  return `AI-edited: "${instruction.trim()}"`;
}

const EDIT_MODEL = process.env['GEMINI_IMAGE_MODEL'] || 'gemini-2.5-flash-image';

/**
 * Applies the instruction and returns the edited image.
 *
 * The prompt keeps the result photographic — a retouch of this studio's own
 * work, not a reinvention of it — but it does not police scope. Scope is
 * decided by `instructionIsInScope`, which runs server-side and cannot be
 * talked out of, whereas a prompt can.
 */
export async function editPhoto(params: {
  apiKey: string;
  photo: Buffer;
  instruction: string;
}): Promise<Buffer | null> {
  const jpeg = await sharp(params.photo)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  const prompt = [
    'You are retouching a real photograph taken in a hair and beauty studio, for that studio to publish as their own work.',
    `The studio asked for this change: "${params.instruction.trim()}"`,
    'Make that change and nothing else. Keep the photograph photographic — same framing, same subject, same lighting direction unless the instruction says otherwise.',
    "Keep it believable as a photograph of this studio's real work — retouch, do not reinvent. Do not swap the subject for a different person.",
    'Do not add text, logos, watermarks or people. Do not turn it into an illustration or a render.',
    'Return the edited photograph.',
  ].join(' ');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(EDIT_MODEL)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
            ],
          },
        ],
      }),
    },
  );
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message || 'The edit could not be applied just now.');

  for (const part of (json?.candidates?.[0]?.content?.parts ?? []) as any[]) {
    if (part?.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
  }
  return null;
}
