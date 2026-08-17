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
import { VisualCommunicationDirector } from './template-engine/engines/visual-communication-director';
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
  /** Soft-accepted composition — still shipped, but quality gate was weak */
  compositionWeak?: boolean;
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

/** Optional face/subject focus — used ONLY for text avoidance mapping, never to re-crop photos. */
export type FaceFocus = {
  centerXPercent?: number;
  centerYPercent?: number;
};

export async function processPortraitFit(
  imageBuffer: Buffer,
  targetW: number,
  targetH: number,
  backgroundColor: string = '#F7F4EF',
  /** cover fills the allocated box (correct size); contain letterboxes and looks undersized */
  fitMode: 'cover' | 'contain' = 'cover',
  /** @deprecated Ignored — do not re-frame client photos via face crop */
  _faceFocus?: FaceFocus,
): Promise<Buffer> {
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

    if (fitMode === 'cover') {
      // Neutral cover — never face-extract / re-frame the client's photo
      return await sharp(enhancedBuffer)
        .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
    }

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
    console.error('[Sharp Portrait Fit Error] Falling back to raw cover:', err);
    try {
      return await sharp(imageBuffer)
        .resize(targetW, targetH, { fit: fitMode === 'contain' ? 'contain' : 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
  private readonly visualCommunicationDirector: VisualCommunicationDirector;
  private readonly themeEngine: ThemeEngine;
  private readonly compositionEngine: CompositionEngine;
  private readonly artDirectionEngine: ArtDirectionEngine;
  private readonly colorCompositionEngine: ColorCompositionEngine;
  private readonly geometryCompiler: GeometryCompiler;

  constructor() {
    this.templateAgent = new TemplateAgentService();
    this.visualCommunicationDirector = new VisualCommunicationDirector();
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
  }): Promise<{ url: string; variants?: { gemini?: string; dalle?: string }; compositionFailed?: boolean; compositionWeak?: boolean; failReason?: string }> {
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
        // Task 8 (AI pipeline work list): this branch renders a solid brand-colour
        // tile, not the client's photo — the real photo's face/subject geometry
        // must not be inherited here (see faceBox handling in overlayBrandingAndText).
        visionResult: undefined,
        logoUrl,
        logoPosition,
      });
      const url = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}`);
      return {
        url,
        compositionFailed: overlayResult.compositionFailed,
        compositionWeak: overlayResult.compositionWeak,
        failReason: overlayResult.failReason,
      };
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
      return {
        url,
        compositionFailed: overlayResult.compositionFailed,
        compositionWeak: overlayResult.compositionWeak,
        failReason: overlayResult.failReason,
      };
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
        // Task 8: text-only procedural tile — no client photo involved, so no
        // inherited face/subject geometry should apply either.
        visionResult: undefined,
        designSpec,
      });
      const url = await uploadBase64ToFirebase(overlayResult.base64, tenantId, `slide_${index}`);
      return {
        url,
        variants: { gemini: url, dalle: url },
        compositionFailed: overlayResult.compositionFailed,
        compositionWeak: overlayResult.compositionWeak,
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
      // --- LAYOUT_MODE=ai_freeform: use gpt-image-2 for pixels in this
      // experimental path only. Default path (flag unset) keeps gpt-image-1,
      // exactly as before — old literal commented, not deleted.
      const imageModel = process.env['LAYOUT_MODE'] === 'ai_freeform' ? 'gpt-image-2' : 'gpt-image-1';
      // const imageModel = 'gpt-image-1'; // pre-ai_freeform default, restored above when flag unset
      try {
        console.log(`Generating ${imageModel} image for slide ${index}...`);
        const response = await openai.images.generate({
          model: imageModel,
          prompt: cleanPrompt,
          size: outputSize === '1080x1920' ? '1024x1536' as any : '1024x1024',
        });
        const base64 = response.data?.[0]?.b64_json;
        if (base64) {
          return base64;
        }
        return null;
      } catch (err) {
        console.warn(`${imageModel} generation failed for slide ${index}:`, err);
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
      // Task 8 (AI pipeline work list): this is a freshly AI-generated lifestyle/
      // studio image — the prompt above explicitly forbids people/faces/bodies, so
      // it never contains the client's subject. Reusing the appointment photo's
      // vision-analysis faceBox/subjectBox here was the actual bug: primitives and
      // text placement would avoid a face that isn't in this frame at all. Passing
      // undefined is already handled correctly downstream (verified: empty
      // protectedZones -> no spurious collision), so this is a safe, direct fix.
      visionResult: undefined,
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
        // Task 8: same AI-generated faceless lifestyle image as the primary
        // variant above (just a different model's output) — no inherited
        // client subject geometry applies here either.
        visionResult: undefined,
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
      compositionWeak: overlayResult.compositionWeak,
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

    const mapLegacyLayoutHint = (id: string): string => {
      const map: Record<string, string> = {
        split_before_after: 'before_after_side_by_side',
        full_bleed_clean: 'editorial_full_bleed',
        passepartout_text: 'editorial_portrait_hero',
        passepartout_clean: 'editorial_feature_story',
        text_only_editorial: 'premium_text_only',
        testimonial_card: 'testimonial_quote_portrait',
        giant_type_overlay: 'premium_hero_statement',
        bold_editorial_poster: 'magazine_masthead_cover',
        translucent_split: 'before_after_labeled',
        art_director_split: 'editorial_split',
        side_panel_split: 'clinical_hero',
      };
      return map[id] || id;
    };

    const beforeAfterPool = [
      'before_after_side_by_side',
      'before_after_stacked',
      'before_after_labeled',
    ];
    const mappedCover = layoutType ? mapLegacyLayoutHint(layoutType) : '';
    const isBeforeAfterJob =
      templateIntent === 'before_after'
      || mappedCover.includes('before_after')
      || (layoutType || '').includes('before_after')
      || layoutType === 'split_before_after';

    for (let i = 0; i < total; i++) {
      const concept = concepts[i];

      if (i === 0 && mappedCover) {
        agentDecisions.push({
          selected_layout_id: mappedCover,
          reasoning: 'Pre-selected cover layout from orchestrator (mapped gallery hint)',
          designSpec: params.designSpec,
        });
        uniqueLayoutsForSlides.push(mappedCover);
        continue;
      }

      // Gallery before/after templates must stay in the transformation family —
      // never fall into the generic rectangle+10% padding recipe fallback.
      if (isBeforeAfterJob) {
        const pick =
          beforeAfterPool.find(id => !uniqueLayoutsForSlides.includes(id))
          || beforeAfterPool[i % beforeAfterPool.length];
        agentDecisions.push({
          selected_layout_id: pick,
          reasoning: 'before_after gallery template family lock',
          designSpec: params.designSpec,
        });
        uniqueLayoutsForSlides.push(pick);
        continue;
      }

      // --- LAYOUT_MODE=ai_freeform: skip Template Agent selection for the
      // remaining slides too — geometry is synthesized live per slide inside
      // generateSlide() instead (see Step 3 of this pass).
      if (process.env['LAYOUT_MODE'] === 'ai_freeform') {
        const sentinel = '__ai_freeform__';
        agentDecisions.push({
          selected_layout_id: sentinel,
          reasoning: 'ai_freeform mode — geometry synthesized live from Visual Communication Spec',
          designSpec: undefined,
        });
        uniqueLayoutsForSlides.push(sentinel);
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
        // Always keep a real client photo on every slide — last-slide undefined photo
        // produced the grey placeholder square (Slide 4 regression).
        let photoUrl: string | undefined = afterPhotoUrl;
        let usingBefore = false;
        if (isFirst) {
          photoUrl = afterPhotoUrl;
        } else if (i === 1 && beforePhotoUrl) {
          photoUrl = beforePhotoUrl;
          usingBefore = true;
        } else if (isBeforeAfterJob && beforePhotoUrl && (i === 2 || concept.slideType === 'before')) {
          // Mid carousel can still show before for contrast storytelling
          photoUrl = i % 2 === 1 ? beforePhotoUrl : afterPhotoUrl;
          usingBefore = i % 2 === 1;
        } else {
          photoUrl = afterPhotoUrl;
        }
        if (isLast) {
          photoUrl = afterPhotoUrl;
          usingBefore = false;
        }

        const brief = artDirectorBrief?.find(b => b.index === concept.index);
        let currentSlideLayout = uniqueLayoutsForSlides[i];

        // Removed forced premium_text_only to allow AI Art Director to rotate freely

        // Let the AI Art Director's choice apply to the last slide too

        try {
          const MAX_SLIDE_ATTEMPTS = 3;
          let result: Awaited<ReturnType<AiImageGenerationService['generateSlide']>> | null = null;
          let attemptLayout = currentSlideLayout;
          const slideQC = new CompositionQualityController();
          const lockedFamily =
            slideQC.inferFamilyFromLayoutId(currentSlideLayout)
            || (isBeforeAfterJob ? 'before_after' : null);
          const beforeAfterRetryPool = [
            'before_after_side_by_side',
            'before_after_stacked',
            'before_after_labeled',
          ];
          for (let attempt = 0; attempt < MAX_SLIDE_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              if (isBeforeAfterJob || lockedFamily === 'before_after' || lockedFamily === 'transformation') {
                // Never escape the before/after family into clinical circles / random recipes
                const alts = beforeAfterRetryPool.filter(id => id !== attemptLayout);
                attemptLayout = alts[(attempt - 1) % Math.max(1, alts.length)] || attemptLayout;
              } else {
                const alts = slideQC.suggestAlternateLayouts(
                  attemptLayout,
                  layoutPool,
                  {
                    visualPriority: agentDecisions[i]?.designSpec?.composition?.visualPriority,
                    family: lockedFamily || undefined,
                  },
                  3,
                );
                attemptLayout = alts[(attempt - 1) % Math.max(1, alts.length)] || attemptLayout;
              }
              console.warn(
                `[SlideQC] Retry slide ${concept.index} attempt ${attempt + 1} with same-family layout '${attemptLayout}' ` +
                `(prev: ${result?.failReason || 'soft'}). Slide will not be excluded.`,
              );
            }
            // Tight-copy on retries: shorter secondary text gives the template band room
            const tightSub = attempt === 0
              ? concept.subheadline
              : (concept.subheadline || '').split(/\s+/).slice(0, Math.max(4, 12 - attempt * 3)).join(' ');
            const tightHeadline = attempt === 0
              ? concept.headline
              : (concept.headline || '').split(/\s+/).slice(0, Math.max(3, 8 - attempt)).join(' ');
            result = await this.generateSlide({
              photoUrl: photoUrl || '',
              beforePhotoUrl,
              overlayText: concept.overlayText,
              headline: tightHeadline,
              subheadline: tightSub || undefined,
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
            if (!result.compositionFailed && !result.compositionWeak) break;
            if (!result.compositionFailed && attempt >= 1) break;
          }
          // NEVER exclude a requested carousel slide — keep best rendered URL
          if (!result?.url) {
            console.error(`[SlideQC] Slide ${concept.index} produced no URL — excluding only due to hard failure.`);
            return null;
          }
          if (result.compositionFailed || result.compositionWeak) {
            console.warn(
              `[SlideQC] Slide ${concept.index} soft-accepted after retries ` +
              `(${result.failReason || 'composition'}; weak=${!!result.compositionWeak}). ` +
              `Keeping in carousel to preserve slide count.`,
            );
          }
          return {
            url: result.url,
            title: concept.title,
            label: `SLIDE ${String(concept.index).padStart(2, '0')}`,
            compositionWeak: !!(result.compositionFailed || result.compositionWeak),
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

      // --- LAYOUT_MODE=ai_freeform: skip Template Agent selection for the
      // remaining frames too — geometry is synthesized live per frame inside
      // generateSlide() instead (see Step 3 of this pass).
      if (process.env['LAYOUT_MODE'] === 'ai_freeform') {
        const sentinel = '__ai_freeform__';
        agentDecisions.push({
          selected_layout_id: sentinel,
          reasoning: 'ai_freeform mode — geometry synthesized live from Visual Communication Spec',
          designSpec: undefined,
        });
        uniqueLayoutsForFrames.push(sentinel);
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
          const frameQC = new CompositionQualityController();
          const lockedFamily = frameQC.inferFamilyFromLayoutId(currentSlideLayout);
          for (let attempt = 0; attempt < MAX_FRAME_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              const alts = frameQC.suggestAlternateLayouts(
                attemptLayout,
                layoutPool,
                {
                  visualPriority: agentDecisions[i]?.designSpec?.composition?.visualPriority,
                  family: lockedFamily || undefined,
                },
                3,
              );
              attemptLayout = alts[(attempt - 1) % Math.max(1, alts.length)] || attemptLayout;
              console.warn(
                `[SlideQC] Retry frame ${frame.index} attempt ${attempt + 1} with same-family layout '${attemptLayout}'. ` +
                `Frame will not be excluded.`,
              );
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
          if (!result?.url) {
            console.error(`[SlideQC] Frame ${frame.index} produced no URL — excluding only due to hard failure.`);
            return null;
          }
          if (result.compositionFailed) {
            console.warn(
              `[SlideQC] Frame ${frame.index} soft-accepted after retries. Keeping in story to preserve frame count.`,
            );
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
  }): Promise<{ base64: string; compositionFailed: boolean; compositionWeak?: boolean; failReason?: string }> {
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
      // Final slide must function as a CTA, but preserve its visual priority (e.g. typography_hero)
      if (isLast) {
        intent.role = 'cta';
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

      // Gallery rendererKeys (e.g. split_before_after) are NOT CompositionEngine recipes —
      // mapping them prevents the empty fallback (rectangle + 10% padding + center text).
      const legacyHintMap: Record<string, string> = {
        split_before_after: 'before_after_side_by_side',
        full_bleed_clean: 'editorial_full_bleed',
        passepartout_text: 'editorial_portrait_hero',
        passepartout_clean: 'editorial_feature_story',
        text_only_editorial: 'premium_text_only',
        testimonial_card: 'testimonial_quote_portrait',
        giant_type_overlay: 'premium_hero_statement',
        bold_editorial_poster: 'magazine_masthead_cover',
        translucent_split: 'before_after_labeled',
        art_director_split: 'editorial_split',
        side_panel_split: 'clinical_hero',
      };
      if (legacyHintMap[computedLayoutType]) {
        console.log(`[LayoutHint] Mapped '${computedLayoutType}' → '${legacyHintMap[computedLayoutType]}'`);
        computedLayoutType = legacyHintMap[computedLayoutType];
      }

      // --- LAYOUT_MODE=ai_freeform: computedLayoutType is a sentinel (see Step 4
      // of this pass, generation-orchestrator.ts), never a real recipe/family id —
      // skip the dynamic-compile fallback entirely rather than feeding it a
      // meaningless family name. resolveLayoutTemplate below already degrades
      // gracefully (universal_dynamic_* defaults) for an unrecognized id.
      if (process.env['LAYOUT_MODE'] !== 'ai_freeform' && !COMPILED_LAYOUTS[computedLayoutType]) {
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

      // Step 2: Face coords for TEXT avoidance only — never re-crop the client photo
      let faceBox: any = undefined;
      if (visionResult?.faceCoordinates && visionResult.faceCoordinates.eyesYPercent) {
        const sourceW = originalW;
        const sourceH = originalH;
        const coords = visionResult.faceCoordinates;
        // Match processPortraitFit centre cover (50/50) so avoidance aligns with real pixels
        const focusX = 50;
        const focusY = 50;

        const eyesMapped = LayoutEngine.mapSourcePercentThroughCover(
          typeof coords.faceCenterXPercent === 'number' ? coords.faceCenterXPercent : 50,
          coords.eyesYPercent,
          sourceW, sourceH, w, h, focusX, focusY,
        );
        const mouthMapped = coords.mouthYPercent
          ? LayoutEngine.mapSourcePercentThroughCover(
            typeof coords.faceCenterXPercent === 'number' ? coords.faceCenterXPercent : 50,
            coords.mouthYPercent,
            sourceW, sourceH, w, h, focusX, focusY,
          )
          : { x: eyesMapped.x, y: Math.round(eyesMapped.y + h * 0.12) };

        const faceTop = Math.max(0, eyesMapped.y - Math.round(h * 0.10));
        const faceBottom = Math.min(h, mouthMapped.y + Math.round(h * 0.12));
        const faceHeight = Math.max(120, faceBottom - faceTop);

        const hasW = typeof coords.faceWidthPercent === 'number' && coords.faceWidthPercent > 5;
        const widthPct = hasW
          ? Math.min(85, Math.max(22, coords.faceWidthPercent as number))
          : 72;
        const faceWidth = Math.round(w * (widthPct / 100));
        let faceX = Math.round(eyesMapped.x - faceWidth / 2);
        faceX = Math.max(0, Math.min(faceX, w - faceWidth));

        faceBox = { x: faceX, y: faceTop, width: faceWidth, height: faceHeight };
        console.log(`[FaceBox] Centre-cover zone x=${faceX} y=${faceTop}-${faceBottom} w=${faceWidth} (text avoidance only)`);
      }

      const additionalSubjects: BoundingBox[] = [];
      if (Array.isArray(visionResult?.protectedSubjects)) {
        for (const sub of visionResult.protectedSubjects) {
          if (sub.type === 'face' && faceBox) continue;
          const mapped = LayoutEngine.mapSourcePercentThroughCover(
            sub.centerXPercent,
            sub.centerYPercent,
            originalW,
            originalH,
            w,
            h,
            50,
            50,
          );
          const sw = Math.round(w * (Math.min(90, Math.max(8, sub.widthPercent)) / 100));
          const sh = Math.round(h * (Math.min(90, Math.max(8, sub.heightPercent)) / 100));
          additionalSubjects.push({
            x: Math.max(0, Math.min(w - sw, Math.round(mapped.x - sw / 2))),
            y: Math.max(0, Math.min(h - sh, Math.round(mapped.y - sh / 2))),
            width: sw,
            height: sh,
          });
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

      // ====================================================================
      // VISUAL COMMUNICATION DIRECTOR — shadow mode (logged only) when
      // LAYOUT_MODE is unset; authoritative geometry source below when
      // LAYOUT_MODE=ai_freeform (see synthesizeGeometryFromVisualSpec).
      // ====================================================================
      const visualSpec = await this.visualCommunicationDirector.generateSpec({
        brandName: businessName || 'Brand',
        aesthetic: (visualRanking && visualRanking.length > 0) ? visualRanking[0] : 'minimalist',
        brief: overlayText || headline || 'Post',
        slideIndex: index || 0,
        totalSlides: totalSlides || 1,
        textLength: (headline?.length || 0) + (subheadline?.length || 0),
        templateIntent: templateIntent as any,
        visionResult: visionResult,
        slideType: isFirst ? 'HOOK' : isLast ? 'CTA' : 'BODY',
      });
      console.log(`\n[Visual Communication Spec] (Shadow Mode)`);
      console.log(JSON.stringify(visualSpec, null, 2));
      console.log(`====================================================================\n`);

      // Step 3 (Plan): Optimizer + visual QC gate; alternate layout if gate fails
      // --- LAYOUT_MODE=ai_freeform: skip the recipe-table lookup here — rawDsl
      // is synthesized further below, once effectiveHeadline/Subheadline/Cta are
      // finalized, from the Art Director's own regionPlan instead.
      let rawDsl: any = process.env['LAYOUT_MODE'] === 'ai_freeform'
        ? undefined
        : COMPILED_LAYOUTS[computedLayoutType]; // original lookup, used whenever the flag is unset
      let optimizedDsl: any = undefined;
      let compositionFailed = false;
      let failReason: string | undefined;
      const compositionQC = new CompositionQualityController();

      // CTA / last-slide copy: loud lead + adaptable supporting rest (never hard-slice to N words)
      let effectiveCta = cta;
      let effectiveHeadline = headline;
      let effectiveSubheadline = subheadline;
      if (isLast) {
        if (!effectiveCta || !String(effectiveCta).trim()) {
          effectiveCta = 'Book now';
        }
        const splitLoudLead = (raw: string): { lead: string; rest: string } => {
          const words = raw.split(/\s+/).filter(Boolean);
          if (words.length === 0) return { lead: '', rest: '' };
          if (words.length <= 3) return { lead: words.join(' '), rest: '' };
          // Prefer first sentence / clause when present
          const sentenceMatch = raw.match(/^(.+?[.!?])(?:\s+|$)([\s\S]*)$/);
          if (sentenceMatch && sentenceMatch[1].split(/\s+/).length <= 8) {
            return { lead: sentenceMatch[1].trim(), rest: (sentenceMatch[2] || '').trim() };
          }
          // Adaptive lead: ~3 words soft target, expands/contracts by copy length (2–5)
          const targetLead = Math.min(5, Math.max(2, Math.round(3 + (words.length > 10 ? 1 : 0) - (words.length < 6 ? 1 : 0))));
          const targetChars = Math.round(Math.min(44, Math.max(18, raw.length * 0.32)));
          const leadWords: string[] = [];
          let chars = 0;
          for (const w of words) {
            const next = chars + w.length + (leadWords.length ? 1 : 0);
            if (leadWords.length >= 2 && (leadWords.length >= targetLead || next > targetChars)) break;
            leadWords.push(w);
            chars = next;
          }
          return {
            lead: leadWords.join(' '),
            rest: words.slice(leadWords.length).join(' ').trim(),
          };
        };

        if (!effectiveHeadline || !String(effectiveHeadline).trim()) {
          // Pick ONE authoritative source field and split lead/rest only within it — never
          // concatenate different copy fields into one blob first. Joining e.g. "Keep your glow
          // consistent" + "by reserving your next facial" and then hard-cutting by word count
          // produces grammatically broken fragments ("YOUR GLOW CONSISTENT BY RESERVING YOUR")
          // because the cut point falls mid-clause, straddling two unrelated sentences.
          const primarySource = [overlayText, subheadline, cta].find(s => s && String(s).trim())?.trim() || '';
          const { lead, rest } = splitLoudLead(primarySource || 'Ready when you are');
          effectiveHeadline = lead || 'Ready when you are';
          // Whatever wasn't consumed into the lead (from the primary source) becomes support
          // copy, plus any other still-untouched fields — each appended as its own clause,
          // never spliced mid-sentence with another field's words.
          const leftoverFields = [rest, ...[overlayText, subheadline, cta].filter(s => s && String(s).trim() && s.trim() !== primarySource)]
            .map(s => (s || '').trim())
            .filter(Boolean);
          if (leftoverFields.length) {
            effectiveSubheadline = [...leftoverFields, effectiveSubheadline].filter(Boolean).join(' ').trim();
          }
        } else if (overlayText && overlayText.trim() && !effectiveSubheadline) {
          // Headline present — put leftover overlay into support so it is not discarded
          const leftover = overlayText.replace(effectiveHeadline, '').trim();
          if (leftover) effectiveSubheadline = leftover;
        }
        console.log(
          `[CTA Copy] lead="${effectiveHeadline}" support="${(effectiveSubheadline || '').slice(0, 80)}" cta="${effectiveCta}"`,
        );
      }
      if (!effectiveHeadline && !overlayText) {
        compositionFailed = true;
        failReason = 'missing_headline';
      }

      // --- LAYOUT_MODE=ai_freeform: synthesize geometry live from the Art
      // Director's own regionPlan instead of the ~1810-entry template recipe
      // table. Everything below (DesignCompiler, LayoutEngine/Composition-
      // Optimizer, primitives, the scoring gate) already treats rawDsl
      // generically, so nothing else in this function needs to change.
      if (process.env['LAYOUT_MODE'] === 'ai_freeform') {
        rawDsl = this.artDirectionEngine.synthesizeGeometryFromVisualSpec(visualSpec, {
          faceBox,
          subjectBox,
          w,
          h,
          slideIndex: index || 0,
          textContent: { headline: effectiveHeadline, subheadline: effectiveSubheadline, cta: effectiveCta },
        });
        console.log(`[AI Freeform] Bypassing template recipe table for slide ${index ?? 0} — geometry synthesized from Visual Communication Spec`);
      }

      const runOptimize = (_layoutId: string, dslIn: any, escalatedPolicy?: any) => {
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
          const safe = 36;
          let lx = w - logoW - safe;
          let ly = h - logoH - safe;
          if (logoPosition === 'bottom_left') { lx = safe; }
          else if (logoPosition === 'top_right') { ly = safe; }
          else if (logoPosition === 'top_left') { lx = safe; ly = safe; }
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
          escalatedPolicy || geometryOut.spatial,
        );
      };

      if (rawDsl) {
        let optResult = runOptimize(computedLayoutType, rawDsl);
        optimizedDsl = optResult.dsl;

        if (optResult.suggestLayoutChange) {
          const meta0 = (optimizedDsl as any)?._compositionMeta || {};
          const failedSignatures: Array<{ axis?: string; share?: number; category: string; textKey?: string }> = [];
          const visualPriority = designLanguage?.intent?.visualPriority || 'image_hero';
          const lockedIntent = {
            visualPriority,
            readingFlow: designLanguage?.intent?.readingFlow,
            family: designLanguage?.intent?.family
              || compositionQC.inferFamilyFromLayoutId(computedLayoutType)
              || undefined,
          };
          let currentCategory = meta0.failureCategory || 'spatial_allocation';
          const regionKey = (dsl: any) => {
            const tr = dsl?._compositionMeta?.textRegion || dsl?.canvasRegions?.textRegion;
            return tr ? `${Math.round(tr.x)},${Math.round(tr.y)},${Math.round(tr.width)},${Math.round(tr.height)}` : 'none';
          };
          failedSignatures.push({
            axis: (optimizedDsl as any)?._spatialPolicy?.splitAxis,
            share: (optimizedDsl as any)?._spatialPolicy?.textShare,
            category: currentCategory,
            textKey: regionKey(optimizedDsl),
          });

          console.warn(
            `[CompositionQC] Layout '${computedLayoutType}' needs repair ` +
            `(category=${currentCategory} priority=${visualPriority} gate=${JSON.stringify(meta0.gatePredicate || {})}). ` +
            `Preserving Template Agent selection — repair before alternate.`,
          );

          let workingPolicy = (optimizedDsl as any)?._spatialPolicy || geometryOut.spatial;
          const triedAxes: Array<'overlay' | 'vertical' | 'horizontal'> = [];
          if (workingPolicy?.splitAxis) triedAxes.push(workingPolicy.splitAxis);
          const seenRegions = new Set<string>([regionKey(optimizedDsl)]);
          let bestAttempt = optResult;
          let bestScore = meta0.qualityScore ?? 0;

          const considerBest = (res: typeof optResult) => {
            const score = (res.dsl as any)?._compositionMeta?.qualityScore ?? 0;
            if (score >= bestScore) {
              bestScore = score;
              bestAttempt = res;
            }
          };

          // --- Same-template bounded repair (typography → in-place → escalate once) ---
          const maxSameTemplateRepairs = 3;
          for (let repair = 1; repair <= maxSameTemplateRepairs && optResult.suggestLayoutChange; repair++) {
            const meta = (optResult.dsl as any)?._compositionMeta || {};
            const issues: string[] = meta.qualityIssues || [];
            currentCategory = meta.failureCategory || currentCategory;

            let nextPolicy = workingPolicy;
            if (meta.needsTypographyRepair || currentCategory === 'readability') {
              // Typography first: same axis, flip bias / slight share — do NOT change axis
              nextPolicy = LayoutEngine.adjustSpatialPolicyInPlace(
                workingPolicy,
                visualPriority,
                meta.contentIntegrity?.reason || 'typography_repair',
              );
            } else if (currentCategory === 'collision' || issues.includes('subject_collision') || issues.includes('text_collision')) {
              nextPolicy = LayoutEngine.adjustSpatialPolicyInPlace(
                workingPolicy,
                visualPriority,
                'collision',
              );
            } else if (meta.needsSpatialEscalation || currentCategory === 'spatial_allocation') {
              nextPolicy = LayoutEngine.escalateSpatialPolicy(
                workingPolicy,
                visualPriority,
                issues[0] || currentCategory,
                triedAxes,
              );
            } else {
              nextPolicy = LayoutEngine.adjustSpatialPolicyInPlace(
                workingPolicy,
                visualPriority,
                currentCategory,
              );
            }

            const retry = runOptimize(computedLayoutType, rawDsl, nextPolicy);
            const rk = regionKey(retry.dsl);
            const axis = (retry.dsl as any)?._spatialPolicy?.splitAxis;
            console.log(
              `[Diagnostic Fallback] Attempt ${repair} (same-template) | Template: ${computedLayoutType} | ` +
              `Axis: ${axis} Share: ${((retry.dsl as any)?._spatialPolicy?.textShare || 0).toFixed(2)} | ` +
              `textRegion=${rk} | ` +
              `Category: ${(retry.dsl as any)?._compositionMeta?.failureCategory || (retry.suggestLayoutChange ? 'unknown' : 'PASS')}`,
            );

            if (axis && !triedAxes.includes(axis)) triedAxes.push(axis);
            considerBest(retry);

            if (seenRegions.has(rk) && retry.suggestLayoutChange) {
              console.warn(`[Diagnostic Fallback] textRegion unchanged (${rk}) — stopping this config`);
              workingPolicy = nextPolicy;
              optResult = retry;
              optimizedDsl = retry.dsl;
              break;
            }
            seenRegions.add(rk);

            workingPolicy = (retry.dsl as any)?._spatialPolicy || nextPolicy;
            optResult = retry;
            optimizedDsl = retry.dsl;
            failedSignatures.push({
              axis,
              share: (retry.dsl as any)?._spatialPolicy?.textShare,
              category: (retry.dsl as any)?._compositionMeta?.failureCategory || currentCategory,
              textKey: rk,
            });

            if (!retry.suggestLayoutChange) break;
          }

          // --- Same-family Template Agent candidates (preserve intent) ---
          if (optResult.suggestLayoutChange) {
            const beforeAfterAlts = [
              'before_after_side_by_side',
              'before_after_stacked',
              'before_after_labeled',
            ];
            const familyLock =
              lockedIntent.family
              || compositionQC.inferFamilyFromLayoutId(computedLayoutType);
            const forceBeforeAfter =
              templateIntent === 'before_after'
              || familyLock === 'before_after'
              || familyLock === 'transformation'
              || computedLayoutType.includes('before_after');

            const alternates = forceBeforeAfter
              ? beforeAfterAlts.filter(id => id !== computedLayoutType && !id.includes(computedLayoutType.replace(/_\d+$/, '')))
              : compositionQC.suggestAlternateLayouts(
                  computedLayoutType,
                  Object.keys(COMPILED_LAYOUTS),
                  lockedIntent,
                  3,
                  failedSignatures,
                );

            let attempt = maxSameTemplateRepairs;
            for (const altId of alternates) {
              attempt++;
              // Dynamically compile recipe IDs that are not yet in COMPILED_LAYOUTS
              let altDsl = COMPILED_LAYOUTS[altId];
              if (!altDsl) {
                try {
                  const layoutAssembler = new LayoutAssemblerService();
                  altDsl = layoutAssembler.compileFamilyToDSL(altId, index || 0, businessName || 'Brand');
                  registerDynamicLayout(altDsl);
                } catch {
                  continue;
                }
              }
              if (!altDsl) continue;

              // Fresh policy derived from locked visualPriority — not a failed foreign geometry
              const altPolicy = LayoutEngine.seedPolicyFromTemplate(
                altDsl,
                LayoutEngine.deriveSpatialPolicy(visualPriority, {
                  readingFlow: lockedIntent.readingFlow,
                }),
              );
              const altResult = runOptimize(altDsl.id || altId, altDsl, altPolicy);
              const altAxis = (altResult.dsl as any)?._spatialPolicy?.splitAxis;
              const altKey = regionKey(altResult.dsl);
              console.log(
                `[Diagnostic Fallback] Attempt ${attempt} (same-family) | Template: ${altId} | ` +
                `Axis: ${altAxis} Share: ${((altResult.dsl as any)?._spatialPolicy?.textShare || 0).toFixed(2)} | ` +
                `textRegion=${altKey} | priority=${visualPriority} | ` +
                `Category: ${(altResult.dsl as any)?._compositionMeta?.failureCategory || (altResult.suggestLayoutChange ? 'unknown' : 'PASS')}`,
              );
              considerBest(altResult);

              if (!altResult.suggestLayoutChange) {
                computedLayoutType = altDsl.id || altId;
                optimizedDsl = altResult.dsl;
                optResult = altResult;
                console.log(`[CompositionQC] Accepted same-family alternate '${computedLayoutType}' (priority=${visualPriority})`);
                break;
              }
              failedSignatures.push({
                axis: altAxis,
                share: (altResult.dsl as any)?._spatialPolicy?.textShare,
                category: (altResult.dsl as any)?._compositionMeta?.failureCategory || 'spatial_allocation',
                textKey: altKey,
              });
            }
          }

          // Soft-accept best attempt — NEVER drop the slide from the carousel
          if (optResult.suggestLayoutChange) {
            optimizedDsl = bestAttempt.dsl;
            optResult = { ...bestAttempt, suggestLayoutChange: false };
            if ((optimizedDsl as any)._compositionMeta) {
              (optimizedDsl as any)._compositionMeta.softAccepted = true;
              (optimizedDsl as any)._compositionMeta.compositionWeak = true;
              (optimizedDsl as any)._compositionMeta.compositionWeakReason =
                (optimizedDsl as any)._compositionMeta.failureCategory
                || ((optimizedDsl as any)._compositionMeta.qualityCritical || []).join(',')
                || 'gate_exhausted';
              (optimizedDsl as any)._compositionMeta.suggestLayoutChange = false;
            }
            failReason = failReason || 'composition_weak_soft_accept';
            console.warn(
              `[CompositionQC] Soft-accepting best composition for '${computedLayoutType}' ` +
              `(score=${bestScore.toFixed?.(1) ?? bestScore}, priority=${visualPriority}, weak=true). ` +
              `Slide will remain in carousel.`,
            );
          }
        } else if (optResult.fitActions.length) {
          console.log(`[CompositionQC] Fit cascade: ${optResult.fitActions.join(' | ')}`);
        }

        // Incomplete slide: ensure heading exists; if missing, keep soft-accepted DSL (still render)
        const textLayers = (optimizedDsl?.layers || []).filter((l: any) => l.type === 'text' || l.type === 'text_group');
        const hasHeadingBox = textLayers.some((l: any) =>
          (l.role === 'heading' || (l.children || []).some((c: any) => c.role === 'heading'))
          && l.allocatedBox
          && !(l as any)._omitForComposition,
        );
        if (textLayers.length > 0 && !hasHeadingBox && (effectiveHeadline || overlayText)) {
          console.warn(`[CompositionQC] Missing heading allocation — rendering best-effort slide (not excluding)`);
          failReason = failReason || 'missing_heading_allocation_soft';
          // Do NOT set compositionFailed — carousel must keep this slide
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
      let photoBandIsDark = true;
      let photoBandSurfaceHex = '#1A1A1A';
      try {
        // Prefer luminance under the actual text band (local contrast), not whole-image mean
        const headingBox = (optimizedDsl?.layers || []).find(
          (l: any) => l.type === 'text' && l.role === 'heading' && l.allocatedBox,
        )?.allocatedBox;
        const band = headingBox
          || (optimizedDsl as any)?._compositionMeta?.actualTextRegion
          || (optimizedDsl as any)?.canvasRegions?.textRegion;
        let statsSource = imageBuffer;
        if (band && band.width > 40 && band.height > 40) {
          const left = Math.max(0, Math.min(w - 2, Math.round(band.x)));
          const top = Math.max(0, Math.min(h - 2, Math.round(band.y)));
          const width = Math.max(2, Math.min(w - left, Math.round(band.width)));
          const height = Math.max(2, Math.min(h - top, Math.round(band.height)));
          try {
            statsSource = await sharp(imageBuffer)
              .resize(w, h, { fit: 'cover', position: 'centre' })
              .extract({ left, top, width, height })
              .toBuffer();
          } catch {
            statsSource = imageBuffer;
          }
        }
        const stats = await sharp(statsSource).stats();
        if (stats.channels && stats.channels.length >= 3) {
          const meanLuminance = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
          photoBandIsDark = meanLuminance <= 127;
          photoBandSurfaceHex = photoBandIsDark ? '#1A1A1A' : '#E8E4DE';
          // Brand-aware but MUST stay readable on this photo band (no black-on-black)
          posterTextColor = this.colorCompositionEngine.ensureReadableInk(
            photoBandIsDark ? '#FFFFFF' : validDepthColor,
            photoBandSurfaceHex,
            colorPalette,
          );
        }
      } catch (contrastErr) {
        // Non-fatal: text-only slides or corrupted buffers fall back to white text
      }

      // Apply photo-band ink for ANY slide that overlays type on a photo
      // (circle / padded / full_bleed) — not only classic full_bleed bases.
      const imageMask = String(
        ((optimizedDsl?.layers || []).find((l: any) => l.type === 'image') as any)?.mask || '',
      );
      const overlaysPhotoInk = !!photoDataUri
        && !layoutType.includes('text_only')
        && (
          isFullBleed
          || imageMask === 'full_bleed'
          || imageMask === 'circle'
          || imageMask === 'arch'
          || imageMask === 'polaroid'
          || imageMask === 'before_after_split'
          || imageMask === 'rectangle'
          || imageMask === ''
        );
      if (overlaysPhotoInk) {
        dynamicTextColor = posterTextColor;
        (optimizedDsl as any)._photoBandIsDark = photoBandIsDark;
        (optimizedDsl as any)._photoBandSurfaceHex = photoBandSurfaceHex;
      }

      // Soft-accepted / weak compositions: do NOT force solid_card here —
      // card + photo-white ink created white-on-cream regressions. Scrim/face dodge handle safety.

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
        escapedLines, dyOffset, dynamicFontSize, dynamicTextColor, posterTextColor, overlayText: finalOverlayText, maxLength,
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

      // Footer always pinned to bottom bar — never top/side brand marks that collide with headlines
      // (Slide 2: "LUMINOUS GLOW BEAUTY" over "SEAMLESS").
      const FOOTER_H = 72;
      const footerBrandLabel = footerBrandToggle ? escapedSpacedName : '';
      const footerSection = (layoutType !== 'poster_cover' && template.showFooter)
        ? `<rect x="0" y="${h - FOOTER_H}" width="${w}" height="${FOOTER_H}" class="footer-bg" />
              ${footerBrandLabel ? `<text x="48" y="${h - 28}" class="footer-brand">${footerBrandLabel}</text>` : ''}
              <text x="${w - 48}" y="${h - 28}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>`
        : '';

      // Disable diagonal AUTHENTIC watermark on face-led layouts — it muddies circle/BA slides
      const watermarkText = '';

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
          
          <!-- Anti-theft watermark disabled on photographic carousels — was muddying circle/BA faces -->
          ${''}
          
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

      // â”€â”€ Step 5: Finish Control (grain + soft vignette for premium presence) â”€â”€
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

        const vignetteSvg = Buffer.from(
          `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><radialGradient id="v" cx="50%" cy="42%" r="78%">` +
          `<stop offset="62%" stop-color="#000" stop-opacity="0"/>` +
          `<stop offset="100%" stop-color="#000" stop-opacity="0.10"/>` +
          `</radialGradient></defs>` +
          `<rect width="${w}" height="${h}" fill="url(#v)"/></svg>`,
        );

        compositeBuffer = await sharp(compositeBuffer)
          .composite([
            { input: noiseBuffer, blend: 'overlay' },
            { input: vignetteSvg, blend: 'over' },
          ])
          .png()
          .toBuffer();
      } catch (noiseErr) {
        console.warn('[Sharp Finish Control Warning] Could not apply grain/vignette, falling back to clean image:', noiseErr);
      }

      const compositionWeak = !!(optimizedDsl as any)?._compositionMeta?.compositionWeak
        || !!(optimizedDsl as any)?._compositionMeta?.softAccepted;
      const finalFailReason = failReason || ((optimizedDsl as any)?._compositionMeta?.compositionWeakReason);

      // Task 12 (AI pipeline work list): one comprehensive per-slide diagnostic —
      // what the art director wanted (visualSpec/priority) vs what the spatial
      // engine did (bboxes/coverage) vs the final outcome (primitive counts,
      // fallback reason) in a single log line, instead of piecing it together
      // from a dozen separate console lines scattered across the pipeline.
      const imageBBox = (optimizedDsl as any)?.canvasRegions?.imageRegion;
      const textCoverage: number | undefined = (optimizedDsl as any)?._compositionMeta?.qualityMetrics?.textCoverage;
      const imageCoverage = imageBBox ? (imageBBox.width * imageBBox.height) / (w * h) : undefined;
      const whitespaceRatio = (textCoverage !== undefined || imageCoverage !== undefined)
        ? Math.max(0, 1 - (textCoverage || 0) - (imageCoverage || 0))
        : undefined;
      // Every key defaults to null (not undefined) rather than being dropped by
      // JSON.stringify — a diagnostic log meant for cross-slide comparison needs
      // a consistent schema even when a given slide has no face/fallback/etc.
      console.log(`[SlideDiagnostics] slide=${index}`, JSON.stringify({
        visualCommunicationSpec: visualSpec ?? null,
        visualPriority: designLanguage?.intent?.visualPriority ?? null,
        spatialPriority: (optimizedDsl as any)?._spatialPolicy?.splitAxis ?? (optimizedDsl as any)?._compositionMeta?.spatial?.splitAxis ?? null,
        textBBox: (optimizedDsl as any)?._compositionMeta?.actualTextRegion ?? null,
        imageBBox: imageBBox ?? null,
        faceBBox: faceBox ?? null,
        imageCoverage: imageCoverage ?? null,
        textCoverage: textCoverage ?? null,
        whitespaceRatio: whitespaceRatio ?? null,
        primitiveCount: (optimizedDsl as any)?._compositionMeta?.primitiveCount ?? 0,
        primitiveSkippedCount: (optimizedDsl as any)?._compositionMeta?.primitiveSkippedCount ?? 0,
        fallbackReason: finalFailReason ?? null,
      }, null, 2));

      return {
        base64: compositeBuffer.toString('base64'),
        compositionFailed,
        compositionWeak,
        failReason: finalFailReason,
      };
    } catch (err) {
      console.error('Failed to apply Sharp text overlay. Returning raw model output:', err);
      return { base64: base64Image, compositionFailed: true, failReason: 'overlay_exception' };
    }
  }
}
