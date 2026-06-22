// ============================================================================
// caption-generation.chain.ts — Caption Generation with Auto-Retry
// Routes to GPT-4o-mini or Claude based on ModelRouter decision.
// Auto-retries with amplified brand voice instruction if confidence < 0.6
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

    const activeModel = this.buildModel(llmConfig);
    const result = await this.callModel(activeModel, assembledPrompt);

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

    // Option 1: GPT-4o-mini (fast, cheap) — always the primary.
    const openAiConfig: LLMConfig = { provider: 'openai', modelId: 'gpt-4o-mini', temperature: 0.75, maxTokens: 1024, timeoutMs: 30000, systemPromptCacheKey: null };

    const openAiPromise = this.generate({ assembledPrompt, llmConfig: openAiConfig, brandDNABlacklist, allowRetry })
      .then(result => ({ ...result, generatedBy: 'ChatGPT' }))
      .catch(() => null);

    // Option 2: Use Gemini when a key is configured.
    // As of June 2026, Google AI Studio issues Auth keys with an AQ. prefix (not AIzaSy...).
    // Both formats are valid server-side keys — any non-empty GEMINI_API_KEY is usable.
    const geminiKey = process.env['GEMINI_API_KEY'];
    const geminiUsable = !!geminiKey && geminiKey.length > 0;

    const secondPromise = geminiUsable
      ? this.callGemini(assembledPrompt, brandDNABlacklist)
          .then(result => ({ ...result, generatedBy: 'Gemini' }))
          .catch(() => this.generateGpt4oMiniOption(assembledPrompt, brandDNABlacklist, allowRetry))
      : this.generateGpt4oMiniOption(assembledPrompt, brandDNABlacklist, allowRetry);

    const results = await Promise.all([openAiPromise, secondPromise]);
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
  // GPT-4o-mini fallback — used as Option 2 when Gemini is unavailable or fails.
  // Cheaper than gpt-4o while still producing quality captions.
  // --------------------------------------------------------------------------

  private generateGpt4oMiniOption(
    assembledPrompt: AssembledPrompt,
    brandDNABlacklist: string[],
    allowRetry: boolean
  ): Promise<(CaptionGenerationResult & { generatedBy: string }) | null> {
    const gpt4oMiniConfig: LLMConfig = { provider: 'openai', modelId: 'gpt-4o-mini', temperature: 0.85, maxTokens: 1024, timeoutMs: 45000, systemPromptCacheKey: null };
    return this.generate({ assembledPrompt, llmConfig: gpt4oMiniConfig, brandDNABlacklist, allowRetry })
      .then(result => ({ ...result, generatedBy: 'GPT-4o-mini' }))
      .catch(() => null);
  }

  // --------------------------------------------------------------------------
  // Gemini direct call (no LangChain — uses Google SDK directly)
  // --------------------------------------------------------------------------

  private async callGemini(prompt: AssembledPrompt, blacklist: string[]): Promise<CaptionGenerationResult> {
    const genAI = new GoogleGenerativeAI(process.env['GEMINI_API_KEY']!);
    // Use the technician's system prompt as a real systemInstruction (not concatenated
    // into the user turn) so Gemini weights it the same way OpenAI does.
    const model = genAI.getGenerativeModel({
      model: process.env['GEMINI_MODEL'] || 'gemini-2.5-flash',
      systemInstruction: wrapSystemPrompt(prompt.systemPrompt),
      generationConfig: {
        // Match the OpenAI standard-text config so the two options compare fairly.
        temperature: AI_CONFIG.models.standardText.temperature,
        maxOutputTokens: AI_CONFIG.models.standardText.maxTokens,
        responseMimeType: 'application/json',
      },
    });

    const response = await model.generateContent(prompt.userPrompt);
    const raw = response.response.text();
    const result = parseCaptionOutput(raw);
    const usage = response.response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? estimateTokens(`${prompt.systemPrompt}\n${prompt.userPrompt}`);
    const outputTokens = usage?.candidatesTokenCount ?? estimateTokens(raw);
    result.tokenUsage = { inputTokens, outputTokens };
    this.checkBlacklist(result.caption, blacklist);
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
