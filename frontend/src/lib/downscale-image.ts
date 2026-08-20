/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * A photo straight off a phone is routinely 10–20MB, and the upload endpoints
 * cap a file at 8MB — so a technician picking a real client photo got a bare
 * "File too large" and no post. The server downsizes to 2048px on the long
 * edge before it does anything with the image anyway, so every byte above that
 * was always going to be discarded; sending them only bought a failed request
 * and a slow one.
 *
 * Returns the original file untouched when it is already small enough, or when
 * anything about the decode fails — an unshrunk upload is a better outcome
 * than losing the photo.
 */
export async function downscaleImage(
  file: File,
  maxEdge = 2048,
  quality = 0.9,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Small files are left alone: re-encoding them costs quality for nothing.
  const NEEDS_NO_WORK = 1.5 * 1024 * 1024;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge && file.size <= NEEDS_NO_WORK) {
    bitmap.close?.();
    return file;
  }

  const scale = Math.min(1, maxEdge / longest);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
