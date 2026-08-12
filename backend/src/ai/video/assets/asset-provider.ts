// ============================================================================
// asset-provider.ts — the strategy interface the Asset agent picks from,
// one per video type (Decision A from the spec: one pipeline, three asset
// strategies). Slideshow and reels are implemented this phase; ai_clips
// (Runway) lands in Phase 7 behind the same interface.
// ============================================================================

import type { SceneAssetKind } from '../video-plan.schema';

export interface SceneCopy {
  index: number;
  headline: string | null;
  caption: string | null;
}

export interface ResolvedSceneAsset {
  index: number;
  kind: SceneAssetKind;
  url: string;
  /** Set only when the provider needs to override the scene's default even split — reels' auto-timed captions. */
  durationSeconds?: number;
}

export interface ResolvedVoiceover {
  script: string;
  voiceId: string;
  assetUrl: string;
  durationSeconds: number;
}

export interface AssetResolutionResult {
  scenes: ResolvedSceneAsset[];
  voiceover?: ResolvedVoiceover | null;
}

export interface AssetProviderContext {
  tenantId: string;
  sceneCopy: SceneCopy[];
  /** Technician-supplied images, in scene order. May be shorter than sceneCopy — gaps are filled by stock search. */
  technicianImageUrls: string[];
  /** Parallel to technicianImageUrls — true means "this is a real client photo." Compliance hard gate input, see client-photo-gate.ts. */
  clientPhotoFlags?: boolean[];
  brandMoodTag: string | null;
  brandTone: string | null;
  medicalAesthetics: boolean;
  voiceoverEnabled: boolean;
}

export interface AssetProvider {
  resolveSceneAssets(ctx: AssetProviderContext): Promise<AssetResolutionResult>;
}

export class AssetResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetResolutionError';
  }
}
