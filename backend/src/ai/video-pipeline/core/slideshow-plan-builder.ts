// Rule-based slideshow Video Plan. No LLM. Phase 2 deterministic core.

import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIDEO_DURATION_SECONDS,
  MAX_SCENES,
  MIN_VIDEO_DURATION_SECONDS,
  type VideoObjective,
  type VideoPlan,
} from '../contract';

export interface SlideshowImageInput {
  url: string;
  assetId?: string | null;
  headline?: string | null;
  caption?: string | null;
}

export interface SlideshowPlanInput {
  technicianId: string;
  brandDnaRef: string;
  objective: VideoObjective;
  images: SlideshowImageInput[];
  branding: {
    logoAssetId: string | null;
    palette: string[];
    font: string;
  };
  medicalAesthetics: boolean;
  createdAt?: string;
}

export class SlideshowPlanBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlideshowPlanBuilderError';
  }
}

const MIN_SCENE_SECONDS = 3;

export function buildSlideshowPlan(input: SlideshowPlanInput): VideoPlan {
  const images = input.images.filter((image) => image.url?.trim());
  if (images.length === 0) {
    throw new SlideshowPlanBuilderError('Slideshow requires at least one image URL');
  }
  if (images.length > MAX_SCENES) {
    throw new SlideshowPlanBuilderError(`Slideshow supports at most ${MAX_SCENES} scenes`);
  }

  const sceneDuration = sceneDurationSeconds(images.length);
  const durationSeconds = sceneDuration * images.length;

  return {
    planVersion: 1,
    technicianId: input.technicianId,
    brandDnaRef: input.brandDnaRef,
    videoType: 'SLIDESHOW',
    aspect: '9:16',
    durationSeconds,
    objective: input.objective,
    scenes: images.map((image, index) => ({
      index,
      durationSeconds: sceneDuration,
      asset: {
        kind: 'IMAGE',
        assetId: image.assetId ?? null,
        url: image.url,
        prompt: null,
      },
      motion: 'KEN_BURNS',
      text: {
        headline: image.headline ?? null,
        caption: image.caption ?? null,
        position: 'BOTTOM',
      },
      transitionOut: index === images.length - 1 ? 'CUT' : 'FADE',
    })),
    audio: {
      voiceover: { enabled: false, script: null, voiceId: null, assetUrl: null },
      music: { trackId: null, mood: null, volume: DEFAULT_MUSIC_VOLUME },
    },
    captions: { enabled: true, style: 'BOLD', burnedIn: true },
    branding: {
      logoAssetId: input.branding.logoAssetId,
      palette: input.branding.palette,
      font: input.branding.font,
    },
    compliance: { medicalAesthetics: input.medicalAesthetics },
    critic: { score: null, passed: false, revisions: 0, notes: [] },
    status: 'DRAFT',
    render: { provider: 'shotstack', renderId: null, outputUrl: null },
    meta: {
      createdAt: input.createdAt ?? new Date().toISOString(),
      source: 'rule_based_v1',
    },
  };
}

function sceneDurationSeconds(count: number): number {
  if (count === 1) return DEFAULT_VIDEO_DURATION_SECONDS;
  return Math.max(
    MIN_SCENE_SECONDS,
    Math.max(MIN_VIDEO_DURATION_SECONDS / count, Math.round((DEFAULT_VIDEO_DURATION_SECONDS / count) * 10) / 10),
  );
}
