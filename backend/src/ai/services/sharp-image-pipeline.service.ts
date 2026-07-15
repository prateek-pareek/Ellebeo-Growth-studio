// ============================================================================
// sharp-image-pipeline.service.ts — Local image processing via Sharp + Firebase
// Fallback when Cloudinary is not configured.
// Cloudinary path remains in image-pipeline.service.ts for production use.
// ============================================================================

import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { firebaseStorage } from '../../config/firebase.client';
import type { ImageProcessingResult } from '../types/chain-output.types';

const PLATFORM_DIMS = {
  feed:      { width: 1080, height: 1080 },  // 1:1 Instagram feed
  story:     { width: 1080, height: 1920 },  // 9:16 Story / TikTok
  reel:      { width: 1080, height: 1920 },  // 9:16 Reel
  thumbnail: { width:  400, height:  400 },  // Square thumbnail
} as const;

export class SharpImagePipelineService {

  async process(params: {
    rawImageUrl: string;
    consentShowFace: boolean;
    outputFormats: ('feed' | 'story' | 'reel')[];
    contentItemId: string;
    tenantId: string;
  }): Promise<ImageProcessingResult> {
    const { rawImageUrl, consentShowFace, tenantId } = params;

    // Fetch raw image bytes
    const imageBuffer = await this.fetchImage(rawImageUrl);

    // Build each variant
    const feedUrl      = await this.processVariant(imageBuffer, 'feed',      consentShowFace, tenantId);
    const storyUrl     = await this.processVariant(imageBuffer, 'story',     consentShowFace, tenantId);
    const thumbnailUrl = await this.processVariant(imageBuffer, 'thumbnail', consentShowFace, tenantId);

    return {
      cloudinaryPublicId: null as any,   // not applicable for Sharp path
      variants: { feedUrl, storyUrl, thumbnailUrl },
      faceBlurred: !consentShowFace,
      facesDetectedCount: 0,             // no face detection in Sharp path
      brandOverlayApplied: false,
      originalStoragePath: rawImageUrl,
    };
  }

  // --------------------------------------------------------------------------
  // Whole-image blur — applied to a raw source photo BEFORE it is handed to an
  // external AI image model, whenever consent denies face display. A strong
  // sigma is used (vs. the lighter one for display variants) so the model
  // cannot "sharpen"/reconstruct facial detail back out of the source.
  // --------------------------------------------------------------------------

  async blurImage(rawImageUrl: string, tenantId: string): Promise<string> {
    const imageBuffer = await this.fetchImage(rawImageUrl);
    const processed = await sharp(imageBuffer).blur(25).jpeg({ quality: 88 }).toBuffer();
    return this.uploadToFirebase(processed, tenantId, 'consent-blur');
  }

  // --------------------------------------------------------------------------

  private async fetchImage(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new SharpPipelineError(`Failed to fetch image: ${res.status} ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  private async processVariant(
    imageBuffer: Buffer,
    format: keyof typeof PLATFORM_DIMS,
    blurFaces: boolean,
    tenantId: string,
  ): Promise<string> {
    const { width, height } = PLATFORM_DIMS[format];

    // Smart Portrait Fit: Avoid aggressive face zooming by containing the image over a blurred background
    let pipeline = sharp(imageBuffer);
    if (blurFaces) {
      pipeline = pipeline.blur(8); // No face detection — apply light blur to entire image when consent denies face
    }
    
    const processedBuffer = await pipeline.toBuffer();

    const containedImg = await sharp(processedBuffer)
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const blurBase = await sharp(processedBuffer)
      .resize(width, height, { fit: 'cover' })
      .blur(40)
      .toBuffer();

    const composited = await sharp(blurBase)
      .composite([{ input: containedImg }])
      .jpeg({ quality: 88 })
      .toBuffer();

    return this.uploadToFirebase(composited, tenantId, format);
  }

  private async uploadToFirebase(
    buffer: Buffer,
    tenantId: string,
    variant: string,
  ): Promise<string> {
    if (!firebaseStorage) {
      throw new SharpPipelineError('Firebase Storage not configured.');
    }

    const storagePath = `tenants/${tenantId}/images/${randomUUID()}-${variant}.jpg`;
    const bucket = firebaseStorage.bucket();
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
  }
}

export class SharpPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharpPipelineError';
  }
}
