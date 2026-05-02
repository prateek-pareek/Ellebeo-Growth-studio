// ============================================================================
// prompt-builder.ts — Modular Prompt Assembly (Pure TypeScript, No LLM Call)
// Assembles the complete prompt from named, independently cacheable fragments.
// ============================================================================

import type {
  BrandDNARecord,
  GoldenExample,
  BusinessGoalType,
  SocialPlatform,
} from '../types/job-payload.types';
import type { VisionAnalysisResult, AssembledPrompt } from '../types/chain-output.types';
import { PromptCache } from './prompt-cache';

// Business goal → prompt framing instruction
const GOAL_FRAMING: Record<BusinessGoalType, string> = {
  attract_new_clients: 'This content should specifically attract new clients who have never visited before. Emphasise the transformation, the welcoming atmosphere, and an irresistible reason to book.',
  fill_quiet_days: 'This content should create urgency and promote available appointment slots. Include a sense of exclusivity or a time-sensitive angle without being pushy.',
  promote_high_margin_services: 'This content should position this service as a premium, high-value treatment worth investing in. Highlight the craft, the results, and the longevity of the outcome.',
  build_brand_authority: 'This content should establish expertise and industry authority. Showcase technical knowledge, professional techniques, and the technician\'s mastery of their craft.',
  retain_existing_clients: 'This content should speak to loyal, returning clients. Create a sense of community, appreciation, and the value of maintaining their results.',
  launch_new_service: 'This content should generate excitement and curiosity about a new service offering. Create intrigue, highlight the innovation, and invite early adopters.',
  seasonal_promotion: 'This content should capitalise on the current season or upcoming occasion. Make it timely, relevant, and create gentle urgency.',
};

const PLATFORM_RULES: Record<SocialPlatform, string> = {
  instagram: `FORMAT RULES FOR INSTAGRAM:\n- First sentence IS the hook — must stop the scroll\n- Hashtags: 15-25 hashtags\n- Include one clear CTA (book, DM, link in bio)`,
  facebook: `FORMAT RULES FOR FACEBOOK:\n- Longer, more conversational (200-400 words)\n- Hashtags: 3-5 maximum\n- No hashtag spam`,
  tiktok: `FORMAT RULES FOR TIKTOK:\n- Hook MUST be in first 2-3 WORDS\n- Short energetic sentences\n- Hashtags: 3-5 only`,
};

const CAPTION_LENGTH_TARGETS = {
  short: { minWords: 50, maxWords: 80 },
  medium: { minWords: 80, maxWords: 130 },
  long: { minWords: 130, maxWords: 200 },
};

export class PromptBuilder {
  constructor(private readonly cache: PromptCache) {}

  async assembleGenerationPrompt(params: {
    brandDNA: BrandDNARecord;
    visionResult: VisionAnalysisResult | null;
    businessGoal: BusinessGoalType;
    goldenExamples: GoldenExample[];
    platform: SocialPlatform;
  }): Promise<AssembledPrompt> {
    const { brandDNA, visionResult, businessGoal, goldenExamples, platform } = params;

    const { brandDNAFragment, brandDNACacheHit } = await this.getBrandDNAFragment(brandDNA);
    const { goldenExamplesFragment, goldenExamplesCacheHit } =
      await this.getGoldenExamplesFragment(brandDNA.tenantId, brandDNA.version, goldenExamples);

    const systemPrompt = this.buildSystemPrompt(brandDNAFragment);
    const visionSection = visionResult ? this.buildVisionSection(visionResult) : '';
    const goalSection = GOAL_FRAMING[businessGoal] ?? 'Generate engaging content.';
    const platformSection = PLATFORM_RULES[platform];
    const lengthTarget = CAPTION_LENGTH_TARGETS[brandDNA.captionLengthPreference];
    const lengthSection = `Caption body should be ${lengthTarget.minWords}–${lengthTarget.maxWords} words (excluding hashtags).`;

    const userPrompt = [
      '## APPOINTMENT ANALYSIS',
      visionSection || '(No image — generate based on appointment context only)',
      '',
      '## YOUR BUSINESS GOAL THIS WEEK',
      goalSection,
      '',
      '## PLATFORM',
      platformSection,
      '',
      '## LENGTH REQUIREMENT',
      lengthSection,
      '',
      '## YOUR BEST PAST CONTENT (FEW-SHOT EXAMPLES)',
      goldenExamplesFragment,
      '',
      '## OUTPUT FORMAT',
      this.buildOutputFormatSection(),
    ].filter(Boolean).join('\n');

    return {
      systemPrompt,
      userPrompt,
      cacheHits: { brandDNAFragment: brandDNACacheHit, goldenExamplesFragment: goldenExamplesCacheHit },
    };
  }

  assembleTweakPrompt(params: {
    previousCaption: string;
    previousHashtags: string[];
    tweakInstruction: string;
    brandDNA: BrandDNARecord;
    platform: SocialPlatform;
  }): { systemPrompt: string; userPrompt: string } {
    const { previousCaption, previousHashtags, tweakInstruction, brandDNA } = params;

    const systemPrompt = `You are editing a social media caption for ${brandDNA.businessName}.
Their brand voice is: ${brandDNA.primaryTone.replace(/_/g, ' ')}.
They NEVER use these words: ${brandDNA.blacklistedWords.join(', ')}.
Make ONLY the specific change requested. Preserve the brand voice exactly.
Return JSON with the same structure as the original caption.`;

    const userPrompt = `ORIGINAL CAPTION:\n${previousCaption}\n\nORIGINAL HASHTAGS:\n${previousHashtags.join(' ')}\n\nTWEAK REQUESTED:\n${tweakInstruction}\n\nApply only this specific change. Return the updated caption and hashtags as JSON.`;

    return { systemPrompt, userPrompt };
  }

  private async getBrandDNAFragment(
    brandDNA: BrandDNARecord
  ): Promise<{ brandDNAFragment: string; brandDNACacheHit: boolean }> {
    const cached = await this.cache.getBrandDNAFragment(brandDNA.tenantId, brandDNA.version);
    if (cached) return { brandDNAFragment: cached, brandDNACacheHit: true };
    const fragment = this.buildBrandDNAFragment(brandDNA);
    await this.cache.setBrandDNAFragment(brandDNA.tenantId, brandDNA.version, fragment);
    return { brandDNAFragment: fragment, brandDNACacheHit: false };
  }

  private async getGoldenExamplesFragment(
    tenantId: string,
    version: number,
    examples: GoldenExample[]
  ): Promise<{ goldenExamplesFragment: string; goldenExamplesCacheHit: boolean }> {
    const cached = await this.cache.getGoldenExamplesFragment(tenantId, version);
    if (cached) return { goldenExamplesFragment: cached, goldenExamplesCacheHit: true };
    const fragment = this.buildGoldenExamplesFragment(examples);
    await this.cache.setGoldenExamplesFragment(tenantId, version, fragment);
    return { goldenExamplesFragment: fragment, goldenExamplesCacheHit: false };
  }

  private buildSystemPrompt(brandDNAFragment: string): string {
    return `You are a specialist social media copywriter for beauty and wellness technicians.
Your ONLY job is to write content that sounds EXACTLY like the specific technician described below.

${brandDNAFragment}

CRITICAL RULES:
- Never write generic AI phrases like "luxurious", "transformative experience", "indulge in"
- Never use any word from the Blacklisted Words list
- Always write in first person as the technician
- Return ONLY valid JSON — no markdown, no explanation, no preamble`;
  }

  private buildBrandDNAFragment(dna: BrandDNARecord): string {
    return `## YOUR BRAND DNA\n**Business:** ${dna.businessName} — ${dna.locationCity}\n**Persona:** ${dna.personaDescription}\n**Primary Tone:** ${dna.primaryTone.replace(/_/g, ' ')}\n${dna.secondaryTone ? `**Secondary Tone:** ${dna.secondaryTone.replace(/_/g, ' ')}\n` : ''}**You call your clients:** "${dna.clientTerminology}"\n**Target Audience:** ${dna.targetAudience}\n**What makes you different:** ${dna.uniqueSellingPoint}\n**Hero Services:** ${dna.heroServices.join(', ')}\n\n**Vocabulary you love:** ${dna.preferredVocabulary.join(', ')}\n**BLACKLISTED WORDS (NEVER USE):** ${dna.blacklistedWords.join(', ')}\n\n**Emojis:** ${dna.useEmojis ? `Yes, ${dna.emojiStyle} use` : 'No emojis'}\n**Your CTA style:** ${dna.preferredCTAStyle}`;
  }

  private buildGoldenExamplesFragment(examples: GoldenExample[]): string {
    if (examples.length === 0) return '(No examples available — write in the brand voice described above)';
    const exampleText = examples.slice(0, 5).map((ex, i) =>
      `**Example ${i + 1} (${ex.platform}, quality: ${ex.qualityScore.toFixed(1)}/1.0):**\n"${ex.captionText}"\nHashtags: ${ex.hashtags.slice(0, 5).join(' ')}...`
    ).join('\n\n');
    return `Study these real examples of this technician's best content. Your output must match this style:\n\n${exampleText}`;
  }

  private buildVisionSection(vision: VisionAnalysisResult): string {
    return `**Service Performed:** ${vision.servicePerformed}\n**Technical Details:** ${vision.technicalDetails}\n**Transformation:** ${vision.transformationDescription}\n**Service Tags:** ${vision.serviceTags.join(', ')}\n**Setting:** ${vision.settingDetected}\n**Image Quality:** ${vision.imageQuality}\n**Faces Visible:** ${vision.facesDetected ? 'Yes' : 'No'}`;
  }

  private buildOutputFormatSection(): string {
    return `Return ONLY this exact JSON structure — no markdown, no extra fields:\n{\n  "caption": "The full caption text",\n  "hookSentence": "The first sentence optimised for the More cutoff",\n  "callToAction": "The CTA phrase",\n  "hashtags": ["hashtag1", "hashtag2"],\n  "altText": "Accessibility description of the image",\n  "estimatedReadTime": 12,\n  "brandVoiceConfidenceScore": 0.87\n}\n\nThe brandVoiceConfidenceScore must be your honest self-assessment (0.0–1.0) of how well this caption matches the provided Brand DNA.`;
  }
}
