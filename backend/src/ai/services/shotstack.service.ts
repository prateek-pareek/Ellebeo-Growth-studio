// ============================================================================
// shotstack.service.ts — Programmatic Reel Generation via Shotstack API
// ============================================================================

import fetch from 'node-fetch';
import { AI_CONFIG } from '../../config/ai.config';

interface ShotstackRenderJson {
  timeline: unknown;
  output: unknown;
}

interface ShotstackSubmitResponse {
  success: boolean;
  message: string;
  response: { id: string; message: string };
}

interface ShotstackStatusResponse {
  success: boolean;
  message: string;
  response: {
    id: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    url?: string;
    error?: string;
  };
}

export class ShotstackService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    const env = process.env['SHOTSTACK_ENV'] ?? 'stage';
    this.baseUrl = env === 'production'
      ? 'https://api.shotstack.io/v1'
      : 'https://api.shotstack.io/stage/v1';
    this.apiKey = process.env['SHOTSTACK_API_KEY'] ?? '';
  }

  // --------------------------------------------------------------------------
  // Build Shotstack Render JSON (dynamic assembly)
  // --------------------------------------------------------------------------

  buildRenderJson(params: {
    beforeImageUrl: string;
    afterImageUrl: string;
    hookSentence: string;
    brandPrimaryColour: string;
    brandSecondaryColour: string;
    musicTrackUrl: string | null;
    musicVolume: number;
    voiceoverUrl: string | null;
    voiceoverVolume: number;
    beforeDurationSec: number;
    afterDurationSec: number;
    textOverlayAppearSec: number;
    outputResolution: string;
    outputFps: number;
  }): ShotstackRenderJson {
    const {
      beforeImageUrl, afterImageUrl, hookSentence,
      brandPrimaryColour,
      musicTrackUrl, musicVolume,
      voiceoverUrl, voiceoverVolume,
      beforeDurationSec, afterDurationSec,
      textOverlayAppearSec, outputResolution, outputFps,
    } = params;

    const totalDuration = beforeDurationSec + afterDurationSec;
    const tracks: unknown[] = [];

    // Track 1: Before image (fade in, 2 seconds)
    tracks.push({
      clips: [{
        asset: { type: 'image', src: beforeImageUrl },
        start: 0,
        length: beforeDurationSec,
        transition: { in: 'fade' },
        effect: 'zoomIn',
      }],
    });

    // Track 2: After image (Ken Burns zoom, 3 seconds)
    tracks.push({
      clips: [{
        asset: { type: 'image', src: afterImageUrl },
        start: beforeDurationSec,
        length: afterDurationSec,
        transition: { in: 'fade' },
        effect: 'zoomIn',
      }],
    });

    // Track 3: Hook text overlay (appears at textOverlayAppearSec)
    const truncatedHook = hookSentence.slice(0, 80); // Shotstack text limit
    tracks.push({
      clips: [{
        asset: {
          type: 'html',
          html: `<p style="font-family:Montserrat,sans-serif;font-weight:700;font-size:28px;color:#ffffff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7);padding:16px;">${truncatedHook}</p>`,
          width: 1080,
          height: 200,
        },
        start: textOverlayAppearSec,
        length: totalDuration - textOverlayAppearSec,
        position: 'center',
        transition: { in: 'slideUp' },
      }],
    });

    // Track 4: Brand colour strip at bottom
    tracks.push({
      clips: [{
        asset: {
          type: 'html',
          html: `<div style="width:1080px;height:8px;background:${brandPrimaryColour};"></div>`,
          width: 1080,
          height: 8,
        },
        start: 0,
        length: totalDuration,
        position: 'bottomCenter',
        offset: { y: -0.02 },
      }],
    });

    // Audio tracks
    const audioTracks: unknown[] = [];

    if (musicTrackUrl) {
      audioTracks.push({
        src: musicTrackUrl,
        effect: 'fadeOut',
        volume: musicVolume,
      });
    }

    if (voiceoverUrl) {
      audioTracks.push({
        src: voiceoverUrl,
        volume: voiceoverVolume,
      });
    }

    return {
      timeline: {
        tracks,
        ...(audioTracks.length > 0 && { soundtrack: audioTracks[0] }),
      },
      output: {
        format: 'mp4',
        resolution: outputResolution,
        fps: outputFps,
        aspectRatio: '9:16',
      },
    };
  }

  // --------------------------------------------------------------------------
  // Submit render job to Shotstack
  // --------------------------------------------------------------------------

  async submitRender(renderJson: ShotstackRenderJson): Promise<string> {
    const response = await fetch(`${this.baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(renderJson),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ShotstackError(`Shotstack submit failed ${response.status}: ${body}`);
    }

    const data = await response.json() as ShotstackSubmitResponse;
    return data.response.id;
  }

  // --------------------------------------------------------------------------
  // Poll render status (5s intervals, 3 minute timeout)
  // --------------------------------------------------------------------------

  async pollRenderStatus(renderId: string): Promise<{ url: string }> {
    const { pollIntervalMs, maxPollAttempts } = AI_CONFIG.shotstack;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await this.sleep(pollIntervalMs);

      const response = await fetch(`${this.baseUrl}/render/${renderId}`, {
        headers: { 'x-api-key': this.apiKey },
      });

      if (!response.ok) continue;

      const data = await response.json() as ShotstackStatusResponse;
      const { status, url, error } = data.response;

      if (status === 'done' && url) {
        return { url };
      }

      if (status === 'failed') {
        throw new ShotstackError(`Shotstack render failed: ${error ?? 'unknown error'}`);
      }
    }

    throw new ShotstackError(`Shotstack render timed out after ${maxPollAttempts * pollIntervalMs / 1000}s`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class ShotstackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShotstackError';
  }
}
