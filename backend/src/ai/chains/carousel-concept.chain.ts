// ============================================================================
// carousel-concept.chain.ts — AI-generated slide concepts for carousel posts
// Generates 3–5 named slide concepts (title + overlay text) via GPT-4o-mini.
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { wrapSystemPrompt } from '../config/platform-system-prompt';
import { buildBrandVoiceBlock, type BrandVoiceContext } from '../config/brand-voice';

export interface CarouselSlideConcept {
  index: number;
  title: string;       // Slide list label, e.g. "01 · The result revealed"
  overlayText: string; // Short text rendered on the image (max 55 chars)
}

export interface CarouselConceptResult {
  concepts: CarouselSlideConcept[];
}

export class CarouselConceptChain {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 600,
      openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
    });
  }

  async generate(params: {
    hookSentence: string;
    callToAction: string;
    serviceName: string;
    clientFirstName?: string;
    businessGoal: string;
    brandName: string;
    slideCount?: number;
    brandVoice?: BrandVoiceContext;
  }): Promise<CarouselConceptResult> {
    const {
      hookSentence,
      callToAction,
      serviceName,
      clientFirstName,
      businessGoal,
      brandName,
      slideCount = 4,
      brandVoice,
    } = params;

    const count = Math.min(5, Math.max(3, slideCount));
    const voiceBlock = buildBrandVoiceBlock(brandVoice);

    const systemPrompt = `You generate Instagram carousel slide concepts for beauty and wellness businesses.
Every overlay line must sound like the technician wrote it — on-brand, specific, never generic.
Return ONLY valid JSON, no markdown, no explanation.`;

    const userPrompt = `Create ${count} carousel slide concepts for this beauty appointment post.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient first name: ${clientFirstName}` : ''}
Hook line: "${hookSentence}"
CTA: "${callToAction}"
Goal: ${businessGoal.replace(/_/g, ' ')}
${voiceBlock ? `\n${voiceBlock}\n` : ''}
Generate exactly ${count} slides:
- Slide 1: Cover — eye-catching opener using the hook
- Slides 2 to ${count - 1}: Body slides — service detail, technique, or result context
- Slide ${count}: CTA — invite to book or follow

Rules for each slide:
- title: descriptive concept name (max 40 chars) formatted as "NN · Concept name"
- overlayText: text shown on the image (max 55 chars, punchy and readable)

Return exactly this JSON shape:
{
  "concepts": [
    { "index": 1, "title": "01 · Cover", "overlayText": "Short hook text" },
    { "index": 2, "title": "02 · The technique", "overlayText": "What was done" },
    { "index": 3, "title": "03 · The result", "overlayText": "The outcome" },
    { "index": 4, "title": "04 · Book now", "overlayText": "CTA text here" }
  ]
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(wrapSystemPrompt(systemPrompt)),
        new HumanMessage(userPrompt),
      ]);
      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      const cleaned = content
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as CarouselConceptResult;
      if (Array.isArray(parsed.concepts) && parsed.concepts.length >= 3) {
        return { concepts: parsed.concepts.slice(0, 5) };
      }
    } catch (err) {
      console.error('[CarouselConceptChain] Generation failed, using fallback:', err);
    }

    // Fallback: deterministic 4-slide structure
    return {
      concepts: [
        { index: 1, title: '01 · Cover', overlayText: hookSentence.slice(0, 55) },
        { index: 2, title: '02 · The service', overlayText: serviceName.slice(0, 55) },
        { index: 3, title: '03 · The result', overlayText: 'See the transformation' },
        { index: 4, title: '04 · Book now', overlayText: callToAction.slice(0, 55) },
      ],
    };
  }
}
