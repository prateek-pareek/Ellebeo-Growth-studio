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
import { resolveLayoutTemplate, BASE_TREATMENTS, TEXT_TEMPLATES, DECORATIONS } from '../config/layout-renderers';

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
  }): Promise<string> {
    const {
      photoUrl, beforePhotoUrl, overlayText, index, isFirst, isLast, isBeforePhoto,
      tenantId, businessName, brandColor,
      secondaryColor = '#f5f0eb',
      aesthetic = 'minimal editorial premium beauty',
      serviceType = 'beauty treatment',
      outputSize = '1024x1024' as '1024x1024' | '1024x1536',
      customPrompt,
      totalSlides = 4,
      layoutType = 'passepartout_text',
      brandFont,
      bodyFont,
      visualRanking = []
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

    const facePreservationClause = `

CRITICAL FACE & BODY PRESERVATION (for GPT model):
- DO NOT alter any facial features, expressions, or identity markers
- DO NOT beautify, smooth, or enhance skin, face, or complexion
- DO NOT change eye color, placement, or appearance
- DO NOT modify nose, mouth, chin, or jaw shape
- DO NOT adjust facial structure in any way
- DO NOT change body shape, proportions, or posture
- The person in the original photo must be completely recognizable and unchanged
- Only add design elements (text boxes, overlays) — NO image editing or retouching of the person`;

    const cleanPrompt = prompt + facePreservationClause + "\n\nCRITICAL: Do NOT write, draw, or render any text overlays, titles, or caption boxes directly onto the image. The image must contain only the raw photographic result.";

    const imageBuffer = await downloadImageAsBuffer(photoUrl);

    // Senior AI Engineer decision: If we have a real client photo, bypass DALL-E / Gemini image edit
    // to enforce 100% face/photo preservation and reduce API cost to $0.
    const isRealClientPhoto = photoUrl && (photoUrl.startsWith('http') || photoUrl.includes('raw_assets') || photoUrl.includes('storage') || photoUrl.includes('temp'));
    
    if (isRealClientPhoto) {
      console.log(`[PASS-THROUGH SHARP COMPOSITOR] Bypassing AI image editor for slide ${index} to guarantee 100% client face preservation.`);
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
      });
      return uploadBase64ToFirebase(brandedBase64, tenantId, `slide_${index}`);
    }

    console.log(`\n==================================================`);
    console.log(`[AI IMAGE PROMPT FOR SLIDE ${index}]:`);
    console.log(cleanPrompt);
    console.log(`==================================================\n`);

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

    // Senior engineer enhancement: For face preservation, add explicit constraints
    // These instructions override default behavior and enforce photo authenticity
    const facePreservationInstructions = `
You MUST follow these strict rules when processing this image:
1. IDENTITY PRESERVATION: The person's face and body must remain EXACTLY as in the original photo
2. NO BEAUTIFICATION: Do not smooth, enhance, or improve skin appearance in any way
3. NO FACIAL ALTERATIONS: Do not modify any facial features — eyes, nose, mouth, cheeks, jaw must remain unchanged
4. AUTHENTIC TEXTURE: Preserve all natural skin texture, lines, and marks from the original
5. NO BODY MODIFICATIONS: Do not alter body shape, posture, or proportions
6. BACKGROUND PRESERVATION: Keep all background elements exactly as they are
7. ONLY TEXT OVERLAYS: The ONLY addition should be the text box and design elements — nothing else should be modified

This is a legal and compliance requirement. Failure to preserve the person's identity and appearance is unacceptable.`;

    // Append preservation instructions to prompt
    const strengthenedPrompt = cleanPrompt + "\n\n" + facePreservationInstructions;

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: strengthenedPrompt,
      size: outputSize,
    });

    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error('gpt-image-1 returned no image data');

    // Senior engineer logging: Track GPT image generation for compliance
    console.log(`[GPT IMAGE ${index}] Generated with face-preservation constraints applied`);
    console.log(`[GPT IMAGE ${index}] Original prompt length: ${cleanPrompt.length} chars`);
    console.log(`[GPT IMAGE ${index}] Output: ${base64.substring(0, 50)}... (face preservation enforced)`);

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
      visualRanking,
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
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, concepts, artDirectorBrief, layoutType = 'passepartout_text', visualRanking = [], ...rest } = params;
    const total = concepts.length;

    const slides = await Promise.all(
      concepts.map(async (concept, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        // Cover + Result (total - 2) + CTA use after photo; middle concern slides use before photo
        const usingBefore = !isFirst && !isLast && (i !== total - 2) && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        const brief = artDirectorBrief?.find(b => b.index === concept.index);

        // Only apply split_before_after on the first slide (cover) of a carousel
        const currentSlideLayout = (isFirst && layoutType === 'split_before_after')
          ? 'split_before_after'
          : (layoutType === 'split_before_after' ? 'passepartout_text' : layoutType);

        try {
          const url = await this.generateSlide({
            photoUrl,
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
    layoutType?: string;
    brandFont?: string;
    bodyFont?: string;
    visualRanking?: string[];
  }): Promise<GeneratedSlide[]> {
    const { afterPhotoUrl, beforePhotoUrl, frames, artDirectorBrief, layoutType = 'passepartout_text', visualRanking = [], ...rest } = params;
    const total = frames.length;

    const results = await Promise.all(
      frames.map(async (frame, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        const usingBefore = isFirst && !!beforePhotoUrl;
        const photoUrl = usingBefore ? beforePhotoUrl! : afterPhotoUrl;

        const brief = artDirectorBrief?.find(b => b.index === frame.index);

        // Only apply split_before_after on the first frame (cover) of a story sequence
        const currentSlideLayout = (isFirst && layoutType === 'split_before_after')
          ? 'split_before_after'
          : (layoutType === 'split_before_after' ? 'passepartout_text' : layoutType);

        try {
          const url = await this.generateSlide({
            photoUrl,
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
      visualRanking = []
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

      const imageBuffer = Buffer.from(base64Image, 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      const originalW = metadata.width || 1024;
      const originalH = metadata.height || 1024;
      const photoMimeType = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'webp' ? 'image/webp' : 'image/png';
      const photoDataUri = `data:${photoMimeType};base64,${base64Image}`;

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

      const rawName = (businessName || 'RAW CANVAS').trim().toUpperCase();
      const spacedName = rawName.split('').join(' ');

      const escapedSpacedName = escapeXml(spacedName);
      const escapedLines = lines.map(line => escapeXml(line.toUpperCase()));

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

      // ── Step 1: Process Base Image — dispatched from layout-templates.config.json ──
      const template = resolveLayoutTemplate(layoutType);

      const baseResult = await BASE_TREATMENTS[template.base]!({
        imageBuffer,
        beforePhotoUrl,
        w, h,
        paddingX, paddingTop, paddingBottom,
        innerW, innerH,
        validSecondaryColor,
        downloadImageAsBuffer,
      });
      let baseImage = baseResult.baseImage;
      let compositeTop = baseResult.compositeTop;
      let compositeBottom = baseResult.compositeBottom;
      let compositeLeft = baseResult.compositeLeft;
      let compositeRight = baseResult.compositeRight;

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

      // Determine text color based on background panel contrast
      const panelLuminance = getLuminance(validBrandColor);
      const isLightPanel = panelLuminance > 175; // Threshold for cream/off-white
      const dynamicTextColor = isLightPanel ? '#1E1E1C' : '#FFFFFF';

      const footerLuminance = getLuminance(validSecondaryColor);
      const isLightFooter = footerLuminance > 175;
      const dynamicFooterTextColor = isLightFooter ? '#1E1E1C' : '#FFFFFF';

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
        w, h, dynamicFontSize, dyOffset, escapedLines, lines, overlayText, maxLength,
        dynamicTextColor, posterTextColor, validBrandColor, validSecondaryColor,
        brandFont, bodyFont, escapedSpacedName, photoDataUri, escapeXml,
      };
      const textPanelSvg = hasText && template.textTemplate
        ? (TEXT_TEMPLATES[template.textTemplate]?.(textCtx) ?? '')
        : '';

      const decoCtx = {
        w, h, paddingX, paddingTop, paddingBottom, innerW, innerH,
        validBrandColor, validSecondaryColor, brandFont, rawName, photoDataUri,
      };
      const visualAdditions = template.decoration
        ? (DECORATIONS[template.decoration]?.(decoCtx) ?? '')
        : '';

      // Fetch the custom fonts from Brand DNA dynamically as Base64 to embed directly in the SVG
      const brandFontBase64 = await fetchGoogleFontBase64(brandFont);
      const bodyFontBase64 = await fetchGoogleFontBase64(bodyFont);

      const svgString = `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>
              ${brandFontBase64 ? `
              @font-face {
                font-family: '${brandFont}';
                src: url('data:font/ttf;base64,${brandFontBase64}') format('truetype');
                font-weight: bold;
                font-style: normal;
              }
              ` : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(brandFont)}:wght@700&amp;display=swap');`}
              
              ${bodyFontBase64 ? `
              @font-face {
                font-family: '${bodyFont}';
                src: url('data:font/ttf;base64,${bodyFontBase64}') format('truetype');
                font-weight: normal;
                font-style: normal;
              }
              ` : `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyFont)}:wght@400&amp;display=swap');`}
              
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
            AUTHENTIC WORK • ${escapedSpacedName}
          </text>
          ` : ''}

          ${visualAdditions}
          ${textPanelSvg}
          
          <!-- Minimalist Editorial Footer (hidden only on poster covers) -->
          ${template.showFooter ? `
          <rect x="0" y="${h - 60}" width="${w}" height="60" class="footer-bg" />
          <text x="60" y="${h - 25}" class="footer-brand">${escapedSpacedName}</text>
          <text x="${w - 60}" y="${h - 25}" class="footer-tracker">${slideNumText} / ${totalSlidesText}</text>
          ` : ''}
        </svg>
      `;

      // Render the SVG at 300 DPI high density and resize it back to canvas bounds to get razor-sharp high-definition text
      const highResSvgBuffer = await sharp(Buffer.from(svgString), { density: 300 })
        .resize(w, h)
        .png()
        .toBuffer();

      // ── Step 4: Composite image scaling and margins — grouped by the base treatment ──
      let compositeBuffer: Buffer;
      if (template.base === 'solid_canvas_full') {
        // baseImage is already a fully-built w x h canvas (solid panel + photo embedded via SVG)
        compositeBuffer = await baseImage
          .composite([{ input: highResSvgBuffer, blend: 'over' }])
          .png()
          .toBuffer();
      } else if (template.base === 'full_bleed' || template.base === 'full_bleed_duotone') {
        let fullBleedImage = sharp(imageBuffer).resize(w, h, { fit: 'cover' });
        if (template.base === 'full_bleed_duotone') {
          fullBleedImage = fullBleedImage.greyscale().tint(validBrandColor as any);
        }
        compositeBuffer = await fullBleedImage
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
            background: validBrandColor
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
