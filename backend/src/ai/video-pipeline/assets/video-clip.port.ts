// Phase 7 — AI video clips. Text/image-to-video generation, provider-agnostic.
// GENERATED_CLIP scenes only ever come through this port. Kept separate from
// StockImagePort/VoiceoverPort because clip generation is slow (long-running
// operation, polled) and materially more expensive per call.

export interface VideoClipRequest {
  /** What the clip should show. Required — used for text-to-video and as the
   * image-to-video motion hint when `imageUrl` is also set. */
  prompt: string;
  /** Optional still to animate (image-to-video). Text-to-video when omitted. */
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}

export interface VideoClipAsset {
  url: string;
  durationSeconds: number;
  provider: string;
}

export interface VideoClipPort {
  generate(req: VideoClipRequest): Promise<VideoClipAsset>;
}

export class VideoClipGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoClipGenerationError';
  }
}
