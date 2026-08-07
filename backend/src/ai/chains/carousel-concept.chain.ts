// ============================================================================
// carousel-concept.chain.ts — AI-generated slide concepts for carousel posts
// Generates 3–5 named slide concepts (title + overlay text) via GPT-4o-mini.
// ============================================================================

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { wrapSystemPrompt } from '../config/platform-system-prompt';
import { buildBrandVoiceBlock, type BrandVoiceContext } from '../config/brand-voice';

export interface CarouselSlideConcept {
  index: number;
  title: string;       // Slide list label, e.g. "01 · Cover"
  slideType?: string;  // Semantic type, e.g. "HOOK", "PROBLEM", "SOLUTION"
  headline: string;    // Massive hero text (max 6 words)
  subheadline?: string; // Optional supporting text (max 12 words)
  cta?: string;        // Optional call to action (max 4 words)
  overlayText: string; // Legacy string computed for backward compatibility
}

export interface CarouselConceptResult {
  concepts: CarouselSlideConcept[];
}

export class CarouselConceptChain {
  private model: ChatGoogleGenerativeAI;

  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-flash-latest',
      temperature: 0.7,
      maxOutputTokens: 8192,
      apiKey: process.env['GEMINI_API_KEY'] ?? '',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
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
    semanticFlow?: import('../services/narrative-planner.service').SemanticSlide[];
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
      semanticFlow = [],
      brandVoice,
    } = params;

    const count = Math.min(5, Math.max(3, slideCount));
    const voiceBlock = buildBrandVoiceBlock(brandVoice);

    const systemPrompt = `You generate Instagram carousel slide concepts for beauty and wellness businesses.
Every slide must sound like the technician wrote it — on-brand, specific, never generic.
You are writing TYPOGRAPHY-READY INSTAGRAM COPY. Instagram users have 1-3 seconds of attention.
You MUST follow these strict Content Density constraints:
- headline: 1-3 words MAX (Extremely punchy. If it is longer, you have failed.)
- subheadline: 6-12 words MAX (Optional context)
- cta: 2-4 words MAX (Optional)
CRITICAL BRAND CONTENT RULE for Body Slides:
- Ensure all body slides closely follow the provided Narrative Template. Do not deviate.
- Set the slideType JSON property strictly to the [Type] provided in the Narrative Template.
NEVER inject variable placeholders, hex codes, or technical IDs.
NEVER write marketing paragraphs. Treat copy as a precise design object.
Return ONLY valid JSON, no markdown, no explanation.`;

    let narrativeTemplate = '';
    if (semanticFlow.length > 0) {
      narrativeTemplate = semanticFlow.map((slide, idx) => {
        let desc = slide.description;
        if (idx === 0) desc = desc.replace('using hook', `using hook: "${hookSentence}"`);
        if (idx === semanticFlow.length - 1) desc = desc.replace('using CTA', `using cta: "${callToAction}"`);
        return `- Slide ${idx + 1}: [Type: ${slide.slideType}] ${desc}`;
      }).join('\n');
    } else {
      // Fallback if semanticFlow isn't passed
      narrativeTemplate = `- Slide 1: [Type: HOOK] Cover\n- Slide 2: [Type: CONTEXT] Context\n- Slide ${count}: [Type: CTA] Call to Action`;
    }

    const userPrompt = `Create ${count} carousel slide concepts for this beauty appointment post.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient first name: ${clientFirstName}` : ''}
Goal: ${businessGoal.replace(/_/g, ' ')}
${voiceBlock ? `\n${voiceBlock}\n` : ''}
Generate exactly ${count} slides using this strict Narrative Template:
${narrativeTemplate}

Return exactly this JSON shape:
{
  "concepts": [
    { "index": 1, "slideType": "HOOK", "title": "01 · Cover", "headline": "Reveal Your Glow", "subheadline": "Ayurvedic Facial Therapy", "cta": "" },
    { "index": 2, "slideType": "PROBLEM", "title": "02 · The technique", "headline": "Deep Hydration", "subheadline": "Using active botanicals specific to our holistic approach", "cta": "" },
    { "index": 3, "slideType": "EXPLANATION", "title": "03 · The result", "headline": "Glass Skin", "subheadline": "Safe, proven results with zero downtime", "cta": "" },
    { "index": 4, "slideType": "CTA", "title": "04 · Book now", "headline": "Claim Your Slot", "subheadline": "", "cta": "Book via Link" }
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
          slideType: c.slideType || 'UNKNOWN',
          headline: c.headline || '',
          subheadline: c.subheadline || '',
          cta: c.cta || '',
          overlayText: [c.headline, c.subheadline, c.cta].filter(Boolean).join(' ')
        }));
        return { concepts: enrichedConcepts };
      }
      return JSON.parse(cleaned) as CarouselConceptResult;
    } catch (e) {
      console.error('[CarouselConceptChain] Error generating slide concepts:', e);
      // Dynamic fallback
      const fallbackConcepts: CarouselSlideConcept[] = [];
      fallbackConcepts.push({ index: 1, slideType: 'HOOK', title: '01 · Cover', headline: 'Reveal Your Glow', subheadline: 'Expert Care', cta: '', overlayText: 'Reveal Your Glow' });
      if (count >= 3) {
        fallbackConcepts.push({ index: 2, slideType: 'PROBLEM', title: '02 · Context', headline: 'Deep Hydration', subheadline: 'Using active botanicals', cta: '', overlayText: 'Deep Hydration' });
      }
      if (count >= 4) {
        fallbackConcepts.push({ index: 3, slideType: 'EXPLANATION', title: '03 · Deep Dive', headline: 'Glass Skin', subheadline: 'Safe, proven results', cta: '', overlayText: 'Glass Skin' });
      }
      if (count === 5) {
        fallbackConcepts.push({ index: 4, slideType: 'PRO_TIP', title: '04 · Value', headline: 'Zero Downtime', subheadline: 'Return to work immediately', cta: '', overlayText: 'Zero Downtime' });
      }
      fallbackConcepts.push({ index: count, slideType: 'CTA', title: `0${count} · Book now`, headline: 'Claim Your Slot', subheadline: '', cta: 'Book via Link', overlayText: 'Claim Your Slot' });
      
      return { concepts: fallbackConcepts };
    }
  }
}
