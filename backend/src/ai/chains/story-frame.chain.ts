// ============================================================================
// story-frame.chain.ts — AI-generated 4-frame story sequence concepts
// ============================================================================

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { wrapSystemPrompt } from '../config/platform-system-prompt';
import { buildBrandVoiceBlock, type BrandVoiceContext } from '../config/brand-voice';

export interface StoryFrameConcept {
  index: number;
  title: string;       // e.g. "Frame 1 · The chair, empty"
  overlayText: string; // Short text rendered on the frame (max 50 chars)
  headline?: string;
  subheadline?: string;
  cta?: string;
}

export interface StoryFrameResult {
  frames: StoryFrameConcept[];
}

export class StoryFrameChain {
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
    brandVoice?: BrandVoiceContext;
  }): Promise<StoryFrameResult> {
    const { hookSentence, callToAction, serviceName, clientFirstName, businessGoal, brandName, brandVoice } = params;
    const voiceBlock = buildBrandVoiceBlock(brandVoice);

    const systemPrompt = `You generate Instagram Story frame sequences for beauty and wellness businesses.
Every story is exactly 4 frames.
Every overlay line must sound like the technician wrote it — on-brand and specific, never generic.
Stories must be fast-paced, ephemeral, and encourage tapping or interaction.
Return ONLY valid JSON.`;

    const getStoryNarrativeTemplate = (goal: string): string => {
      const g = goal.toLowerCase();
      if (g.includes('showcase')) {
        return `- Frame 1: The Teaser (e.g. "Wait until you see this...") (Use the hook: "${hookSentence}")\n- Frame 2: The Before (Relatable struggle)\n- Frame 3: The Reveal (Huge result)\n- Frame 4: Tap to Book (Interactive Link Sticker)`;
      } else if (g.includes('education')) {
        return `- Frame 1: Question/Poll (e.g. "Did you know?") (Use the hook: "${hookSentence}")\n- Frame 2: The Mistake (What people get wrong)\n- Frame 3: The Fix (Quick tip)\n- Frame 4: Tap for Full Guide / Consult`;
      } else if (g.includes('promotion')) {
        return `- Frame 1: Flash Offer Teaser (Use the hook: "${hookSentence}")\n- Frame 2: What's included (Fast visual list)\n- Frame 3: MUST explicitly say: "Check the Ellebeo Client Portal for coupons!"\n- Frame 4: Tap to claim before it's gone`;
      } else if (g.includes('convert')) {
        return `- Frame 1: Callout to a specific desire (e.g. "Need a glow up?") (Use the hook: "${hookSentence}")\n- Frame 2: The Treatment happening (Action shot context)\n- Frame 3: MUST explicitly say: "Check out my profile in the Ellebeo client portal for seamless booking."\n- Frame 4: Tap to reserve your spot (Link Sticker)`;
      } else if (g.includes('trust')) {
        return `- Frame 1: Client Quote / Testimonial overlay (Use the hook: "${hookSentence}")\n- Frame 2: Their starting point\n- Frame 3: Their transformation\n- Frame 4: Tap to start your journey`;
      } else {
        return `- Frame 1: The before / empty chair / anticipation (Use the hook: "${hookSentence}")\n- Frame 2: Mid-process / technique in action\n- Frame 3: The reveal / result\n- Frame 4: Tap for the CTA`;
      }
    };

    const narrativeTemplate = getStoryNarrativeTemplate(businessGoal);

    const userPrompt = `Create a 4-frame story sequence for this beauty appointment.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient: ${clientFirstName}` : ''}
Goal: ${businessGoal.replace(/_/g, ' ')}
${voiceBlock ? `\n${voiceBlock}\n` : ''}
Frame structure MUST precisely follow this Narrative Template:
${narrativeTemplate}

Rules:
- title: "Frame N · Concept" (max 35 chars)
- overlayText: legacy string (can just combine headline and subheadline)
- headline: Massive punchy hook/title for this specific slide (max 30 chars)
- subheadline: Smaller supporting text (max 60 chars)
- cta: Call to action text (usually on last frame)

Return exactly:
{
  "frames": [
    { "index": 1, "title": "Frame 1 · The chair, empty", "overlayText": "...", "headline": "...", "subheadline": "..." },
    { "index": 2, "title": "Frame 2 · Hands at work", "overlayText": "...", "headline": "...", "subheadline": "..." },
    { "index": 3, "title": "Frame 3 · The reveal", "overlayText": "...", "headline": "...", "subheadline": "..." },
    { "index": 4, "title": "Frame 4 · Tap for a consult", "overlayText": "...", "headline": "...", "subheadline": "...", "cta": "..." }
  ]
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(wrapSystemPrompt(systemPrompt)),
        new HumanMessage(userPrompt),
      ]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      const parsed = JSON.parse(cleaned) as StoryFrameResult;
      if (Array.isArray(parsed.frames) && parsed.frames.length === 4) return parsed;
    } catch {
      // fallback below
    }

    return {
      frames: [
        { index: 1, title: 'Frame 1 · The chair, empty', overlayText: 'Before it all begins', headline: 'Before', subheadline: 'The anticipation' },
        { index: 2, title: 'Frame 2 · Mid-process, hands only', overlayText: serviceName.slice(0, 50), headline: serviceName.slice(0, 30), subheadline: 'Trust the process' },
        { index: 3, title: 'Frame 3 · The reveal', overlayText: hookSentence.slice(0, 50), headline: 'The Reveal', subheadline: hookSentence.slice(0, 60) },
        { index: 4, title: 'Frame 4 · Tap for a consult', overlayText: callToAction.slice(0, 50), headline: 'Ready?', subheadline: 'Book your appointment', cta: callToAction.slice(0, 50) },
      ],
    };
  }
}
