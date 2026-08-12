// ============================================================================
// ai-clips-asset-provider.ts — AssetProvider strategy for ai_clips: generates
// a short clip per scene via VideoClipProvider (Runway first, swappable).
// Premium/opt-in and the only strategy with a real per-scene dollar cost, so
// this is also where the rate limit + cost ceiling from the spec live.
//
// Compliance note: scene copy reaching this provider has already passed
// through DirectorService's compliance hard gate (copy-compliance-gate.ts)
// before resolveSceneAssets is ever called — the per-scene prompt built here
// is derived directly from that already-filtered text, so no separate
// client-photo check applies (there is no real photo — every asset here is
// synthetic).
// ============================================================================

import type { AssetProvider, AssetProviderContext, AssetResolutionResult, ResolvedSceneAsset } from './asset-provider';
import type { VideoClipProvider } from '../clips/video-clip-provider';
import { RunwayVideoClipProvider } from '../../services/runway-video-clip.service';
import { MAX_AI_CLIPS_COST_USD, MAX_AI_CLIP_SCENES_PER_VIDEO, MIN_SCENE_DURATION_SECONDS } from '../video-plan.constants';

export const AI_CLIP_DEFAULT_DURATION_SECONDS = 5;

export class AiClipsCostCeilingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiClipsCostCeilingError';
  }
}

export class AiClipsRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiClipsRateLimitError';
  }
}

export class AiClipsAssetProvider implements AssetProvider {
  constructor(
    private readonly clipProvider: VideoClipProvider = new RunwayVideoClipProvider(),
    private readonly costCeilingUsd: number = MAX_AI_CLIPS_COST_USD,
    private readonly maxScenes: number = MAX_AI_CLIP_SCENES_PER_VIDEO,
  ) {}

  async resolveSceneAssets(ctx: AssetProviderContext): Promise<AssetResolutionResult> {
    if (ctx.sceneCopy.length > this.maxScenes) {
      throw new AiClipsRateLimitError(
        `ai_clips video has ${ctx.sceneCopy.length} scenes, exceeding the per-video limit of ${this.maxScenes} generated clips`,
      );
    }

    const scenes: ResolvedSceneAsset[] = [];
    let spentUsd = 0;

    for (const scene of ctx.sceneCopy.slice().sort((a, b) => a.index - b.index)) {
      const durationSeconds = Math.max(MIN_SCENE_DURATION_SECONDS, AI_CLIP_DEFAULT_DURATION_SECONDS);
      const prompt = buildClipPrompt(scene, ctx.brandMoodTag);

      const clip = await this.clipProvider.generateClip({ prompt, durationSeconds, aspect: '9:16' });

      const projectedSpend = spentUsd + clip.costUsd;
      if (projectedSpend > this.costCeilingUsd) {
        throw new AiClipsCostCeilingError(
          `ai_clips cost ceiling exceeded: scene ${scene.index} would bring total spend to $${projectedSpend.toFixed(2)}, over the $${this.costCeilingUsd.toFixed(2)} per-video ceiling`,
        );
      }
      spentUsd = projectedSpend;

      scenes.push({ index: scene.index, kind: 'generated_clip', url: clip.url, durationSeconds: clip.durationSeconds });
    }

    return { scenes };
  }
}

function buildClipPrompt(scene: { headline: string | null; caption: string | null }, brandMoodTag: string | null): string {
  const subject = scene.caption ?? scene.headline ?? 'a professional beauty clinic, elegant and inviting';
  const mood = brandMoodTag ? `, ${brandMoodTag} mood` : '';
  return `Cinematic 9:16 vertical shot: ${subject}${mood}. No real people's faces, no medical procedures.`;
}
