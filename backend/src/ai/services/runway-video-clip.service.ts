// ============================================================================
// runway-video-clip.service.ts — Runway Gen-3 text-to-video, implementing
// VideoClipProvider. Submit-then-poll, same convention as
// shotstack.service.ts's pollRenderStatus (this codebase has no webhook
// infrastructure for Runway — Phase 2 built one for Shotstack specifically;
// adding a Runway webhook is a reasonable follow-up, not required for this
// adapter to be correct). Endpoint shape follows Runway's public
// text-to-video API as of this writing — verify against current Runway docs
// before enabling in production; API surfaces like this do change.
// ============================================================================

import fetch from 'node-fetch';
import { AI_CONFIG } from '../../config/ai.config';
import { RUNWAY_COST_PER_SECOND_USD } from '../video/video-plan.constants';
import type { GenerateClipParams, GeneratedClip, VideoClipProvider } from '../video/clips/video-clip-provider';
import { VideoClipProviderError } from '../video/clips/video-clip-provider';

interface RunwayTaskSubmitResponse {
  id: string;
}

interface RunwayTaskStatusResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  output?: string[];
  failure?: string;
}

export class RunwayVideoClipProvider implements VideoClipProvider {
  private readonly baseUrl = 'https://api.runwayml.com/v1';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['RUNWAY_API_KEY'] ?? '';
  }

  async generateClip(params: GenerateClipParams): Promise<GeneratedClip> {
    const taskId = await this.submitGeneration(params);
    const url = await this.pollGeneration(taskId);
    return {
      url,
      durationSeconds: params.durationSeconds,
      costUsd: Math.round(params.durationSeconds * RUNWAY_COST_PER_SECOND_USD * 100) / 100,
    };
  }

  private async submitGeneration(params: GenerateClipParams): Promise<string> {
    const response = await fetch(`${this.baseUrl}/text_to_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        promptText: params.prompt,
        duration: params.durationSeconds,
        ratio: params.aspect === '9:16' ? '768:1280' : '1280:768',
        model: 'gen3a_turbo',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new VideoClipProviderError(`Runway submit failed ${response.status}: ${body}`);
    }

    const data = await response.json() as RunwayTaskSubmitResponse;
    return data.id;
  }

  private async pollGeneration(taskId: string): Promise<string> {
    const { pollIntervalMs, maxPollAttempts } = AI_CONFIG.runway;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await this.sleep(pollIntervalMs);

      const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) continue;

      const data = await response.json() as RunwayTaskStatusResponse;

      if (data.status === 'SUCCEEDED' && data.output?.[0]) {
        return data.output[0];
      }
      if (data.status === 'FAILED') {
        throw new VideoClipProviderError(`Runway generation failed: ${data.failure ?? 'unknown error'}`);
      }
    }

    throw new VideoClipProviderError(`Runway generation timed out after ${maxPollAttempts * pollIntervalMs / 1000}s`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
