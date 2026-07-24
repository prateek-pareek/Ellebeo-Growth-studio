// ============================================================================
// story-frame.chain.ts — AI-generated 4-frame story sequence concepts
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
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
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500,
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
    brandVoice?: BrandVoiceContext;
  }): Promise<StoryFrameResult> {
    const { hookSentence, callToAction, serviceName, clientFirstName, businessGoal, brandName, brandVoice } = params;
    const voiceBlock = buildBrandVoiceBlock(brandVoice);

    const systemPrompt = `You generate Instagram Story frame sequences for beauty and wellness businesses.
Each story is exactly 4 frames: hook → process → result → CTA.
Every overlay line must sound like the technician wrote it — on-brand and specific, never generic.
Return ONLY valid JSON.`;

    const userPrompt = `Create a 4-frame story sequence for this beauty appointment.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient: ${clientFirstName}` : ''}
Hook: "${hookSentence}"
CTA: "${callToAction}"
Goal: ${businessGoal.replace(/_/g, ' ')}
${voiceBlock ? `\n${voiceBlock}\n` : ''}
Frame structure:
- Frame 1: The before / empty chair / anticipation
- Frame 2: Mid-process / technique in action
- Frame 3: The reveal / result
- Frame 4: Tap for the CTA

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
