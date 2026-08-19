import { AI_CONFIG } from '../../../config/ai.config';
import { assertResolvedAssetsHardGate } from '../compliance/hard-gate';
import { isPeopleStockTagList } from '../compliance/terms';
import { isAiClipsEnabled } from '../feature-flag';
import { MAX_SCENES } from '../contract';
import {
  AssetResolveError,
  stockSearchQuery,
  type AssetProvider,
  type AssetResolveInput,
  type ResolvedSceneAsset,
} from './asset-provider';
import { normalizeTechnician } from './studio-assets';
import type { StockImagePort } from './stock-image.port';
import type { VideoClipPort } from './video-clip.port';

/**
 * Phase 7 — AI video clips. Same shape as `createStudioAssetProvider`, but
 * missing scenes are offered to `clip` (a `VideoClipPort`) first when the
 * caller opted in (`input.preferAiClips`) and the feature is enabled globally.
 * Every scene the clip provider does not fill — because it's disabled, over
 * budget, or a generation call failed — falls back to stock, unchanged from
 * the Phase 4 studio provider. `assertResolvedAssetsHardGate` is still the
 * real enforcement: medical-aesthetics brands never get a GENERATED_CLIP
 * asset out of this function, whatever `preferAiClips` says.
 */
export function createAiClipAssetProvider(clip: VideoClipPort, stock: StockImagePort): AssetProvider {
  return {
    resolve: (input) => resolveAiClipAssets(input, clip, stock),
  };
}

export async function resolveAiClipAssets(
  input: AssetResolveInput,
  clip: VideoClipPort,
  stock: StockImagePort,
): Promise<ResolvedSceneAsset[]> {
  const sceneCount = Math.min(MAX_SCENES, Math.max(1, Math.floor(input.sceneCount)));
  const technician = input.technicianAssets
    .map(normalizeTechnician)
    .filter((asset): asset is ResolvedSceneAsset => asset !== null);

  const resolved: Array<ResolvedSceneAsset | null> = Array.from({ length: sceneCount }, (_, index) => {
    return technician[index] ?? null;
  });

  const cfg = AI_CONFIG.video.aiClips;
  const wantsAiClips = Boolean(input.preferAiClips) && !input.medicalAesthetics && isAiClipsEnabled();
  if (wantsAiClips) {
    const budgetCap = Math.floor(cfg.maxCostUsdPerVideo / cfg.costUsdPerClip);
    const clipBudget = Math.max(0, Math.min(cfg.maxClipsPerVideo, budgetCap));
    let clipsUsed = 0;
    for (let index = 0; index < resolved.length && clipsUsed < clipBudget; index++) {
      if (resolved[index]) continue;
      const prompt = input.clipPrompts?.[clipsUsed]?.trim() || stockSearchQuery(input);
      try {
        const generated = await clip.generate({
          prompt,
          durationSeconds: cfg.defaultDurationSeconds,
          aspectRatio: '9:16',
        });
        resolved[index] = {
          kind: 'GENERATED_CLIP',
          url: generated.url,
          assetId: null,
          prompt,
          source: 'ai_clip',
        };
        clipsUsed += 1;
      } catch {
        // Leave this slot null — it is filled from stock below, same as any
        // other missing scene. A flaky clip call must not fail the whole reel.
      }
    }
  }

  const missing = resolved.filter((asset) => asset === null).length;
  if (missing > 0) {
    const rawHits = await stock.search(stockSearchQuery(input), {
      count: input.medicalAesthetics ? missing * 3 : missing,
      orientation: 'vertical',
    });
    const hits = input.medicalAesthetics
      ? rawHits.filter((hit) => !isPeopleStockTagList(hit.tags))
      : rawHits;
    let cursor = 0;
    for (let i = 0; i < resolved.length; i++) {
      if (resolved[i]) continue;
      const hit = hits[cursor];
      cursor += 1;
      if (!hit?.url) {
        throw new AssetResolveError(
          `Stock fallback could not fill scene ${i} (need ${missing} stock image(s))`,
        );
      }
      resolved[i] = {
        kind: 'STOCK',
        url: hit.url,
        assetId: null,
        prompt: hit.tags.join(', ') || null,
        source: 'stock',
      };
    }
  }

  const assets = resolved.map((asset, index) => {
    if (!asset) throw new AssetResolveError(`Scene ${index} has no asset URL`);
    return asset;
  });
  assertResolvedAssetsHardGate(assets, input.medicalAesthetics);
  return assets;
}
