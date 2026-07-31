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
- headline: 1-3 words MAX (Extremely punchy. If it is longer, you have failed.)
- subheadline: 6-12 words MAX (Optional context)
- cta: 2-4 words MAX (Optional)
CRITICAL BRAND CONTENT RULE for Body Slides:
- Ensure all body slides closely follow the provided Narrative Template. Do not deviate.
NEVER inject variable placeholders, hex codes, or technical IDs.
NEVER write marketing paragraphs. Treat copy as a precise design object.
Return ONLY valid JSON, no markdown, no explanation.`;

    const getNarrativeTemplate = (goal: string, count: number): string => {
      const g = goal.toLowerCase();
      let slides: string[] = [];
      
      // Slide 1: Hook
      if (g.includes('showcase')) slides.push(`- Slide 1: Cover — Lead with the final result or transformation (Use the hook: "${hookSentence}")`);
      else if (g.includes('education')) slides.push(`- Slide 1: Cover — Hook the user with a question or core problem (Use the hook: "${hookSentence}")`);
      else if (g.includes('promotion')) slides.push(`- Slide 1: Cover — The Offer or Attention Grabber (Use the hook: "${hookSentence}")`);
      else if (g.includes('convert')) slides.push(`- Slide 1: Cover — The Client Desire / Goal (Use the hook: "${hookSentence}")`);
      else if (g.includes('trust')) slides.push(`- Slide 1: Cover — Client Story or Relatable Struggle (Use the hook: "${hookSentence}")`);
      else slides.push(`- Slide 1: Cover — Eye-catching opener (Use the hook: "${hookSentence}")`);
      
      // Body Slides
      if (count === 3) {
        if (g.includes('promotion')) slides.push(`- Slide 2: Value — MUST explicitly say: "Explore coupons and offers on the Ellebeo client portal (check the link in our description)."`);
        else if (g.includes('convert')) slides.push(`- Slide 2: Value — MUST explicitly say: "Check out my profile in the Ellebeo client portal for seamless booking and exclusive services."`);
        else if (g.includes('showcase')) slides.push(`- Slide 2: Context — Benefits and Transformation details`);
        else if (g.includes('education')) slides.push(`- Slide 2: Context — The specific technique, solution, or aftercare tips`);
        else if (g.includes('trust')) slides.push(`- Slide 2: Context — The Review / Quote`);
        else slides.push(`- Slide 2: Context — Core value proposition`);
      } else if (count >= 4) {
        if (g.includes('showcase')) { slides.push(`- Slide 2: Context — The Before & After explanation`); slides.push(`- Slide 3: Value — Benefits and Transformation details`); }
        else if (g.includes('education')) { slides.push(`- Slide 2: Context — Explain why this happens or the science behind it`); slides.push(`- Slide 3: Value — The specific technique, solution, or aftercare tips`); }
        else if (g.includes('promotion')) { slides.push(`- Slide 2: Context — What is included and the benefits`); slides.push(`- Slide 3: Value — MUST explicitly say: "Explore coupons and offers on the Ellebeo client portal (check the link in our description)."`); }
        else if (g.includes('convert')) { slides.push(`- Slide 2: Context — The Treatment that solves it`); slides.push(`- Slide 3: Value — MUST explicitly say: "Check out my profile in the Ellebeo client portal for seamless booking and exclusive services."`); }
        else if (g.includes('trust')) { slides.push(`- Slide 2: Context — The Journey to Transformation`); slides.push(`- Slide 3: Value — The Review / Quote`); }
        else { slides.push(`- Slide 2: Context — The problem or journey`); slides.push(`- Slide 3: Value — Deep dive into specifics`); }
        
        // If 5 slides, duplicate the context slide logic for slide 4 (shifting the others down)
        if (count === 5) {
           const valSlide = slides.pop()!;
           slides.push(`- Slide 3: Deep Dive — Additional context or proof`);
           slides.push(valSlide.replace('Slide 3', 'Slide 4'));
        }
      }
      
      // CTA Slide
      if (g.includes('showcase')) slides.push(`- Slide ${count}: CTA — Direct CTA to book the service (CTA: "${callToAction}")`);
      else if (g.includes('education')) slides.push(`- Slide ${count}: CTA — Soft CTA (e.g. Save this post or book a consultation) (CTA: "${callToAction}")`);
      else if (g.includes('promotion')) slides.push(`- Slide ${count}: CTA — Urgent CTA to book before the offer expires (CTA: "${callToAction}")`);
      else if (g.includes('convert')) slides.push(`- Slide ${count}: CTA — Frictionless CTA (e.g. Reserve your slot now) (CTA: "${callToAction}")`);
      else if (g.includes('trust')) slides.push(`- Slide ${count}: CTA — Experience it yourself (CTA: "${callToAction}")`);
      else slides.push(`- Slide ${count}: CTA — Invite to book or follow (CTA: "${callToAction}")`);
      
      return slides.join('\\n');
    };

    const narrativeTemplate = getNarrativeTemplate(businessGoal, count);

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
    { "index": 1, "title": "01 · Cover", "headline": "Reveal Your Glow", "subheadline": "Ayurvedic Facial Therapy", "cta": "" },
    { "index": 2, "title": "02 · The technique", "headline": "Deep Hydration", "subheadline": "Using active botanicals specific to our holistic approach", "cta": "" },
    { "index": 3, "title": "03 · The result", "headline": "Glass Skin", "subheadline": "Safe, proven results with zero downtime", "cta": "" },
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
