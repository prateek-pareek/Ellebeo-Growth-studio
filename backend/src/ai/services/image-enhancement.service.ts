import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import Replicate from 'replicate';
import type { VisionAnalysisResult } from '../types/chain-output.types';

@Injectable()
export class ImageEnhancementService {
  private readonly logger = new Logger(ImageEnhancementService.name);
  private replicate: Replicate;
  private readonly isEnabled: boolean;

  constructor() {
    const replicateKey = process.env.REPLICATE_API_TOKEN;
    this.isEnabled = !!replicateKey;

    if (this.isEnabled) {
      this.replicate = new Replicate({ auth: replicateKey as string });
    } else {
      this.logger.warn('REPLICATE_API_TOKEN is missing. Image Enhancement disabled.');
    }
  }

  async enhanceImage(
    imageUrl: string,
    moodboardVisionSummary: string,
    brandColor: string,
    visionResult?: VisionAnalysisResult | null
  ): Promise<string> {
    if (!this.isEnabled) return imageUrl;

    const runWithRetry = async (model: any, options: any, retries = 3): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          return await this.replicate.run(model, options);
        } catch (error: any) {
          if (error.response?.status === 429 && i < retries - 1) {
            const retryAfter = parseInt(error.response?.headers?.get('retry-after') || '5', 10);
            this.logger.warn(`Replicate rate limited (429). Retrying after ${retryAfter}s...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          } else {
            throw error;
          }
        }
      }
    };

    try {
      this.logger.log(`Starting Photo Intelligence Pipeline for ${imageUrl}`);

      const technicalScore = visionResult?.suitabilityScores?.technicalQuality ?? 85;
      this.logger.log(`Vision Technical Quality Score: ${technicalScore}`);

      // 1. Local Image Correction (sharp)
      const originalRes = await fetch(imageUrl);
      const originalBuffer = Buffer.from(await originalRes.arrayBuffer());

      const metadata = await sharp(originalBuffer).metadata();
      const width = metadata.width || 1024;
      const height = metadata.height || 1024;

      let pipeline = sharp(originalBuffer);
      let needsESRGAN = false;

      if (technicalScore < 80) {
        this.logger.log('Technical score below 80, but skipping aggressive Sharp normalization to protect skin tones.');
        // We removed normalize() and sharpen() here because it ruins human faces and creates scary artifacts.
      }

      if (width < 1000 || height < 1000 || technicalScore < 60) {
        this.logger.log(`Image is low resolution (${width}x${height}) or very low quality. Flagging for ESRGAN upscaling.`);
        needsESRGAN = true;
      }

      const processedBuffer = await pipeline.png().toBuffer();
      let finalDataUri = `data:image/png;base64,${processedBuffer.toString('base64')}`;

      // 2. Conditional Super Resolution (Phase B - Replicate ESRGAN)
      if (needsESRGAN && this.isEnabled) {
        this.logger.log('Applying AI Super Resolution via Replicate (ESRGAN)...');

        const output = await runWithRetry(
          'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
          {
            input: {
              image: finalDataUri,
              scale: 4,
              face_enhance: false
            }
          }
        );

        if (!output) throw new Error('Failed to run Replicate super resolution');
        finalDataUri = typeof output === 'string' ? output : (output as string[])[0];
      } else {
        this.logger.log('Skipping Replicate ESRGAN. Image is sufficient quality or Replicate is disabled.');
      }

      this.logger.log('Photo Intelligence Pipeline complete!');
      return finalDataUri;

    } catch (error) {
      this.logger.error('Failed to enhance image, falling back to raw photo.', error);
      return imageUrl;
    }
  }
}
