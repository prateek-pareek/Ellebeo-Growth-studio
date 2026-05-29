// ============================================================================
// ai-image-generation.service.ts — GPT-Image-1 powered slide generation
// Takes real before/after photo + brand context → beautiful designed image
// ============================================================================

import OpenAI from 'openai';
import { firebaseStorage } from '../../config/firebase.client';
import * as https from 'https';
import * as http from 'http';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export interface GeneratedSlide {
  url: string;
  label: string;
  title: string;
}

export interface SlideInput {
  index: number;
  title: string;
  overlayText: string;
  photoUrl: string;
  isFirst: boolean;
  isLast: boolean;
}

async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadBase64ToFirebase(base64: string, tenantId: string, name: string): Promise<string> {
  if (!firebaseStorage) throw new Error('Firebase storage not configured');
  const buffer = Buffer.from(base64, 'base64');
  const bucket = firebaseStorage.bucket();
  const filePath = `generated/${tenantId}/${name}_${Date.now()}.png`;
  const file = bucket.file(filePath);
  await file.save(buffer, { contentType: 'image/png', public: true });
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

function buildSlidePrompt(params: {
  overlayText: string;
  businessName: string;
  brandColor: string;
  secondaryColor: string;
  aesthetic: string;
  serviceType: string;
  isFirst: boolean;
  isLast: boolean;
}): string {
  const { overlayText, businessName, brandColor, secondaryColor, aesthetic, serviceType, isFirst, isLast } = params;

  const base = `Transform this ${serviceType} photo into a professional Instagram social media graphic for "${businessName}".
Brand colors: primary ${brandColor}, secondary ${secondaryColor}.
Visual aesthetic: ${aesthetic || 'minimal, editorial, premium beauty'}.

Requirements:
- Keep the real photo as the main visual — do NOT replace or obscure the person or hair
- Add a modern, clean design overlay
- Bold, elegant typography for the text: "${overlayText}"
- Use brand colors for text and design accents
- Professional beauty industry aesthetic
- No fake or AI-generated faces — preserve the real photo authentically`;

  if (isFirst) {
    return `${base}
- This is the COVER slide — make it visually striking
- Large bold headline text at the bottom on a semi-transparent bar
- Strong first impression, editorial feel`;
  }

  if (isLast) {
    return `${base}
- This is the CTA (call to action) slide
- Centred text with brand colour accent
- Clean, minimal — invite the viewer to book`;
  }

  return `${base}
- This is a body slide — informative and clean
- Text at the bottom with subtle dark background strip
- Let the photo breathe, minimal design interference`;
}

export class AiImageGenerationService {

  async generateSlide(params: {
    photoUrl: string;
    overlayText: string;
    title: string;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
  }): Promise<string> {
    const {
      photoUrl, overlayText, index, isFirst, isLast,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
    } = params;

    const prompt = buildSlidePrompt({
      overlayText,
      businessName,
      brandColor,
      secondaryColor,
      aesthetic,
      serviceType,
      isFirst,
      isLast,
    });

    const imageBuffer = await downloadImageAsBuffer(photoUrl);
    const imageFile = new File([imageBuffer], 'photo.jpg', { type: 'image/jpeg' });

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt,
      size: '1024x1024',
    });

    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error('gpt-image-1 returned no image data');

    return uploadBase64ToFirebase(base64, tenantId, `slide_${index}`);
  }

  async generateCarousel(params: {
    afterPhotoUrl: string;
    beforePhotoUrl?: string;
    concepts: Array<{ index: number; title: string; overlayText: string }>;
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, ...rest } = params;
    const total = concepts.length;

    const slides = await Promise.all(
      concepts.map(async (concept, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        // Cover + CTA use after photo; body slides use before photo
        const photoUrl = (isFirst || isLast || !beforePhotoUrl)
          ? afterPhotoUrl
          : beforePhotoUrl;

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: concept.overlayText,
            title: concept.title,
            index: concept.index,
            isFirst,
            isLast,
            ...rest,
          });
          return { url, title: concept.title, label: `SLIDE ${String(concept.index).padStart(2, '0')}` };
        } catch (err) {
          console.error(`[AiImageGen] Slide ${concept.index} failed:`, err);
          // Return null — orchestrator will fall back to Cloudinary
          return null;
        }
      })
    );

    const valid = slides.filter(Boolean) as GeneratedSlide[];
    if (valid.length === 0) throw new Error('All slides failed to generate');
    return valid;
  }

  async generateStory(params: {
    afterPhotoUrl: string;
    beforePhotoUrl?: string;
    frames: Array<{ index: number; title: string; overlayText: string }>;
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, ...rest } = params;
    const total = frames.length;

    const results = await Promise.all(
      frames.map(async (frame, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        const photoUrl = (isFirst && beforePhotoUrl) ? beforePhotoUrl : afterPhotoUrl;

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: frame.overlayText,
            title: frame.title,
            index: frame.index,
            isFirst,
            isLast,
            ...rest,
          });
          return { url, title: frame.title, label: `FRAME ${String(frame.index).padStart(2, '0')}` };
        } catch (err) {
          console.error(`[AiImageGen] Frame ${frame.index} failed:`, err);
          return null;
        }
      })
    );

    const valid = results.filter(Boolean) as GeneratedSlide[];
    if (valid.length === 0) throw new Error('All story frames failed to generate');
    return valid;
  }
}
