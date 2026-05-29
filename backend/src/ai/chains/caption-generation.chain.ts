// ============================================================================
// caption-generation.chain.ts — Caption Generation with Auto-Retry
// Routes to GPT-4o-mini or Claude based on ModelRouter decision.
// Auto-retries with amplified brand voice instruction if confidence < 0.6
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AI_CONFIG } from '../../config/ai.config';
import type { CaptionGenerationResult, LLMConfig, AssembledPrompt } from '../types/chain-output.types';
import { wrapSystemPrompt } from '../config/platform-system-prompt';

function parseCaptionOutput(raw: string): CaptionGenerationResult {
  // Strip markdown code fences if model wrapped the JSON
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CaptionParseError(`Model returned non-JSON: ${cleaned.slice(0, 300)}`);
  }

  const obj = parsed as Record<string, unknown>;

  return {
    caption: String(obj['caption'] ?? ''),
    hookSentence: String(obj['hookSentence'] ?? ''),
    callToAction: String(obj['callToAction'] ?? ''),
    hashtags: Array.isArray(obj['hashtags']) ? (obj['hashtags'] as string[]).map(h => String(h).replace(/^#+/, '')) : [],
    altText: String(obj['altText'] ?? ''),
    estimatedReadTime: Number(obj['estimatedReadTime'] ?? 10),
    brandVoiceConfidenceScore: Math.min(1, Math.max(0, Number(obj['brandVoiceConfidenceScore'] ?? 0.5))),
  };
}

function estimateTokens(text: string): number {
  // Lightweight heuristic: ~4 chars/token for English mixed content
  return Math.max(1, Math.ceil(text.length / 4));
}

// ---------------------------------------------------------------------------
// Caption Generation Chain
// ---------------------------------------------------------------------------

export class CaptionGenerationChain {
  // --------------------------------------------------------------------------
  // Run with auto-retry escalation
  // --------------------------------------------------------------------------

  async generate(params: {
    assembledPrompt: AssembledPrompt;
    llmConfig: LLMConfig;
    brandDNABlacklist: string[];
    allowRetry?: boolean;
  }): Promise<CaptionGenerationResult> {
    const { assembledPrompt, llmConfig, brandDNABlacklist, allowRetry = true } = params;

    let activeModel: BaseChatModel;
    let result: CaptionGenerationResult;

    try {
      activeModel = this.buildModel(llmConfig);
      result = await this.callModel(activeModel, assembledPrompt);
    } catch (primaryErr) {
      if (process.env['GEMINI_API_KEY']) {
        console.warn('[CaptionChain] Primary model failed, falling back to Gemini:', (primaryErr as Error).message);
        activeModel = new ChatGoogleGenerativeAI({
          model: 'gemini-1.5-flash',
          apiKey: process.env['GEMINI_API_KEY'],
          temperature: 0.75,
          maxOutputTokens: 1024,
        }) as any;
        result = await this.callModel(activeModel, assembledPrompt);
      } else {
        throw primaryErr;
      }
    }

    // Validate no blacklisted words slipped through
    this.checkBlacklist(result.caption, brandDNABlacklist);

    // Auto-retry with amplified instruction if confidence is too low
    if (
      allowRetry &&
      result.brandVoiceConfidenceScore < AI_CONFIG.routing.brandVoiceConfidenceRetryThreshold
    ) {
      const amplifiedPrompt = this.amplifyBrandVoice(assembledPrompt, result);
      const retryResult = await this.callModel(activeModel, amplifiedPrompt);
      // Return whichever has higher confidence
      return retryResult.brandVoiceConfidenceScore >= result.brandVoiceConfidenceScore
        ? retryResult
        : result;
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Run multiple models in parallel to generate options
  // --------------------------------------------------------------------------

  async generateMultipleOptions(params: {
    assembledPrompt: AssembledPrompt;
    brandDNABlacklist: string[];
    allowRetry?: boolean;
  }): Promise<{ primary: CaptionGenerationResult; options: (CaptionGenerationResult & { generatedBy: string })[] }> {
    const { assembledPrompt, brandDNABlacklist, allowRetry = true } = params;

    const modelConfigs: LLMConfig[] = [
      { provider: 'openai', modelId: 'gpt-4o-mini', temperature: 0.75, maxTokens: 1024, timeoutMs: 30000, systemPromptCacheKey: null },
      { provider: 'openai', modelId: 'gpt-4o', temperature: 0.7, maxTokens: 1024, timeoutMs: 45000, systemPromptCacheKey: null },
      // Claude only when Anthropic key is explicitly enabled
      ...(process.env['USE_ANTHROPIC'] === 'true'
        ? [{ provider: 'anthropic' as const, modelId: 'claude-3-5-sonnet-20241022', temperature: 0.72, maxTokens: 1024, timeoutMs: 45000, systemPromptCacheKey: null }]
        : []),
    ];

    const promises = modelConfigs.map(config => 
      this.generate({ assembledPrompt, llmConfig: config, brandDNABlacklist, allowRetry })
        .then(result => ({ ...result, generatedBy: config.modelId }))
        .catch(err => {
          console.error(`[CaptionGenerationChain] Model ${config.modelId} failed:`, err);
          return null;
        })
    );

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null) as (CaptionGenerationResult & { generatedBy: string })[];

    if (validResults.length === 0) {
      throw new Error("All models failed to generate a caption.");
    }

    return {
      primary: validResults[0],
      options: validResults
    };
  }

  // --------------------------------------------------------------------------
  // Internal LLM call
  // --------------------------------------------------------------------------

  private async callModel(
    model: BaseChatModel,
    prompt: AssembledPrompt
  ): Promise<CaptionGenerationResult> {
    const messages = [
      new SystemMessage(wrapSystemPrompt(prompt.systemPrompt)),
      new HumanMessage(prompt.userPrompt),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const parsed = parseCaptionOutput(content);
    const promptText = `${prompt.systemPrompt}\n${prompt.userPrompt}`;
    const usage = (response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    parsed.tokenUsage = {
      inputTokens: usage?.input_tokens ?? estimateTokens(promptText),
      outputTokens: usage?.output_tokens ?? estimateTokens(content),
    };
    return parsed;
  }

  // --------------------------------------------------------------------------
  // Build the correct model instance from LLMConfig
  // --------------------------------------------------------------------------

  private buildModel(config: LLMConfig): BaseChatModel {
    if (config.provider === 'anthropic') {
      return new ChatAnthropic({
        modelName: config.modelId,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
      });
    }

    if (config.provider === 'google') {
      return new ChatGoogleGenerativeAI({
        model: config.modelId,
        apiKey: process.env['GEMINI_API_KEY'],
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      }) as any;
    }

    return new ChatOpenAI({
      modelName: config.modelId,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeout: config.timeoutMs,
      openAIApiKey: process.env['OPENAI_API_KEY'],
    });
  }

  // --------------------------------------------------------------------------
  // Amplified retry prompt — appended to original prompt when confidence is low
  // --------------------------------------------------------------------------

  private amplifyBrandVoice(
    original: AssembledPrompt,
    previousResult: CaptionGenerationResult
  ): AssembledPrompt {
    const amplification = `
⚠️ BRAND VOICE RETRY REQUIRED ⚠️

Your previous attempt scored ${previousResult.brandVoiceConfidenceScore.toFixed(2)} brand voice confidence.
This is too low. The caption must sound MORE like this specific person.

Previous caption (DO NOT copy — rewrite it):
"${previousResult.caption}"

What to fix:
- Read the Brand DNA persona description again carefully
- Use more of their preferred vocabulary
- Match their exact tone — not a generic version of it
- Start completely fresh — do not modify the previous caption

You MUST score your new attempt higher. Be more specific to this person's voice.`;

    return {
      ...original,
      userPrompt: original.userPrompt + amplification,
    };
  }

  // --------------------------------------------------------------------------
  // Blacklist check — hard validation after generation
  // --------------------------------------------------------------------------

  private checkBlacklist(caption: string, blacklist: string[]): void {
    const lowerCaption = caption.toLowerCase();
    const violations = blacklist.filter((word) =>
      lowerCaption.includes(word.toLowerCase())
    );

    if (violations.length > 0) {
      throw new BlacklistViolationError(
        `Caption contains blacklisted words: ${violations.join(', ')}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class CaptionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptionParseError';
  }
}

export class BlacklistViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlacklistViolationError';
  }
}
