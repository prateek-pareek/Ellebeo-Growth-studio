import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import Replicate from 'replicate';

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
    brandColor: string
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
      this.logger.log(`Starting Local/OpenAI Enhancement for ${imageUrl}`);

      // 1. Remove background locally (Phase A.1)
      this.logger.log('Masking subject via Replicate (rembg)...');
      let subjectUrl = imageUrl;
      if (imageUrl.startsWith('data:image')) {
        subjectUrl = imageUrl; // Replicate supports base64 data URIs
      }

      const maskOutput = await runWithRetry(
        'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
        { input: { image: subjectUrl } }
      );
      if (!maskOutput) throw new Error('Failed to run Replicate rembg');
      const maskResultUrl = typeof maskOutput === 'string' ? maskOutput : (maskOutput as any)[0] || maskOutput;
      
      const maskRes = await fetch(maskResultUrl);
      const transparentBuffer = Buffer.from(await maskRes.arrayBuffer());

      // Extract alpha channel to create a black/white mask (Subject = Black, Background = White)
      const bwMaskBuffer = await sharp(transparentBuffer)
        .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .extractChannel('alpha')
        .negate()
        .png()
        .toBuffer();
      const maskDataUri = `data:image/png;base64,${bwMaskBuffer.toString('base64')}`;

      // Prepare original image to match exact 1024x1024 dimensions
      const originalRes = await fetch(imageUrl);
      const originalBuffer = Buffer.from(await originalRes.arrayBuffer());
      const baseImageBuffer = await sharp(originalBuffer)
        .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
      const baseImageDataUri = `data:image/png;base64,${baseImageBuffer.toString('base64')}`;

      // 3. True Studio Realism Inpainting (Phase B)
      this.logger.log('Inpainting luxury background via Replicate (SDXL-Inpainting)...');
      const bgPrompt = `A completely empty luxury beauty studio background, empty room, no people, smooth aesthetic: ${moodboardVisionSummary}. Ambient accent color: ${brandColor}. Highly realistic 4k photography.`;

      const sdxlOutput = await runWithRetry(
        'stability-ai/sdxl-inpainting:5c7d5dc6dd8bf75c1acaa8565735e7986bc5b66206b55cca93cb72c9bf15ccaa',
        {
          input: {
            image: baseImageDataUri,
            mask: maskDataUri,
            prompt: bgPrompt,
            width: 1024,
            height: 1024,
            num_inference_steps: 30,
            scheduler: 'K_EULER'
          }
        }
      );
      
      if (!sdxlOutput) throw new Error('Failed to run SDXL Inpainting');
      const inpaintResultUrl = typeof sdxlOutput === 'string' ? sdxlOutput : (sdxlOutput as any)[0] || sdxlOutput;
      
      const inpaintRes = await fetch(inpaintResultUrl);
      const compositedBuffer = Buffer.from(await inpaintRes.arrayBuffer());

      // 5. Super Resolution (Phase B - Replicate ESRGAN)
      this.logger.log('Applying AI Super Resolution via Replicate (ESRGAN)...');
      
      const intermediateDataUri = `data:image/png;base64,${compositedBuffer.toString('base64')}`;

      const output = await runWithRetry(
        'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
        {
          input: {
            image: intermediateDataUri,
            scale: 2,
            face_enhance: true
          }
        }
      );
      
      if (!output) throw new Error('Failed to run Replicate super resolution');

      // The output is a URL to the enhanced image
      const finalDataUri = typeof output === 'string' ? output : (output as string[])[0];
      
      this.logger.log('Enhancement complete!');
      return finalDataUri;

    } catch (error) {
      this.logger.error('Failed to enhance image, falling back to raw photo.', error);
      return imageUrl; 
    }
  }
}
