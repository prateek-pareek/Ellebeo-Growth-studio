// ============================================================================
// caption-timing.ts — "auto-timed captions" for reels: distributes a measured
// voiceover duration across scenes proportional to each scene's caption word
// count, so on-screen text tracks speech pacing instead of a flat per-scene
// duration. Deliberately word-count-proportional rather than true ASR forced
// alignment — no speech-to-text/alignment tool exists in this codebase, and
// ElevenLabsService itself already estimates duration the same way (word
// count / WORDS_PER_SECOND, see elevenlabs.service.ts) — this reuses that
// same assumption consistently instead of introducing a second, different one.
// ============================================================================

import { MAX_SCENE_DURATION_SECONDS, MIN_SCENE_DURATION_SECONDS } from '../video-plan.constants';

export const WORDS_PER_SECOND = 2.5;

export interface CaptionTimingInput {
  index: number;
  headline: string | null;
  caption: string | null;
}

function wordCount(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Returns scene durations (seconds), in the same order as `scenes`,
 * approximately proportional to `totalDurationSeconds` weighted by each
 * scene's word count (untexted scenes get an equal minimal share). Clamped to
 * the schema's per-scene duration bounds, so the sum can drift slightly from
 * totalDurationSeconds — bounds win over exact proportionality when a scene
 * would otherwise be inaudibly short or absurdly long.
 */
export function computeCaptionTimings(scenes: CaptionTimingInput[], totalDurationSeconds: number): number[] {
  if (scenes.length === 0) return [];

  const weights = scenes.map((s) => Math.max(1, wordCount(s.caption) + wordCount(s.headline)));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const raw = weights.map((w) => (totalDurationSeconds * w) / totalWeight);
  const clamped = raw.map((d) => Math.min(MAX_SCENE_DURATION_SECONDS, Math.max(MIN_SCENE_DURATION_SECONDS, Math.round(d))));

  return clamped;
}
