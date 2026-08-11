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
import { resolveLayoutTemplate, BASE_TREATMENTS, TEXT_TEMPLATES, DECORATIONS, LAYOUT_TEMPLATES, registerDynamicLayout, COMPILED_LAYOUTS } from '../config/layout-renderers';
import { TemplateAgentService } from './template-agent.service';
import { LayoutAssemblerService } from './template-engine/layout-assembler.service';
import templateLibraryData from '../config/template-library.json';
import { ThemeEngine } from './template-engine/engines/theme-engine';
import { CompositionEngine, TemplateIntent } from './template-engine/engines/composition-engine';
import { ArtDirectionEngine } from './template-engine/engines/art-direction-engine';
import { GeometryCompiler } from './template-engine/engines/geometry-compiler';
import { ColorCompositionEngine } from './template-engine/engines/color-composition-engine';
import { DesignCompiler } from './template-engine/engines/design-compiler';
import { LayoutEngine, BoundingBox } from './template-engine/engines/layout-engine';
import { CompositionOptimizer } from './template-engine/engines/composition-optimizer';
import { CompositionQualityController } from './template-engine/engines/composition-quality-controller';

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

    const containedImg = await sharp(enhancedBuffer)
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    return await sharp({
      create: { width: targetW, height: targetH, channels: 3, background: backgroundColor }
    })
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
  if (process.env.LOCAL_TEST === 'true') {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../../../.tempmediaStorage');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${name}_${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return `file:///${filePath.replace(/\\/g, '/')}`;
  }

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
  private readonly artDirectionEngine: ArtDirectionEngine;
  private readonly colorCompositionEngine: ColorCompositionEngine;
  private readonly geometryCompiler: GeometryCompiler;

  constructor() {
    this.templateAgent = new TemplateAgentService();
    this.themeEngine = new ThemeEngine();
    this.compositionEngine = new CompositionEngine();
    this.artDirectionEngine = new ArtDirectionEngine();
    this.colorCompositionEngine = new ColorCompositionEngine();
    this.geometryCompiler = new GeometryCompiler();
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
    outputSize?: '1024x1024' | '1080x1920';
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
    logoUrl?: string;
    logoPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
  }): Promise<{ url: string; variants?: { gemini?: string; dalle?: string }; compositionFailed?: boolean; failReason?: string }> {
    const {
      photoUrl, beforePhotoUrl, overlayText, headline, subheadline, cta, index, isFirst, isLast, isBeforePhoto,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
      outputSize = '1024x1024' as '1024x1024' | '1080x1920',
      layoutType = 'passepartout_text',
      customPrompt,
      logoPosition = 'bottom_right',
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
      logoUrl,
      designSpec
    } = params;

    // Fast-path: Skip AI image generation entirely for text-only editorial layouts
    if (layoutType === 'text_only_editorial') {
      console.log(`[TEXT ONLY EDITORIAL] Bypassing AI image generator for slide ${index} and creating solid brand colored tile.`);
      const overlayResult = await this.overlayBrandingAndText({
        base64Image: '',
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
        outputSize,
        captionText: overlayText,
        visionResult,
        logoUrl,
        logoPosition,
      });
      const url = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}`);
      return { url, compositionFailed: overlayResult.compositionFailed, failReason: overlayResult.failReason };
    }

    let cleanPrompt = '';
    let imageBuffer: Buffer | null = null;

    const isRealClientPhoto = photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('data:image/') || photoUrl.includes('raw_assets') || photoUrl.includes('storage') || photoUrl.includes('temp'));

    if (isRealClientPhoto || generatorModel === 'none') {
      console.log(`[PASS-THROUGH SHARP COMPOSITOR] Bypassing AI image editor for slide ${index} to guarantee 100% client face preservation.`);
      imageBuffer = await downloadImageAsBuffer(photoUrl);
      const base64Image = imageBuffer.toString('base64');
      const overlayResult = await this.overlayBrandingAndText({
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
        logoUrl,
        logoPosition,
      });
      const url = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}`);
      return { url, compositionFailed: overlayResult.compositionFailed, failReason: overlayResult.failReason };
    }

    // Bypass AI image generation entirely for procedural text-only families
    if (layoutType === 'text_palette_minimal' || !photoUrl && layoutType?.includes('text_')) {
      // Create a minimal 1x1 transparent pixel base64. The renderer will cover it with SVG backgrounds.
      const transparent1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const overlayResult = await this.overlayBrandingAndText({
        base64Image: transparent1x1,
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
      const url = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}`);
      return {
        url,
        variants: { gemini: url, dalle: url },
        compositionFailed: overlayResult.compositionFailed,
        failReason: overlayResult.failReason,
      };
    }

    // Compile dynamic lifestyle/studio assets for non-booking educational/moodboard posts
    // Subjects use Brand DNA aesthetic direction instead of hardcoded beige/travertine
    const brandAestheticHint = aesthetic || 'minimal, premium beauty editorial';

    // Canva-Style Aesthetic Multiplexer: Force the AI into distinct aesthetic categories 
    // rather than repeating "lifestyle interior" every time.
    const lifestyleSubjects = [
      `A high-end studio beauty editorial shot, highly polished, premium skin glow, minimal props, in ${brandAestheticHint} style, using brand colors: primary ${brandColor}, secondary ${secondaryColor}, background ${backgroundBrandColor}`,
      `Clean architectural interior of a luxury clinical ${serviceType} space, emphasizing premium materials, soft natural light, shadows, matching palette: ${brandColor}, ${secondaryColor}`,
      `Extreme macro photography of smooth premium textures (like silk, thick cream, or polished stone) related to ${serviceType}, styled in ${brandAestheticHint} aesthetic, using exact brand accent: ${accentBrandColor}`,
      `An abstract, flowing composition of soft lighting and shadow geometries evoking the feeling of premium ${serviceType}, in exact brand colors: ${brandColor}, ${secondaryColor}, ${backgroundBrandColor}`
    ];
    // Use modulo so a 4-slide carousel cycles perfectly through 4 distinct visual flavors
    const chosenSubject = lifestyleSubjects[index % 4];

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
          size: outputSize === '1080x1920' ? '1024x1536' as any : '1024x1024',
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
    const overlayResult = await this.overlayBrandingAndText({
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
      logoUrl,
      logoPosition,
    });

    // Upload primary image
    const primaryUrl = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}_primary`);

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

      const altOverlayResult = await this.overlayBrandingAndText({
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

      const altUrl = await uploadBase64ToFirebase(altOverlayResult.base64, tenantId, `slide_${index}_alt`);

      // Return both variants for technician choice
      variants = {
        gemini: geminiResult === base64 ? primaryUrl : altUrl,
        dalle: dalleResult === base64 ? primaryUrl : altUrl,
      };
    }

    return {
      url: primaryUrl,
      variants,
      compositionFailed: overlayResult.compositionFailed,
      failReason: overlayResult.failReason,
    };
  }

  async generateCarousel(params: {
    afterPhotoUrl: string;
    beforePhotoUrl?: string;
    concepts: Array<{ index: number; title: string; overlayText: string; headline?: string; subheadline?: string; cta?: string; slideType?: string; }>;
    semanticFlow?: import('./narrative-planner.service').SemanticSlide[];
    tenantId: string;
    businessName: string;
    brandColor: string;
    secondaryColor?: string;
    aesthetic?: string;
    serviceType?: string;
    artDirectorBrief?: any[];
    layoutType?: string;
    logoUrl?: string;
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
    visionResultBefore?: VisionAnalysisResult;
    templateIntent?: 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
    logoPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, visionResultBefore, templateIntent = 'educational', designSpec, ...rest } = params;
    const total = concepts.length;

    // Derive pool dynamically from compiled layouts — never goes stale when new layouts are added
    const layoutPool = Object.keys(COMPILED_LAYOUTS);

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

      if (i === 0 && params.layoutType) {
        agentDecisions.push({ selected_layout_id: params.layoutType, reasoning: 'Pre-selected cover layout from orchestrator', designSpec: params.designSpec });
        uniqueLayoutsForSlides.push(params.layoutType);
        continue;
      }

      const semanticSlide = params.semanticFlow?.find(s => s.slideType === concept.slideType);

      const decision = await this.templateAgent.selectTemplate({
        brief: concept.overlayText || 'Slide',
        brandName: params.businessName || 'Brand',
        aesthetic: (params.visualRanking && params.visualRanking.length > 0) ? params.visualRanking[0] : 'clean and modern',
        textLength: (concept.overlayText || '').length,
        slideIndex: i,
        totalSlides: total,
        visionResult: visionResultStub,
        excludeLayouts: uniqueLayoutsForSlides,
        templateIntent,
        slideType: concept.slideType,
        semanticIntent: semanticSlide?.semanticIntent,
        requiredTraits: semanticSlide?.requiredTraits,
        triptychAlreadyUsed: agentDecisions.some(d => d.designSpec?.photo?.imageExecution === 'triptych'),
      });
      agentDecisions.push(decision);
      uniqueLayoutsForSlides.push(decision.selected_layout_id);
    }

    // Instantiate the layout assembler to handle forced procedural layouts
    const layoutAssembler = new LayoutAssemblerService();

    // Inject a "breather" slide (text-only, aesthetic background) into the middle of the carousel
    // This provides visual relief and answers the user request for a "random color palette text slide"
    for (let i = 0; i < total; i++) {
      let chosen = agentDecisions[i].selected_layout_id;

      // Let the AI Art Director's choice pass through
      uniqueLayoutsForSlides[i] = chosen;
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

        // Removed forced premium_text_only to allow AI Art Director to rotate freely

        // Let the AI Art Director's choice apply to the last slide too

        try {
          const MAX_SLIDE_ATTEMPTS = 3;
          let result: Awaited<ReturnType<AiImageGenerationService['generateSlide']>> | null = null;
          let attemptLayout = currentSlideLayout;
          for (let attempt = 0; attempt < MAX_SLIDE_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              const fallbackPool = layoutPool.filter(id => id !== attemptLayout);
              attemptLayout = fallbackPool[Math.floor(((concept.index || i) + attempt) % Math.max(1, fallbackPool.length))] || attemptLayout;
              console.warn(`[SlideQC] Regenerating slide ${concept.index} attempt ${attempt + 1} with layout '${attemptLayout}' (prev fail: ${result?.failReason || 'unknown'})`);
            }
            result = await this.generateSlide({
              photoUrl: photoUrl || '',
              beforePhotoUrl,
              overlayText: concept.overlayText,
              headline: concept.headline,
              subheadline: concept.subheadline,
              cta: concept.cta || (isLast ? 'Book now' : undefined),
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
              layoutType: attemptLayout,
              visualRanking,
              capitalizationRule,
              footerBrandToggle,
              generatorModel,
              logoUrl: params.logoUrl,
              logoPosition: params.logoPosition,
              backgroundBrandColor,
              accentBrandColor,
              depthBrandColor,
              moodboardVisionSummary,
              visionResult: (usingBefore && visionResultBefore) ? visionResultBefore : (visionResult ?? visionResultStub),
              templateIntent,
              designSpec: agentDecisions[i].designSpec,
            });
            if (!result.compositionFailed) break;
          }
          if (!result || result.compositionFailed) {
            console.error(`[SlideQC] Slide ${concept.index} still failed after retries (${result?.failReason}). Excluding from carousel.`);
            return null;
          }
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
    logoUrl?: string;
    generatorModel?: 'gemini' | 'dalle' | 'both' | 'none';
    backgroundBrandColor?: string;
    accentBrandColor?: string;
    depthBrandColor?: string;
    moodboardVisionSummary?: string;
    visionResult?: VisionAnalysisResult;
    visionResultBefore?: VisionAnalysisResult;
    templateIntent?: any;
    semanticFlow?: import('./narrative-planner.service').SemanticSlide[];
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
    logoPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, layoutType = 'random_diverse', visualRanking = [], capitalizationRule = 'uppercase', footerBrandToggle = true, generatorModel = 'both', backgroundBrandColor = '#F7F4EF', accentBrandColor = '#D4A373', depthBrandColor = '#1E1E1C', moodboardVisionSummary, visionResult, visionResultBefore, templateIntent, semanticFlow, designSpec, ...rest } = params;
    const total = frames.length;

    // Derive pool dynamically from compiled layouts — never goes stale when new layouts are added
    const layoutPool = Object.keys(COMPILED_LAYOUTS);

    // Prepare vision summary mapping
    const isZoomedFace = moodboardVisionSummary ? (moodboardVisionSummary.toLowerCase().includes('macro') || moodboardVisionSummary.toLowerCase().includes('zoomed') || moodboardVisionSummary.toLowerCase().includes('close-up')) : false;

    const visionResultStub = isZoomedFace ? { framingType: 'macro', facesDetected: true } as any : undefined;

    // Select unique layouts intelligently using Template Agent sequentially
    const uniqueLayoutsForFrames: string[] = [];
    const agentDecisions: Array<{ selected_layout_id: string; reasoning: string; designSpec?: any }> = [];

    for (let i = 0; i < total; i++) {
      const frame = frames[i];
      if (i === 0 && params.layoutType) {
        agentDecisions.push({ selected_layout_id: params.layoutType, reasoning: 'Pre-selected cover layout from orchestrator', designSpec: params.designSpec });
        uniqueLayoutsForFrames.push(params.layoutType);
        continue;
      }

      const semanticSlide = semanticFlow?.find((s, idx) => idx === i);

      const decision = await this.templateAgent.selectTemplate({
        brief: frame.overlayText || (i === 0 ? 'Cover frame' : 'Body frame'),
        brandName: params.businessName || 'Brand',
        aesthetic: params.aesthetic || 'minimal editorial',
        textLength: (frame.overlayText || '').length,
        slideIndex: i,
        totalSlides: total,
        visionResult: visionResultStub,
        excludeLayouts: uniqueLayoutsForFrames,
        templateIntent,
        slideType: semanticSlide?.slideType,
        semanticIntent: semanticSlide?.semanticIntent,
        triptychAlreadyUsed: agentDecisions.some(d => d.designSpec?.photo?.imageExecution === 'triptych'),
      });
      agentDecisions.push(decision);
      uniqueLayoutsForFrames.push(decision.selected_layout_id);
    }

    // Allow the AI Art Director / Template Agent to dictate the visual rhythm
    for (let i = 0; i < total; i++) {
      let chosen = agentDecisions[i].selected_layout_id;
      uniqueLayoutsForFrames[i] = chosen;
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
        const mappedIntent = templateIntent || mapIntent(currentSlideLayout);

        // Force premium_text_only for text-only body slides in educational/promotional stories
        if (!photoUrl && (mappedIntent === 'educational' || mappedIntent === 'promotion')) {
          currentSlideLayout = 'premium_text_only';
        }

        try {
          const MAX_FRAME_ATTEMPTS = 3;
          let result: Awaited<ReturnType<AiImageGenerationService['generateSlide']>> | null = null;
          let attemptLayout = currentSlideLayout;
          for (let attempt = 0; attempt < MAX_FRAME_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              const fallbackPool = layoutPool.filter(id => id !== attemptLayout);
              attemptLayout = fallbackPool[Math.floor(((frame.index || i) + attempt) % Math.max(1, fallbackPool.length))] || attemptLayout;
              console.warn(`[SlideQC] Regenerating frame ${frame.index} attempt ${attempt + 1} with layout '${attemptLayout}'`);
            }
            result = await this.generateSlide({
              photoUrl: photoUrl || '',
              beforePhotoUrl,
              overlayText: frame.overlayText,
              headline: frame.headline,
              subheadline: frame.subheadline,
              cta: frame.cta || (isLast ? 'Book now' : undefined),
              title: frame.title,
              index: frame.index,
              isFirst,
              isLast,
              isBeforePhoto: usingBefore,
              outputSize: '1080x1920',
              customPrompt: brief?.artDirectorPrompt,
              ...rest,
              brandColor: rest.brandColor,
              secondaryColor: rest.secondaryColor,
              totalSlides: total,
              layoutType: attemptLayout,
              visualRanking,
              capitalizationRule,
              footerBrandToggle,
              generatorModel,
              logoUrl: params.logoUrl,
              logoPosition: params.logoPosition,
              backgroundBrandColor,
              accentBrandColor,
              depthBrandColor,
              moodboardVisionSummary,
              visionResult: (usingBefore && visionResultBefore) ? visionResultBefore : (visionResult ?? visionResultStub),
              templateIntent: mappedIntent,
              designSpec: agentDecisions[i].designSpec,
            });
            if (!result.compositionFailed) break;
          }
          if (!result || result.compositionFailed) {
            console.error(`[SlideQC] Frame ${frame.index} still failed after retries. Excluding.`);
            return null;
          }
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
    logoUrl?: string;
    logoPosition?: string;
    backgroundBrandColor?: string;
    accentBrandColor?: string;
    depthBrandColor?: string;
    outputSize?: string;
    captionText: string;
    visionResult?: VisionAnalysisResult;
    templateIntent?: any;
    designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec;
  }): Promise<{ base64: string; compositionFailed: boolean; failReason?: string }> {
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
      logoUrl,
      logoPosition = 'bottom_right',
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
        isStory = outputSize === '1080x1920';
      } else {
        isStory = outputSize === '1080x1920';
        originalW = 1080;
        originalH = isStory ? 1920 : 1080;
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
      const h = isStory ? 1920 : 1080;

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
      const validBackgroundColor = backgroundBrandColor && backgroundBrandColor.startsWith('#') ? backgroundBrandColor : '#F7F4EF';
      const validAccentColor = accentBrandColor && accentBrandColor.startsWith('#') ? accentBrandColor : '#D4A373';
      const validDepthColor = depthBrandColor && depthBrandColor.startsWith('#') ? depthBrandColor : '#1E1E1C';

      const rawName = (businessName || 'RAW CANVAS').trim().toUpperCase();
      // Letter-spacing every character looks premium for short names but clips
      // long studio names out of the footer. Keep natural spacing past ~14 chars.
      const displayName = rawName.length <= 14
        ? rawName.split('').join(' ')
        : (rawName.length > 28 ? `${rawName.slice(0, 26).trimEnd()}…` : rawName);

      const escapedSpacedName = escapeXml(displayName);

      // Fetch logo as base64 for watermark if provided
      let logoDataUri = '';
      if (logoUrl) {
        try {
          const https = await import('https');
          const http = await import('http');
          const protocol = logoUrl.startsWith('https') ? https : http;
          const logoBuffer = await new Promise<Buffer>((resolve, reject) => {
            (protocol as any).get(logoUrl, (res: any) => {
              const chunks: Buffer[] = [];
              res.on('data', (c: Buffer) => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });
          const resizedLogo = await sharp(logoBuffer).resize(600, 600, { fit: 'inside' }).png().toBuffer();
          logoDataUri = `data:image/png;base64,${resizedLogo.toString('base64')}`;
        } catch (e) {
          console.warn('[Logo Fetch Warning] Failed to fetch logo for watermark:', e);
        }
      }

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

      // Footer type: keep readable without blowing past the slide counter
      let footerLetterSpacing = 2;
      let footerFontSize = 18;

      if (rawName.length <= 10) {
        footerFontSize = 22;
        footerLetterSpacing = 4;
      } else if (rawName.length > 22) {
        footerLetterSpacing = 1;
        footerFontSize = 14;
      } else if (rawName.length > 16) {
        footerLetterSpacing = 1;
        footerFontSize = 16;
      }

      // True Passepartout Layout Calculations using dynamic borders (Now driven by Whitespace Strategy)
      // ── Step 0: Resolve Design Tokens & Composition Metadata ──
      const designTokens = this.themeEngine.resolveDesignTokens(visualRanking);
      const composition = this.compositionEngine.calculateComposition(designTokens, templateIntent as any, isFirst, visionResult?.faceCoordinates);

      // NEW ARCHITECTURE: Pull semantic rules from the Art Direction Engine using the layout ID!
      const intent = this.artDirectionEngine.generateDesignIntent(layoutType, Math.max(0, (index || 1) - 1), totalSlides || 1, designSpec);
      // Final slide must be a clear CTA composition
      if (isLast) {
        intent.visualPriority = 'cta_hero';
        intent.readingFlow = intent.readingFlow || 'center_down';
      }
      const behavior = this.artDirectionEngine.mapIntentToBehavior(intent);
      const designLanguage = { intent, behavior };
      const geometryOut = this.geometryCompiler.compile(designLanguage, w, h, designSpec);

      const paddingX = geometryOut.safeX;
      const paddingTop = geometryOut.safeY;
      
      const _topLevelLayoutEngine = new LayoutEngine(w, h, undefined);
      const _topLevelConstraints = _topLevelLayoutEngine.calculateConstraints((intent.family as any) || 'minimal', 'balanced', false, behavior);
      const paddingBottom = _topLevelConstraints.margins.bottom;

      const innerW = w - (paddingX * 2);
      const innerH = h - (paddingTop + paddingBottom);

      // Layout type is passed directly from the Art Director/Template Agent without legacy shape overrides
      let computedLayoutType = layoutType;

      if (!COMPILED_LAYOUTS[computedLayoutType]) {
        console.log(`[Dynamic Compilation] Layout '${computedLayoutType}' not found in COMPILED_LAYOUTS, compiling dynamically...`);
        const layoutAssembler = new LayoutAssemblerService();
        const dsl = layoutAssembler.compileFamilyToDSL(computedLayoutType, index || 0, businessName || 'Brand');
        registerDynamicLayout(dsl);
        computedLayoutType = dsl.id;
      }

      // â”€â”€ Step 1: Process Base Image â€” dispatched from layout-templates.config.json â”€â”€
      const template = resolveLayoutTemplate(computedLayoutType, visualRanking);
      if (['circle_crop', 'polaroid_stack', 'arch_mask', 'floating_cutout', 'torn_paper_edge'].includes(computedLayoutType)) {
        template.base = computedLayoutType as any;
      }

      // Step 2 (Plan): Face Coordinate Transformation
      let faceBox: any = undefined;
      if (visionResult?.faceCoordinates && visionResult.faceCoordinates.eyesYPercent) {
        const sourceW = originalW;
        const sourceH = originalH;
        // Image scaling and translation (letterbox offset) from fit: contain
        const scale = Math.min(w / sourceW, h / sourceH);
        const drawnW = Math.round(sourceW * scale);
        const drawnH = Math.round(sourceH * scale);
        const offsetY = Math.round((h - drawnH) / 2);
        
        // Map percentages to actual drawn image height on canvas
        const eyesY = Math.round(offsetY + (visionResult.faceCoordinates.eyesYPercent / 100) * drawnH);
        const mouthY = visionResult.faceCoordinates.mouthYPercent
          ? Math.round(offsetY + (visionResult.faceCoordinates.mouthYPercent / 100) * drawnH)
          : Math.round(eyesY + (drawnH * 0.15));

      // Final face-safe bounding box on canvas.
      // Prefer vision X/width when present; otherwise protect a wide central band
      // so side-anchored headlines cannot cover cheeks/hair on portraits.
      const offsetX = Math.round((w - drawnW) / 2);
      const faceTop = Math.max(0, eyesY - Math.round(h * 0.10));
      const faceBottom = Math.min(h, mouthY + Math.round(h * 0.12));
      const faceHeight = Math.max(120, faceBottom - faceTop);

      const coords = visionResult.faceCoordinates;
      const hasX = typeof coords.faceCenterXPercent === 'number';
      const hasW = typeof coords.faceWidthPercent === 'number' && coords.faceWidthPercent > 5;
      const widthPct = hasW
        ? Math.min(85, Math.max(22, coords.faceWidthPercent as number))
        : 72;
      const faceWidth = Math.round((hasX || hasW ? drawnW : w) * (widthPct / 100));
      let faceX: number;
      if (hasX) {
        const centerX = offsetX + ((coords.faceCenterXPercent as number) / 100) * drawnW;
        faceX = Math.round(centerX - faceWidth / 2);
      } else {
        faceX = Math.round((w - faceWidth) / 2);
      }
      faceX = Math.max(0, Math.min(faceX, w - faceWidth));

      faceBox = { x: faceX, y: faceTop, width: faceWidth, height: faceHeight };
      console.log(`[FaceBox] Protected zone x=${faceX} y=${faceTop}-${faceBottom} w=${faceWidth} (eyes=${eyesY}, mouth=${mouthY}, x%=${coords.faceCenterXPercent ?? 'n/a'})`);
    }

      // Map vision protected subjects (products, hands, treatment areas, …) onto canvas
      const containScale = Math.min(w / originalW, h / originalH);
      const subjectDrawnW = Math.round(originalW * containScale);
      const subjectDrawnH = Math.round(originalH * containScale);
      const subjectOffsetX = Math.round((w - subjectDrawnW) / 2);
      const subjectOffsetY = Math.round((h - subjectDrawnH) / 2);

      const additionalSubjects: BoundingBox[] = [];
      if (Array.isArray(visionResult?.protectedSubjects)) {
        for (const sub of visionResult.protectedSubjects) {
          if (sub.type === 'face' && faceBox) continue; // face already expanded via subjectBox
          additionalSubjects.push(
            LayoutEngine.mapPercentBoxToCanvas(
              {
                centerXPercent: sub.centerXPercent,
                centerYPercent: sub.centerYPercent,
                widthPercent: sub.widthPercent,
                heightPercent: sub.heightPercent,
              },
              w, h, subjectDrawnW, subjectDrawnH, subjectOffsetX, subjectOffsetY,
            ),
          );
        }
      }

      // Subject mass (face + upper body) — text must clear the client image, not only eyes
      const subjectBox = faceBox
        ? LayoutEngine.expandFaceToSubject(faceBox, w, h)
        : undefined;
      if (subjectBox) {
        console.log(`[SubjectBox] Cleared client image mass x=${subjectBox.x} y=${subjectBox.y} w=${subjectBox.width} h=${subjectBox.height}`);
      }
      if (additionalSubjects.length) {
        console.log(`[ProtectedSubjects] ${additionalSubjects.length} additional visual subject(s) protected`);
      }

      // Step 3 (Plan): Optimizer + visual QC gate; alternate layout if gate fails
      let rawDsl = COMPILED_LAYOUTS[computedLayoutType];
      let optimizedDsl: any = undefined;
      let compositionFailed = false;
      let failReason: string | undefined;
      const compositionQC = new CompositionQualityController();

      // CTA slides must have explicit CTA copy
      let effectiveCta = cta;
      let effectiveHeadline = headline;
      let effectiveSubheadline = subheadline;
      if (isLast) {
        if (!effectiveCta || !String(effectiveCta).trim()) {
          effectiveCta = 'Book now';
        }
        if (!effectiveHeadline || !String(effectiveHeadline).trim()) {
          effectiveHeadline = overlayText?.split(/\s+/).slice(0, 5).join(' ') || 'Ready when you are';
        }
      }
      if (!effectiveHeadline && !overlayText) {
        compositionFailed = true;
        failReason = 'missing_headline';
      }

      const runOptimize = (_layoutId: string, dslIn: any) => {
        let dslWork = JSON.parse(JSON.stringify(dslIn));
        const designCompiler = new DesignCompiler();
        if (designLanguage) dslWork = designCompiler.compile(dslWork, designLanguage);
        if (designSpec) dslWork = designCompiler.compile(dslWork, designSpec);

        const layoutEngine = new LayoutEngine(w, h, faceBox, subjectBox, additionalSubjects);
        const optFamily = (designLanguage?.intent?.family as any) || 'minimal';
        const behaviorProfile = (dslWork as any)?.behavior;
        const constraints = layoutEngine.calculateConstraints(optFamily, 'balanced', false, behaviorProfile);

        let logoBox: any = undefined;
        if (logoUrl) {
          const logoW = 150;
          const logoH = 150;
          let lx = w - logoW - 30;
          let ly = h - logoH - 30;
          if (logoPosition === 'bottom_left') { lx = 30; }
          else if (logoPosition === 'top_right') { ly = 30; }
          else if (logoPosition === 'top_left') { lx = 30; ly = 30; }
          logoBox = { x: lx, y: ly, width: logoW, height: logoH, role: 'obstacle' };
        }

        const optimizer = new CompositionOptimizer();
        return optimizer.optimizeWithMeta(
          dslWork,
          constraints,
          w,
          h,
          faceBox,
          designLanguage?.intent?.visualPriority,
          logoBox,
          geometryOut.typography,
          subjectBox,
          designLanguage?.intent?.readingFlow,
          { headline: effectiveHeadline, subheadline: effectiveSubheadline, cta: effectiveCta },
          additionalSubjects,
          geometryOut.spatial,
        );
      };

      if (rawDsl) {
        let optResult = runOptimize(computedLayoutType, rawDsl);
        optimizedDsl = optResult.dsl;

        if (optResult.suggestLayoutChange) {
          console.warn(`[CompositionQC] Layout '${computedLayoutType}' failed visual gate. Trying alternates… Actions: ${optResult.fitActions.join(' | ')}`);
          const alternates = compositionQC.suggestAlternateLayouts(
            computedLayoutType,
            Object.keys(COMPILED_LAYOUTS),
            {
              visualPriority: designLanguage?.intent?.visualPriority,
              readingFlow: designLanguage?.intent?.readingFlow,
              family: designLanguage?.intent?.family,
            },
            4,
          );
          for (const altId of alternates) {
            const altDsl = COMPILED_LAYOUTS[altId];
            if (!altDsl) continue;
            const altResult = runOptimize(altId, altDsl);
            console.log(`[CompositionQC] Alternate '${altId}' → suggestChange=${altResult.suggestLayoutChange} actions=${altResult.fitActions.slice(-2).join(';')}`);
            if (!altResult.suggestLayoutChange) {
              computedLayoutType = altId;
              optimizedDsl = altResult.dsl;
              optResult = altResult;
              console.log(`[CompositionQC] Accepted alternate arrangement '${altId}'`);
              break;
            }
          }
          if (optResult.suggestLayoutChange) {
            compositionFailed = true;
            failReason = failReason || `visual_gate:${(optimizedDsl as any)?._compositionMeta?.qualityIssues?.join(',') || 'exhausted'}`;
            console.warn(`[CompositionQC] No alternate passed visual gate — marking slide failed for regenerate`);
          }
        } else if (optResult.fitActions.length) {
          console.log(`[CompositionQC] Fit cascade: ${optResult.fitActions.join(' | ')}`);
        }

        // Incomplete slide: heading pocket missing or empty content
        const textLayers = (optimizedDsl?.layers || []).filter((l: any) => l.type === 'text' || l.type === 'text_group');
        const hasHeadingBox = textLayers.some((l: any) =>
          (l.role === 'heading' || (l.children || []).some((c: any) => c.role === 'heading'))
          && l.allocatedBox
          && !(l as any)._omitForComposition,
        );
        if (textLayers.length > 0 && !hasHeadingBox && (effectiveHeadline || overlayText)) {
          compositionFailed = true;
          failReason = failReason || 'missing_heading_allocation';
        }
      }

      const baseResult = await BASE_TREATMENTS[template.base]!({
        layoutType: computedLayoutType,
        imageBuffer,
        beforePhotoUrl,
        w, h,
        paddingX, paddingTop, paddingBottom,
        innerW, innerH,
        validBrandColor,
        validSecondaryColor,
        validBackgroundColor,
        downloadImageAsBuffer: downloadImageAsBuffer,
        designSpec,
        designLanguage,
        faceCoordinates: visionResult?.faceCoordinates,
        faceBox,
        subjectBox,
        additionalSubjects,
        optimizedDsl
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
      let isFullBleed = template.base === 'full_bleed_base' || template.base === 'universal_dynamic_base' || layoutType === 'look_number_plate';

      // V2 Smart Surface Detection for Breather Slides
      if (layoutType.includes('text_only')) {
        isFullBleed = false;
      }

      let textSurfaceColor = isFullBleed ? validBrandColor : validBackgroundColor;

      // Split / Inset / band layout: prefer optimized regions (not raw compiled JSON)
      const activeRegions = optimizedDsl?.canvasRegions || COMPILED_LAYOUTS[computedLayoutType]?.canvasRegions;
      if (activeRegions?.imageRegion && activeRegions.imageRegion.width < w) {
        textSurfaceColor = validBackgroundColor;
        isFullBleed = false;
      }
      // Full-bleed with text band: surface for ink is the photo — keep high-contrast poster ink
      if (activeRegions?.textRegion && activeRegions.textRegion.height < h * 0.55) {
        isFullBleed = true;
      }

      const surfaceLuminance = getLuminance(textSurfaceColor);
      const isLightSurface = surfaceLuminance > 150;

      const colorPalette = {
        brandColor: validBrandColor,
        secondaryColor: validSecondaryColor,
        backgroundColor: validBackgroundColor,
        accentColor: validAccentColor,
        depthColor: validDepthColor,
        textColor: validDepthColor,
      };

      // BrandDNA inks only — background is canvas-locked and never becomes text color
      let dynamicTextColor = this.colorCompositionEngine.resolveTextInk(
        textSurfaceColor,
        colorPalette,
        'primary',
      );
      // Prefer depth on light brand/canvas surfaces when contrast allows
      if (isLightSurface && getLuminance(validDepthColor) < 120) {
        dynamicTextColor = validDepthColor;
      }

      const footerLuminance = getLuminance(validSecondaryColor);
      const isLightFooter = footerLuminance > 150;
      const dynamicFooterTextColor = this.colorCompositionEngine.resolveTextInk(
        validSecondaryColor,
        colorPalette,
        'secondary',
      ) || (isLightFooter ? validDepthColor : '#FFFFFF');

      let posterTextColor = '#FFFFFF';
      try {
        const stats = await sharp(imageBuffer).stats();
        if (stats.channels && stats.channels.length >= 3) {
          const meanLuminance = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
          posterTextColor = meanLuminance > 127 ? depthBrandColor : '#FFFFFF';
        }
      } catch (contrastErr) {
        // Non-fatal: text-only slides or corrupted buffers fall back to white text
      }

      if (isFullBleed && !layoutType.includes('text_only') && photoDataUri) {
        dynamicTextColor = posterTextColor;
      }

      // Instead of rigid character counting, we now defer to the Art Direction Engine's proportional weighting
      let dynamicFontSize = geometryOut.typography.heroSize;

      let maxLength = 0;
      for (const line of lines) {
        if (line.length > maxLength) maxLength = line.length;
      }

      // If the template specifically requests body or secondary text scaling, we can adjust here, 
      // but by default the primary hero text drives the composition.
      const dyOffset = Math.round(dynamicFontSize * geometryOut.typography.heroLineHeight);

      const activeTheme = visualRanking?.[0] || 'editorial_beauty';

      // ── Step 3: Assemble SVG overlays — dispatched from layout-templates.config.json ──
      const textCtx = {
        layoutType: computedLayoutType, w, h, dynamicFontSize, dyOffset, escapedLines, lines, overlayText: finalOverlayText, maxLength,
        structuredText: { headline, subheadline, cta },
        dynamicTextColor, posterTextColor, validBrandColor, validSecondaryColor,
        brandFont, bodyFont, escapedSpacedName, photoDataUri, escapeXml, logoUrl,
        faceCoordinates: visionResult?.faceCoordinates,
        activeTheme,
      };
      // STRICT ARCHITECTURAL OWNERSHIP:
      // If this layout is driven by the modern DSL (layout_v2_ or dynamically compiled),
      // the DSL Typography Engine has absolute ownership over text rendering.
      // We explicitly disable the legacy text renderer here to prevent duplication.
      const isDslLayout = computedLayoutType.startsWith('layout_v2_') || computedLayoutType.startsWith('auto_') || !!COMPILED_LAYOUTS[computedLayoutType];

      const textPanelSvg = (hasText && template.textTemplate && !isDslLayout)
        ? (TEXT_TEMPLATES[template.textTemplate]?.(textCtx) ?? '')
        : '';

      const decoCtx = {
        layoutType: computedLayoutType, w, h, paddingX, paddingTop, paddingBottom, innerW, innerH,
        validBrandColor, validSecondaryColor, validBackgroundColor, validAccentColor, validDepthColor, brandFont, rawName, photoDataUri,
        escapedLines, dyOffset, dynamicFontSize, dynamicTextColor, overlayText: finalOverlayText, maxLength,
        structuredText: { headline: effectiveHeadline, subheadline: effectiveSubheadline, cta: effectiveCta },
        visionResult: visionResult,
        logoUrl,
        faceCoordinates: visionResult?.faceCoordinates,
        faceBox,
        subjectBox,
        additionalSubjects,
        injectedFeatures: composition.injectedFeatures,
        designTokens,
        designSpec,
        designLanguage,
        typographyMetrics: geometryOut.typography,
        capitalizationRule,
        visualRanking,
        activeTheme,
        optimizedDsl,
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

      // Footer is always pinned to the absolute canvas bottom so large
      // negative-space margins never push the brand bar into headline territory.
      const FOOTER_H = 72;
      const footerBrandLabel = footerBrandToggle ? escapedSpacedName : '';
      const footerSection = (layoutType !== 'poster_cover' && template.showFooter)
        ? (() => {
          const footerStyle = ((index ?? 0) + (totalSlides ?? 4)) % 5;
          if (footerStyle === 0) {
            return `<rect x="0" y="${h - FOOTER_H}" width="${w}" height="${FOOTER_H}" class="footer-bg" />
              ${footerBrandLabel ? `<text x="48" y="${h - 28}" class="footer-brand">${footerBrandLabel}</text>` : ''}
              <text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 1) {
            return `<text x="${paddingX + 50}" y="${paddingTop + 52}" font-family="'${bodyFont}', system-ui, sans-serif" font-size="13px" font-weight="600" letter-spacing="3px" fill="${validSecondaryColor}" fill-opacity="0.85">${footerBrandLabel || escapedSpacedName}</text>
              <line x1="${paddingX + 50}" y1="${paddingTop + 62}" x2="${Math.min(paddingX + 280, w - paddingX - 50)}" y2="${paddingTop + 62}" stroke="${validSecondaryColor}" stroke-width="1" stroke-opacity="0.45" />
              <text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 2) {
            return `<text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          } else if (footerStyle === 3) {
            const sideLabel = (footerBrandLabel || escapedSpacedName).slice(0, 22);
            return `<text x="${w - paddingX - 24}" y="${Math.round(h * 0.55)}" font-family="'${bodyFont}', system-ui, sans-serif" font-size="11px" font-weight="600" letter-spacing="4px" fill="${validBrandColor}" fill-opacity="0.65" transform="rotate(90 ${w - paddingX - 24} ${Math.round(h * 0.55)})">${sideLabel}</text>
              <text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
          }
          return `<text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`;
        })()
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
              
              .overlay-text { font-family: '${brandFont}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
              .text-centered { text-anchor: middle; }
              .text-left { text-anchor: start; }
              .footer-bg { fill: ${validSecondaryColor}; }
              .footer-brand { font-family: '${brandFont}', system-ui, sans-serif; font-size: ${footerFontSize}px; font-weight: bold; fill: ${dynamicFooterTextColor}; letter-spacing: ${footerLetterSpacing}px; text-anchor: start; }
              .footer-tracker { font-family: '${bodyFont}', system-ui, sans-serif; font-size: 13px; font-weight: normal; fill: ${dynamicFooterTextColor}; letter-spacing: 1px; text-anchor: end; }
            </style>
          </defs>
          
          ${visualAdditions}
          ${textPanelSvg}
          
          <!-- Anti-theft transparent brand watermark across the image area (not shown on clean full bleed) -->
          ${template.showWatermark && activeTheme === 'editorial_beauty' ? `
            ${logoDataUri ? `
              <!-- Logo Watermark -->
              <image href="${logoDataUri}" x="${w / 2 - 300}" y="${h / 2 - 300}" width="600" height="600" opacity="0.02" preserveAspectRatio="xMidYMid meet" />
            ` : ''}
            <text x="${w / 2}" y="${logoDataUri ? (h / 2 + 350) : (h / 2.2)}" fill="#ffffff" fill-opacity="${logoDataUri ? '0.03' : '0.04'}" font-family="'${brandFont}', system-ui, sans-serif" font-size="28px" font-weight="bold" transform="rotate(-30 ${w / 2} ${logoDataUri ? (h / 2 + 350) : (h / 2.2)})" text-anchor="middle" letter-spacing="8px">
              AUTHENTIC WORK • ${escapedSpacedName}
            </text>
          ` : ''}
          
          ${footerSection}
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

      return {
        base64: compositeBuffer.toString('base64'),
        compositionFailed,
        failReason,
      };
    } catch (err) {
      console.error('Failed to apply Sharp text overlay. Returning raw model output:', err);
      return { base64: base64Image, compositionFailed: true, failReason: 'overlay_exception' };
    }
  }
}
