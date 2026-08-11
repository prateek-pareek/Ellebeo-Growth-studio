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
You are writing TYPOGRAPHY-READY INSTAGRAM COPY that also TEACHES on educational carousels.

Content density by slide role:
- HOOK: headline 3–5 words; optional short subheadline (≤12 words). Scroll-stopping, not a lecture.
- PROBLEM / EXPLANATION / SOLUTION / CONTEXT / TECHNIQUE / WHAT_IS_INCLUDED: headline 3–7 words; subheadline MUST teach something concrete (10–20 words). Include a real tip, mechanism, or process detail for the service — not empty vibe words.
- CTA: headline 3–6 words inviting action; cta field REQUIRED (2–5 words, e.g. "Book a consult", "DM to book"). subheadline can reinforce urgency (≤12 words).

CRITICAL:
- Follow the Narrative Template slideType order exactly (Hook → Problem → Explanation → Solution/Process → CTA when provided).
- Set slideType JSON to the [Type] from the template.
- Never use placeholders, hex codes, or technical IDs.
- Prefer specific service language over generic beauty fluff.
Return ONLY valid JSON, no markdown, no explanation.`;

    let narrativeTemplate = '';
    if (semanticFlow.length > 0) {
      narrativeTemplate = semanticFlow.map((slide, idx) => {
        let desc = slide.description;
        if (idx === 0) desc = desc.replace('using hook', `using hook: "${hookSentence}"`);
        if (idx === semanticFlow.length - 1) desc = desc.replace('using CTA', `using cta: "${callToAction}"`).replace('using cta', `using cta: "${callToAction}"`);
        return `- Slide ${idx + 1}: [Type: ${slide.slideType}] ${desc}`;
      }).join('\n');
    } else {
      narrativeTemplate = `- Slide 1: [Type: HOOK] Cover hook
- Slide 2: [Type: PROBLEM] Name the client problem with educational context
- Slide 3: [Type: EXPLANATION] Teach the mechanism/technique
- Slide ${count}: [Type: CTA] Clear booking CTA using cta: "${callToAction}"`;
    }

    const userPrompt = `Create ${count} carousel slide concepts for this beauty appointment post.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient first name: ${clientFirstName}` : ''}
Goal: ${businessGoal.replace(/_/g, ' ')}
${voiceBlock ? `\n${voiceBlock}\n` : ''}
Generate exactly ${count} slides using this strict Narrative Template:
${narrativeTemplate}

Educational carousels must feel useful: middle slides should answer "what is going wrong?", "why does this treatment work?", and "what happens in the process?".

Return exactly this JSON shape:
{
  "concepts": [
    { "index": 1, "slideType": "HOOK", "title": "01 · Cover", "headline": "Reveal Your Glow", "subheadline": "What clogged pores are really doing to your skin", "cta": "" },
    { "index": 2, "slideType": "PROBLEM", "title": "02 · The problem", "headline": "Congestion Builds Quietly", "subheadline": "Dead cells and oil trap bacteria until breakouts or dullness show up", "cta": "" },
    { "index": 3, "slideType": "EXPLANATION", "title": "03 · Why it works", "headline": "Extraction Clears Pathways", "subheadline": "We clear blockages so actives absorb evenly and inflammation calms", "cta": "" },
    { "index": 4, "slideType": "SOLUTION", "title": "04 · The process", "headline": "Calm. Clear. Reset.", "subheadline": "Cleanse, extract, treat, then seal with barrier-supportive care", "cta": "" },
    { "index": 5, "slideType": "CTA", "title": "05 · Book now", "headline": "Ready for clearer skin?", "subheadline": "Same-week consults available", "cta": "Book via Link" }
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
