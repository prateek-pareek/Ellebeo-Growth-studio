// ============================================================================
// slideshow-asset-provider.ts — AssetProvider strategy for slideshow: use the
// technician's image 1:1 per scene, fall back to the Asset agent (stock
// search) for any scene missing one. Also composed inside ReelsAssetProvider
// for image resolution, so reels and slideshow always share this exact logic.
// ============================================================================

import type { AssetProvider, AssetProviderContext, AssetResolutionResult, ResolvedSceneAsset, SceneCopy } from './asset-provider';
import { runAssetAgent } from '../agents/asset-agent';

export class SlideshowAssetProvider implements AssetProvider {
  async resolveSceneAssets(ctx: AssetProviderContext): Promise<AssetResolutionResult> {
    const scenes: ResolvedSceneAsset[] = [];
    const gaps: SceneCopy[] = [];

    for (const scene of ctx.sceneCopy) {
      const url = ctx.technicianImageUrls[scene.index];
      if (url) {
        scenes.push({ index: scene.index, kind: 'image', url });
      } else {
        gaps.push(scene);
      }
    }

    if (gaps.length > 0) {
      const agentResult = await runAssetAgent({
        scenesNeedingAssets: gaps,
        brandMoodTag: ctx.brandMoodTag,
        medicalAesthetics: ctx.medicalAesthetics,
      });
      for (const asset of agentResult.output.assets) {
        scenes.push({ index: asset.index, kind: 'stock', url: asset.url });
      }
    }

    scenes.sort((a, b) => a.index - b.index);
    return { scenes };
  }
}
