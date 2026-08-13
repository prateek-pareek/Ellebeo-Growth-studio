import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIDEO_DURATION_SECONDS,
  MAX_SCENES,
  MAX_VIDEO_DURATION_SECONDS,
  MIN_VIDEO_DURATION_SECONDS,
  type SceneAssetKind,
  type VideoObjective,
  type VideoPlan,
} from '../contract';

export interface ReelsAssetInput {
  url: string | null;
  assetId?: string | null;
  kind?: SceneAssetKind;
  headline?: string | null;
  caption?: string | null;
}

export interface ReelsPlanInput {
  technicianId: string;
  brandDnaRef: string;
  objective: VideoObjective;
  assets: ReelsAssetInput[];
  sceneCount?: number;
  branding: {
    logoAssetId: string | null;
    palette: string[];
    font: string;
  };
  medicalAesthetics: boolean;
  createdAt?: string;
  source?: VideoPlan['meta']['source'];
}

export class ReelsPlanBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReelsPlanBuilderError';
  }
}

export function buildReelsPlan(input: ReelsPlanInput): VideoPlan {
  const requested = input.sceneCount ?? Math.max(input.assets.length, 1);
  const sceneCount = Math.min(MAX_SCENES, Math.max(1, requested));
  const durationSeconds = DEFAULT_VIDEO_DURATION_SECONDS;
  const sceneDuration = roundTime(durationSeconds / sceneCount);

  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const asset = input.assets[index];
    const kind: SceneAssetKind =
      asset?.kind === 'VIDEO' || asset?.kind === 'GENERATED_CLIP' || asset?.kind === 'STOCK'
        ? asset.kind
        : 'IMAGE';
    return {
      index,
      durationSeconds: index === sceneCount - 1
        ? roundTime(durationSeconds - sceneDuration * (sceneCount - 1))
        : sceneDuration,
      asset: {
        kind,
        assetId: asset?.assetId ?? null,
        url: asset?.url?.trim() || null,
        prompt: null,
      },
      motion: kind === 'VIDEO' || kind === 'GENERATED_CLIP' ? 'NONE' as const : 'KEN_BURNS' as const,
      text: {
        headline: asset?.headline ?? null,
        caption: asset?.caption ?? null,
        position: 'BOTTOM' as const,
      },
      transitionOut: index === sceneCount - 1 ? 'CUT' as const : 'FADE' as const,
    };
  });

  return {
    planVersion: 1,
    technicianId: input.technicianId,
    brandDnaRef: input.brandDnaRef,
    videoType: 'REELS',
    aspect: '9:16',
    durationSeconds,
    objective: input.objective,
    scenes,
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
      source: input.source ?? 'rule_based_v1',
    },
  };
}

export function clampVideoDuration(seconds: number): number {
  return Math.min(MAX_VIDEO_DURATION_SECONDS, Math.max(MIN_VIDEO_DURATION_SECONDS, seconds));
}

export function redistributeSceneDurations(count: number, totalSeconds: number): number[] {
  const total = clampVideoDuration(totalSeconds);
  if (count <= 1) return [total];
  const each = roundTime(total / count);
  const durations = Array.from({ length: count }, () => each);
  durations[count - 1] = roundTime(total - each * (count - 1));
  if (durations[count - 1]! <= 0) durations[count - 1] = each;
  return durations;
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10;
}
