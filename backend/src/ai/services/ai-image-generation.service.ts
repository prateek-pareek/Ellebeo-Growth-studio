// ============================================================================
// ai-image-generation.service.ts — Multi-model Image Generation (Gemini > GPT-Image-1)
// Takes real before/after photo + brand context → beautiful designed image
//
// CRITICAL ARCHITECTURE NOTE:
// - Gemini (gemini-2.5-flash-image): Uses vision+generation. Treats input photo as
//   reference context to preserve. SAFE for face/identity — will NOT beautify or alter faces.
// - GPT (gpt-image-1): Uses images.edit() which implies "enhance/edit" semantics.
//   REQUIRES explicit face-preservation instructions in prompts to prevent facial alterations.
//
// This service prioritizes Gemini (lines 189-243) and falls back to GPT only if Gemini fails.
// For GPT fallback: strict face-preservation clauses are injected into prompts (line 185-194).
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

export async function downloadImageAsBuffer(url: string): Promise<Buffer> {
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

export async function processPortraitFit(imageBuffer: Buffer, targetW: number, targetH: number): Promise<Buffer> {
  try {
    // Apply aggressive HD sharpening, light color modulation, and gamma correction for premium output
    const enhancedBuffer = await sharp(imageBuffer)
      .sharpen({ sigma: 1.8, m1: 0.6, m2: 3.5 })
      .modulate({ saturation: 1.06, brightness: 1.02 })
      .gamma(1.1)
      .toBuffer();

    const metadata = await sharp(enhancedBuffer).metadata();
    const originalW = metadata.width || 1024;
    const originalH = metadata.height || 1024;
    const targetAspect = targetW / targetH;
    const sourceAspect = originalW / originalH;
    
    // Always contain the original photo fully and layer it on a blurred version to prevent awkward zooming or cropping of faces
    const blurredBg = await sharp(enhancedBuffer)
      .resize(targetW, targetH, { fit: 'cover' })
      .blur(50)
      .toBuffer();
      
    const containedImg = await sharp(enhancedBuffer)
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
      
    return await sharp(blurredBg)
      .composite([{ input: containedImg }])
      .png()
      .toBuffer();
  } catch (err) {
    console.error('[Sharp Portrait Fit Error] Falling back to raw contain:', err);
    try {
      return await sharp(imageBuffer)
        .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      return imageBuffer;
    }
  }
}


// In-memory cache for fonts to prevent repeated network calls
const fontCache: Record<string, string> = {};

async function fetchGoogleFontBase64(fontFamily: string): Promise<string> {
  if (fontCache[fontFamily]) {
    return fontCache[fontFamily];
  }

  try {
    const escapedFamily = encodeURIComponent(fontFamily);
    const googleFontsCssUrl = `https://fonts.googleapis.com/css2?family=${escapedFamily}:wght@400;700&display=swap`;

    const cssText = await new Promise<string>((resolve, reject) => {
      // Send a modern User-Agent to force Google Fonts to return the raw TTF/WOFF2 links
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
      https.get(googleFontsCssUrl, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
        res.on('error', reject);
      }).on('error', reject);
    });

    // Extract the URL pointing to the font file (.ttf or .woff2)
    const urlMatch = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!urlMatch || !urlMatch[1]) {
      throw new Error(`Failed to extract font URL for: ${fontFamily}`);
    }

    const fontUrl = urlMatch[1];
    const fontBuffer = await downloadImageAsBuffer(fontUrl);
    const base64 = fontBuffer.toString('base64');
    
    fontCache[fontFamily] = base64;
    return base64;
  } catch (err: any) {
    console.error(`[FONT DOWNLOADER ERROR] Failed to fetch font: ${fontFamily}. Fallback active.`, err.message);
    return '';
  }
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

PHOTO PRESERVATION (ABSOLUTE — non-negotiable):
- Preserve the original photo exactly as it is — this is the HERO of the image.
- The person in the photo must remain COMPLETELY UNCHANGED in every detail.
- Do NOT modify ANY facial features, facial structure, skin tone, eye placement, nose shape, mouth, chin, or jawline.
- Do NOT alter facial expressions or head position.
- Do NOT retouch, airbrush, smooth, or beautify skin or faces — keep raw, real, and textured.
- Do NOT apply any filters, color grading, or tone adjustments to the face or skin.
- Do NOT change hair color, hair texture, or hair styling.
- Do NOT modify body shape, proportion, or posture.
- Do NOT crop, remove, or replace the background. Keep the natural environment, background wood, towels, and salon context fully intact.
- Do NOT add bokeh, light leaks, glamour lighting, or any beautification effects.
- No AI-generated faces, bodies, or features — only add design overlays to EXISTING elements.

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
- Show the full photo with its original background and all persons exactly as they appear.
- Add the main headline "${overlayText}" in clean white text placed in the lower part of the frame.
- Place a clean, minimal semi-transparent dark rectangle panel behind the headline for high contrast and readability.`;
  }

  if (isLast) {
    return `${base}

CTA SLIDE:
- Focus is on the call to action message: "${overlayText}".
- Display the text cleanly in a small, modern, semi-transparent dark box at the center of the frame.
- Below the text, add a small, minimalist text line: "BOOK NOW" or "DM TO BOOK".
- The person in the photo must remain completely unchanged.`;
  }

  return `${base}

BODY SLIDE:
- Photo takes most of the composition with the person unchanged.
- Add the text label "${overlayText}" cleanly in a semi-transparent dark box at the bottom of the frame.`;
}

export class AiImageGenerationService {

  async generateSlide(params: {
    photoUrl: string;
    beforePhotoUrl?: string;
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
    layoutType?: string;
    brandFont?: string;
    bodyFont?: string;
    visualRanking?: string[];
    capitalizationRule?: string;
    footerBrandToggle?: boolean;
    generatorModel?: 'gemini' | 'dalle' | 'both';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
  }): Promise<string> {
    const {
      photoUrl, beforePhotoUrl, overlayText, index, isFirst, isLast, isBeforePhoto,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
      outputSize = '1024x1024' as '1024x1024' | '1024x1536',
      layoutType = 'passepartout_text',
      customPrompt,
      totalSlides = 4,
      brandFont,
      bodyFont,
      visualRanking = [],
      capitalizationRule = 'uppercase',
      footerBrandToggle = true,
      generatorModel = 'both',
      backgroundBrandColor = '#F7F4EF',
      accentBrandColor = '#D4A373'
    } = params;

    // Fast-path: Skip AI image generation entirely for text-only editorial quote layouts
    if (layoutType === 'text_only_editorial') {
      console.log(`[TEXT ONLY EDITORIAL] Bypassing AI image generator for slide ${index} and creating solid brand colored tile.`);
      const brandedBase64 = await this.overlayBrandingAndText({
        base64Image: '',
        overlayText,
        isFirst,
        isLast,
        brandColor,
        secondaryColor,
        businessName,
        index,
        totalSlides,
        brandFont,
        bodyFont,
        layoutType,
        beforePhotoUrl,
        visualRanking,
        capitalizationRule,
        footerBrandToggle,
        backgroundBrandColor,
        accentBrandColor
      });
      return uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
    }

    let cleanPrompt = '';
    let imageBuffer: Buffer | null = null;

    const isRealClientPhoto = photoUrl && (photoUrl.startsWith('http') || photoUrl.includes('raw_assets') || photoUrl.includes('storage') || photoUrl.includes('temp'));

    if (isRealClientPhoto) {
      console.log(`[PASS-THROUGH SHARP COMPOSITOR] Bypassing AI image editor for slide ${index} to guarantee 100% client face preservation.`);
      imageBuffer = await downloadImageAsBuffer(photoUrl);
      const base64Image = imageBuffer.toString('base64');
      const brandedBase64 = await this.overlayBrandingAndText({
        base64Image,
        overlayText,
        isFirst,
        isLast,
        brandColor,
        secondaryColor,
        businessName,
        index,
        totalSlides,
        brandFont,
        bodyFont,
        layoutType,
        beforePhotoUrl,
        visualRanking,
        capitalizationRule,
        footerBrandToggle,
        backgroundBrandColor,
        accentBrandColor
      });
      return uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
    }

    // Compile dynamic lifestyle/studio assets for non-booking educational/moodboard posts
    const lifestyleSubjects = [
      `a luxury minimalist beauty clinic treatment room with warm soft lighting, beige tones, and clean design`,
      `close-up of elegant serum bottles on a textured travertine stone plate, surrounded by delicate olive leaves, soft shadows`,
      `a premium spa treatment leather chair in a high-end wellness interior, aesthetic clinical design`,
      `clean aesthetic details of organic cosmetic packaging resting on a stone surface, delicate shadows`
    ];
    const chosenSubject = lifestyleSubjects[index % lifestyleSubjects.length];

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

    const rankingStyleText = visualRanking && visualRanking.length > 0
      ? `Visual style priorities: ${visualRanking.join(', ')}`
      : 'minimal, premium beauty editorial';

    const facePreservationClause = `
    
CRITICAL IMAGE REQUIREMENTS:
- Subject: ${chosenSubject}
- Color scheme: brand palette primary ${brandColor}, secondary ${secondaryColor}
- Aesthetic style: ${aesthetic || 'minimal, premium beauty editorial'}. ${rankingStyleText}
- Photographic quality: Captured on a medium-format 80MP camera, ultra-detailed textures, razor-sharp focus on details, Hasselblad/Leica photography style, 8k resolution, cinematic natural lighting.
- Do NOT feature any people, faces, or bodies. Focus entirely on organic, luxury interiors and clinic product details.
- The image must look like a professional, high-fashion campaign photography asset.
- CRITICAL: Do NOT write, draw, or render any text overlays, titles, or logo elements directly onto the image. The image must contain only the raw photographic result.`;

    cleanPrompt = prompt + facePreservationClause;



    let base64 = '';

    // Real client photos are already handled and returned early in the pass-through compositor block.
    // Standard text-to-image asset generation happens below for lifestyle/concept slides.
      console.log(`Generating lifestyle base images using generatorModel: ${generatorModel} for slide ${index}...`);
      
      const geminiTask = (async () => {
        if (generatorModel === 'dalle') return null;
        const geminiKey = process.env['GEMINI_API_KEY'];
        if (!geminiKey) return null;
        try {
          const aiClient = new GoogleGenAI({ apiKey: geminiKey });
          const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: cleanPrompt,
            config: { responseModalities: ['image'] } as any,
          });
          const outputPart = response.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);
          return outputPart?.inlineData?.data || null;
        } catch (err) {
          console.error(`Gemini generation failed for slide ${index}:`, err);
          return null;
        }
      })();

      const dalleTask = (async () => {
        if (generatorModel === 'gemini') return null;
        try {
          console.log(`Generating DALL-E 3 image for slide ${index}...`);
          const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: cleanPrompt,
            size: outputSize === '1024x1536' ? '1024x1792' as any : '1024x1024',
          });
          const url = response.data?.[0]?.url;
          if (url) {
            const buf = await downloadImageAsBuffer(url);
            return buf.toString('base64');
          }
          return null;
        } catch (err) {
          console.warn(`DALL-E 3 generation failed for slide ${index}, trying DALL-E 2 fallback:`, err);
          try {
            const response = await openai.images.generate({
              model: 'dall-e-2',
              prompt: cleanPrompt,
              size: '1024x1024',
            });
            const url = response.data?.[0]?.url;
            if (url) {
              const buf = await downloadImageAsBuffer(url);
              return buf.toString('base64');
            }
          } catch (err2) {
            console.error(`DALL-E 2 fallback generation failed for slide ${index}:`, err2);
          }
          return null;
        }
      })();

      const [geminiResult, dalleResult] = await Promise.all([geminiTask, dalleTask]);

      if (generatorModel === 'both' && geminiResult && dalleResult) {
        console.log(`Both base images generated! Evaluating aesthetic winner using GPT-4o-mini judge...`);
        try {
          const evalResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a senior art director. Evaluate the two aesthetic beauty clinic background images and choose the one that looks more premium, professional, and fits a high-fashion beauty clinic brand (e.g. clean travertine, minimal spa interiors, elegant cosmetic products). Respond ONLY with valid JSON: {"winner": "A" | "B"}.'
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Image A is the first image, Image B is the second image. Which one looks more premium?' },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${geminiResult}` } },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${dalleResult}` } }
                ]
              }
            ],
            response_format: { type: 'json_object' }
          });
          const evalText = evalResponse.choices[0]?.message?.content || '';
          const evalParsed = JSON.parse(evalText) as { winner: 'A' | 'B' };
          if (evalParsed.winner === 'A') {
            console.log(`--> Winner is Image A (Gemini)`);
            base64 = geminiResult;
          } else {
            console.log(`--> Winner is Image B (DALL-E 3)`);
            base64 = dalleResult;
          }
        } catch (evalErr) {
          console.error('[Vision Judge Error] Selection query failed, falling back to DALL-E:', evalErr);
          base64 = dalleResult;
        }
      } else {
        base64 = geminiResult || dalleResult || '';
      }

      if (!base64) throw new Error(`OpenAI image generation failed completely for slide ${index}`);

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
      brandFont,
      bodyFont,
      layoutType,
      beforePhotoUrl,
      visualRanking,
      capitalizationRule,
      footerBrandToggle,
      backgroundBrandColor,
      accentBrandColor
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
    layoutType?: string;
    brandFont?: string;
    bodyFont?: string;
    visualRanking?: string[];
    capitalizationRule?: string;
    footerBrandToggle?: boolean;
    generatorModel?: 'gemini' | 'dalle' | 'both';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', ...rest } = params;
    const total = concepts.length;

    // Define pool of premium layout templates
    const layoutPool = [
      'passepartout_text',
      'asymmetric_monogram',
      'translucent_split',
      'poster_cover',
      'postcard_ticket',
      'editorial_arch',
      'text_only_editorial',
      'transparent_scrim',
      'premium_diptyque',
      'art_director_split',
      'gold_ticket',
      'newspaper_editorial',
      'book_magazine_cover',
      'letter_envelope'
    ];

    // Select unique layouts without repeats
    const uniqueLayoutsForSlides: string[] = [];
    let pool = [...layoutPool];
    for (let i = 0; i < total; i++) {
      let chosen = '';
      if (i === 0) {
        // Slide 1 (Cover) should prefer a striking template if available
        const coverOptions = ['poster_cover', 'translucent_split', 'passepartout_text'];
        chosen = coverOptions.find(o => pool.includes(o)) || pool[0];
      } else {
        const randomIndex = Math.floor(Math.random() * pool.length);
        chosen = pool[randomIndex] || 'passepartout_text';
      }
      uniqueLayoutsForSlides.push(chosen);
      pool = pool.filter(l => l !== chosen);
      if (pool.length === 0) pool = [...layoutPool]; // Reset if total slides exceeds layout count
    }

    const slides = await Promise.all(
      concepts.map(async (concept, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        // Cover uses after photo (or before if available); slide 3 (reveal) uses after photo. Non-outcome slides generate lifestyle assets.
        let photoUrl: string | undefined = undefined;
        let usingBefore = false;
        if (isFirst) {
          photoUrl = afterPhotoUrl;
        } else if (i === 1 && beforePhotoUrl) {
          photoUrl = beforePhotoUrl;
          usingBefore = true;
        } else if (i === 2 || i === total - 2) {
          photoUrl = afterPhotoUrl;
        }

        const brief = artDirectorBrief?.find(b => b.index === concept.index);
        let currentSlideLayout = uniqueLayoutsForSlides[i];
        if (isLast) {
          currentSlideLayout = 'transparent_scrim';
        }

        try {
          const url = await this.generateSlide({
            photoUrl: photoUrl || '',
            beforePhotoUrl,
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
            layoutType: currentSlideLayout,
            visualRanking,
            capitalizationRule,
            footerBrandToggle,
            generatorModel,
            backgroundBrandColor,
            accentBrandColor
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
    brandFont?: string;
    bodyFont?: string;
    visualRanking?: string[];
    capitalizationRule?: string;
    footerBrandToggle?: boolean;
    layoutType?: string;
    generatorModel?: 'gemini' | 'dalle' | 'both';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', ...rest } = params;
    const total = frames.length;

    // Define pool of premium layout templates
    const layoutPool = [
      'passepartout_text',
      'asymmetric_monogram',
      'translucent_split',
      'poster_cover',
      'postcard_ticket',
      'editorial_arch',
      'text_only_editorial',
      'transparent_scrim',
      'premium_diptyque',
      'art_director_split',
      'gold_ticket',
      'newspaper_editorial',
      'book_magazine_cover',
      'letter_envelope'
    ];

    // Select unique layouts without repeats
    const uniqueLayoutsForFrames: string[] = [];
    let pool = [...layoutPool];
    for (let i = 0; i < total; i++) {
      let chosen = '';
      if (i === 0) {
        // Frame 1 (Cover) should prefer a striking template if available
        const coverOptions = ['poster_cover', 'translucent_split', 'passepartout_text'];
        chosen = coverOptions.find(o => pool.includes(o)) || pool[0];
      } else {
        const randomIndex = Math.floor(Math.random() * pool.length);
        chosen = pool[randomIndex] || 'passepartout_text';
      }
      uniqueLayoutsForFrames.push(chosen);
      pool = pool.filter(l => l !== chosen);
      if (pool.length === 0) pool = [...layoutPool]; // Reset if total frames exceeds layout count
    }

    const results = await Promise.all(
      frames.map(async (frame, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        // Cover uses before photo (if available) or after; slide 3 (reveal) uses after photo. Non-outcome frames generate lifestyle assets.
        let photoUrl: string | undefined = undefined;
        let usingBefore = false;
        if (isFirst) {
          photoUrl = beforePhotoUrl || afterPhotoUrl;
          usingBefore = !!beforePhotoUrl;
        } else if (i === 2 || i === total - 2) {
          photoUrl = afterPhotoUrl;
        }

        const brief = artDirectorBrief?.find(b => b.index === frame.index);
        let currentSlideLayout = uniqueLayoutsForFrames[i];
        if (isLast) {
          currentSlideLayout = 'transparent_scrim';
        }

        try {
          const url = await this.generateSlide({
            photoUrl: photoUrl || '',
            beforePhotoUrl,
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
            layoutType: currentSlideLayout,
            visualRanking,
            capitalizationRule,
            footerBrandToggle,
            generatorModel,
            backgroundBrandColor,
            accentBrandColor
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
    layoutType?: string;
    beforePhotoUrl?: string;
    brandFont?: string;
    bodyFont?: string;
    visualRanking?: string[];
    capitalizationRule?: string;
    footerBrandToggle?: boolean;
    backgroundBrandColor?: string;
    accentBrandColor?: string;
  }): Promise<string> {
    const { 
      base64Image, 
      overlayText, 
      isFirst, 
      isLast, 
      brandColor, 
      secondaryColor, 
      businessName, 
      index, 
      totalSlides, 
      layoutType = 'passepartout_text', 
      beforePhotoUrl,
      brandFont = 'Playfair Display',
      bodyFont = 'Inter',
      visualRanking = [],
      capitalizationRule = 'uppercase',
      footerBrandToggle = true,
      backgroundBrandColor = '#F7F4EF',
      accentBrandColor = '#D4A373'
    } = params;

    const hasText = overlayText && overlayText.trim().length > 0;

    try {
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      let originalW = 1024;
      let originalH = 1024;
      let imageBuffer: Buffer = Buffer.alloc(0);

      if (base64Image && base64Image.trim().length > 0) {
        imageBuffer = Buffer.from(base64Image, 'base64');
        try {
          const metadata = await sharp(imageBuffer).metadata();
          originalW = metadata.width || 1024;
          originalH = metadata.height || 1024;
        } catch (metadataErr) {
          console.warn('[Sharp Metadata Warning]: Could not parse image metadata, using defaults:', metadataErr);
        }
      }

      // Force high-definition target canvas dimensions (Instagram standards)
      const isStory = originalH > originalW;
      const w = 1080;
      const h = isStory ? 1620 : 1080;

      const lines: string[] = [];
      if (hasText) {
        const words = overlayText.split(/\s+/);
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
      }

      let rectY = h - 250;
      let textY = h - 195;
      let rectHeight = 130;

      if (isLast) {
        rectY = h - 275;
        textY = h - 220;
        rectHeight = 165;
      }

      // Use dynamic brand colors
      const validBrandColor = brandColor.startsWith('#') ? brandColor : '#161616';
      const validSecondaryColor = secondaryColor.startsWith('#') ? secondaryColor : '#161616';
      const validBackgroundColor = backgroundBrandColor.startsWith('#') ? backgroundBrandColor : '#F7F4EF';
      const validAccentColor = accentBrandColor.startsWith('#') ? accentBrandColor : '#D4A373';

      const rawName = (businessName || 'RAW CANVAS').trim().toUpperCase();
      const spacedName = rawName.split('').join(' ');

      const escapedSpacedName = escapeXml(spacedName);
      
      // Formatting helper mapped to Brand DNA capitalization rules
      const formatTextByRule = (text: string, rule: string): string => {
        const clean = text.trim();
        const ruleLower = rule.toLowerCase();
        if (ruleLower.includes('sentence')) {
          return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
        } else if (ruleLower.includes('title') || ruleLower.includes('first_letter') || ruleLower.includes('capitalisation') || ruleLower.includes('heading')) {
          return clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }
        return clean.toUpperCase(); // default UPPERCASE
      };

      const formattedLines = lines.map(line => formatTextByRule(line, capitalizationRule));
      const escapedLines = formattedLines.map(line => escapeXml(line));

      const slideNumText = String(index || 1).padStart(2, '0');
      const totalSlidesText = String(totalSlides || 4).padStart(2, '0');

      // ── MAPPING STYLE RANKINGS DYNAMICALLY (Production-Grade Lookup) ──
      const STYLE_GEOMETRY: Record<string, { borderPercent: number; letterSpacing: string }> = {
        quiet_luxury: { borderPercent: 0.03, letterSpacing: '5px' },
        editorial_beauty: { borderPercent: 0.04, letterSpacing: '3px' },
        clinical_minimalist: { borderPercent: 0.035, letterSpacing: '4px' },
        warm_wellness: { borderPercent: 0.045, letterSpacing: '2px' },
        high_fashion: { borderPercent: 0.035, letterSpacing: '5px' },
        polished_commercial: { borderPercent: 0.05, letterSpacing: '2px' },
        soft_feminine: { borderPercent: 0.045, letterSpacing: '3px' },
        bold_campaign: { borderPercent: 0.05, letterSpacing: '1px' },
        natural_organic: { borderPercent: 0.04, letterSpacing: '2px' },
        contemporary_cool: { borderPercent: 0.05, letterSpacing: '1px' },
      };

      const primaryRanking = visualRanking[0] || 'quiet_luxury';
      const geometry = STYLE_GEOMETRY[primaryRanking] || { borderPercent: 0.04, letterSpacing: '2px' };
      
      const borderPercent = geometry.borderPercent;
      const headingLetterSpacing = geometry.letterSpacing;

      // Dynamic brand footer spacing based on name length to prevent overlaps/clippings
      let footerLetterSpacing = 5;
      let footerFontSize = 13;
      if (escapedSpacedName.length > 35) {
        footerLetterSpacing = 1;
        footerFontSize = 10;
      } else if (escapedSpacedName.length > 25) {
        footerLetterSpacing = 2;
        footerFontSize = 11;
      }

      // True Passepartout Layout Calculations using dynamic borders
      const paddingX = Math.floor(w * borderPercent); 
      const paddingTop = Math.floor(h * borderPercent); 
      const paddingBottom = 200; // Deep bottom margin for text & footer

      const innerW = w - (paddingX * 2);
      const innerH = h - (paddingTop + paddingBottom);

      // ── Step 1: Process Base Image based on LayoutType ──
      let baseImage: sharp.Sharp;
      if (imageBuffer && imageBuffer.length > 0) {
        baseImage = sharp(imageBuffer);
      } else {
        baseImage = sharp({
          create: {
            width: w,
            height: h,
            channels: 3,
            background: validBackgroundColor
          }
        });
      }
      let compositeTop = paddingTop;
      let compositeBottom = paddingBottom;
      let compositeLeft = paddingX;
      let compositeRight = paddingX;

      if (layoutType === 'text_only_editorial') {
        baseImage = sharp({
          create: {
            width: w,
            height: h,
            channels: 3,
            background: validBackgroundColor
          }
        });
        compositeTop = 0;
        compositeBottom = 0;
        compositeLeft = 0;
        compositeRight = 0;
      } else if (layoutType === 'postcard_ticket') {
        const cardW = w - 160;
        const cardH = h - 300;
        baseImage = sharp(await processPortraitFit(imageBuffer, cardW, cardH));
        compositeTop = 80;
        compositeLeft = 80;
        compositeBottom = h - cardH - compositeTop;
        compositeRight = w - cardW - compositeLeft;
      } else if (layoutType === 'editorial_arch') {
        baseImage = sharp(await processPortraitFit(imageBuffer, innerW, innerH));
        compositeTop = paddingTop;
        compositeLeft = paddingX;
        compositeBottom = paddingBottom;
        compositeRight = paddingX;
      } else if (layoutType === 'split_before_after' && beforePhotoUrl) {
        try {
          const beforeBuffer = await downloadImageAsBuffer(beforePhotoUrl);
          
          const leftHalf = await processPortraitFit(beforeBuffer, Math.round(innerW / 2), innerH);
          const rightHalf = await processPortraitFit(imageBuffer, Math.round(innerW / 2), innerH);

          baseImage = sharp({
            create: {
              width: innerW,
              height: innerH,
              channels: 3,
              background: '#000000',
            }
          }).composite([
            { input: leftHalf, top: 0, left: 0 },
            { input: rightHalf, top: 0, left: Math.round(innerW / 2) }
          ]);
        } catch (splitErr) {
          console.error('[Sharp Split Frame Error] Failed to stitch before/after images, falling back:', splitErr);
          baseImage = sharp(await processPortraitFit(imageBuffer, innerW, innerH));
        }
      } else if (layoutType === 'premium_diptyque') {
        baseImage = sharp(await processPortraitFit(imageBuffer, w, h));
        compositeTop = 0;
        compositeLeft = 0;
        compositeBottom = 0;
        compositeRight = 0;

        if (beforePhotoUrl) {
          try {
            const beforeBuffer = await downloadImageAsBuffer(beforePhotoUrl);
            const maskW = 320;
            const maskH = 440;
            const archMaskSvg = `<svg width="${maskW}" height="${maskH}">
              <path d="M 0,160 A 160,160 0 0,1 320,160 V 440 H 0 Z" fill="#ffffff" />
            </svg>`;
            
            // Fit the before image into the mask dimensions elegantly
            const fittedBeforeBuffer = await processPortraitFit(beforeBuffer, maskW, maskH);
            const croppedBefore = await sharp(fittedBeforeBuffer)
              .composite([{ input: Buffer.from(archMaskSvg), blend: 'dest-in' }])
              .png()
              .toBuffer();

            baseImage = sharp(await baseImage.toBuffer()).composite([
              { input: croppedBefore, left: 60, top: h - 520 }
            ]);
          } catch (diptyqueErr) {
            console.error('[Sharp Diptyque Frame Error] Failed to overlay before photo:', diptyqueErr);
          }
        }
      } else if (layoutType === 'art_director_split') {
        const photoW = Math.floor(w * 0.6);
        const photoBuffer = (imageBuffer && imageBuffer.length > 0)
          ? await processPortraitFit(imageBuffer, photoW, h)
          : null;

        baseImage = sharp({
          create: {
            width: w,
            height: h,
            channels: 3,
            background: validBackgroundColor
          }
        });

        if (photoBuffer) {
          baseImage = baseImage.composite([{ input: photoBuffer, left: 0, top: 0 }]);
        }
        compositeTop = 0;
        compositeLeft = 0;
        compositeBottom = 0;
        compositeRight = 0;
      } else if (layoutType === 'asymmetric_monogram' || layoutType === 'transparent_scrim') {
        // Full bleed layouts
        baseImage = sharp(await processPortraitFit(imageBuffer, w, h));
        compositeTop = 0;
        compositeLeft = 0;
        compositeBottom = 0;
        compositeRight = 0;
      } else {
        if (layoutType !== 'full_bleed_clean' && layoutType !== 'translucent_split' && layoutType !== 'poster_cover') {
          baseImage = sharp(await processPortraitFit(imageBuffer, innerW, innerH));
        }
      }

      // ── Step 2: Auto-detect Contrast for Borderless Poster Covers & Slide Backgrounds ──
      const getLuminance = (hex: string): number => {
        try {
          const cleaned = hex.replace('#', '');
          const rgb = parseInt(cleaned, 16);
          const r = (rgb >> 16) & 0xff;
          const g = (rgb >> 8) & 0xff;
          const b = (rgb >> 0) & 0xff;
          return 0.299 * r + 0.587 * g + 0.114 * b;
        } catch {
          return 0; // Default to dark (white text)
        }
      };

      // Determine text color using brand palette colors instead of binary white/black
      const panelLuminance = getLuminance(validBrandColor);
      const isLightPanel = panelLuminance > 175;
      const dynamicTextColor = isLightPanel ? validBrandColor : validBackgroundColor;

      const footerLuminance = getLuminance(validSecondaryColor);
      const isLightFooter = footerLuminance > 175;
      const dynamicFooterTextColor = isLightFooter ? validBrandColor : validBackgroundColor;

      let posterTextColor = '#FFFFFF';
      if (layoutType === 'poster_cover') {
        try {
          const stats = await sharp(imageBuffer).stats();
          const meanLuminance = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
          posterTextColor = meanLuminance > 127 ? '#1E1E1C' : '#FFFFFF';
        } catch (contrastErr) {
          console.error('[Sharp Contrast Detection Error]:', contrastErr);
        }
      }

      // Calculate dynamic font size and letter spacing to prevent clipping
      let dynamicFontSize = 26;
      let maxLength = 0;
      for (const line of lines) {
        if (line.length > maxLength) maxLength = line.length;
      }
      if (maxLength > 32) {
        dynamicFontSize = 18;
      } else if (maxLength > 26) {
        dynamicFontSize = 21;
      }
      const dyOffset = Math.round(dynamicFontSize * 1.35);

      // ── Step 3: Assemble SVG Overlays
      const showPassepartoutText = hasText && (layoutType === 'passepartout_text' || layoutType === 'split_before_after');
      let textPanelSvg = '';
      if (showPassepartoutText) {
        textPanelSvg = `
          <!-- Hook Text directly in the Passepartout Negative Space -->
          <text x="${w / 2}" y="${h - 135}" text-anchor="middle" class="overlay-text text-centered" style="font-size: ${dynamicFontSize}px; fill: ${dynamicTextColor};">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'asymmetric_monogram' && hasText) {
        textPanelSvg = `
          <!-- Left-aligned negative space text for Asymmetrical Layout -->
          <text x="60" y="${h - 145}" text-anchor="start" class="overlay-text text-left" style="font-size: ${dynamicFontSize}px; fill: ${dynamicTextColor};">
            ${escapedLines.map((line, idx) => `<tspan x="60" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="start">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'translucent_split' && hasText) {
        textPanelSvg = `
          <!-- Text inside the blurred brand side-panel -->
          <text x="${w * 0.25}" y="${h / 2 - 40}" text-anchor="middle" class="overlay-text text-centered" style="font-size: ${dynamicFontSize}px; fill: ${validBackgroundColor};">
            ${escapedLines.map((line, idx) => `<tspan x="${w * 0.25}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'poster_cover' && hasText) {
        textPanelSvg = `
          <!-- High contrast text placed directly on the borderless photo -->
          <text x="${w / 2}" y="${h - 150}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${posterTextColor}; font-size: ${dynamicFontSize}px; letter-spacing: 5px;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'text_only_editorial' && hasText) {
        textPanelSvg = `
          <!-- Center-aligned premium quote card style text -->
          <text x="${w / 2}" y="${h / 2 - (lines.length * (dyOffset + 8)) / 2 + 25}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize + 6}px; line-height: 1.45;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset + 10}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'postcard_ticket' && hasText) {
        textPanelSvg = `
          <!-- Elegant clean caption centered under the postcard frame -->
          <text x="${w / 2}" y="${h - 130}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize}px;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'editorial_arch' && hasText) {
        textPanelSvg = `
          <!-- Clean arch caption in bottom margin -->
          <text x="${w / 2}" y="${h - 125}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize}px;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'transparent_scrim' && hasText) {
        textPanelSvg = `
          <!-- Premium overlay text centered on darkened scrim background -->
          <text x="${w / 2}" y="${h / 2 - (lines.length * (dyOffset + 8)) / 2 + 25}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${validBackgroundColor}; font-size: ${dynamicFontSize + 4}px; line-height: 1.45;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset + 10}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'premium_diptyque' && hasText) {
        textPanelSvg = `
          <!-- Center-aligned caption positioned in top half for Diptyque -->
          <text x="${w / 2}" y="180" text-anchor="middle" class="overlay-text text-centered" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize}px;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'art_director_split' && hasText) {
        textPanelSvg = `
          <!-- Centered caption in the right side brand panel -->
          <text x="864" y="${h / 2 - (lines.length * (dyOffset + 8)) / 2 + 25}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${validBackgroundColor}; font-size: ${dynamicFontSize}px; line-height: 1.45;">
            ${escapedLines.map((line, idx) => `<tspan x="864" dy="${idx === 0 ? 0 : dyOffset}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'gold_ticket' && hasText) {
        textPanelSvg = `
          <!-- Gold/Brass ticket text layout -->
          <text x="${w / 2}" y="${h / 2 - (lines.length * (dyOffset + 8)) / 2 + 25}" text-anchor="middle" class="overlay-text text-centered" style="fill: ${validAccentColor}; font-size: ${dynamicFontSize + 2}px; letter-spacing: 4px; font-weight: 300;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset + 8}" text-anchor="middle">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'newspaper_editorial' && hasText) {
        textPanelSvg = `
          <!-- Newspaper style double column vertical text layout -->
          <text x="80" y="${h / 2 - (lines.length * dyOffset) / 2}" text-anchor="start" class="overlay-text text-left" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize - 2}px; font-family: Georgia, serif; font-weight: normal; line-height: 1.6;">
            ${escapedLines.map((line, idx) => `<tspan x="80" dy="${idx === 0 ? 0 : dyOffset + 6}">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'book_magazine_cover' && hasText) {
        textPanelSvg = `
          <!-- Editorial book / magazine title layout -->
          <text x="${w / 2}" y="240" text-anchor="middle" class="overlay-text text-centered" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize + 8}px; font-family: '${brandFont}', Georgia, serif; font-weight: 900; letter-spacing: 2px;">
            ${escapedLines.map((line, idx) => `<tspan x="${w / 2}" dy="${idx === 0 ? 0 : dyOffset + 12}">${line}</tspan>`).join('')}
          </text>`;
      } else if (layoutType === 'letter_envelope' && hasText) {
        textPanelSvg = `
          <!-- Classic elegant stationary letter letter layout -->
          <text x="120" y="240" text-anchor="start" class="overlay-text text-left" style="fill: ${dynamicTextColor}; font-size: ${dynamicFontSize}px; font-family: '${brandFont}', Georgia, serif; font-weight: 200; font-style: italic;">
            ${escapedLines.map((line, idx) => `<tspan x="120" dy="${idx === 0 ? 0 : dyOffset + 6}">${line}</tspan>`).join('')}
          </text>`;
      }

      // Draw structural overlays (split pane rectangles or monograms)
      let visualAdditions = '';
      if (layoutType === 'asymmetric_monogram') {
        visualAdditions = `
          <!-- Large single-character monogram watermark in negative space -->
          <text x="${w * 0.82}" y="${h * 0.76}" fill="${validSecondaryColor}" fill-opacity="0.07" font-family="'${brandFont}', Georgia, serif" font-size="300px" font-weight="bold" text-anchor="middle">
            ${rawName.charAt(0)}
          </text>`;
      } else if (layoutType === 'translucent_split') {
        visualAdditions = `
          <!-- Semi-transparent solid brand pane overlay -->
          <rect x="0" y="0" width="${w * 0.5}" height="${h}" fill="${validBrandColor}" fill-opacity="0.38" />`;
      } else if (layoutType === 'postcard_ticket') {
        visualAdditions = `
          <!-- Decorative dashed ticket/postcard vintage frame overlay -->
          <rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="${validSecondaryColor}" stroke-width="1.5" stroke-dasharray="10,6" />
          <rect x="50" y="50" width="${w - 100}" height="${h - 260}" fill="none" stroke="${validSecondaryColor}" stroke-width="1.2" />
          <!-- Ticket notch circles -->
          <circle cx="40" cy="${h - 210}" r="15" fill="${validBrandColor}" />
          <circle cx="${w - 40}" cy="${h - 210}" r="15" fill="${validBrandColor}" />`;
      } else if (layoutType === 'editorial_arch') {
        visualAdditions = `
          <!-- The Arch cutout mask overlay using even-odd fill path subtraction -->
          <path d="M -10,-10 H ${w+10} V ${h+10} H -10 Z M ${paddingX},${paddingTop + 140} A ${innerW / 2},${innerW / 2} 0 0,1 ${w - paddingX},${paddingTop + 140} V ${h - paddingBottom + 20} H ${paddingX} Z" fill="${validBrandColor}" fill-rule="evenodd" />
          <path d="M ${paddingX},${paddingTop + 140} A ${innerW / 2},${innerW / 2} 0 0,1 ${w - paddingX},${paddingTop + 140} V ${h - paddingBottom + 20} H ${paddingX} Z" fill="none" stroke="${validSecondaryColor}" stroke-width="1.5" />`;
      } else if (layoutType === 'transparent_scrim') {
        visualAdditions = `
          <!-- Dark brand-colored transparent overlay scrim across entire screen -->
          <rect x="0" y="0" width="${w}" height="${h}" fill="${validBrandColor}" fill-opacity="0.28" />`;
      } else if (layoutType === 'premium_diptyque') {
        visualAdditions = `
          <!-- Matching elegant arch outline border for the inset before card -->
          <path d="M 58,${h - 362} A 162,162 0 0,1 382,${h - 362} V ${h - 78} H 58 Z" fill="none" stroke="${validSecondaryColor}" stroke-width="2.5" />
          <text x="220" y="${h - 45}" font-family="'${bodyFont}', sans-serif" font-size="12px" fill="#FFFFFF" font-weight="bold" text-anchor="middle" letter-spacing="2">BEFORE</text>`;
      } else if (layoutType === 'gold_ticket') {
        visualAdditions = `
          <!-- Elegant gold/brass ticket border overlay -->
          <rect x="50" y="50" width="${w - 100}" height="${h - 100}" fill="none" stroke="${validAccentColor}" stroke-width="2" />
          <rect x="62" y="62" width="${w - 124}" height="${h - 124}" fill="none" stroke="${validAccentColor}" stroke-width="0.8" stroke-dasharray="8,4" />
          <circle cx="50" cy="${h / 2}" r="25" fill="${validBrandColor}" stroke="${validAccentColor}" stroke-width="1.5" />
          <circle cx="${w - 50}" cy="${h / 2}" r="25" fill="${validBrandColor}" stroke="${validAccentColor}" stroke-width="1.5" />`;
      } else if (layoutType === 'newspaper_editorial') {
        visualAdditions = `
          <!-- Newspaper column dividers and header rule -->
          <line x1="60" y1="80" x2="${w - 60}" y2="80" stroke="${validSecondaryColor}" stroke-width="2" />
          <line x1="60" y1="90" x2="${w - 60}" y2="90" stroke="${validSecondaryColor}" stroke-width="0.5" />
          <line x1="480" y1="120" x2="480" y2="${h - 140}" stroke="${validSecondaryColor}" stroke-width="0.5" stroke-dasharray="5,5" />
          <text x="60" y="70" font-family="Georgia, serif" font-size="11px" fill="${validSecondaryColor}" letter-spacing="2">THE DAILY EDITORIAL</text>`;
      } else if (layoutType === 'book_magazine_cover') {
        visualAdditions = `
          <!-- Magazine header structure -->
          <rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="${validSecondaryColor}" stroke-width="1.2" />
          <line x1="40" y1="120" x2="${w - 40}" y2="120" stroke="${validSecondaryColor}" stroke-width="1" />
          <text x="${w / 2}" y="95" font-family="'${bodyFont}', sans-serif" font-size="12px" fill="${validSecondaryColor}" font-weight="bold" text-anchor="middle" letter-spacing="8">GROWTH STUDIO / ISSUE 04</text>`;
      } else if (layoutType === 'letter_envelope') {
        visualAdditions = `
          <!-- Premium stationary letter borders and monogram wax seal simulation -->
          <rect x="80" y="80" width="${w - 160}" height="${h - 160}" fill="none" stroke="${validSecondaryColor}" stroke-width="0.8" />
          <circle cx="${w - 140}" cy="140" r="18" fill="${validAccentColor}" fill-opacity="0.15" />
          <circle cx="${w - 140}" cy="140" r="14" fill="none" stroke="${validAccentColor}" stroke-width="0.8" />
          <text x="${w - 140}" y="144" font-family="'${brandFont}', Georgia, serif" font-size="12px" fill="${validAccentColor}" text-anchor="middle">L</text>`;
      }
      const brandFontBase64 = await fetchGoogleFontBase64(brandFont);
      const bodyFontBase64 = await fetchGoogleFontBase64(bodyFont);

      // Pre-compile dynamic font faces to avoid nested template literal parsing issues
      const brandFontFace = brandFontBase64
        ? `@font-face {
            font-family: '${brandFont}';
            src: url('data:font/ttf;base64,${brandFontBase64}') format('truetype');
            font-weight: bold;
            font-style: normal;
          }`
        : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(brandFont)}:wght@700&display=swap');`;

      const bodyFontFace = bodyFontBase64
        ? `@font-face {
            font-family: '${bodyFont}';
            src: url('data:font/ttf;base64,${bodyFontBase64}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }`
        : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyFont)}:wght@400&display=swap');`;

      // Pre-compile conditional SVG components
      const watermarkText = (layoutType !== 'full_bleed_clean' && layoutType !== 'poster_cover')
        ? `<text x="${w / 2}" y="${h / 2.2}" fill="#ffffff" fill-opacity="0.10" font-family="'${brandFont}', system-ui, sans-serif" font-size="28px" font-weight="bold" transform="rotate(-30 ${w / 2} ${h / 2.2})" text-anchor="middle" letter-spacing="8px">
            AUTHENTIC WORK • ${escapedSpacedName}
          </text>`
        : '';

      const footerSection = (layoutType !== 'poster_cover')
        ? `<rect x="0" y="${h - 85}" width="${w}" height="85" class="footer-bg" />
          ${footerBrandToggle ? `<text x="60" y="${h - 35}" class="footer-brand">${escapedSpacedName}</text>` : ''}
          <text x="${w - 60}" y="${h - 35}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`
        : '';

      const svgString = `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>
              ${brandFontFace}
              ${bodyFontFace}
              
              .overlay-text { font-family: '${brandFont}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 26px; font-weight: bold; fill: ${dynamicTextColor}; letter-spacing: ${headingLetterSpacing}; }
              .text-centered { text-anchor: middle; }
              .text-left { text-anchor: start; }
              .footer-bg { fill: ${validSecondaryColor}; }
              .footer-brand { font-family: '${brandFont}', system-ui, sans-serif; font-size: ${footerFontSize}px; font-weight: bold; fill: ${dynamicFooterTextColor}; letter-spacing: ${footerLetterSpacing}px; text-anchor: start; }
              .footer-tracker { font-family: '${bodyFont}', system-ui, sans-serif; font-size: 13px; font-weight: normal; fill: ${dynamicFooterTextColor}; letter-spacing: 1px; text-anchor: end; }
            </style>
          </defs>
          
          ${watermarkText}
          ${visualAdditions}
          ${textPanelSvg}
          ${footerSection}
        </svg>
      `;

      // Render the SVG at 300 DPI high density and resize it back to canvas bounds to get razor-sharp high-definition text
      const highResSvgBuffer = await sharp(Buffer.from(svgString), { density: 300 })
        .resize(w, h)
        .png()
        .toBuffer();

      // ── Step 4: Composite image scaling and margins based on layout ──
      let compositeBuffer: Buffer;
      if (layoutType === 'full_bleed_clean' || layoutType === 'translucent_split' || layoutType === 'poster_cover' || layoutType === 'asymmetric_monogram' || layoutType === 'transparent_scrim' || layoutType === 'gold_ticket' || layoutType === 'newspaper_editorial' || layoutType === 'book_magazine_cover' || layoutType === 'letter_envelope') {
        const sourceImage = (imageBuffer && imageBuffer.length > 0) ? sharp(imageBuffer) : sharp({
          create: {
            width: w,
            height: h,
            channels: 3,
            background: validBackgroundColor
          }
        });
        compositeBuffer = await sourceImage
          .resize(w, h, { fit: 'cover' })
          .composite([{ input: highResSvgBuffer, blend: 'over' }])
          .png()
          .toBuffer();
      } else {
        compositeBuffer = await baseImage
          .extend({
            top: compositeTop,
            bottom: compositeBottom,
            left: compositeLeft,
            right: compositeRight,
            background: validBackgroundColor
          })
          .composite([{ input: highResSvgBuffer, blend: 'over' }])
          .png()
          .toBuffer();
      }

      // ── Step 5: Finish Control (Overlay microscopic gray noise overlay for matte texture) ──
      try {
        const noiseSize = 256;
        const noisePixels = Buffer.alloc(noiseSize * noiseSize * 2); // 2 channels: Grayscale (Y) + Alpha (A)
        for (let i = 0; i < noisePixels.length; i += 2) {
          noisePixels[i] = Math.floor(Math.random() * 255); // Grayscale value
          noisePixels[i + 1] = 5; // Alpha opacity (~2% opacity: 5/255)
        }
        const noiseBuffer = await sharp(noisePixels, { raw: { width: noiseSize, height: noiseSize, channels: 2 } })
          .resize(w, h)
          .png()
          .toBuffer();

        compositeBuffer = await sharp(compositeBuffer)
          .composite([{ input: noiseBuffer, blend: 'overlay' }])
          .png()
          .toBuffer();
      } catch (noiseErr) {
        console.warn('[Sharp Finish Control Warning] Could not apply grain texture, falling back to clean image:', noiseErr);
      }

      return compositeBuffer.toString('base64');
    } catch (err) {
      console.error('Failed to apply Sharp text overlay. Returning raw model output:', err);
      return base64Image;
    }
  }
}
