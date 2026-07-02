// ============================================================================
// ai-image-generation.service.ts — GPT-Image-1 powered slide generation
// Takes real before/after photo + brand context → beautiful designed image
// ============================================================================

import OpenAI from 'openai';
import { firebaseStorage } from '../../config/firebase.client';
import * as https from 'https';
import * as http from 'http';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

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

function buildBeforeSlidePrompt(params: {
  overlayText: string;
  businessName: string;
  brandColor: string;
}): string {
  const { overlayText, businessName, brandColor } = params;
  return `You are a social media designer adding a minimal text overlay to a BEFORE photo for "${businessName}".

CRITICAL — this is the BEFORE image in a before/after transformation post:
- Preserve the photo EXACTLY as it is — no color grading, no filters, no enhancements, no cinematic treatment
- The photo must look raw and natural so the contrast with the AFTER photo is powerful and believable
- Do NOT add bokeh, light leaks, glamour lighting, or any beautification effect
- Do NOT make the skin/hair/nails look better than reality

ONLY ADD:
- A small, clean text label "${overlayText}" — place it in the bottom-left corner
- Use a thin semi-transparent dark pill or rectangle behind the text (rgb 0,0,0 at 55% opacity)
- Text in clean white, small size, all-caps tracking — minimal, unobtrusive
- A tiny "BEFORE" badge in brand color ${brandColor} in the top-left corner

CONTENT SAFETY: family-friendly, professional, no nudity or intimate areas.`;
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

  const base = `You are a professional social media designer creating an Instagram graphic for "${businessName}".
This is a real photo of a ${serviceType}. Your task: overlay a clean, elegant text layout on top of the photo.

Brand palette: primary ${brandColor}, secondary ${secondaryColor}.
Aesthetic direction: ${aesthetic || 'minimal, premium beauty editorial, high-fashion editorial'}.

PHOTO PRESERVATION (critical):
- Preserve the original photo exactly as it is. 
- Do NOT crop, remove, or replace the background. Keep the natural environment, background wood, towels, and salon context fully intact.
- Do NOT retouch, airbrush, or apply heavy plastic-looking filters to the skin or face. Keep the real skin texture and lighting natural.
- No AI-generated faces or bodies.

VISUAL DESIGN DIRECTION:
- The text overlay must look premium, minimalist, and editorial.
- Place a clean, semi-transparent dark rectangle (black at 55% opacity) behind the text to ensure high contrast and readability.
- Use a clean, modern, white all-caps sans-serif font for the typography. Do not overlay large, distracting blocks of color.

CONTENT SAFETY (non-negotiable):
- Output must be entirely family-friendly and safe for professional social media.
- Never generate nudity, partial nudity, sexual content, or inappropriate imagery.
- Never expose intimate body areas.
- Ensure all designs are clean, brand-safe, and professional.`;

  if (isFirst) {
    return `${base}

COVER SLIDE:
- Show the full photo with its original background.
- Add the main headline "${overlayText}" in clean white text placed in the lower part of the frame.
- Place a clean, minimal semi-transparent dark rectangle panel behind the headline for high contrast and readability.`;
  }

  if (isLast) {
    return `${base}

CTA SLIDE:
- Focus is on the call to action message: "${overlayText}".
- Display the text cleanly in a small, modern, semi-transparent dark box at the center of the frame.
- Below the text, add a small, minimalist text line: "BOOK NOW" or "DM TO BOOK".`;
  }

  return `${base}

BODY SLIDE:
- Photo takes most of the composition.
- Add the text label "${overlayText}" cleanly in a semi-transparent dark box at the bottom of the frame.`;
}

export class AiImageGenerationService {

  async generateSlide(params: {
    photoUrl: string;
    overlayText: string;
    title: string;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    isBeforePhoto: boolean;
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
    outputSize?: '1024x1024' | '1024x1536';
    customPrompt?: string;
    totalSlides?: number;
  }): Promise<string> {
    const {
      photoUrl, overlayText, index, isFirst, isLast, isBeforePhoto,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
      outputSize = '1024x1024' as '1024x1024' | '1024x1536',
      customPrompt,
      totalSlides = 4,
    } = params;

    const prompt = customPrompt || (isBeforePhoto
      ? buildBeforeSlidePrompt({ overlayText: '', businessName, brandColor })
      : buildSlidePrompt({
        overlayText: '',
        businessName,
        brandColor,
        secondaryColor,
        aesthetic,
        serviceType,
        isFirst,
        isLast,
      }));

    const cleanPrompt = prompt + "\n\nCRITICAL: Do NOT write, draw, or render any text overlays, titles, or caption boxes directly onto the image. The image must contain only the raw photographic result.";

    const imageBuffer = await downloadImageAsBuffer(photoUrl);

    const geminiKey = process.env['GEMINI_API_KEY'];
    if (geminiKey && geminiKey.length > 0) {
      try {
        console.log(`Attempting image generation with Gemini (Nano Banana) for slide ${index}...`);
        const aiClient = new GoogleGenAI({ apiKey: geminiKey });
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBuffer.toString('base64'),
              },
            },
            cleanPrompt,
          ],
          config: {
            responseModalities: ['image'],
          } as any,
        });

        // Debug logging block for Senior AI telemetry analysis
        console.log(`[DEBUG Gemini API Response Metadata for Slide ${index}]:`, JSON.stringify(response, (key, value) => {
          if (key === 'data' && typeof value === 'string' && value.length > 200) {
            return `${value.slice(0, 50)}... [Base64 Truncated: ${value.length} chars]`;
          }
          return value;
        }, 2));

        const outputPart = response.candidates?.[0]?.content?.parts?.find(
          (part: any) => part.inlineData
        );
        const base64Data = outputPart?.inlineData?.data;

        if (base64Data) {
          console.log(`Gemini image generation successful for slide ${index}!`);
          const brandedBase64 = await this.overlayBrandingAndText({
            base64Image: base64Data,
            overlayText,
            isFirst,
            isLast,
            brandColor,
            secondaryColor,
            businessName,
            index,
            totalSlides,
          });
          return uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
        } else {
          console.warn(`Gemini returned empty image data for slide ${index}. Falling back to OpenAI.`);
        }
      } catch (err) {
        console.error(`Gemini image generation failed for slide ${index}:`, err);
        console.log(`Falling back to OpenAI for slide ${index}...`);
      }
    }

    console.log(`Using OpenAI to generate slide ${index}...`);
    const imageFile = new File([imageBuffer], 'photo.jpg', { type: 'image/jpeg' });

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: cleanPrompt,
      size: outputSize,
    });

    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error('gpt-image-1 returned no image data');

    const brandedBase64 = await this.overlayBrandingAndText({
      base64Image: base64,
      overlayText,
      isFirst,
      isLast,
      brandColor,
      secondaryColor,
      businessName,
      index,
      totalSlides,
    });
    return uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
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
    artDirectorBrief?: any[];
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, ...rest } = params;
    const total = concepts.length;

    const slides = await Promise.all(
      concepts.map(async (concept, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        // Cover + CTA use after photo; body slides use before photo
        const usingBefore = !isFirst && !isLast && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        const brief = artDirectorBrief?.find(b => b.index === concept.index);

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: concept.overlayText,
            title: concept.title,
            index: concept.index,
            isFirst,
            isLast,
            isBeforePhoto: usingBefore,
            outputSize: '1024x1024',
            customPrompt: brief?.artDirectorPrompt,
            ...rest,
            brandColor: brief?.panelHexColor || rest.brandColor,
            secondaryColor: brief?.textColorHex || rest.secondaryColor,
            totalSlides: total,
          });
          return { url, title: concept.title, label: `SLIDE ${String(concept.index).padStart(2, '0')}` };
        } catch {
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
    artDirectorBrief?: any[];
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, ...rest } = params;
    const total = frames.length;

    const results = await Promise.all(
      frames.map(async (frame, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        const usingBefore = isFirst && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        const brief = artDirectorBrief?.find(b => b.index === frame.index);

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: frame.overlayText,
            title: frame.title,
            index: frame.index,
            isFirst,
            isLast,
            isBeforePhoto: usingBefore,
            outputSize: '1024x1536',
            customPrompt: brief?.artDirectorPrompt,
            ...rest,
            brandColor: brief?.panelHexColor || rest.brandColor,
            secondaryColor: brief?.textColorHex || rest.secondaryColor,
            totalSlides: total,
          });
          return { url, title: frame.title, label: `FRAME ${String(frame.index).padStart(2, '0')}` };
        } catch {
          return null;
        }
      })
    );

    const valid = results.filter(Boolean) as GeneratedSlide[];
    if (valid.length === 0) throw new Error('All story frames failed to generate');
    return valid;
  }

  private async overlayBrandingAndText(params: {
    base64Image: string;
    overlayText: string;
    isFirst: boolean;
    isLast: boolean;
    brandColor: string;
    secondaryColor: string;
    businessName?: string;
    index?: number;
    totalSlides?: number;
  }): Promise<string> {
    const { base64Image, overlayText, isFirst, isLast, brandColor, secondaryColor, businessName, index, totalSlides } = params;

    if (!overlayText || overlayText.trim().length === 0) {
      return base64Image;
    }

    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      const w = metadata.width || 1024;
      const h = metadata.height || 1024;

      const words = overlayText.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + word).length > 28) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine) lines.push(currentLine.trim());

      let rectY = h - 250;
      let textY = h - 195;
      let rectHeight = 130;

      if (isLast) {
        rectY = h - 275;
        textY = h - 220;
        rectHeight = 165;
      }

      const bgOpacity = 0.65;
      const panelBg = '#161616';
      const borderStroke = brandColor.startsWith('#') ? brandColor : '#1a1a1a';
      const dividerStroke = secondaryColor.startsWith('#') ? secondaryColor : '#c28d75';

      const rawName = (businessName || 'RAW CANVAS').trim().toUpperCase();
      const spacedName = rawName.split('').join(' ');

      const slideNumText = String(index || 1).padStart(2, '0');
      const totalSlidesText = String(totalSlides || 4).padStart(2, '0');

      const svgString = `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>
              .bg-rect { fill: ${panelBg}; fill-opacity: ${bgOpacity}; stroke: ${borderStroke}; stroke-width: 2px; }
              .overlay-text { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: bold; fill: #ffffff; text-anchor: middle; letter-spacing: 1.5px; }
              .footer-bg { fill: #161616; }
              .footer-line { stroke: ${dividerStroke}; stroke-width: 1.5px; }
              .footer-brand { font-family: 'Georgia', Times, serif; font-size: 16px; font-weight: bold; fill: #ffffff; letter-spacing: 4px; text-anchor: start; }
              .footer-tracker { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: normal; fill: #ffffff; letter-spacing: 1px; text-anchor: end; }
            </style>
          </defs>
          <!-- Text Panel above footer -->
          <rect x="60" y="${rectY}" width="${w - 120}" height="${rectHeight}" rx="10" class="bg-rect" />
          <text x="${w / 2}" y="${textY}" class="overlay-text">
            ${lines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : 36}">${line.toUpperCase()}</tspan>`).join('')}
          </text>

          <!-- Editorial Footer -->
          <rect x="0" y="${h - 80}" width="${w}" height="80" class="footer-bg" />
          <line x1="0" y1="${h - 80}" x2="${w}" y2="${h - 80}" class="footer-line" />
          <text x="60" y="${h - 35}" class="footer-brand">${spacedName}</text>
          <text x="${w - 60}" y="${h - 35}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>
        </svg>
      `;

      const svgBuffer = Buffer.from(svgString);
      const compositeBuffer = await sharp(imageBuffer)
        .composite([{ input: svgBuffer, blend: 'over' }])
        .png()
        .toBuffer();

      return compositeBuffer.toString('base64');
    } catch (err) {
      console.error('Failed to apply Sharp text overlay. Returning raw model output:', err);
      return base64Image;
    }
  }
}
