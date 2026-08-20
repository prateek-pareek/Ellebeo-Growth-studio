// ============================================================================
// video-clip-provider.ts — the text-to-video adapter interface. Runway Gen-3
// is the first (and only, this phase) implementation; Veo/Pika swap in
// behind this same interface without touching AiClipsAssetProvider or
// DirectorService. This is the pipeline's one genuinely new external
// capability (Phase 0 finding: no Runway/text-to-video integration existed
// anywhere before this phase) — everything else in the video pipeline reused
// existing platform integrations.
// ============================================================================

export interface GenerateClipParams {
  /** Visual description of what the clip should show. */
  prompt: string;
  durationSeconds: number;
  aspect: '9:16';
}

export interface GeneratedClip {
  url: string;
  durationSeconds: number;
  costUsd: number;
}

export interface VideoClipProvider {
  generateClip(params: GenerateClipParams): Promise<GeneratedClip>;
}

export class VideoClipProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoClipProviderError';
  }
}
