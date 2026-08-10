// ============================================================================
// vision-analysis.chain.ts — GPT-4o Vision Chain with PostgreSQL Cache
// CRITICAL: Never calls GPT-4o Vision if cache hit exists for this image hash.
// ============================================================================

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import type { VisionAnalysisResult } from '../types/chain-output.types';
import type { ModelRouter } from '../orchestrator/model-router';
import { wrapSystemPrompt } from '../config/platform-system-prompt';
import { firebaseStorage } from '../../config/firebase.client';

const VISION_PROMPT_VERSION = 'v2.5';

// Zod-validated output schema enforcer (inline for strict mode)
function parseVisionOutput(raw: string): VisionAnalysisResult {
  // Extract the first JSON object from the string, ignoring conversational filler or markdown
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleaned = jsonMatch ? jsonMatch[0] : raw;
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new VisionParseError(`Vision model returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  const result: VisionAnalysisResult = {
    servicePerformed: String(obj['servicePerformed'] ?? ''),
    serviceTags: Array.isArray(obj['serviceTags']) ? (obj['serviceTags'] as string[]) : [],
    technicalDetails: String(obj['technicalDetails'] ?? ''),
    transformationDescription: String(obj['transformationDescription'] ?? ''),
    keyVisualDetail: String(obj['keyVisualDetail'] ?? ''),
    imageQuality: validateImageQuality(obj['imageQuality']),
    facesDetected: Boolean(obj['facesDetected'] ?? false),
    settingDetected: String(obj['settingDetected'] ?? 'salon'),
    framingType: validateFramingType(obj['framingType']),
    suitabilityScores: {
      technicalQuality: Number((obj['suitabilityScores'] as any)?.technicalQuality ?? 80),
      brandCompatibility: Number((obj['suitabilityScores'] as any)?.brandCompatibility ?? 50),
      composition: Number((obj['suitabilityScores'] as any)?.composition ?? 50),
    }
  };

  if (obj['faceCoordinates']) {
    const coords = obj['faceCoordinates'] as Record<string, number>;
    if (typeof coords.eyesYPercent === 'number' && typeof coords.mouthYPercent === 'number') {
      result.faceCoordinates = {
        eyesYPercent: coords.eyesYPercent,
        mouthYPercent: coords.mouthYPercent,
        faceCenterXPercent: typeof coords.faceCenterXPercent === 'number' ? coords.faceCenterXPercent : undefined,
        faceWidthPercent: typeof coords.faceWidthPercent === 'number' ? coords.faceWidthPercent : undefined,
      };
      console.log(`[Vision Model] Successfully extracted face coordinates: Eyes at ${coords.eyesYPercent}%, Mouth at ${coords.mouthYPercent}%, X at ${coords.faceCenterXPercent ?? 'n/a'}%`);
    } else {
      console.log(`[Vision Model] GPT returned malformed faceCoordinates:`, coords);
    }
  } else {
    console.log(`[Vision Model] No faceCoordinates detected by GPT in this image.`);
  }

  if (!result.servicePerformed) {
    throw new VisionParseError('Vision result missing servicePerformed field');
  }

  return result;
}

function validateFramingType(
  val: unknown
): 'macro' | 'portrait' | 'wide' | 'unknown' {
  const valid = ['macro', 'portrait', 'wide', 'unknown'];
  return valid.includes(String(val)) ? (val as 'macro' | 'portrait' | 'wide' | 'unknown') : 'unknown';
}

function validateImageQuality(
  val: unknown
): 'excellent' | 'good' | 'acceptable' | 'poor' {
  const valid = ['excellent', 'good', 'acceptable', 'poor'];
  return valid.includes(String(val)) ? (val as 'excellent' | 'good' | 'acceptable' | 'poor') : 'acceptable';
}

// ---------------------------------------------------------------------------
// Vision Analysis Chain
// ---------------------------------------------------------------------------

export class VisionAnalysisChain {
  private model: ChatGoogleGenerativeAI | null = null;
  private readonly cfg: ReturnType<ModelRouter['selectVisionModel']>;

  constructor(
    private readonly prisma: PrismaClient,
    modelRouter: ModelRouter
  ) {
    this.cfg = modelRouter.selectVisionModel();
  }

  private getModel(): ChatGoogleGenerativeAI {
    if (!this.model) {
      if (!process.env['GEMINI_API_KEY']) {
        throw new Error('GEMINI_API_KEY is required for vision analysis (image processing)');
      }
      this.model = new ChatGoogleGenerativeAI({
        model: this.cfg.modelId,
        temperature: this.cfg.temperature,
        maxOutputTokens: this.cfg.maxTokens,
        apiKey: process.env['GEMINI_API_KEY'],
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      });
    }
    return this.model;
  }

  // --------------------------------------------------------------------------
  // Main Entry — Buffer-First Pipeline with Deterministic Caching
  // --------------------------------------------------------------------------

  async analyse(params: {
    imageUrl: string;    // Legacy fallback URL (not used for extraction anymore)
    storagePath: string; // Raw storage path (Firebase or HTTP)
    imageHash?: string | null; 
    cachedResult?: string | null; 
  }): Promise<{ result: VisionAnalysisResult; fromCache: boolean }> {
    const { storagePath, imageHash, cachedResult } = params;

    // 1. Check in-payload cache (fastest — already in memory)
    if (cachedResult) {
      try {
        const parsed = JSON.parse(cachedResult) as VisionAnalysisResult;
        if (parsed.faceCoordinates) {
          console.log(`[Vision Model] CACHE HIT: Successfully extracted face coordinates: Eyes at ${parsed.faceCoordinates.eyesYPercent}%, Mouth at ${parsed.faceCoordinates.mouthYPercent}%`);
          return { result: parsed, fromCache: true };
        } else {
          console.log(`[Vision Model] CACHE HIT: No faceCoordinates detected in cached result. Forcing re-evaluation...`);
        }
      } catch {
        // Corrupted cache — fall through
      }
    }

    // 2. Download Image to Buffer Securely (Bypasses 403s and prepares for Gemini Base64)
    let imageBuffer: Buffer;
    try {
      imageBuffer = await this.downloadImageToBuffer(storagePath);
    } catch (err: any) {
      console.error(`[Vision Model] FATAL: Failed to download image for analysis: ${err.message}`);
      throw err; // Fail fast rather than sending garbage to Gemini
    }

    // 3. Compute deterministic hash from raw bytes (Perfect cache key)
    const finalHash = imageHash || createHash('sha256').update(imageBuffer).digest('hex');
    const dbCached = await this.checkDBCache(finalHash);
    if (dbCached) {
      return { result: dbCached, fromCache: true };
    }

    // 4. Encode to Base64 Data URI (Strict requirement for Gemini multimodal)
    // We assume JPEG/PNG based on common usage; Gemini accepts generic image/jpeg data uris fine
    const base64DataUri = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    // 5. Call Vision Model
    const result = await this.callVisionModel(base64DataUri);

    // 6. Save to PostgreSQL cache
    await this.saveToDBCache(finalHash, result);

    return { result, fromCache: false };
  }

  // --------------------------------------------------------------------------
  // Image Loading Service (Internal)
  // --------------------------------------------------------------------------

  private async downloadImageToBuffer(storagePath: string): Promise<Buffer> {
    // If it's a standard HTTP(S) public URL, fetch it directly
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      const response = await fetch(storagePath);
      if (!response.ok) {
        throw new Error(`HTTP error fetching image: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    // Otherwise, assume it's a Firebase Storage path (e.g. tenants/...)
    if (!firebaseStorage) {
      throw new Error('Firebase Storage is not configured. Cannot fetch raw image for Vision Pipeline.');
    }
    
    // Use the backend's admin credentials to pull the file directly over gRPC
    console.log(`[Vision Model] Downloading image buffer securely from Firebase Admin SDK...`);
    const bucket = firebaseStorage.bucket();
    const file = bucket.file(storagePath);
    
    try {
      const [buffer] = await file.download();
      return buffer;
    } catch (err: any) {
      throw new Error(`Firebase Admin download failed for path '${storagePath}': ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // GPT-4o / Gemini Vision API Call
  // --------------------------------------------------------------------------

  private async callVisionModel(base64DataUri: string): Promise<VisionAnalysisResult> {
    const systemPrompt = `You are a senior beauty industry analyst with 15 years of hands-on experience across hair colour, skin treatments, lashes, brows, nails, and injectables.
Your job is to extract precise, technically accurate information from beauty treatment photos so a copywriter can write a specific, authentic social media caption.
The quality of your analysis directly determines whether the caption sounds generic or genuinely expert.
Return ONLY valid JSON — no markdown, no explanation, no preamble.`;

    const humanMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `Analyse this beauty/wellness treatment image in detail. Return this exact JSON structure:

{
  "servicePerformed": "Precise service name using correct industry terminology — e.g. 'Lived-In Balayage with Olaplex Toning to Level 9 Ash Blonde', not just 'Hair colour'. Be as specific as visible evidence allows.",
  "serviceTags": ["specific technique tags — e.g. 'balayage', 'root-smudge', 'glass-skin', 'lip-flip', 'lash-lift', 'french-tip' — 3 to 6 tags, most specific first"],
  "technicalDetails": "2–3 sentences of technically accurate craft detail: placement method, product type if inferrable, application technique, colour depth/tone/direction, tool marks visible, layering, blending — the kind of detail only an expert would notice",
  "transformationDescription": "1–2 sentences describing the result from the client's perspective: what changed, how it looks, the emotional effect — written to be used in a social caption",
  "keyVisualDetail": "The single most striking, specific, caption-worthy detail in this image — the one thing that makes this result stand out. One short sentence. E.g. 'The way the colour melts from a deep root shadow into a bright, icy blonde at the ends' or 'The extreme lift on her inner corners makes her eyes look dramatically wider'. This should anchor the hook sentence.",
  "imageQuality": "excellent|good|acceptable|poor",
  "facesDetected": true,
  "faceCoordinates": {
    "eyesYPercent": 35,
    "mouthYPercent": 50,
    "faceCenterXPercent": 50,
    "faceWidthPercent": 35
  },
  "settingDetected": "salon chair|nail table|treatment bed|studio|outdoor|home — be specific",
  "framingType": "macro|portrait|wide|unknown — macro is very close up, portrait is head/shoulders, wide is full body/room",
  "suitabilityScores": {
    "technicalQuality": 95,
    "brandCompatibility": 20,
    "composition": 60
  }
}

If facesDetected is true, you MUST include faceCoordinates. Imagine a grid from 0–100 on both axes (0 = top/left, 100 = bottom/right). Estimate eyesYPercent and mouthYPercent to the nearest 5%. Also estimate faceCenterXPercent (horizontal center of the face) and faceWidthPercent (how wide the face is relative to the frame — typically 25–45 for portraits, wider for macros). If no face is detected, omit faceCoordinates entirely.
CRITICAL: Score technicalQuality (0-100) on sharpness, exposure, and noise. Score brandCompatibility (0-100) purely on the background and setting (is it a messy peeling wall/distracting=20, or a clean luxury salon/aesthetic=95?). Score composition (0-100) on framing and subject placement.
Be specific. Vague answers like 'hair was coloured' or 'skin looks better' are useless. Use the technical vocabulary a professional technician would use.`,
        },
        {
          type: 'image_url',
          image_url: { url: base64DataUri, detail: 'high' },
        },
      ],
    });

    const response = await this.getModel().invoke([new SystemMessage(systemPrompt), humanMessage]);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const usage = (response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    return parseVisionOutput(content);
  }

  // --------------------------------------------------------------------------
  // PostgreSQL Cache Read/Write
  // --------------------------------------------------------------------------

  private async checkDBCache(hash: string): Promise<VisionAnalysisResult | null> {
    try {
      const record = await this.prisma.imageVisionCache.findUnique({
        where: { hash },
      });

      if (!record) return null;

      // Validate that the cached record matches our current model & prompt version
      if (record.model !== this.cfg.modelId || record.promptVersion !== VISION_PROMPT_VERSION) {
        return null;
      }

      const parsed = record.result as unknown as VisionAnalysisResult;
      if (parsed.faceCoordinates) {
        console.log(`[Vision Model] DB CACHE HIT: Successfully extracted face coordinates: Eyes at ${parsed.faceCoordinates.eyesYPercent}%, Mouth at ${parsed.faceCoordinates.mouthYPercent}%`);
        return parsed;
      } else {
        console.log(`[Vision Model] DB CACHE HIT: No faceCoordinates detected in cached result. INVALIDATING DB CACHE...`);
        return null;
      }
    } catch {
      return null;
    }
  }

  private async saveToDBCache(
    hash: string,
    result: VisionAnalysisResult
  ): Promise<void> {
    try {
      await this.prisma.imageVisionCache.upsert({
        where: { hash },
        update: {
          result: result as unknown as any,
          model: this.cfg.modelId,
          promptVersion: VISION_PROMPT_VERSION,
        },
        create: {
          hash,
          result: result as unknown as any,
          model: this.cfg.modelId,
          promptVersion: VISION_PROMPT_VERSION,
        },
      });
    } catch {
      // non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class VisionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionParseError';
  }
}
