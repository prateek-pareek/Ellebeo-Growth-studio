// ============================================================================
// tweak.chain.ts — Lightweight Caption Tweak (1/10th token cost of full gen)
// THIS CHAIN MUST NEVER BE USED FOR FULL REGENERATIONS.
// Architecture enforces this: only /tweak endpoint calls this chain.
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { AI_CONFIG } from '../../config/ai.config';
import { PromptBuilder } from '../orchestrator/prompt-builder';
import type { TweakResult } from '../types/chain-output.types';
import type { TweakRequest } from '../types/job-payload.types';
import type { BrandDNARecord } from '../types/job-payload.types';

function parseTweakOutput(raw: string): Omit<TweakResult, 'contentItemId' | 'tokenCost'> {
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new TweakParseError(`Non-JSON tweak output: ${cleaned.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;
  return {
    tweakedCaption: String(obj['caption'] ?? ''),
    tweakedHashtags: Array.isArray(obj['hashtags']) ? (obj['hashtags'] as string[]) : [],
    tweakedCallToAction: String(obj['callToAction'] ?? ''),
    brandVoiceConfidenceScore: Math.min(1, Math.max(0, Number(obj['brandVoiceConfidenceScore'] ?? 0.8))),
  };
}

export class TweakChain {
  // Tweaks always use gpt-4o-mini — cost controlled by architecture
  private readonly model: ChatOpenAI;

  constructor(private readonly promptBuilder: PromptBuilder) {
    this.model = new ChatOpenAI({
      modelName: AI_CONFIG.models.standardText.modelId,
      temperature: 0.6,           // Slightly lower temp for focused edits
      maxTokens: 512,             // Tweaks need far fewer tokens than full generation
      timeout: AI_CONFIG.timeouts.openaiMini,
      openAIApiKey: process.env['OPENAI_API_KEY'],
    });
  }

  async tweak(params: {
    request: TweakRequest;
    brandDNA: BrandDNARecord;
    previousHashtags: string[];
  }): Promise<TweakResult> {
    const { request, brandDNA, previousHashtags } = params;

    const { systemPrompt, userPrompt } = this.promptBuilder.assembleTweakPrompt({
      previousCaption: request.previousCaption,
      previousHashtags,
      tweakInstruction: request.tweakInstruction,
      brandDNA,
      platform: request.platform ?? 'instagram',
    });

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const parsed = parseTweakOutput(content);

    // Estimate cost (tweaks use far fewer tokens than full generation)
    const usage = (response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    const tokensIn = usage?.input_tokens ?? 200;
    const tokensOut = usage?.output_tokens ?? 150;
    const pricing = AI_CONFIG.pricing[AI_CONFIG.models.standardText.modelId];
    const cost = (tokensIn / 1000) * pricing.inputPer1k + (tokensOut / 1000) * pricing.outputPer1k;

    return {
      contentItemId: request.contentItemId,
      ...parsed,
      tokenCost: cost,
    };
  }
}

export class TweakParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TweakParseError';
  }
}
