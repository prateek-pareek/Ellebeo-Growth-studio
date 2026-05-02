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

// Zod-validated output schema enforcer (inline for strict mode)
function parseVisionOutput(raw: string): VisionAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VisionParseError(`Vision model returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  const result: VisionAnalysisResult = {
    servicePerformed: String(obj['servicePerformed'] ?? ''),
    serviceTags: Array.isArray(obj['serviceTags']) ? (obj['serviceTags'] as string[]) : [],
    technicalDetails: String(obj['technicalDetails'] ?? ''),
    transformationDescription: String(obj['transformationDescription'] ?? ''),
    imageQuality: validateImageQuality(obj['imageQuality']),
    facesDetected: Boolean(obj['facesDetected'] ?? false),
    settingDetected: String(obj['settingDetected'] ?? 'salon'),
  };

  if (!result.servicePerformed) {
    throw new VisionParseError('Vision result missing servicePerformed field');
  }

  return result;
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
  private readonly model: ChatOpenAI;

  constructor(
    private readonly prisma: PrismaClient,
    modelRouter: ModelRouter
  ) {
    const cfg = modelRouter.selectVisionModel();
    this.model = new ChatOpenAI({
      modelName: cfg.modelId,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeout: cfg.timeoutMs,
      openAIApiKey: process.env['OPENAI_API_KEY'],
    });
  }

  // --------------------------------------------------------------------------
  // Main Entry — Cache-first. Returns cached result if available.
  // --------------------------------------------------------------------------

  async analyse(params: {
    imageUrl: string;   // Cloudinary CDN URL (processed, accessible)
    storagePath: string; // Used to compute the cache key
    cachedResult?: string; // Pre-fetched from job payload if already cached
  }): Promise<{ result: VisionAnalysisResult; fromCache: boolean }> {
    const { imageUrl, storagePath, cachedResult } = params;

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
    const storageHash = createHash('sha256').update(storagePath).digest('hex');
    const dbCached = await this.checkDBCache(storageHash);
    if (dbCached) {
      return { result: dbCached, fromCache: true };
    }

    // 3. No cache hit — call GPT-4o Vision
    const result = await this.callVisionModel(imageUrl);

    // 4. Save to PostgreSQL cache (permanent — never expires)
    await this.saveToDBCache(storageHash, storagePath, result);

    return { result, fromCache: false };
  }

  // --------------------------------------------------------------------------
  // GPT-4o Vision API Call
  // --------------------------------------------------------------------------

  private async callVisionModel(imageUrl: string): Promise<VisionAnalysisResult> {
    const systemMessage = new SystemMessage(
      `You are an expert beauty and wellness technician analyst. 
Analyse the provided image and extract structured information about the beauty service shown.
Return ONLY valid JSON with no markdown, no explanation.`
    );

    const humanMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `Analyse this beauty/wellness treatment image. Return this exact JSON structure:
{
  "servicePerformed": "Specific service name with detail, e.g. Blonde Balayage with Ash Toning",
  "serviceTags": ["colour", "balayage", "blonde", "toning"],
  "technicalDetails": "Technical description of technique and application visible in image",
  "transformationDescription": "Human-readable description of the transformation shown",
  "imageQuality": "excellent|good|acceptable|poor",
  "facesDetected": true|false,
  "settingDetected": "e.g. salon chair, studio, outdoor"
}`,
        },
        {
          type: 'image_url',
          image_url: { url: imageUrl, detail: 'high' },
        },
      ],
    });

    const response = await this.model.invoke([systemMessage, humanMessage]);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    return parseVisionOutput(content);
  }

  // --------------------------------------------------------------------------
  // PostgreSQL Cache Read/Write
  // --------------------------------------------------------------------------

  private async checkDBCache(storageHash: string): Promise<VisionAnalysisResult | null> {
    const records = await this.prisma.$queryRaw<
      Array<{ vision_result: unknown }>
    >`
      SELECT vision_result
      FROM image_vision_cache
      WHERE storage_object_hash = ${storageHash}
      LIMIT 1
    `;

    if (!records[0]) return null;

    const raw = records[0].vision_result;
    if (typeof raw === 'object' && raw !== null) {
      return raw as VisionAnalysisResult;
    }
    return null;
  }

  private async saveToDBCache(
    storageHash: string,
    storagePath: string,
    result: VisionAnalysisResult
  ): Promise<void> {
    const modelVersion = AI_CONFIG.models.vision.modelId;
    await this.prisma.$executeRaw`
      INSERT INTO image_vision_cache (storage_object_hash, storage_path, vision_result, model_version)
      VALUES (${storageHash}, ${storagePath}, ${JSON.stringify(result)}::jsonb, ${modelVersion})
      ON CONFLICT (storage_object_hash) DO NOTHING
    `;
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
