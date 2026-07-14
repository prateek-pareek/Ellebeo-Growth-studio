import { Injectable, Logger } from '@nestjs/common';
// @ts-ignore
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import OpenAI from 'openai';

@Injectable()
export class ImageEnhancementService {
  private readonly logger = new Logger(ImageEnhancementService.name);
  private openai: OpenAI;
  private readonly isEnabled: boolean;

  constructor() {
    const apiToken = process.env.OPENAI_API_KEY;
    this.isEnabled = !!apiToken;
    if (this.isEnabled && apiToken) {
      this.openai = new OpenAI({
        apiKey: apiToken,
      });
    } else {
      this.logger.warn('OPENAI_API_KEY is missing. Image Enhancement is disabled.');
    }
  }

  async enhanceImage(
    imageUrl: string,
    moodboardVisionSummary: string,
    brandColor: string
  ): Promise<string> {
    if (!this.isEnabled) return imageUrl;

    try {
      this.logger.log(`Starting Local/OpenAI Enhancement for ${imageUrl}`);

      // 1. Fetch original image as buffer
      let imageBuffer: Buffer;
      if (imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      // 2. Remove background locally (Phase A.1)
      this.logger.log('Masking subject locally...');
      // Img.ly processes Blob and returns Blob
      const blob = new Blob([imageBuffer]);
      const transparentBlob = await removeBackground(blob);
      const transparentBuffer = Buffer.from(await transparentBlob.arrayBuffer());

      // 3. Generate new background via DALL-E 3 (Phase A.2)
      this.logger.log('Generating luxury background via DALL-E 3...');
      const bgPrompt = `A completely empty luxury beauty studio background, empty room, no people, smooth aesthetic: ${moodboardVisionSummary}. Ambient accent color: ${brandColor}. Highly realistic 4k photography.`;
      
      const dalleResponse = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt: bgPrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });
      const bgBase64 = dalleResponse?.data?.[0]?.b64_json;
      if (!bgBase64) throw new Error('Failed to generate DALL-E background');
      
      const bgBuffer = Buffer.from(bgBase64, 'base64');

      // 4. Composite subject over background (Phase A.3)
      this.logger.log('Compositing foreground over new background...');
      
      const subject = await sharp(transparentBuffer)
        .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const compositedBuffer = await sharp(bgBuffer)
        .composite([{ input: subject, blend: 'over' }])
        .png()
        .toBuffer();

      // 5. Super Resolution (Phase B - Sharp Matrix Upscaling)
      this.logger.log('Applying Sharp Matrix Upscaling (Super Resolution)...');
      
      const finalBuffer = await sharp(compositedBuffer)
        .resize(2048, 2048)
        .sharpen({
          sigma: 1.5,
          m1: 1,
          m2: 2,
          x1: 2,
          y2: 10,
          y3: 20
        }) // Sophisticated unsharp mask
        .modulate({
          brightness: 1.05,
          saturation: 1.1
        }) // Studio lighting adjustment
        .png()
        .toBuffer();

      // Return as base64 data URI to be consumed by the rest of the pipeline
      const finalDataUri = `data:image/png;base64,${finalBuffer.toString('base64')}`;
      
      this.logger.log('Enhancement complete!');
      return finalDataUri;

    } catch (error) {
      this.logger.error('Failed to enhance image, falling back to raw photo.', error);
      return imageUrl; 
    }
  }
}
