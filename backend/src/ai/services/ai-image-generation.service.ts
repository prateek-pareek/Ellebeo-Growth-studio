// ============================================================================
// ai-image-generation.service.ts â€” Multi-model Image Generation (Gemini > GPT-Image-1)
// Takes real before/after photo + brand context â†’ beautiful designed image
//
// CRITICAL ARCHITECTURE NOTE:
// - Gemini (gemini-2.5-flash-image): Uses vision+generation. Treats input photo as
//   reference context to preserve. SAFE for face/identity â€” will NOT beautify or alter faces.
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
import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { ModelRouter } from '../orchestrator/model-router';
import type { VisionAnalysisResult } from '../types/chain-output.types';
import { resolveLayoutTemplate, BASE_TREATMENTS, TEXT_TEMPLATES, DECORATIONS, LAYOUT_TEMPLATES } from '../config/layout-renderers';
import { TemplateAgentService } from './template-agent.service';
import templateLibraryData from '../config/template-library.json';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export interface GeneratedSlide {
  url: string;
  label: string;
  title: string;
  variants?: {
    gemini?: string;
    dalle?: string;
  };
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
  if (!url.startsWith('http')) {
    try {
      return await fs.promises.readFile(url);
    } catch (err) {
      throw new Error(`Failed to read local file ${url}: ${err}`);
    }
  }

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

export async function processPortraitFit(imageBuffer: Buffer, targetW: number, targetH: number, backgroundColor: string = '#F7F4EF'): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const inputW = metadata.width || targetW;
    const inputH = metadata.height || targetH;

    let baseSharp = sharp(imageBuffer);

    // Upscale if smaller than 80% of target canvas to prevent pixelation
    if (inputW < targetW * 0.8 || inputH < targetH * 0.8) {
      baseSharp = baseSharp.resize({
        width: Math.max(inputW * 2, targetW),
        height: Math.max(inputH * 2, targetH),
        fit: 'inside',
        kernel: 'lanczos3'
      });
      // Skip aggressive sharpening for very small images as it creates artifacts
    } else {
      // Apply aggressive HD sharpening, light color modulation, and gamma correction for premium output
      baseSharp = baseSharp.sharpen({ sigma: 2.2, m1: 0.6, m2: 3.5 });
    }

    const enhancedBuffer = await baseSharp
      .modulate({ saturation: 1.06, brightness: 1.02 })
      .gamma(1.1)
      .toBuffer();

    // Always contain the original photo fully and layer it on a blurred version to prevent awkward zooming or cropping of faces
    const blurBase = await sharp(enhancedBuffer)
      .resize(targetW, targetH, { fit: 'cover' })
      .blur(50)
      .toBuffer();

    // Tint the blur with the brand's background color to create a unified premium look
    const colorOverlaySvg = `<svg width="${targetW}" height="${targetH}"><rect x="0" y="0" width="${targetW}" height="${targetH}" fill="${backgroundColor}" fill-opacity="0.45" /></svg>`;
    const tintedBg = await sharp(blurBase)
      .composite([{ input: Buffer.from(colorOverlaySvg), blend: 'over' }])
      .png()
      .toBuffer();

    const containedImg = await sharp(enhancedBuffer)
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    return await sharp(tintedBg)
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

CRITICAL â€” this is the BEFORE image in a before/after transformation post:
- Preserve the photo EXACTLY as it is â€” no color grading, no filters, no enhancements, no cinematic treatment
- The photo must look raw and natural so the contrast with the AFTER photo is powerful and believable
- Do NOT add bokeh, light leaks, glamour lighting, or any beautification effect
- Do NOT make the skin/hair/nails look better than reality

ONLY ADD:
- A small, clean text label "${overlayText}" â€” place it in the bottom-left corner
- Use a thin semi-transparent dark pill or rectangle behind the text (rgb 0,0,0 at 55% opacity)
- Text in clean white, small size, all-caps tracking â€” minimal, unobtrusive
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

PHOTO PRESERVATION (ABSOLUTE â€” non-negotiable):
- Preserve the original photo exactly as it is â€” this is the HERO of the image.
- The person in the photo must remain COMPLETELY UNCHANGED in every detail.
- Do NOT modify ANY facial features, facial structure, skin tone, eye placement, nose shape, mouth, chin, or jawline.
- Do NOT alter facial expressions or head position.
- Do NOT retouch, airbrush, smooth, or beautify skin or faces â€” keep raw, real, and textured.
- Do NOT apply any filters, color grading, or tone adjustments to the face or skin.
- Do NOT change hair color, hair texture, or hair styling.
- Do NOT modify body shape, proportion, or posture.
- Do NOT crop, remove, or replace the background. Keep the natural environment, background wood, towels, and salon context fully intact.
- Do NOT add bokeh, light leaks, glamour lighting, or any beautification effects.
- No AI-generated faces, bodies, or features â€” only add design overlays to EXISTING elements.

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
  private templateAgent: TemplateAgentService;

  constructor() {
    this.templateAgent = new TemplateAgentService();
  }

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
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
  }): Promise<{ url: string; variants?: { gemini?: string; dalle?: string } }> {
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
      accentBrandColor = '#D4A373',
      depthBrandColor = '#1E1E1C',
      moodboardVisionSummary,
      visionResult,
    } = params;

    // Fast-path: Skip AI image generation entirely for text-only editorial layouts
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
        accentBrandColor,
        outputSize,
        captionText: overlayText,
        visionResult,
      });
      const url = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
      return { url };
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
        accentBrandColor,
        captionText: overlayText,
        visionResult,
      });
      const url = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
      return { url };
    }

    // Compile dynamic lifestyle/studio assets for non-booking educational/moodboard posts
    // Subjects use Brand DNA aesthetic direction instead of hardcoded beige/travertine
    const brandAestheticHint = aesthetic || 'minimal, premium beauty editorial';
    const lifestyleSubjects = [
      `a luxury minimalist ${serviceType} treatment room in ${brandAestheticHint} style, using brand color palette: primary ${brandColor}, secondary ${secondaryColor}, background ${backgroundBrandColor}, accent ${accentBrandColor}`,
      `close-up macro shot of elegant, organic botanical ingredients and natural elements used in ${serviceType}, styled in ${brandAestheticHint} aesthetic, color-matched to palette: ${brandColor}, ${secondaryColor}, ${accentBrandColor}`,
      `clean architectural details of a premium ${serviceType} space with beautiful natural lighting and shadows, color palette matching: primary ${brandColor}, secondary ${secondaryColor}, background ${backgroundBrandColor}`,
      `macro photography of smooth textures, glass serum bottles, or high-end products related to ${serviceType}, styled in ${brandAestheticHint} aesthetic, brand colors: ${brandColor}, ${secondaryColor}, ${accentBrandColor}`,
      `an abstract, flowing composition of soft silk, water ripples, or natural textures evoking the feeling of a premium ${serviceType}, in exact brand colors: ${brandColor}, ${secondaryColor}, ${accentBrandColor}`,
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

    // Build moodboard context block for the image generation AI
    const moodboardBlock = moodboardVisionSummary
      ? `\n- MOODBOARD DIRECTION (from brand reference images — match this feel): ${moodboardVisionSummary}`
      : '';

    const facePreservationClause = `
    
CRITICAL IMAGE REQUIREMENTS:
- Subject: ${chosenSubject}
- BRAND COLOR PALETTE (MANDATORY — the generated image MUST use these exact colors as the dominant palette):
  * Primary brand color: ${brandColor}
  * Secondary brand color: ${secondaryColor}
  * Background color: ${backgroundBrandColor}
  * Accent color: ${accentBrandColor}
  * The image's dominant tones, surfaces, backgrounds, and accents MUST visually match these hex colors. Do NOT invent your own color scheme.
- Aesthetic style: ${brandAestheticHint}. ${rankingStyleText}${moodboardBlock}
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
        console.log(`Generating GPT Image 1 image for slide ${index}...`);
        const response = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: cleanPrompt,
          size: outputSize === '1024x1536' ? '1024x1536' as any : '1024x1024',
        });
        const base64 = response.data?.[0]?.b64_json;
        if (base64) {
          return base64;
        }
        return null;
      } catch (err) {
        console.warn(`GPT Image 1 generation failed for slide ${index}:`, err);
        return null;
      }
    })();

    const [geminiResult, dalleResult] = await Promise.all([geminiTask, dalleTask]);

    // Both models should generate - return both for technician to choose
    if (geminiResult || dalleResult) {
      console.log(`Image generation finished for slide ${index}:`);
      if (geminiResult) console.log(`   • Gemini: Generated ✅`);
      if (dalleResult) console.log(`   • DALL-E: Generated ✅`);
      if (!geminiResult) console.log(`   • Gemini: Failed ❌`);
      if (!dalleResult) console.log(`   • DALL-E: Failed ❌`);

      // Use primary result for main display, store both for technician choice
      base64 = geminiResult || dalleResult || '';
    } else {
      throw new Error(`No image generated from any model for slide ${index}`);
    }

    if (!base64) throw new Error(`OpenAI image generation failed completely for slide ${index}`);

    // Apply branding/text overlay to both models' images
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
      accentBrandColor,
      depthBrandColor,
      outputSize,
      captionText: overlayText,
      visionResult,
    });

    // Upload primary image
    const primaryUrl = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}_primary`);

    // If both models generated images, also upload the alternative
    let variants: { gemini?: string; dalle?: string } | undefined;
    if (geminiResult && dalleResult && generatorModel === 'both') {
      // Apply overlay to alternative image for comparison
      const altBase64 = geminiResult === base64 ? dalleResult : geminiResult;
      const brandedAltBase64 = await this.overlayBrandingAndText({
        base64Image: altBase64,
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
        accentBrandColor,
        outputSize,
        captionText: overlayText,
        visionResult,
      });

      const altUrl = await uploadBase64ToFirebase(brandedAltBase64, tenantId, `slide_${index}_alt`);

      // Return both variants for technician choice
      variants = {
        gemini: geminiResult === base64 ? primaryUrl : altUrl,
        dalle: dalleResult === base64 ? primaryUrl : altUrl,
      };
    }

    return { url: primaryUrl, variants };
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
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, ...rest } = params;
    const total = concepts.length;

    // Derive pool dynamically from JSON config — never goes stale when new layouts are added
    const layoutPool = Object.keys(templateLibraryData);

    // Prepare vision summary mapping
    const isZoomedFace = moodboardVisionSummary ? (moodboardVisionSummary.toLowerCase().includes('macro') || moodboardVisionSummary.toLowerCase().includes('zoomed') || moodboardVisionSummary.toLowerCase().includes('close-up')) : false;

    const visionResultStub = isZoomedFace ? { framingType: 'macro', facesDetected: true } as any : undefined;

    // Select unique layouts intelligently using Template Agent
    const uniqueLayoutsForSlides: string[] = [];
    let pool = [...layoutPool];

    for (let i = 0; i < total; i++) {
      let chosen = '';
      if (i === 0) {
        // Cover uses agent
        const agentDecision = await this.templateAgent.selectTemplate({
          brief: concepts[i]?.overlayText || 'Cover slide',
          brandName: params.businessName || 'Brand',
          aesthetic: params.aesthetic || 'minimal editorial',
          textLength: (concepts[i]?.overlayText || '').length,
          slideIndex: 0,
          totalSlides: total,
          visionResult: visionResultStub,
          excludeLayouts: uniqueLayoutsForSlides
        });
        chosen = agentDecision.selected_layout_id;
      } else {
        // Body slides use agent too
        const agentDecision = await this.templateAgent.selectTemplate({
          brief: concepts[i]?.overlayText || 'Body slide',
          brandName: params.businessName || 'Brand',
          aesthetic: params.aesthetic || 'minimal editorial',
          textLength: (concepts[i]?.overlayText || '').length,
          slideIndex: i,
          totalSlides: total,
          visionResult: visionResultStub,
          excludeLayouts: uniqueLayoutsForSlides
        });
        chosen = agentDecision.selected_layout_id;

        // Prevent dupes locally
        if (uniqueLayoutsForSlides.includes(chosen) && pool.length > 0) {
          chosen = pool[Math.floor(Math.random() * pool.length)] || chosen;
        }
      }

      uniqueLayoutsForSlides.push(chosen);
      pool = pool.filter(l => l !== chosen);
      if (pool.length === 0) pool = [...layoutPool];
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
          const result = await this.generateSlide({
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
            brandColor: rest.brandColor,
            secondaryColor: rest.secondaryColor,
            totalSlides: total,
            layoutType: currentSlideLayout,
            visualRanking,
            capitalizationRule,
            footerBrandToggle,
            generatorModel,
            backgroundBrandColor,
            accentBrandColor,
            depthBrandColor,
            moodboardVisionSummary,
            visionResult: visionResult ?? visionResultStub,
          });
          return {
            url: result.url,
            title: concept.title,
            label: `SLIDE ${String(concept.index).padStart(2, '0')}`,
            variants: result.variants
          };
        } catch (err) {
          console.error(`Failed to generate slide ${concept.index}:`, err);
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
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, ...rest } = params;
    const total = frames.length;

    // Derive pool dynamically from JSON config — never goes stale when new layouts are added
    const layoutPool = Object.keys(LAYOUT_TEMPLATES);

    // Prepare vision summary mapping
    const isZoomedFace = moodboardVisionSummary ? (moodboardVisionSummary.toLowerCase().includes('macro') || moodboardVisionSummary.toLowerCase().includes('zoomed') || moodboardVisionSummary.toLowerCase().includes('close-up')) : false;

    const visionResultStub = isZoomedFace ? { framingType: 'macro', facesDetected: true } as any : undefined;

    // Select unique layouts intelligently using Template Agent
    const uniqueLayoutsForFrames: string[] = [];
    let pool = [...layoutPool];

    for (let i = 0; i < total; i++) {
      let chosen = '';
      if (i === 0) {
        // Cover uses agent
        const agentDecision = await this.templateAgent.selectTemplate({
          brief: frames[i]?.overlayText || 'Cover frame',
          brandName: params.businessName || 'Brand',
          aesthetic: params.aesthetic || 'minimal editorial',
          textLength: (frames[i]?.overlayText || '').length,
          slideIndex: 0,
          totalSlides: total,
          visionResult: visionResultStub
        });
        chosen = agentDecision.selected_layout_id;
      } else {
        // Body frames use agent too
        const agentDecision = await this.templateAgent.selectTemplate({
          brief: frames[i]?.overlayText || 'Body frame',
          brandName: params.businessName || 'Brand',
          aesthetic: params.aesthetic || 'minimal editorial',
          textLength: (frames[i]?.overlayText || '').length,
          slideIndex: i,
          totalSlides: total,
          visionResult: visionResultStub
        });
        chosen = agentDecision.selected_layout_id;

        // Prevent dupes locally
        if (uniqueLayoutsForFrames.includes(chosen) && pool.length > 0) {
          chosen = pool[Math.floor(Math.random() * pool.length)] || chosen;
        }
      }

      uniqueLayoutsForFrames.push(chosen);
      pool = pool.filter(l => l !== chosen);
      if (pool.length === 0) pool = [...layoutPool];
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
          const result = await this.generateSlide({
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
            brandColor: rest.brandColor,
            secondaryColor: rest.secondaryColor,
            totalSlides: total,
            layoutType: currentSlideLayout,
            visualRanking,
            capitalizationRule,
            footerBrandToggle,
            generatorModel,
            backgroundBrandColor,
            accentBrandColor,
            depthBrandColor,
            moodboardVisionSummary,
            visionResult: visionResult ?? visionResultStub,
          });
          return {
            url: result.url,
            title: frame.title,
            label: `FRAME ${String(frame.index).padStart(2, '0')}`,
            variants: result.variants
          };
        } catch (err) {
          console.error(`Failed to generate frame ${frame.index}:`, err);
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
    depthBrandColor?: string;
    outputSize?: string;
    captionText: string;
    visionResult?: VisionAnalysisResult;
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
      accentBrandColor = '#D4A373',
      depthBrandColor = '#1E1E1C',
      outputSize,
      visionResult
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

      let imageBuffer: Buffer;
      let isStory = false;
      let originalW = 1080;
      let originalH = 1080;
      let photoDataUri = '';

      if (base64Image) {
        imageBuffer = Buffer.from(base64Image, 'base64');
        const metadata = await sharp(imageBuffer).metadata();
        originalW = metadata.width || 1024;
        originalH = metadata.height || 1024;
        const photoMimeType = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'webp' ? 'image/webp' : 'image/png';
        photoDataUri = `data:${photoMimeType};base64,${base64Image}`;
        isStory = originalH > originalW;
      } else {
        isStory = outputSize === '1024x1536';
        originalW = 1080;
        originalH = isStory ? 1620 : 1080;
        imageBuffer = await sharp({
          create: {
            width: originalW,
            height: originalH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        }).png().toBuffer();
        photoDataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      }

      // Force high-definition target canvas dimensions (Instagram standards)
      const w = 1080;
      const h = isStory ? 1620 : 1080;

      // Ensure every slide has text for layouts that use randomized_overlay
      let finalOverlayText = overlayText;
      if (!overlayText || overlayText.trim().length === 0) {
        if (layoutType === 'passepartout_clean' || layoutType === 'full_bleed_clean') {
          finalOverlayText = businessName || 'AUTHENTIC WORK';
        }
      }
      const hasText = finalOverlayText && finalOverlayText.trim().length > 0;

      const lines: string[] = [];
      if (hasText) {
        const words = finalOverlayText.split(/\s+/);
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

      // â”€â”€ MAPPING STYLE RANKINGS DYNAMICALLY (Production-Grade Lookup) â”€â”€
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

      // Dynamic brand footer spacing based on name length to prevent overlaps/clippings but keep it readable (not micro)
      let footerLetterSpacing = 6;
      let footerFontSize = 18; // Base increased from 13 to 18

      if (escapedSpacedName.length < 15) {
        // Short names can be larger and more spaced out
        footerFontSize = 24;
        footerLetterSpacing = 8;
      } else if (escapedSpacedName.length > 35) {
        // Very long names
        footerLetterSpacing = 2;
        footerFontSize = 14; // Minimum readability increased from 10 to 14
      } else if (escapedSpacedName.length > 25) {
        // Medium-long names
        footerLetterSpacing = 3;
        footerFontSize = 16;
      }

      // True Passepartout Layout Calculations using dynamic borders
      const paddingX = Math.floor(w * borderPercent);
      const paddingTop = Math.floor(h * borderPercent);
      const paddingBottom = 200; // Deep bottom margin for text & footer

      const innerW = w - (paddingX * 2);
      const innerH = h - (paddingTop + paddingBottom);

      // â”€â”€ Step 1: Process Base Image â€” dispatched from layout-templates.config.json â”€â”€
      const template = resolveLayoutTemplate(layoutType, visualRanking);

      const baseResult = await BASE_TREATMENTS[template.base]!({
        layoutType,
        imageBuffer,
        beforePhotoUrl,
        w, h,
        paddingX, paddingTop, paddingBottom,
        innerW, innerH,
        validBrandColor,
        validSecondaryColor,
        validBackgroundColor,
        downloadImageAsBuffer,
      });
      let baseImage = baseResult.baseImage;
      let compositeTop = baseResult.compositeTop;
      let compositeBottom = baseResult.compositeBottom;
      let compositeLeft = baseResult.compositeLeft;
      let compositeRight = baseResult.compositeRight;




      // â”€â”€ Step 2: Auto-detect Contrast for Borderless Poster Covers & Slide Backgrounds â”€â”€
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

      // Determine text color using luminance to guarantee WCAG contrast
      // Use the exact background color that the text will sit on depending on the layout type
      const isFullBleed = template.base === 'full_bleed_base' || template.base === 'universal_dynamic_base' || layoutType === 'look_number_plate';

      // If it's full bleed, the text sits on the photo. We default to using depthBrandColor unless we calculate photo luminance.
      // If it's bordered/split, the text sits on the validBackgroundColor.
      const textSurfaceColor = isFullBleed ? validBrandColor : validBackgroundColor;

      const surfaceLuminance = getLuminance(textSurfaceColor);
      const isLightSurface = surfaceLuminance > 150; // Threshold for legibility
      const dynamicTextColor = isLightSurface ? depthBrandColor : validBackgroundColor; // Dark on Light, Light on Dark

      const footerLuminance = getLuminance(validSecondaryColor);
      const isLightFooter = footerLuminance > 150;
      const dynamicFooterTextColor = isLightFooter ? depthBrandColor : validBackgroundColor;

      let posterTextColor = '#FFFFFF';
      if (template.textTemplate === 'poster_high_contrast') {
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

      // ── Step 3: Assemble SVG overlays — dispatched from layout-templates.config.json ──
      const textCtx = {
        layoutType, w, h, dynamicFontSize, dyOffset, escapedLines, lines, overlayText: finalOverlayText, maxLength,
        dynamicTextColor, posterTextColor, validBrandColor, validSecondaryColor,
        brandFont, bodyFont, escapedSpacedName, photoDataUri, escapeXml,
        faceCoordinates: visionResult?.faceCoordinates,
      };
      const textPanelSvg = hasText && template.textTemplate
        ? (TEXT_TEMPLATES[template.textTemplate]?.(textCtx) ?? '')
        : '';

      const decoCtx = {
        layoutType, w, h, paddingX, paddingTop, paddingBottom, innerW, innerH,
        validBrandColor, validSecondaryColor, validBackgroundColor, validAccentColor, brandFont, rawName, photoDataUri,
        escapedLines, dyOffset, dynamicFontSize, dynamicTextColor, overlayText: finalOverlayText, maxLength,
      };
      const visualAdditions = template.decoration
        ? (DECORATIONS[template.decoration]?.(decoCtx) ?? '')
        : '';

      // Fetch the custom fonts from Brand DNA dynamically as Base64 to embed directly in the SVG
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
        : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(brandFont)}:wght@700&amp;display=swap');`;

      const bodyFontFace = bodyFontBase64
        ? `@font-face {
            font-family: '${bodyFont}';
            src: url('data:font/ttf;base64,${bodyFontBase64}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }`
        : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyFont)}:wght@400&amp;display=swap');`;

      // Pre-compile conditional SVG components
      const watermarkText = (layoutType !== 'full_bleed_clean' && layoutType !== 'poster_cover')
        ? `<text x="${w / 2}" y="${h / 2.2}" fill="#ffffff" fill-opacity="0.10" font-family="'${brandFont}', system-ui, sans-serif" font-size="28px" font-weight="bold" transform="rotate(-30 ${w / 2} ${h / 2.2})" text-anchor="middle" letter-spacing="8px">
            AUTHENTIC WORK â€¢ ${escapedSpacedName}
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
          
          <!-- Anti-theft transparent brand watermark across the image area (not shown on clean full bleed) -->
          ${template.showWatermark ? `
          <text x="${w / 2}" y="${h / 2.2}" fill="#ffffff" fill-opacity="0.10" font-family="'${brandFont}', system-ui, sans-serif" font-size="28px" font-weight="bold" transform="rotate(-30 ${w / 2} ${h / 2.2})" text-anchor="middle" letter-spacing="8px">
            AUTHENTIC WORK â€¢ ${escapedSpacedName}
          </text>
          ` : ''}

          ${visualAdditions}
          ${textPanelSvg}
          
          <!-- Brand identity mark: randomly placed so the grid stays diverse -->
          ${template.showFooter ? (() => {
          const footerStyle = ((index ?? 0) + (totalSlides ?? 4)) % 5;
          if (footerStyle === 0) {
            // Classic footer bar
            return `<rect x="0" y="${h - 60}" width="${w}" height="60" class="footer-bg" />
              <text x="60" y="${h - 25}" class="footer-brand">${escapedSpacedName}</text>
              <text x="${w - 60}" y="${h - 25}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 1) {
            // Top-left corner floating wordmark
            return `<text x="50" y="52" font-family="'${bodyFont}', system-ui, sans-serif" font-size="13px" font-weight="600" letter-spacing="4px" fill="${validSecondaryColor}" fill-opacity="0.85" text-transform="uppercase">${escapedSpacedName}</text>
              <line x1="50" y1="62" x2="${Math.min(50 + escapedSpacedName.length * 8, 300)}" y2="62" stroke="${validSecondaryColor}" stroke-width="1" stroke-opacity="0.5" />`;
          } else if (footerStyle === 2) {
            // Bottom-right corner slide counter only — super minimal
            return `<text x="${w - 60}" y="${h - 25}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 3) {
            // Vertical side tag — editorial magazine style
            return `<text x="${w - 24}" y="${Math.round(h * 0.62)}" font-family="'${bodyFont}', system-ui, sans-serif" font-size="11px" font-weight="600" letter-spacing="5px" fill="${validBrandColor}" fill-opacity="0.7" transform="rotate(90 ${w - 24} ${Math.round(h * 0.62)})">${escapedSpacedName}</text>`;
          } else {
            // Pure transparent — no footer at all for this slide
            return '';
          }
        })() : ''}
        </svg>
      `;

      // Render the SVG at 300 DPI high density and resize it back to canvas bounds to get razor-sharp high-definition text
      const highResSvgBuffer = await sharp(Buffer.from(svgString), { density: 300 })
        .resize(w, h)
        .png()
        .toBuffer();

      // â”€â”€ Step 4: Composite image scaling and margins â€” grouped by the base treatment â”€â”€
      let compositeBuffer: Buffer;
      if (template.base === 'solid_canvas_full') {
        // baseImage is already a fully-built w x h canvas (solid panel + photo embedded via SVG)
        compositeBuffer = await baseImage
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

      // â”€â”€ Step 5: Finish Control (Overlay microscopic gray noise overlay for matte texture) â”€â”€
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
