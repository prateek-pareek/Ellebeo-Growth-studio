// ============================================================================
// client-photo-gate.ts — the code-enforced (no LLM) hard gate on imagery.
// When compliance.medicalAesthetics is true: any technician-supplied image
// flagged as a real client photo is blocked from becoming a scene asset —
// unconditionally, before an AssetProvider ever sees the url. This is a
// plain boolean check, not a prompt instruction, so it can't be bypassed by
// anything upstream. Video-type-agnostic: any AssetProvider composing image
// resolution (slideshow, reels, and the Phase 7 ai_clips provider) should
// call this before assigning a technician image to a scene.
// ============================================================================

/**
 * Returns a new array of image urls with any client-photo-flagged entry
 * removed (set to undefined) when medicalAesthetics is true. Callers should
 * treat `undefined` the same as "no technician image for this scene" —
 * i.e. route to stock/generated fallback, never to the real photo.
 */
export function filterClientPhotos(
  imageUrls: string[],
  clientPhotoFlags: boolean[] | undefined,
  medicalAesthetics: boolean,
): (string | undefined)[] {
  if (!medicalAesthetics || !clientPhotoFlags) {
    return [...imageUrls];
  }
  return imageUrls.map((url, index) => (clientPhotoFlags[index] ? undefined : url));
}
