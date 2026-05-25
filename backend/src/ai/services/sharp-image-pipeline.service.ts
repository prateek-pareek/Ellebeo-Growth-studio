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

    let pipeline = sharp(imageBuffer)
      .resize(width, height, { fit: 'cover', position: 'attention' }); // attention = smart crop

    // No face detection — apply light blur to entire image when consent denies face
    if (blurFaces) {
      pipeline = pipeline.blur(8);
    }

    const processed = await pipeline.jpeg({ quality: 88 }).toBuffer();

    return this.uploadToFirebase(processed, tenantId, format);
  }

  private async uploadToFirebase(
    buffer: Buffer,
    tenantId: string,
    variant: string,
  ): Promise<string> {
    if (!firebaseStorage) {
      throw new SharpPipelineError('Firebase Storage not configured.');
    }

    const storagePath = `images/${tenantId}/${randomUUID()}-${variant}.jpg`;
    const bucket = firebaseStorage.bucket();
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
      public: true,
    });

    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  }
}

export class SharpPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharpPipelineError';
  }
}
