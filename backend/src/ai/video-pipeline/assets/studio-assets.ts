import { assertResolvedAssetsHardGate } from '../compliance/hard-gate';
import { isPeopleStockTagList } from '../compliance/terms';
import { MAX_SCENES } from '../contract';
import {
  AssetResolveError,
  stockSearchQuery,
  type AssetProvider,
  type AssetResolveInput,
  type ResolvedSceneAsset,
  type TechnicianAssetInput,
} from './asset-provider';
import type { StockImagePort } from './stock-image.port';

export function createStudioAssetProvider(stock: StockImagePort): AssetProvider {
  return {
    resolve: (input) => resolveStudioAssets(input, stock),
  };
}

export async function resolveStudioAssets(
  input: AssetResolveInput,
  stock: StockImagePort,
): Promise<ResolvedSceneAsset[]> {
  const sceneCount = Math.min(MAX_SCENES, Math.max(1, Math.floor(input.sceneCount)));
  const technician = input.technicianAssets
    .map(normalizeTechnician)
    .filter((asset): asset is ResolvedSceneAsset => asset !== null);

  const resolved: Array<ResolvedSceneAsset | null> = Array.from({ length: sceneCount }, (_, index) => {
    return technician[index] ?? null;
  });

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

export function normalizeTechnician(asset: TechnicianAssetInput): ResolvedSceneAsset | null {
  const url = asset.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const kind = asset.kind === 'VIDEO' || asset.kind === 'GENERATED_CLIP' ? asset.kind : 'IMAGE';
  return {
    kind,
    url,
    assetId: asset.assetId ?? null,
    prompt: null,
    source: 'technician',
  };
}
