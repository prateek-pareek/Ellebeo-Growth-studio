import { AI_CONFIG } from '../../../config/ai.config';

export function estimateUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = AI_CONFIG.pricing[modelId as keyof typeof AI_CONFIG.pricing];
  if (!pricing) {
    const fallback = AI_CONFIG.pricing['claude-3-5-sonnet-20241022'];
    return (inputTokens / 1000) * fallback.inputPer1k + (outputTokens / 1000) * fallback.outputPer1k;
  }
  return (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
}
