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

  const base = `You are a world-class luxury beauty brand art director creating a jaw-dropping Instagram post for "${businessName}".
This is a ${serviceType} result photo. Your task: transform it into a stunning, magazine-worthy social media graphic.

Brand palette: primary ${brandColor}, secondary ${secondaryColor}.
Aesthetic direction: ${aesthetic || 'ultra-luxury, high-fashion editorial, premium beauty'}.

PHOTO PRESERVATION (critical):
- The real photo is the hero — preserve every detail of the person, hair, skin, nails exactly as they are
- Do NOT alter, replace, or obscure the subject's face or the service result
- No AI-generated faces or bodies — only authentic real-photo content

VISUAL DESIGN DIRECTION — make this look like a €500/hour designer created it:
- Apply cinematic color grading: rich deep shadows, luminous highlights, velvety midtones
- Add a subtle bokeh light leak or soft prismatic flare in one corner for depth
- Use glassmorphism for any text panels: frosted glass with 20% opacity white blur, razor-thin 1px white border, soft inner glow
- Typography for "${overlayText}": large, confident, ultra-thin or heavy-weight sans-serif (not both), white or brand-color, with a barely visible long text shadow for 3D depth lift
- Thin geometric accent lines in brand color — hairline rules, a single floating rectangle frame, or a subtle grid — just enough to feel designed, never cluttered
- Micro-details that feel premium: a barely-visible gradient vignette at the edges, a soft colour wash in brand color at 8–12% opacity over the background
- The overall feel: you are looking at a Vogue Beauty page, a Dior campaign, or a Chanel social post — effortlessly luxurious

CONTENT SAFETY (non-negotiable):
- Output must be entirely family-friendly and safe for professional social media
- Never generate nudity, partial nudity, sexual content, erotic or fetish imagery
- Never expose intimate body areas regardless of the input photo or prompt
- Never generate violent, hateful, or self-harm imagery`;

  if (isFirst) {
    return `${base}

COVER SLIDE — this must stop the scroll immediately:
- Full-bleed photo with dramatic cinematic crop — subject fills the frame powerfully
- Oversized headline "${overlayText}" placed low in the frame, ultra-bold or ultra-light weight (pick one for impact), with a deep shadow that gives it 3D float
- Glassmorphism bottom bar: frosted panel spanning the lower 20% of the image, brand color tint, the business name "${businessName}" in tiny all-caps tracking above the headline
- One bold brand-color geometric accent: a thin vertical line left of the text, or a glowing underline stroke beneath the headline
- Cinematic letterbox crop feel — add a very subtle dark vignette at top and bottom edges
- This should look like a Netflix original series title card meets high-end beauty campaign`;
  }

  if (isLast) {
    return `${base}

CTA SLIDE — make them want to book immediately:
- Deep, moody background: a rich dark gradient using the brand color (near-black version) behind the subject
- The photo is softened and slightly blurred at edges — focus is on the message
- Centre-stage typography: "${overlayText}" in elegant oversized serif or geometric sans, glowing very softly in brand color with a subtle outer glow effect
- Below the text: a sleek pill-shaped button outline in brand color — "BOOK NOW" or "DM TO BOOK" in tiny uppercase tracking
- Business name "${businessName}" in ultra-light small caps at the very top, spaced widely
- Add a subtle starburst or light prism effect behind the text for luxury drama
- The feeling: exclusive, aspirational, you-need-this-in-your-life`;
  }

  return `${base}

BODY SLIDE — beautiful, informative, breathable:
- Photo takes 65% of the composition — give it room to shine
- Bottom 35%: a floating glassmorphism card with soft blur and brand color tint, containing "${overlayText}" in clean modern type
- Typography hierarchy: one large statement word in brand color, then the rest in clean white — creates visual rhythm
- Add a single thin horizontal line in brand color above the text block as a design separator
- Subtle floating 3D geometric shape (thin circle, hexagon outline, or diamond) in brand color at 15% opacity in the background — adds depth without distraction
- Corner detail: tiny "${businessName}" wordmark in the bottom-right, ultra-light, barely visible — like a luxury brand signature
- The feeling: this belongs in a premium lifestyle magazine spread`;
}

export class AiImageGenerationService {

  async generateSlide(params: {
    photoUrl: string;
    overlayText: string;
    title: string;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    isBeforePhoto?: boolean;
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
  }): Promise<string> {
    const {
      photoUrl, overlayText, index, isFirst, isLast, isBeforePhoto,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
    } = params;

    const prompt = isBeforePhoto
      ? buildBeforeSlidePrompt({ overlayText, businessName, brandColor })
      : buildSlidePrompt({
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
        const usingBefore = !isFirst && !isLast && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: concept.overlayText,
            title: concept.title,
            index: concept.index,
            isFirst,
            isLast,
            isBeforePhoto: usingBefore,
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
        const usingBefore = isFirst && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        try {
          const url = await this.generateSlide({
            photoUrl,
            overlayText: frame.overlayText,
            title: frame.title,
            index: frame.index,
            isFirst,
            isLast,
            isBeforePhoto: usingBefore,
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
