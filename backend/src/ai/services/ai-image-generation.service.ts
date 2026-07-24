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
import { resolveLayoutTemplate, BASE_TREATMENTS, TEXT_TEMPLATES, DECORATIONS, LAYOUT_TEMPLATES, registerDynamicLayout } from '../config/layout-renderers';
import { TemplateAgentService } from './template-agent.service';
import { LayoutAssemblerService } from './template-engine/layout-assembler.service';
import templateLibraryData from '../config/template-library.json';
import { ThemeEngine } from './template-engine/engines/theme-engine';
import { CompositionEngine, TemplateIntent } from './template-engine/engines/composition-engine';

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
  if (!url) throw new Error('Empty URL provided to downloadImageAsBuffer');
  if (url.startsWith('data:image/')) {
    const base64Data = url.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }

  if (!url.startsWith('http')) {
    try {
      const cleanPath = url.replace(/^file:\/\/\/?/, '');
      return await fs.promises.readFile(cleanPath);
    } catch (err) {
      throw new Error(`Failed to read local file ${url}: ${err}`);
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    throw new Error(`Failed to download image from ${url}: ${err}`);
  }
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
  if (!fontFamily || ['sans-serif', 'serif', 'system-ui', 'monospace', 'arial', 'helvetica'].includes(fontFamily.toLowerCase())) {
    return '';
  }

  if (fontCache[fontFamily] !== undefined) {
    return fontCache[fontFamily];
  }

  try {
    const escapedFamily = encodeURIComponent(fontFamily);
    const googleFontsCssUrl = `https://fonts.googleapis.com/css2?family=${escapedFamily}&display=swap`;

    const cssText = await new Promise<string>((resolve, reject) => {
      const req = https.get(googleFontsCssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 3000
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Font CSS fetch timeout')); });
      req.on('error', reject);
    });

    const urlMatch = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!urlMatch || !urlMatch[1]) {
      fontCache[fontFamily] = '';
      return '';
    }

    const fontUrl = urlMatch[1];
    const fontBuffer = await new Promise<Buffer>((resolve, reject) => {
      const req = https.get(fontUrl, { timeout: 3000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Font binary download timeout')); });
      req.on('error', reject);
    });

    const base64 = fontBuffer.toString('base64');
    fontCache[fontFamily] = base64;
    return base64;
  } catch (err: any) {
    console.warn(`[FONT ENGINE] Could not fetch Google Font '${fontFamily}' dynamically (${err.message}). Using SVG font-family fallback.`);
    fontCache[fontFamily] = '';
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
  private readonly templateAgent: TemplateAgentService;
  private readonly themeEngine: ThemeEngine;
  private readonly compositionEngine: CompositionEngine;

  constructor() {
    this.templateAgent = new TemplateAgentService();
    this.themeEngine = new ThemeEngine();
    this.compositionEngine = new CompositionEngine();
  }

  async generateSlide(params: {
    photoUrl: string;
    beforePhotoUrl?: string;
    overlayText: string;
    headline?: string;
    subheadline?: string;
    cta?: string;
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
    generatorModel?: 'gemini' | 'dalle' | 'both' | 'none';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
    templateIntent?: 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
  }): Promise<{ url: string; variants?: { gemini?: string; dalle?: string } }> {
    const {
      photoUrl, beforePhotoUrl, overlayText, headline, subheadline, cta, index, isFirst, isLast, isBeforePhoto,
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
      templateIntent = 'educational',
      designSpec
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

    const isRealClientPhoto = photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('data:image/') || photoUrl.includes('raw_assets') || photoUrl.includes('storage') || photoUrl.includes('temp'));

    if (isRealClientPhoto || generatorModel === 'none') {
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
        designSpec,
      });
      const url = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
      return { url };
    }

    // Bypass AI image generation entirely for procedural text-only families
    if (layoutType === 'text_palette_minimal' || !photoUrl && layoutType?.includes('text_')) {
       // Create a minimal 1x1 transparent pixel base64. The renderer will cover it with SVG backgrounds.
       const transparent1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
       const brandedBase64 = await this.overlayBrandingAndText({
         base64Image: transparent1x1,
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
         designSpec,
       });
       const url = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
       return { url, variants: { gemini: url, dalle: url } };
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
      headline,
      subheadline,
      cta,
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
      designSpec,
    });

    // Upload primary image
    const primaryUrl = await uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}_primary`);

    // If both models generated images, also upload the alternative
    let variants: { gemini?: string; dalle?: string } | undefined;
    if (geminiResult && dalleResult && generatorModel === 'both') {
      // Apply overlay to alternative image for comparison using alternative text logic
      const altBase64 = geminiResult === base64 ? dalleResult : geminiResult;
      
      // Simple heuristic to create a different text variation for the alt model
      // so the slides don't look completely identical. 
      // If it's a cover slide, we might use a slightly different hook format.
      let altOverlayText = overlayText;
      if (overlayText.length > 20 && overlayText.includes(' ')) {
        const words = overlayText.split(' ');
        if (words.length > 5) {
            altOverlayText = words.slice(0, Math.ceil(words.length * 0.8)).join(' ') + '...';
        } else {
            altOverlayText = overlayText.toUpperCase();
        }
      } else {
        altOverlayText = overlayText.toUpperCase() !== overlayText ? overlayText.toUpperCase() : overlayText.toLowerCase();
      }

      const brandedAltBase64 = await this.overlayBrandingAndText({
        base64Image: altBase64,
        overlayText: altOverlayText,
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
        captionText: altOverlayText,
        visionResult,
        designSpec,
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
    concepts: Array<{ index: number; title: string; overlayText: string; headline?: string; subheadline?: string; cta?: string; }>;
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
    generatorModel?: 'gemini' | 'dalle' | 'both' | 'none';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
    templateIntent?: 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, templateIntent = 'educational', ...rest } = params;
    const total = concepts.length;

    // Derive pool dynamically from JSON config — never goes stale when new layouts are added
    const layoutPool = Object.keys(templateLibraryData);

    // Prepare vision summary mapping
    const isZoomedFace = moodboardVisionSummary ? (moodboardVisionSummary.toLowerCase().includes('macro') || moodboardVisionSummary.toLowerCase().includes('zoomed') || moodboardVisionSummary.toLowerCase().includes('close-up')) : false;

    const visionResultStub = isZoomedFace ? { framingType: 'macro', facesDetected: true } as any : undefined;

    // Select unique layouts intelligently using Template Agent
    const uniqueLayoutsForSlides: string[] = [];
    let pool = [...layoutPool];

    // Select unique layouts intelligently using Template Agent sequentially to ensure diversity and history tracking works
    const agentDecisions: Array<{ selected_layout_id: string; reasoning: string; designSpec?: any }> = [];
    
    for (let i = 0; i < total; i++) {
      const concept = concepts[i];
      const decision = await this.templateAgent.selectTemplate({
        brief: concept.overlayText || 'Slide',
        brandName: params.businessName || 'Brand',
        aesthetic: (params.visualRanking && params.visualRanking.length > 0) ? params.visualRanking[0] : 'clean and modern',
        textLength: (concept.overlayText || '').length,
        slideIndex: i,
        totalSlides: total,
        visionResult: visionResultStub,
        excludeLayouts: uniqueLayoutsForSlides
      });
      agentDecisions.push(decision);
      uniqueLayoutsForSlides.push(decision.selected_layout_id);
    }

    // Instantiate the layout assembler to handle forced procedural layouts
    const layoutAssembler = new LayoutAssemblerService();
    
    // Inject a "breather" slide (text-only, aesthetic background) into the middle of the carousel
    // This provides visual relief and answers the user request for a "random color palette text slide"
    let breatherIndex = -1;
    if (total >= 4) {
      // Pick slide index 1 or 2 (2nd or 3rd slide) randomly
      breatherIndex = Math.floor(Math.random() * (total - 2)) + 1;
    }

    for (let i = 0; i < total; i++) {
      let chosen = agentDecisions[i].selected_layout_id;
      
      if (i === breatherIndex) {
        chosen = 'text_palette_minimal';
        agentDecisions[i].reasoning = 'Forced text breather slide for visual pacing';
      }
      
      // Let the AI Art Director's choice pass through (or breather override)
      uniqueLayoutsForSlides[i] = chosen; // Override since it was already pushed in the loop above
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
        
        // Let the AI Art Director's choice apply to the last slide too
        
        try {
          const result = await this.generateSlide({
            photoUrl: photoUrl || '',
            beforePhotoUrl,
            overlayText: concept.overlayText,
            headline: concept.headline,
            subheadline: concept.subheadline,
            cta: concept.cta,
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
            templateIntent,
            designSpec: agentDecisions[i].designSpec,
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
    frames: Array<{ index: number; title: string; overlayText: string; headline?: string; subheadline?: string; cta?: string; }>;
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
    generatorModel?: 'gemini' | 'dalle' | 'both' | 'none';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
    templateIntent?: any;
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, templateIntent, designSpec, ...rest } = params;
    const total = frames.length;

    // Derive pool dynamically from JSON config — never goes stale when new layouts are added
    const layoutPool = Object.keys(LAYOUT_TEMPLATES);

    // Prepare vision summary mapping
    const isZoomedFace = moodboardVisionSummary ? (moodboardVisionSummary.toLowerCase().includes('macro') || moodboardVisionSummary.toLowerCase().includes('zoomed') || moodboardVisionSummary.toLowerCase().includes('close-up')) : false;

    const visionResultStub = isZoomedFace ? { framingType: 'macro', facesDetected: true } as any : undefined;

    // Select unique layouts intelligently using Template Agent sequentially
    const uniqueLayoutsForFrames: string[] = [];
    const agentDecisions: Array<{ selected_layout_id: string; reasoning: string; designSpec?: any }> = [];
    
    for (let i = 0; i < total; i++) {
      const frame = frames[i];
      const decision = await this.templateAgent.selectTemplate({
        brief: frame.overlayText || (i === 0 ? 'Cover frame' : 'Body frame'),
        brandName: params.businessName || 'Brand',
        aesthetic: params.aesthetic || 'minimal editorial',
        textLength: (frame.overlayText || '').length,
        slideIndex: i,
        totalSlides: total,
        visionResult: visionResultStub,
        excludeLayouts: uniqueLayoutsForFrames
      });
      agentDecisions.push(decision);
      uniqueLayoutsForFrames.push(decision.selected_layout_id);
    }

    const clientApprovedStoryTemplates = [
      'desktop_course_hero',
      'course_learnings_split',
      'banner_card_editorial',
      'tablet_workbook_cover'
    ];

    for (let i = 0; i < total; i++) {
      const chosen = clientApprovedStoryTemplates[i % clientApprovedStoryTemplates.length];
      uniqueLayoutsForFrames.push(chosen);
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

        // Map the legacy layout ID to a semantic template intent for the CompositionEngine
        const mapIntent = (layout: string) => {
          if (layout.includes('hero') || layout.includes('carousel')) return 'brand_story';
          if (layout.includes('die_cut') || layout.includes('split') || layout.includes('before_after')) return 'before_after';
          if (layout.includes('catalog') || layout.includes('elevation') || layout.includes('diagram') || layout.includes('editorial')) return 'educational';
          if (layout.includes('promo') || layout.includes('sale')) return 'promotion';
          if (layout.includes('testimonial') || layout.includes('quote')) return 'testimonial';
          return 'brand_story';
        };
        const templateIntent = mapIntent(currentSlideLayout);

        try {
          const result = await this.generateSlide({
            photoUrl: photoUrl || '',
            beforePhotoUrl,
            overlayText: frame.overlayText,
            headline: frame.headline,
            subheadline: frame.subheadline,
            cta: frame.cta,
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
            templateIntent,
            designSpec: agentDecisions[i].designSpec,
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
    headline?: string;
    subheadline?: string;
    cta?: string;
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
    templateIntent?: any;
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
  }): Promise<string> {
    const {
      base64Image,
      overlayText,
      headline,
      subheadline,
      cta,
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
      visionResult,
      templateIntent,
      designSpec
    } = params;

    const hasText = (overlayText && overlayText.trim().length > 0) || !!headline || !!subheadline || !!cta;

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

      // â”€â”€ Step 0: Resolve Design Tokens & Composition Metadata â”€â”€
      const designTokens = this.themeEngine.resolveDesignTokens(visualRanking);
      const composition = this.compositionEngine.calculateComposition(designTokens, templateIntent as any, isFirst);

      // We can use composition.maskPreference to override layout if we want.
      let computedLayoutType = layoutType;
      
      // Only apply generic shape overrides to the universal random templates, 
      // NOT to our specifically contracted templates in compiled-layouts.v1.json
      if (['random_diverse', 'universal_dynamic_base', 'passepartout_text'].includes(layoutType)) {
        if (composition.maskPreference === 'circle') computedLayoutType = 'circle_crop';
        else if (composition.maskPreference === 'polaroid') computedLayoutType = 'polaroid_stack';
        else if (composition.maskPreference === 'arch') computedLayoutType = 'arch_mask';
        else if (composition.maskPreference === 'organic') computedLayoutType = 'floating_cutout';
        else if (composition.maskPreference === 'torn') computedLayoutType = 'torn_paper_edge';
      }
      
      // â”€â”€ Step 1: Process Base Image â€” dispatched from layout-templates.config.json â”€â”€
      const template = resolveLayoutTemplate(computedLayoutType, visualRanking);
      if (['circle_crop', 'polaroid_stack', 'arch_mask', 'floating_cutout', 'torn_paper_edge'].includes(computedLayoutType)) {
        template.base = computedLayoutType as any;
      }

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
        designSpec,
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
      // Explicitly enforce the Brand DNA semantic roles: Depth color is for Typography!
      const isFullBleed = template.base === 'full_bleed_base' || template.base === 'universal_dynamic_base' || layoutType === 'look_number_plate';
      const textSurfaceColor = isFullBleed ? validBrandColor : validBackgroundColor;

      const surfaceLuminance = getLuminance(textSurfaceColor);
      const isLightSurface = surfaceLuminance > 150; 
      
      // If the surface is light, always use the Depth color (e.g. charcoal black #393939) for text.
      // Only fall back to Background Color (light) if the surface is dark.
      const dynamicTextColor = isLightSurface ? depthBrandColor : validBackgroundColor;

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

      // Calculate dynamic font size and letter spacing to prevent clipping (Scaled for high-end aesthetic)
      const scaleFactor = w / 1080;
      let dynamicFontSize = Math.round(72 * scaleFactor);
      let maxLength = 0;
      for (const line of lines) {
        if (line.length > maxLength) maxLength = line.length;
      }
      if (maxLength > 40) {
        dynamicFontSize = Math.round(42 * scaleFactor);
      } else if (maxLength > 32) {
        dynamicFontSize = Math.round(48 * scaleFactor);
      } else if (maxLength > 26) {
        dynamicFontSize = Math.round(56 * scaleFactor);
      }
      const dyOffset = Math.round(dynamicFontSize * 1.35);

      // ── Step 3: Assemble SVG overlays — dispatched from layout-templates.config.json ──
      const textCtx = {
        layoutType, w, h, dynamicFontSize, dyOffset, escapedLines, lines, overlayText: finalOverlayText, maxLength,
        structuredText: { headline, subheadline, cta },
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
        structuredText: { headline, subheadline, cta },
        visionResult: visionResult,
        faceCoordinates: visionResult?.faceCoordinates,
        injectedFeatures: composition.injectedFeatures,
        designTokens,
        designSpec,
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
        : '';

      const bodyFontFace = bodyFontBase64
        ? `@font-face {
            font-family: '${bodyFont}';
            src: url('data:font/ttf;base64,${bodyFontBase64}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }`
        : '';

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
            <!-- Premium Text Shadows and Glassmorphism Filters -->
            <filter id="premium_shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="15" flood-color="#000000" flood-opacity="0.25"/>
            </filter>
            <filter id="premium_glass" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 15 -5" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>

            <style>
              ${brandFontFace}
              ${bodyFontFace}
              
              .overlay-text { font-family: '${brandFont}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 38px; font-weight: 800; fill: ${dynamicTextColor}; letter-spacing: ${headingLetterSpacing}; line-height: 1.3; }
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
            return `<rect x="${paddingX}" y="${h - paddingBottom - 60}" width="${innerW}" height="60" class="footer-bg" />
              <text x="${paddingX + 60}" y="${h - paddingBottom - 25}" class="footer-brand">${escapedSpacedName}</text>
              <text x="${w - paddingX - 60}" y="${h - paddingBottom - 25}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 1) {
            // Top-left corner floating wordmark
            return `<text x="${paddingX + 50}" y="${paddingTop + 52}" font-family="'${bodyFont}', system-ui, sans-serif" font-size="13px" font-weight="600" letter-spacing="4px" fill="${validSecondaryColor}" fill-opacity="0.85" text-transform="uppercase">${escapedSpacedName}</text>
              <line x1="${paddingX + 50}" y1="${paddingTop + 62}" x2="${Math.min(paddingX + 50 + escapedSpacedName.length * 8, w - paddingX - 50)}" y2="${paddingTop + 62}" stroke="${validSecondaryColor}" stroke-width="1" stroke-opacity="0.5" />`;
          } else if (footerStyle === 2) {
            // Bottom-right corner slide counter only — super minimal
            return `<text x="${w - paddingX - 60}" y="${h - paddingBottom - 25}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 3) {
            // Vertical side tag — editorial magazine style
            return `<text x="${w - paddingX - 24}" y="${Math.round(h * 0.62)}" font-family="'${bodyFont}', system-ui, sans-serif" font-size="11px" font-weight="600" letter-spacing="5px" fill="${validBrandColor}" fill-opacity="0.7" transform="rotate(90 ${w - paddingX - 24} ${Math.round(h * 0.62)})">${escapedSpacedName}</text>`;
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

      // ── Step 4: Composite image scaling and margins ──
      // CRITICAL: We MUST materialize the baseImage (Sharp lazy chain) to a Buffer first,
      // then create a NEW Sharp instance to composite the SVG overlay on top.
      // Chaining .composite().composite() on a lazy Sharp instance causes the second
      // composite to lose the first composite's pixels — always toBuffer() in between.
      let compositeBuffer: Buffer;
      if (template.base === 'solid_canvas_full' || template.base === 'universal_dynamic_base') {
        // baseImage is a fully-built w x h canvas (background + client photo embedded at correct position)
        // Materialize it first, then composite the SVG overlay on top as a separate Sharp operation
        const baseBuffer = await baseImage.png().toBuffer();
        compositeBuffer = await sharp(baseBuffer)
          .composite([{ input: highResSvgBuffer, blend: 'over' }])
          .png()
          .toBuffer();
      } else {
        // For bordered/split/other base treatments: extend the canvas with padding, then composite SVG
        const extendedBaseBuffer = await baseImage
          .extend({
            top: compositeTop,
            bottom: compositeBottom,
            left: compositeLeft,
            right: compositeRight,
            background: validBackgroundColor
          })
          .png()
          .toBuffer();
        compositeBuffer = await sharp(extendedBaseBuffer)
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
