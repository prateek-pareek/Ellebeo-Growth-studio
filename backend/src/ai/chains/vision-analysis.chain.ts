// ============================================================================
// vision-analysis.chain.ts — GPT-4o Vision Chain with PostgreSQL Cache
// CRITICAL: Never calls GPT-4o Vision if cache hit exists for this image hash.
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AI_CONFIG } from '../../config/ai.config';
import type { VisionAnalysisResult } from '../types/chain-output.types';
import type { ModelRouter } from '../orchestrator/model-router';
import { wrapSystemPrompt } from '../config/platform-system-prompt';

const VISION_PROMPT_VERSION = 'v2.0';

// Zod-validated output schema enforcer (inline for strict mode)
function parseVisionOutput(raw: string): VisionAnalysisResult {
  // Strip markdown code fences if model wraps output in ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
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
  };

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
  private model: ChatOpenAI | null = null;
  private readonly cfg: ReturnType<ModelRouter['selectVisionModel']>;

  constructor(
    private readonly prisma: PrismaClient,
    modelRouter: ModelRouter
  ) {
    this.cfg = modelRouter.selectVisionModel();
  }

  private getModel(): ChatOpenAI {
    if (!this.model) {
      if (!process.env['OPENAI_API_KEY']) {
        throw new Error('OPENAI_API_KEY is required for vision analysis (image processing)');
      }
      this.model = new ChatOpenAI({
        modelName: this.cfg.modelId,
        temperature: this.cfg.temperature,
        maxTokens: this.cfg.maxTokens,
        timeout: this.cfg.timeoutMs,
        openAIApiKey: process.env['OPENAI_API_KEY'],
      });
    }
    return this.model;
  }

  // --------------------------------------------------------------------------
  // Main Entry — Cache-first. Returns cached result if available.
  // --------------------------------------------------------------------------

  async analyse(params: {
    imageUrl: string;   // Cloudinary CDN URL (processed, accessible)
    storagePath: string; // Used to compute the cache key if no imageHash
    imageHash?: string | null; // s3ObjectHash if available
    cachedResult?: string | null; // Pre-fetched from job payload if already cached
  }): Promise<{ result: VisionAnalysisResult; fromCache: boolean }> {
    const { imageUrl, storagePath, imageHash, cachedResult } = params;

    // 1. Check in-payload cache (fastest — already in memory)
    if (cachedResult) {
      try {
        const parsed = JSON.parse(cachedResult) as VisionAnalysisResult;
          return { result: parsed, fromCache: true };
      } catch {
        // Corrupted cache — fall through to DB check
      }
    }

    // 2. Compute image hash and check PostgreSQL cache
    const finalHash = imageHash || createHash('sha256').update(storagePath).digest('hex');
    const dbCached = await this.checkDBCache(finalHash);
    if (dbCached) {
      return { result: dbCached, fromCache: true };
    }

    // 3. No cache hit — call GPT-4o Vision
    const result = await this.callVisionModel(imageUrl);

    // 4. Save to PostgreSQL cache
    await this.saveToDBCache(finalHash, result);

    return { result, fromCache: false };
  }

  // --------------------------------------------------------------------------
  // GPT-4o Vision API Call
  // --------------------------------------------------------------------------

  private async callVisionModel(imageUrl: string): Promise<VisionAnalysisResult> {
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
  "settingDetected": "salon chair|nail table|treatment bed|studio|outdoor|home — be specific",
  "framingType": "macro|portrait|wide|unknown — macro is very close up, portrait is head/shoulders, wide is full body/room"
}

Be specific. Vague answers like 'hair was coloured' or 'skin looks better' are useless. Use the technical vocabulary a professional technician would use.`,
        },
        {
          type: 'image_url',
          image_url: { url: imageUrl, detail: 'high' },
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

      return record.result as unknown as VisionAnalysisResult;
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
