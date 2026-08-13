// Map a validated Video Plan to Shotstack edit JSON. No LLM. No network.

import { AI_CONFIG } from '../../../config/ai.config';
import type { VideoPlan, VideoScene } from '../contract';

export interface ShotstackEditJson {
  timeline: {
    background: string;
    tracks: unknown[];
    soundtrack?: { src: string; volume: number; effect: string };
  };
  output: {
    format: 'mp4';
    resolution: string;
    fps: number;
    aspectRatio: '9:16';
  };
  callback?: string;
}

export class ShotstackEditMapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShotstackEditMapperError';
  }
}

const MOTION_EFFECT: Record<string, string | undefined> = {
  KEN_BURNS: 'zoomIn',
  NONE: undefined,
  SLIDE: undefined,
};

const TRANSITION_IN: Record<string, string | undefined> = {
  FADE: 'fade',
  CUT: undefined,
  SLIDE: 'slideLeft',
};

const TEXT_POSITION: Record<string, string> = {
  TOP: 'top',
  CENTER: 'center',
  BOTTOM: 'bottom',
};

export function mapVideoPlanToShotstackEdit(
  plan: VideoPlan,
  options: { callbackUrl?: string } = {},
): ShotstackEditJson {
  const scenes = [...plan.scenes].sort((a, b) => a.index - b.index);
  if (scenes.length === 0) {
    throw new ShotstackEditMapperError('Video Plan has no scenes');
  }

  for (const scene of scenes) {
    if (!scene.asset.url) {
      throw new ShotstackEditMapperError(`Scene ${scene.index} is missing an asset URL`);
    }
  }

  const imageClips = scenes.map((scene, i) => {
    const start = startTime(scenes, i);
    const effect = scene.motion === 'KEN_BURNS'
      ? (i % 2 === 0 ? 'zoomIn' : 'zoomOut')
      : MOTION_EFFECT[scene.motion];
    const transitionIn = i === 0 ? 'fade' : TRANSITION_IN[scenes[i - 1]!.transitionOut];
    const transitionOut = TRANSITION_IN[scene.transitionOut];

    const clip: Record<string, unknown> = {
      asset: { type: 'image', src: scene.asset.url },
      start,
      length: scene.durationSeconds,
      fit: 'cover',
    };
    if (effect) clip.effect = effect;
    const transition: Record<string, string> = {};
    if (transitionIn) transition.in = transitionIn;
    if (transitionOut && i < scenes.length - 1) transition.out = transitionOut;
    if (Object.keys(transition).length > 0) clip.transition = transition;
    return clip;
  });

  const tracks: unknown[] = [{ clips: imageClips }];

  const textClips = scenes.flatMap((scene, i) => {
    const overlay = overlayHtml(scene, plan);
    if (!overlay) return [];
    return [{
      asset: {
        type: 'html',
        html: overlay,
        width: 1080,
        height: 280,
      },
      start: startTime(scenes, i),
      length: scene.durationSeconds,
      position: TEXT_POSITION[scene.text.position] ?? 'bottom',
      transition: { in: 'fade' },
    }];
  });
  if (textClips.length > 0) tracks.push({ clips: textClips });

  const brandColour = plan.branding.palette[0] ?? '#000000';
  tracks.push({
    clips: [{
      asset: {
        type: 'html',
        html: `<div style="width:1080px;height:8px;background:${escapeHtml(brandColour)};"></div>`,
        width: 1080,
        height: 8,
      },
      start: 0,
      length: plan.durationSeconds,
      position: 'bottom',
    }],
  });

  const musicSrc = httpUrl(plan.audio.music.trackId);
  const voSrc = plan.audio.voiceover.enabled ? httpUrl(plan.audio.voiceover.assetUrl) : null;

  const edit: ShotstackEditJson = {
    timeline: {
      background: '#000000',
      tracks,
      ...(musicSrc && !voSrc
        ? {
          soundtrack: {
            src: musicSrc,
            volume: plan.audio.music.volume,
            effect: 'fadeOut',
          },
        }
        : {}),
    },
    output: {
      format: 'mp4',
      resolution: AI_CONFIG.shotstack.outputResolution,
      fps: AI_CONFIG.shotstack.outputFps,
      aspectRatio: '9:16',
    },
  };

  if (voSrc) {
    edit.timeline.tracks.push({
      clips: [{
        asset: { type: 'audio', src: voSrc, volume: AI_CONFIG.shotstack.voiceoverVolume },
        start: 0,
        length: plan.durationSeconds,
      }],
    });
    if (musicSrc) {
      edit.timeline.tracks.push({
        clips: [{
          asset: { type: 'audio', src: musicSrc, volume: plan.audio.music.volume },
          start: 0,
          length: plan.durationSeconds,
        }],
      });
    }
  }

  if (options.callbackUrl) edit.callback = options.callbackUrl;
  return edit;
}

function startTime(scenes: VideoScene[], index: number): number {
  return scenes.slice(0, index).reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

function overlayHtml(scene: VideoScene, plan: VideoPlan): string | null {
  if (!plan.captions.enabled && !plan.captions.burnedIn) return null;
  const headline = scene.text.headline?.trim();
  const caption = scene.text.caption?.trim();
  if (!headline && !caption) return null;

  const font = escapeHtml(plan.branding.font || 'Montserrat');
  const weight = plan.captions.style === 'BOLD' ? 700 : 500;
  const parts = [
    headline
      ? `<div style="font-family:${font},sans-serif;font-weight:${weight};font-size:42px;color:#ffffff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7);">${escapeHtml(headline.slice(0, 80))}</div>`
      : '',
    caption
      ? `<div style="font-family:${font},sans-serif;font-weight:500;font-size:24px;color:#ffffff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7);margin-top:8px;">${escapeHtml(caption.slice(0, 120))}</div>`
      : '',
  ];
  return `<div style="padding:24px;">${parts.join('')}</div>`;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
