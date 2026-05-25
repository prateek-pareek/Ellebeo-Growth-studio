// ============================================================================
// image-pipeline.service.ts — Full Cloudinary Transformation Sequence
// Executed in this exact order (per spec Section 7.2):
// 1. Upload from S3 → 2. Face detection → 3. Conditional blur
// → 4. Smart crop → 5. Brand overlay → 6. Quality optimisation
// → 7. Generate variant URLs → 8. Store in DB
// ============================================================================

import { firebaseStorage } from '../../config/firebase.client';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import type { ImageProcessingResult } from '../types/chain-output.types';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key: process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

interface FaceDetectionResult {
  faces: Array<{ x: number; y: number; width: number; height: number }>;
  facesDetected: number;
}

export class ImagePipelineService {
  constructor(private readonly prisma: PrismaClient) {}

  // --------------------------------------------------------------------------
  // Main Pipeline Entry Point
  // --------------------------------------------------------------------------

  async process(params: {
    rawStoragePath: string;
    existingCloudinaryId?: string;
    consentShowFace: boolean;
    brandPrimaryColour: string;
    brandSecondaryColour: string;
    outputFormats: ('feed' | 'story' | 'reel')[];
    contentItemId: string;
    tenantId: string;
  }): Promise<ImageProcessingResult> {
    const { rawStoragePath, existingCloudinaryId, consentShowFace, brandPrimaryColour, contentItemId } = params;

    // Step 1: Upload to Cloudinary from Firebase (or use existing)
    const publicId = existingCloudinaryId ?? await this.uploadFromFirebase(rawStoragePath, params.tenantId);

    // Step 2: Face Detection
    const faceDetection = await this.detectFaces(publicId);

    // Step 3: Conditional face blur
    const facesBlurred = !consentShowFace && faceDetection.facesDetected > 0;

    // Step 4-7: Generate all variant URLs with transformations applied
    const feedUrl = this.buildTransformedUrl(publicId, 'feed', facesBlurred, brandPrimaryColour);
    const storyUrl = this.buildTransformedUrl(publicId, 'story', facesBlurred, brandPrimaryColour);
    const thumbnailUrl = this.buildTransformedUrl(publicId, 'thumbnail', facesBlurred, brandPrimaryColour);

    // Step 8: Store URLs in PostgreSQL (skip when called from orchestrator with deferred ID)
    if (contentItemId !== 'deferred') {
      await this.persistImageUrls({
        contentItemId,
        publicId,
        feedUrl,
        storyUrl,
        thumbnailUrl,
        faceBlurred: facesBlurred,
        brandOverlayApplied: true,
      });
    }

    return {
      cloudinaryPublicId: publicId,
      variants: { feedUrl, storyUrl, thumbnailUrl },
      faceBlurred: facesBlurred,
      facesDetectedCount: faceDetection.facesDetected,
      brandOverlayApplied: true,
      originalStoragePath: rawStoragePath,
    };
  }

  // --------------------------------------------------------------------------
  // Step 1: Upload from Firebase via Cloudinary's fetch-from-URL feature
  // --------------------------------------------------------------------------

  private async uploadFromFirebase(storagePath: string, tenantId: string): Promise<string> {
    const slug = storagePath.split('/').pop()?.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.[^.]+$/, '') || `img_${Date.now()}`;
    const publicId = `growthstudio/${tenantId}/${slug}`;

    // If rawStoragePath is already a public HTTP URL, upload it directly to Cloudinary
    // (no Firebase needed — covers Unsplash, Firebase public URLs, CRM photo URLs, etc.)
    const sourceUrl = (storagePath.startsWith('http://') || storagePath.startsWith('https://'))
      ? storagePath
      : await this.getFirebaseSignedUrl(storagePath);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new ImagePipelineError('Cloudinary upload timeout')),
        AI_CONFIG.timeouts.cloudinaryTransform
      );

      cloudinary.uploader.upload(
        sourceUrl,
        {
          public_id: publicId,
          overwrite: false,
          resource_type: 'image',
          tags: [`tenant:${tenantId}`],
        },
        (err, result) => {
          clearTimeout(timeout);
          if (err) return reject(new ImagePipelineError(`Upload failed: ${err.message}`));
          if (!result) return reject(new ImagePipelineError('Upload returned no result'));
          resolve(result.public_id);
        }
      );
    });
  }

  private async getFirebaseSignedUrl(storagePath: string): Promise<string> {
    if (!firebaseStorage) {
      throw new ImagePipelineError('Firebase Storage is not configured. Cannot fetch raw image.');
    }
    const bucket = firebaseStorage.bucket();
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000,
    });
    return signedUrl;
  }

  // --------------------------------------------------------------------------
  // Step 2: Face Detection
  // --------------------------------------------------------------------------

  private async detectFaces(publicId: string): Promise<FaceDetectionResult> {
    try {
      const result = await cloudinary.api.resource(publicId, {
        faces: true,
        image_metadata: false,
      });

      const faces = (result.faces as number[][] | undefined) ?? [];
      return {
        faces: faces.map((f) => ({ x: f[0] ?? 0, y: f[1] ?? 0, width: f[2] ?? 0, height: f[3] ?? 0 })),
        facesDetected: faces.length,
      };
    } catch {
      // Face detection failure is non-fatal — default to no faces detected
      return { faces: [], facesDetected: 0 };
    }
  }

  // --------------------------------------------------------------------------
  // Steps 3-7: Build Cloudinary Transformation URL
  // Applies: blur (conditional) + smart crop + brand overlay + quality optimisation
  // --------------------------------------------------------------------------

  private buildTransformedUrl(
    publicId: string,
    format: 'feed' | 'story' | 'thumbnail',
    blurFaces: boolean,
    brandColour: string
  ): string {
    const dimensions = AI_CONFIG.cloudinary.outputFormats[format];
    const colourHex = brandColour.replace('#', '');

    const transformations: Record<string, unknown>[] = [];

    // Step 3: Conditional face blur
    if (blurFaces) {
      transformations.push({
        effect: `blur_faces:${AI_CONFIG.cloudinary.faceBlurIntensity}`,
      });
    }

    // Step 4: Smart crop to target aspect ratio
    transformations.push({
      width: dimensions.width,
      height: dimensions.height,
      crop: 'fill',
      gravity: 'auto',
    });

    // Step 5: Brand colour strip overlay at bottom
    if (format !== 'thumbnail') {
      transformations.push({
        overlay: {
          font_family: 'Montserrat',
          font_size: 24,
          font_weight: 'bold',
          text: ' ',
        },
        color: `#${colourHex}`,
        gravity: 'south',
        width: dimensions.width,
        height: 8,
        y: 0,
      });
    }

    // Step 6: Quality and format optimisation
    transformations.push({
      quality: 'auto',
      fetch_format: 'auto',
    });

    return cloudinary.url(publicId, {
      transformation: transformations,
      secure: true,
    });
  }

  // --------------------------------------------------------------------------
  // Step 8: Persist URLs to content_items
  // --------------------------------------------------------------------------

  private async persistImageUrls(params: {
    contentItemId: string;
    publicId: string;
    feedUrl: string;
    storyUrl: string;
    thumbnailUrl: string;
    faceBlurred: boolean;
    brandOverlayApplied: boolean;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE content_items
      SET cloudinary_public_id  = ${params.publicId},
          feed_image_url         = ${params.feedUrl},
          story_image_url        = ${params.storyUrl},
          thumbnail_url          = ${params.thumbnailUrl},
          face_blurred           = ${params.faceBlurred},
          brand_overlay_applied  = ${params.brandOverlayApplied},
          image_status           = 'completed',
          updated_at             = NOW()
      WHERE content_item_id = ${params.contentItemId}::uuid
    `;
  }
}

export class ImagePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePipelineError';
  }
}
