// ============================================================================
// caption-generation.chain.ts — Caption Generation with Auto-Retry
// Routes to GPT-4o-mini or Claude based on ModelRouter decision.
// Auto-retries with amplified brand voice instruction if confidence < 0.6
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AI_CONFIG } from '../../config/ai.config';
import type { CaptionGenerationResult, LLMConfig, AssembledPrompt } from '../types/chain-output.types';

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
    hashtags: Array.isArray(obj['hashtags']) ? (obj['hashtags'] as string[]) : [],
    altText: String(obj['altText'] ?? ''),
    estimatedReadTime: Number(obj['estimatedReadTime'] ?? 10),
    brandVoiceConfidenceScore: Math.min(1, Math.max(0, Number(obj['brandVoiceConfidenceScore'] ?? 0.5))),
  };
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

    const model = this.buildModel(llmConfig);
    const result = await this.callModel(model, assembledPrompt);

    // Validate no blacklisted words slipped through
    this.checkBlacklist(result.caption, brandDNABlacklist);

    // Auto-retry with amplified instruction if confidence is too low
    if (
      allowRetry &&
      result.brandVoiceConfidenceScore < AI_CONFIG.routing.brandVoiceConfidenceRetryThreshold
    ) {
      const amplifiedPrompt = this.amplifyBrandVoice(assembledPrompt, result);
      const retryResult = await this.callModel(model, amplifiedPrompt);
      // Return whichever has higher confidence
      return retryResult.brandVoiceConfidenceScore >= result.brandVoiceConfidenceScore
        ? retryResult
        : result;
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Internal LLM call
  // --------------------------------------------------------------------------

  private async callModel(
    model: BaseChatModel,
    prompt: AssembledPrompt
  ): Promise<CaptionGenerationResult> {
    const messages = [
      new SystemMessage(prompt.systemPrompt),
      new HumanMessage(prompt.userPrompt),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    return parseCaptionOutput(content);
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
