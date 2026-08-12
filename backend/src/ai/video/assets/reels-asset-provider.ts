// ============================================================================
// reels-asset-provider.ts — AssetProvider strategy for reels: resolves scene
// images exactly like slideshow (composes SlideshowAssetProvider), then adds
// an ElevenLabs voiceover and re-times each scene's duration to track speech
// pacing (computeCaptionTimings) — the "auto-timed captions" this phase adds.
// ============================================================================

import type { AssetProvider, AssetProviderContext, AssetResolutionResult, ResolvedSceneAsset } from './asset-provider';
import { SlideshowAssetProvider } from './slideshow-asset-provider';
import { ElevenLabsService } from '../../services/elevenlabs.service';
import { computeCaptionTimings } from './caption-timing';
import { AI_CONFIG } from '../../../config/ai.config';
import type { BrandTone } from '../../types/job-payload.types';

export class ReelsAssetProvider implements AssetProvider {
  constructor(
    private readonly imageProvider: AssetProvider = new SlideshowAssetProvider(),
    private readonly elevenLabsService: ElevenLabsService = new ElevenLabsService(),
  ) {}

  async resolveSceneAssets(ctx: AssetProviderContext): Promise<AssetResolutionResult> {
    const { scenes } = await this.imageProvider.resolveSceneAssets(ctx);

    if (!ctx.voiceoverEnabled) {
      return { scenes };
    }

    const script = buildVoiceoverScript(ctx.sceneCopy);
    if (!script) {
      return { scenes };
    }

    const voiceId = resolveVoiceId(ctx.brandTone);
    const voiceover = await this.elevenLabsService.generateVoiceover({
      script,
      voiceId,
      stability: AI_CONFIG.elevenLabs.defaultStability,
      similarityBoost: AI_CONFIG.elevenLabs.defaultSimilarityBoost,
      style: AI_CONFIG.elevenLabs.defaultStyle,
    });

    const durations = computeCaptionTimings(ctx.sceneCopy, voiceover.durationSeconds);
    const timedScenes: ResolvedSceneAsset[] = scenes.map((scene) => ({
      ...scene,
      durationSeconds: durations[scene.index] ?? scene.durationSeconds,
    }));

    return {
      scenes: timedScenes,
      voiceover: {
        script,
        voiceId,
        assetUrl: voiceover.audioCdnUrl,
        durationSeconds: voiceover.durationSeconds,
      },
    };
  }
}

function buildVoiceoverScript(sceneCopy: AssetProviderContext['sceneCopy']): string | null {
  const parts = sceneCopy
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((s) => s.caption ?? s.headline)
    .filter((t): t is string => !!t);
  if (parts.length === 0) return null;
  return `${parts.join('. ')}.`;
}

function resolveVoiceId(brandTone: string | null): string {
  const voiceMap = AI_CONFIG.elevenLabs.voiceMap;
  const tone = (brandTone ?? 'warm_and_friendly') as BrandTone;
  return voiceMap[tone]?.voiceId ?? voiceMap.warm_and_friendly.voiceId;
}
