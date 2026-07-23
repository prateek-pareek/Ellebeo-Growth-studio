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
  title: string;       // Slide list label, e.g. "01 · Cover"
  headline: string;    // Massive hero text (max 6 words)
  subheadline?: string; // Optional supporting text (max 12 words)
  cta?: string;        // Optional call to action (max 4 words)
  overlayText: string; // Legacy string computed for backward compatibility
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
      maxTokens: 800,
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
Every slide must sound like the technician wrote it — on-brand, specific, never generic.
You are writing TYPOGRAPHY-READY INSTAGRAM COPY. Instagram users have 1-3 seconds of attention.
You MUST follow these strict Content Density constraints:
- headline: 2-6 words MAX (Punchy and scannable)
- subheadline: 6-12 words MAX (Optional context)
- cta: 2-4 words MAX (Optional)
NEVER write marketing paragraphs. Treat copy as a precise design object.
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

Return exactly this JSON shape:
{
  "concepts": [
    { "index": 1, "title": "01 · Cover", "headline": "Reveal Your Glow", "subheadline": "Ayurvedic Facial Therapy", "cta": "" },
    { "index": 2, "title": "02 · The technique", "headline": "Deep Hydration", "subheadline": "Using active botanicals", "cta": "" },
    { "index": 3, "title": "03 · The result", "headline": "Glass Skin", "subheadline": "Ready for the weekend", "cta": "" },
    { "index": 4, "title": "04 · Book now", "headline": "Claim Your Slot", "subheadline": "", "cta": "Book via Link" }
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
      const parsed = JSON.parse(cleaned) as any;
      if (Array.isArray(parsed.concepts) && parsed.concepts.length >= 3) {
        const enrichedConcepts: CarouselSlideConcept[] = parsed.concepts.slice(0, 5).map((c: any) => ({
          index: c.index,
          title: c.title,
          headline: c.headline || '',
          subheadline: c.subheadline || '',
          cta: c.cta || '',
          overlayText: [c.headline, c.subheadline, c.cta].filter(Boolean).join(' ')
        }));
        return { concepts: enrichedConcepts };
      }
    } catch {
      // fallback below
    }

    // Fallback: deterministic 4-slide structure
    return {
      concepts: [
        { index: 1, title: '01 · Cover', headline: hookSentence.slice(0, 40), subheadline: 'See the transformation', cta: '', overlayText: hookSentence.slice(0, 40) },
        { index: 2, title: '02 · The service', headline: serviceName.slice(0, 40), subheadline: 'Our signature approach', cta: '', overlayText: serviceName.slice(0, 40) },
        { index: 3, title: '03 · The result', headline: 'The Result', subheadline: 'Flawless execution', cta: '', overlayText: 'The Result' },
        { index: 4, title: '04 · Book now', headline: 'Book Today', subheadline: '', cta: callToAction.slice(0, 40), overlayText: callToAction.slice(0, 40) },
      ],
    };
  }
}
