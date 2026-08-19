import type { SceneAssetKind, VideoType } from '../contract';

export type AssetSource = 'technician' | 'stock' | 'ai_clip';

export interface TechnicianAssetInput {
  url: string;
  assetId?: string | null;
  kind?: SceneAssetKind;
}

export interface ResolvedSceneAsset {
  kind: SceneAssetKind;
  url: string;
  assetId: string | null;
  prompt: string | null;
  source: AssetSource;
}

export interface AssetResolveInput {
  videoType: VideoType;
  sceneCount: number;
  technicianAssets: TechnicianAssetInput[];
  query?: string;
  medicalAesthetics: boolean;
  /** Phase 7 opt-in: attempt AI-generated clips for missing scenes before
   * falling back to stock. Ignored by providers that don't support it. */
  preferAiClips?: boolean;
  /** Per-scene prompts for AI-generated clips, matched by missing-scene order. */
  clipPrompts?: string[];
}

export interface AssetProvider {
  resolve(input: AssetResolveInput): Promise<ResolvedSceneAsset[]>;
}

export class AssetResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetResolveError';
  }
}

export function stockSearchQuery(input: Pick<AssetResolveInput, 'query' | 'medicalAesthetics'>): string {
  if (input.medicalAesthetics) return 'spa interior marble linen texture';
  return input.query?.trim() || 'beauty salon skincare';
}
