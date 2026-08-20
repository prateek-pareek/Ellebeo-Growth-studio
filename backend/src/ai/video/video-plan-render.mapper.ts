// ============================================================================
// video-plan-render.mapper.ts — Video Plan → Shotstack edit JSON
// Generic N-scene mapper shared by all three video types (slideshow, reels,
// ai_clips) — this is the "one render step" the pipeline design calls for.
// Deterministic, LLM-free: pure data transformation only.
// ============================================================================

import type { VideoPlan, Scene, Transition, TextPosition } from './video-plan.schema';

export interface ShotstackRenderJson {
  timeline: unknown;
  output: unknown;
  callback?: string;
}

export class VideoRenderMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoRenderMappingError';
  }
}

const TRANSITION_MAP: Record<Transition, string | undefined> = {
  fade: 'fade',
  slide: 'slideLeft',
  cut: undefined,
};

const POSITION_MAP: Record<TextPosition, string> = {
  top: 'top',
  center: 'center',
  bottom: 'bottomCenter',
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSceneClip(scene: Scene, start: number): { asset: unknown; start: number; length: number } {
  if (!scene.asset.url) {
    throw new VideoRenderMappingError(`Scene ${scene.index} has no resolved asset url — cannot render`);
  }

  const assetType = scene.asset.kind === 'video' || scene.asset.kind === 'generated_clip' ? 'video' : 'image';
  const clip: Record<string, unknown> = {
    asset: { type: assetType, src: scene.asset.url },
    start,
    length: scene.durationSeconds,
  };

  if (scene.motion === 'ken_burns') {
    clip['effect'] = 'zoomIn';
  }

  const transitionOut = TRANSITION_MAP[scene.transitionOut];
  if (transitionOut) {
    clip['transition'] = { out: transitionOut };
  }

  return clip as { asset: unknown; start: number; length: number };
}

function buildTextClip(scene: Scene, start: number, font: string | null): unknown | null {
  const text = scene.text.headline ?? scene.text.caption;
  if (!text) return null;

  const safeText = escapeHtml(text.slice(0, 120));
  return {
    asset: {
      type: 'html',
      html: `<p style="font-family:${font ?? 'Montserrat'},sans-serif;font-weight:700;font-size:28px;color:#ffffff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7);padding:16px;">${safeText}</p>`,
      width: 1080,
      height: 200,
    },
    start,
    length: scene.durationSeconds,
    position: POSITION_MAP[scene.text.position],
  };
}

export interface BuildShotstackEditOptions {
  /** Resolved music track CDN url. Plan only carries a mood/trackId — the
   * caller (VideoRenderService) resolves the actual url before mapping. */
  musicUrl?: string | null;
  callbackUrl?: string | null;
}

export function buildShotstackEditFromPlan(plan: VideoPlan, options: BuildShotstackEditOptions = {}): ShotstackRenderJson {
  if (plan.scenes.length === 0) {
    throw new VideoRenderMappingError('Video Plan has zero scenes — cannot render');
  }

  const sceneClips: unknown[] = [];
  const textClips: unknown[] = [];
  let cursor = 0;

  for (const scene of plan.scenes) {
    sceneClips.push(buildSceneClip(scene, cursor));
    const textClip = buildTextClip(scene, cursor, plan.branding.font);
    if (textClip) textClips.push(textClip);
    cursor += scene.durationSeconds;
  }

  const totalDuration = cursor;
  // Text tracks are declared first so Shotstack layers them above the scene tracks.
  const tracks: unknown[] = [
    ...(textClips.length > 0 ? [{ clips: textClips }] : []),
    { clips: sceneClips },
  ];

  if (plan.branding.palette[0]) {
    tracks.push({
      clips: [{
        asset: {
          type: 'html',
          html: `<div style="width:1080px;height:8px;background:${plan.branding.palette[0]};"></div>`,
          width: 1080,
          height: 8,
        },
        start: 0,
        length: totalDuration,
        position: 'bottomCenter',
        offset: { y: -0.02 },
      }],
    });
  }

  const audioTracks: unknown[] = [];
  if (options.musicUrl) {
    audioTracks.push({ src: options.musicUrl, effect: 'fadeOut', volume: plan.audio.music.volume });
  }
  if (plan.audio.voiceover.enabled && plan.audio.voiceover.assetUrl) {
    audioTracks.push({ src: plan.audio.voiceover.assetUrl, volume: 1.0 });
  }

  return {
    timeline: {
      tracks,
      ...(audioTracks.length > 0 && { soundtrack: audioTracks[0] }),
    },
    output: {
      format: 'mp4',
      resolution: '1080',
      fps: 30,
      aspectRatio: plan.aspect,
    },
    ...(options.callbackUrl && { callback: options.callbackUrl }),
  };
}
