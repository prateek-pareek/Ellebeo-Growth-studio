// ============================================================================
// model-router.ts — Centralised LLM Routing Decision Point
// All model selection flows through here — never hardcoded in chains.
// ============================================================================

import { AI_CONFIG } from '../../config/ai.config';
import type { LLMConfig, ModelRoutingContext } from '../types/chain-output.types';

export class ModelRouter {
  // --------------------------------------------------------------------------
  // Route text generation (caption, variants, script)
  // Decision order:
  //   1. Premium tier → Claude
  //   2. Brand DNA complexity > threshold → Claude
  //   3. Previous generation had low confidence → escalate to Claude
  //   4. Default → GPT-4o-mini
  // --------------------------------------------------------------------------

  selectTextModel(context: ModelRoutingContext): LLMConfig {
    const cfg = AI_CONFIG.models;
    const thresholds = AI_CONFIG.routing;

    // Route to Claude only when Anthropic key is configured and credited
    const anthropicConfigured = !!process.env['ANTHROPIC_API_KEY'] && process.env['USE_ANTHROPIC'] === 'true';
    const useClaude =
      anthropicConfigured &&
      (context.userTier === 'premium' ||
        context.brandDNAComplexityScore > thresholds.complexityScoreThreshold ||
        (context.previousConfidenceScore !== undefined &&
          context.previousConfidenceScore < thresholds.brandVoiceConfidenceRetryThreshold));

    if (useClaude) {
      return {
        provider: 'anthropic',
        modelId: cfg.premiumText.modelId,
        temperature: cfg.premiumText.temperature,
        maxTokens: cfg.premiumText.maxTokens,
        timeoutMs: cfg.premiumText.timeoutMs,
        systemPromptCacheKey: null,
      };
    }

    return {
      provider: 'openai',
      modelId: cfg.standardText.modelId,
      temperature: cfg.standardText.temperature,
      maxTokens: cfg.standardText.maxTokens,
      timeoutMs: cfg.standardText.timeoutMs,
      systemPromptCacheKey: null,
    };
  }

  // --------------------------------------------------------------------------
  // Vision model — always GPT-4o, but documents cache-check requirement
  // The chain itself must check the vision cache BEFORE calling this method.
  // If this method is called, a real API call will be made.
  // --------------------------------------------------------------------------

  selectVisionModel(): LLMConfig {
    const cfg = AI_CONFIG.models.vision;
    return {
      provider: 'openai',
      modelId: cfg.modelId,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
      systemPromptCacheKey: null,
    };
  }

  // --------------------------------------------------------------------------
  // Reel script model — always GPT-4o-mini (short output, cost-sensitive)
  // --------------------------------------------------------------------------

  selectReelScriptModel(): LLMConfig {
    const cfg = AI_CONFIG.models.reelScript;
    return {
      provider: 'openai',
      modelId: cfg.modelId,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
      systemPromptCacheKey: null,
    };
  }

  // --------------------------------------------------------------------------
  // Cost estimation per job (called after completion for observability)
  // --------------------------------------------------------------------------

  estimateCost(
    modelId: string,
    tokensInput: number,
    tokensOutput: number
  ): number {
    const pricing = AI_CONFIG.pricing[modelId as keyof typeof AI_CONFIG.pricing];
    if (!pricing) return 0;
    return (
      (tokensInput / 1000) * pricing.inputPer1k +
      (tokensOutput / 1000) * pricing.outputPer1k
    );
  }

  // --------------------------------------------------------------------------
  // Human-readable routing explanation (for logs/observability)
  // --------------------------------------------------------------------------

  explainRouting(context: ModelRoutingContext): string {
    if (context.userTier === 'premium') return 'Claude: premium tier';
    if (context.brandDNAComplexityScore > AI_CONFIG.routing.complexityScoreThreshold) {
      return `Claude: complexity score ${context.brandDNAComplexityScore.toFixed(2)} > ${AI_CONFIG.routing.complexityScoreThreshold}`;
    }
    if (
      context.previousConfidenceScore !== undefined &&
      context.previousConfidenceScore < AI_CONFIG.routing.brandVoiceConfidenceRetryThreshold
    ) {
      return `Claude: retry escalation (previous confidence: ${context.previousConfidenceScore.toFixed(2)})`;
    }
    return 'GPT-4o-mini: standard routing';
  }
}
