// ============================================================================
// reel-script.chain.ts — Voiceover Script Generation (≤15 seconds / 38 words)
// Only runs when generationOptions.includeVoiceover === true
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { AI_CONFIG } from '../../config/ai.config';
import type { ReelScriptResult } from '../types/chain-output.types';
import type { BrandDNARecord } from '../types/job-payload.types';
import type { CaptionGenerationResult, VisionAnalysisResult } from '../types/chain-output.types';
import type { ModelRouter } from '../orchestrator/model-router';
import { wrapSystemPrompt } from '../config/platform-system-prompt';

function parseReelScriptOutput(raw: string, brandTone: string): ReelScriptResult {
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ReelScriptParseError(`Non-JSON reel script output: ${cleaned.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const script = String(obj['script'] ?? '');
  const wordCount = script.split(/\s+/).filter(Boolean).length;

  // Get ElevenLabs voice config from brand tone
  const voiceMap = AI_CONFIG.elevenLabs.voiceMap;
  const toneKey = brandTone as keyof typeof voiceMap;
  const voiceConfig = voiceMap[toneKey] ?? voiceMap['warm_and_friendly'];

  return {
    script,
    wordCount,
    estimatedDurationSeconds: Math.ceil(wordCount / 2.5), // ~150 words per minute
    elevenLabsVoiceSettings: {
      voiceId: voiceConfig.voiceId,
      voiceName: voiceConfig.voiceName,
      stability: Number(obj['stability'] ?? AI_CONFIG.elevenLabs.defaultStability),
      similarityBoost: Number(obj['similarityBoost'] ?? AI_CONFIG.elevenLabs.defaultSimilarityBoost),
      style: Number(obj['style'] ?? AI_CONFIG.elevenLabs.defaultStyle),
    },
  };
}

export class ReelScriptChain {
  private model: ChatOpenAI | null = null;
  private readonly cfg: ReturnType<ModelRouter['selectReelScriptModel']>;

  constructor(modelRouter: ModelRouter) {
    this.cfg = modelRouter.selectReelScriptModel();
  }

  private getModel(): ChatOpenAI {
    if (!this.model) {
      this.model = new ChatOpenAI({
        modelName: this.cfg.modelId,
        temperature: this.cfg.temperature,
        maxTokens: this.cfg.maxTokens,
        timeout: this.cfg.timeoutMs,
        openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
      });
    }
    return this.model;
  }

  async generate(params: {
    caption: CaptionGenerationResult;
    visionResult: VisionAnalysisResult | null;
    brandDNA: BrandDNARecord;
  }): Promise<ReelScriptResult> {
    const { caption, visionResult, brandDNA } = params;
    const maxWords = AI_CONFIG.routing.reelScriptMaxWords;

    const systemPrompt = `You are writing a voiceover script for a social media Reel for ${brandDNA.businessName}.
The voiceover must sound EXACTLY like this person when they speak:
- Tone: ${brandDNA.primaryTone?.replace(/_/g, ' ') ?? 'warm and friendly'}
- They refer to their clients as: "${brandDNA.clientTerminology ?? 'clients'}"
- Their target client: ${brandDNA.primaryPersona ?? brandDNA.oneLiner ?? 'beauty lovers who value quality'}

STRICT RULES:
- Maximum ${maxWords} words (spoken at natural pace = 15 seconds maximum)
- No filler words (um, uh, like, basically)
- Must hook immediately — first 3 words must be compelling
- Never use these words: ${brandDNA.blacklistedWords.join(', ')}
- Written to be SPOKEN, not read — use natural speech rhythm`;

    const userPrompt = `Write a voiceover script for a Reel based on this content:

SERVICE: ${visionResult?.servicePerformed ?? 'Beauty treatment'}
TRANSFORMATION: ${visionResult?.transformationDescription ?? caption.caption.slice(0, 100)}
CAPTION HOOK: ${caption.hookSentence}

Return ONLY this JSON (no markdown):
{
  "script": "The exact words to speak — maximum ${maxWords} words",
  "stability": 0.5,
  "similarityBoost": 0.75,
  "style": 0.0
}

Set stability (0.0-1.0), similarityBoost (0.0-1.0), and style (0.0-1.0) based on the brand tone.
Higher stability = more consistent/controlled delivery. Higher style = more expressive.
For ${brandDNA.primaryTone.replace(/_/g, ' ')} tone: choose appropriate values.`;

    const response = await this.getModel().invoke([
      new SystemMessage(wrapSystemPrompt(systemPrompt)),
      new HumanMessage(userPrompt),
    ]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const result = parseReelScriptOutput(content, brandDNA.primaryTone);

    // Hard enforce word limit — truncate if model exceeded it
    if (result.wordCount > maxWords) {
      const words = result.script.split(/\s+/);
      result.script = words.slice(0, maxWords).join(' ');
      result.wordCount = maxWords;
      result.estimatedDurationSeconds = 15;
    }

    return result;
  }
}

export class ReelScriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReelScriptParseError';
  }
}
