/** Gemini Lab–only. Do not import from the /generate pipeline. */

import { v2 as cloudinary } from 'cloudinary';

/**
 * Keeping a post.
 *
 * Everything the Lab made used to end at a browser download: four options
 * generated, one chosen, a PNG saved to someone's Downloads folder. Nothing
 * was stored, so there was no record of what a studio had published, nothing
 * the calendar could show, and no way to plan a week of posts — the product
 * generated content and then forgot it existed.
 *
 * The image goes to Cloudinary, the same place the rest of the app puts
 * imagery, rather than into Postgres as a base64 column: a 4:5 PNG is well
 * over a megabyte, and a library of them would make every list query drag the
 * images along with it.
 */

let configured = false;

/** Configured lazily so a deployment without Cloudinary still boots and generates. */
function ensureConfigured(): boolean {
  const name = process.env['CLOUDINARY_CLOUD_NAME'];
  const key = process.env['CLOUDINARY_API_KEY'];
  const secret = process.env['CLOUDINARY_API_SECRET'];
  if (!name || !key || !secret) return false;
  if (!configured) {
    cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret, secure: true });
    configured = true;
  }
  return true;
}

export function storageAvailable(): boolean {
  return ensureConfigured();
}

/** Uploads a rendered post and returns its URL. */
export async function storePostImage(params: {
  tenantId: string;
  png: Buffer;
}): Promise<string> {
  if (!ensureConfigured()) {
    throw new Error('Image storage is not configured on this server.');
  }
  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `gemini-lab/${params.tenantId}`,
        resource_type: 'image',
        format: 'png',
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          reject(new Error(err?.message || 'Upload failed.'));
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(params.png);
  });
}

/** A data URL back to the bytes, so the client can hand back what it was shown. */
export function dataUrlToPng(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.startsWith('data:image/')) return null;
  const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  return buf.length ? buf : null;
}
