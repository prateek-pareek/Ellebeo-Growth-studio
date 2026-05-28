// ============================================================================
// platform-variant.chain.ts — Multi-Platform Caption Adaptation
// Only runs when more than one platform is in generationOptions.platform
// Instagram is the primary — this chain adapts it for Facebook and TikTok
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { PlatformVariantResult } from '../types/chain-output.types';
import type { CaptionGenerationResult } from '../types/chain-output.types';
import type { BrandDNARecord, SocialPlatform } from '../types/job-payload.types';
import type { ModelRouter } from '../orchestrator/model-router';
import { wrapSystemPrompt } from '../config/platform-system-prompt';

const PLATFORM_ADAPTATION_RULES: Partial<Record<SocialPlatform, string>> = {
  facebook: `Adapt this caption for Facebook:
- Slightly longer and more conversational (can be 2-3 short paragraphs)
- Storytelling tone — share the "why" or the feeling behind the service
- Maximum 3-5 hashtags, positioned naturally (not at the end as a block)
- More personal, community-focused language
- Remove any Instagram-specific language ("link in bio", etc.)`,

  tiktok: `Adapt this caption for TikTok:
- Hook must land in the FIRST 2-3 WORDS — make it punchy and scroll-stopping
- Short, energetic sentences. Maximum 3 sentences in the caption body.
- Trend-aware language — use current TikTok beauty vernacular where authentic
- Maximum 5 hashtags — include 1-2 trending beauty tags (#BeautyTok, #HairTok, etc.)
- Remove all Instagram-specific language
- Add a "follow for more" style soft CTA`,
};

function parsePlatformVariantOutput(
  raw: string,
  platform: SocialPlatform
): PlatformVariantResult {
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new PlatformVariantParseError(
      `Non-JSON platform variant output for ${platform}: ${cleaned.slice(0, 200)}`
    );
  }

  const obj = parsed as Record<string, unknown>;
  return {
    platform,
    caption: String(obj['caption'] ?? ''),
    hashtags: Array.isArray(obj['hashtags']) ? (obj['hashtags'] as string[]) : [],
    callToAction: String(obj['callToAction'] ?? ''),
  };
}

export class PlatformVariantChain {
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
        maxTokens: 800,
        timeout: this.cfg.timeoutMs,
        openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
      });
    }
    return this.model;
  }

  async generateVariants(params: {
    primaryCaption: CaptionGenerationResult;
    targetPlatforms: SocialPlatform[];
    brandDNA: BrandDNARecord;
  }): Promise<PlatformVariantResult[]> {
    const { primaryCaption, targetPlatforms, brandDNA } = params;

    // Filter to only platforms that actually need adaptation (not instagram — that's the primary)
    const platformsToAdapt = targetPlatforms.filter((p) => p !== 'instagram');

    if (platformsToAdapt.length === 0) return [];

    // Run all platform adaptations concurrently
    const variants = await Promise.all(
      platformsToAdapt.map((platform) =>
        this.adaptForPlatform({ primaryCaption, platform, brandDNA })
      )
    );

    return variants;
  }

  private async adaptForPlatform(params: {
    primaryCaption: CaptionGenerationResult;
    platform: SocialPlatform;
    brandDNA: BrandDNARecord;
  }): Promise<PlatformVariantResult> {
    const { primaryCaption, platform, brandDNA } = params;
    const adaptationRules = PLATFORM_ADAPTATION_RULES[platform] ?? '';

    const systemPrompt = `You are adapting a social media caption for a different platform.
The brand voice must remain IDENTICAL — only the format and style changes.
Business: ${brandDNA.businessName}
Tone: ${brandDNA.primaryTone.replace(/_/g, ' ')}
NEVER use these words: ${brandDNA.blacklistedWords.join(', ')}`;

    const userPrompt = `PRIMARY INSTAGRAM CAPTION:
"${primaryCaption.caption}"

CTA: ${primaryCaption.callToAction}
Original hashtags: ${primaryCaption.hashtags.slice(0, 5).join(' ')}

${adaptationRules}

Return ONLY this JSON:
{
  "caption": "The adapted caption for ${platform}",
  "hashtags": ["tag1", "tag2"],
  "callToAction": "Platform-specific CTA"
}`;

    const response = await this.getModel().invoke([
      new SystemMessage(wrapSystemPrompt(systemPrompt)),
      new HumanMessage(userPrompt),
    ]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    return parsePlatformVariantOutput(content, platform);
  }
}

export class PlatformVariantParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformVariantParseError';
  }
}
