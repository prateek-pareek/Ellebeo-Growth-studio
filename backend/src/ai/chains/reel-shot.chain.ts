// ============================================================================
// reel-shot.chain.ts — Generates a 5-shot storyboard for Reel / TikTok posts
// Each shot has a timestamp and a filming direction (not voiceover text).
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export interface ReelShot {
  timestamp: string;   // e.g. "0:00"
  description: string; // e.g. "Before, hands moving in"
}

export interface ReelShotResult {
  type: 'reel';
  shots: ReelShot[];
  suggestedPostingTime: string; // e.g. "Tue 18:30 — peak watch-through for your followers"
  hookOverlayText: string;      // Short text shown on frame 1, max 50 chars
}

export class ReelShotChain {
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
  }): Promise<ReelShotResult> {
    const { hookSentence, callToAction, serviceName, clientFirstName, businessGoal, brandName } = params;

    const systemPrompt = `You generate TikTok/Reel storyboards for beauty and wellness businesses.
Each storyboard has exactly 5 shots with timestamps and filming directions.
Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Create a 5-shot TikTok/Reel storyboard for this beauty post.

Business: ${brandName}
Service: ${serviceName}${clientFirstName ? `\nClient: ${clientFirstName}` : ''}
Hook: "${hookSentence}"
CTA: "${callToAction}"
Goal: ${businessGoal.replace(/_/g, ' ')}

Shots structure:
- Shot 1 (0:00): The before state / empty chair / anticipation
- Shot 2 (0:05): Hands at work / technique close-up
- Shot 3 (0:14): The reveal — slow pan or zoom
- Shot 4 (0:22): Client reaction — authentic, not staged
- Shot 5 (0:28): End card with hook text

Rules for each shot:
- description: what the camera shows (max 45 chars, cinematic direction language)
- timestamp must increase: 0:00, 0:05, 0:14, 0:22, 0:28
- suggestedPostingTime: best day/time for TikTok with a reason (max 55 chars)
- hookOverlayText: text shown on Shot 1 frame (max 50 chars, from the hook)

Return:
{
  "type": "reel",
  "shots": [
    { "timestamp": "0:00", "description": "Before, hands moving in" },
    { "timestamp": "0:05", "description": "The technique — one detailed shot" },
    { "timestamp": "0:14", "description": "The reveal — slow pan, natural light" },
    { "timestamp": "0:22", "description": "Client reaction — quiet, not staged" },
    { "timestamp": "0:28", "description": "End card — the result, held still" }
  ],
  "suggestedPostingTime": "Tue 18:30 — peak watch-through for your followers",
  "hookOverlayText": "Hook text here"
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      const parsed = JSON.parse(cleaned) as ReelShotResult;
      if (Array.isArray(parsed.shots) && parsed.shots.length >= 4) return parsed;
    } catch (err) {
      console.error('[ReelShotChain] Generation failed, using fallback:', err);
    }

    return {
      type: 'reel',
      shots: [
        { timestamp: '0:00', description: 'Before, hands moving in' },
        { timestamp: '0:05', description: `The technique — ${serviceName.slice(0, 30)}` },
        { timestamp: '0:14', description: 'The reveal — slow pan, natural light' },
        { timestamp: '0:22', description: 'Client reaction — quiet, not staged' },
        { timestamp: '0:28', description: `End card — "${hookSentence.slice(0, 35)}"` },
      ],
      suggestedPostingTime: 'Tue 18:30 — peak watch-through for your followers',
      hookOverlayText: hookSentence.slice(0, 50),
    };
  }
}
