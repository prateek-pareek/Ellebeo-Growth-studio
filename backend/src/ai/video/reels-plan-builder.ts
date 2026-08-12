// ============================================================================
// reels-plan-builder.ts — assembles the Video Plan for a reels-type video
// from resolved scene assets + optional voiceover. Deliberately parallel to
// slideshow-plan-builder.ts rather than sharing code (same precedent set in
// Phase 2 keeping ShotstackService.buildRenderJson alongside the newer
// generic mapper) — reels' inputs (resolved assets + VO) differ enough from
// slideshow's (raw image urls) that sharing would cost more in indirection
// than it saves in duplication.
// ============================================================================

import { VideoPlan, parseVideoPlan } from './video-plan.schema';
import type { ResolvedSceneAsset, ResolvedVoiceover, SceneCopy } from './assets/asset-provider';

export interface BuildReelsPlanParams {
  technicianId: string;
  brandDnaRef: string;
  objective: VideoPlan['objective'];
  sceneCopy: SceneCopy[];
  resolvedAssets: ResolvedSceneAsset[];
  voiceover?: ResolvedVoiceover | null;
  brandFont?: string | null;
  brandPalette?: string[];
  medicalAesthetics?: boolean;
  fallbackDurationSeconds?: number;
}

export class ReelsPlanBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReelsPlanBuilderError';
  }
}

export function buildReelsPlan(params: BuildReelsPlanParams): VideoPlan {
  const { sceneCopy, resolvedAssets } = params;
  if (sceneCopy.length === 0) {
    throw new ReelsPlanBuilderError('At least one scene is required to build a reels plan');
  }

  const assetsByIndex = new Map(resolvedAssets.map((a) => [a.index, a]));
  const fallbackDuration = params.fallbackDurationSeconds ?? Math.max(2, Math.round(20 / sceneCopy.length));

  const scenes = sceneCopy
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((copy) => {
      const asset = assetsByIndex.get(copy.index);
      if (!asset) {
        throw new ReelsPlanBuilderError(`No resolved asset for scene ${copy.index}`);
      }
      return {
        index: copy.index,
        durationSeconds: asset.durationSeconds ?? fallbackDuration,
        asset: { kind: asset.kind, url: asset.url },
        motion: 'ken_burns' as const,
        text: { headline: copy.headline, caption: copy.caption, position: 'bottom' as const },
        transitionOut: 'fade' as const,
      };
    });

  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

  const raw = {
    technicianId: params.technicianId,
    brandDnaRef: params.brandDnaRef,
    videoType: 'reels',
    durationSeconds: totalDuration,
    objective: params.objective,
    scenes,
    audio: {
      voiceover: params.voiceover
        ? { enabled: true, script: params.voiceover.script, voiceId: params.voiceover.voiceId, assetUrl: params.voiceover.assetUrl }
        : { enabled: false },
      music: {},
    },
    captions: { enabled: true, style: 'bold', burnedIn: true },
    branding: { palette: params.brandPalette ?? [], font: params.brandFont ?? null },
    compliance: { medicalAesthetics: params.medicalAesthetics ?? false },
    critic: {},
    render: {},
    meta: { createdAt: new Date().toISOString() },
  };

  return parseVideoPlan(raw);
}
